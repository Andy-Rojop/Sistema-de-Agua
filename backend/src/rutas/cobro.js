/**
 * COBRO EN CAMPO
 * Tesorero: busca, registra lectura, emite el recibo del periodo (misma
 * tarifa del cierre) y cobra. Reimprimir no vuelve a facturar.
 */

'use strict';

const express = require('express');
const { consultar, consultarUna, enTransaccion, registrarBitacora } = require('../datos/bd');
const { autenticar, exigirPermiso } = require('./seguridad');
const { calcularConsumo } = require('../dominio/consumo');
const { calcularRecibo, lineasDelRecibo } = require('../dominio/tarifa');
const { calcularMora, aplicarPago } = require('../dominio/pagos');
const { vistaRecibo, SQL_RECIBO } = require('../dominio/recibo-vista');
const { periodoAbierto } = require('../dominio/periodo');

const router = express.Router();

async function tarifaVigente(fecha) {
  const t = await consultarUna(
    `SELECT * FROM tarifas
      WHERE vigente_desde <= $1 AND (vigente_hasta IS NULL OR vigente_hasta >= $1)
      ORDER BY vigente_desde DESC LIMIT 1`,
    [fecha || new Date()]
  );
  if (!t) throw new Error('No hay una tarifa vigente configurada.');
  return {
    id: t.id,
    tarifaBasicaCentavos: t.tarifa_basica_centavos,
    litrosIncluidos: t.litros_incluidos,
    litrosPorBloque: t.litros_por_bloque,
    precioBloqueCentavos: t.precio_bloque_centavos,
    cuotaFijaCentavos: t.cuota_fija_centavos,
    redondeoBloque: t.redondeo_bloque,
  };
}

async function juntaParametros() {
  const parametros = await consultar(
    `SELECT clave, valor FROM parametros WHERE clave LIKE 'junta_%'`
  );
  const junta = {};
  parametros.forEach(function (p) { junta[p.clave] = p.valor; });
  return junta;
}

async function payloadRecibo(id) {
  const r = await consultarUna(SQL_RECIBO, [id]);
  if (!r) return null;
  return vistaRecibo(r, await juntaParametros());
}

async function cargosDeConexion(conexionId, periodoId) {
  const fila = await consultarUna(
    `SELECT c.saldo_favor_centavos, c.modalidad,
            COALESCE((SELECT SUM(r.saldo_centavos) FROM recibos r
                       WHERE r.conexion_id = c.id AND r.saldo_centavos > 0
                         AND r.periodo_id IS DISTINCT FROM $2), 0) AS saldo_anterior
       FROM conexiones c WHERE c.id = $1`,
    [conexionId, periodoId]
  );
  const saldoAnterior = Number(fila.saldo_anterior);
  return {
    modalidad: fila.modalidad,
    saldoFavorCentavos: fila.saldo_favor_centavos,
    saldoAnteriorCentavos: saldoAnterior,
    moraCentavos: saldoAnterior > 0 ? calcularMora(saldoAnterior) : 0,
  };
}

// Búsqueda para trabajo de campo (nombre, código, medidor, dirección).
router.get('/cobro/buscar', autenticar, exigirPermiso('cobro'), async function (req, res, next) {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const like = q ? '%' + q + '%' : null;

    const filas = await consultar(
      `SELECT c.id, c.codigo, c.sector, c.modalidad,
              b.nombres || ' ' || b.apellidos AS titular,
              b.direccion, m.serie AS medidor_serie,
              COALESCE((SELECT SUM(r.saldo_centavos) FROM recibos r
                         WHERE r.conexion_id = c.id AND r.saldo_centavos > 0), 0) AS saldo_pendiente
         FROM conexiones c
         JOIN beneficiarios b ON b.id = c.beneficiario_id
         LEFT JOIN medidores m ON m.conexion_id = c.id AND m.estado = 'ACTIVO'
        WHERE c.eliminado_en IS NULL AND c.estado = 'ACTIVA'
          AND ($1::text IS NULL
               OR LOWER(c.codigo) LIKE $1
               OR LOWER(b.nombres || ' ' || b.apellidos) LIKE $1
               OR LOWER(COALESCE(b.direccion, '')) LIKE $1
               OR LOWER(COALESCE(c.sector, '')) LIKE $1
               OR LOWER(COALESCE(m.serie, '')) LIKE $1)
        ORDER BY c.codigo`,
      [like]
    );
    res.json(filas);
  } catch (e) { next(e); }
});

// Ficha de cobro: periodo, lectura, recibo del mes e historial.
router.get('/cobro/conexiones/:id', autenticar, exigirPermiso('cobro'),
  async function (req, res, next) {
  try {
    const conexion = await consultarUna(
      `SELECT c.id, c.codigo, c.sector, c.modalidad, c.estado, c.saldo_favor_centavos,
              b.nombres || ' ' || b.apellidos AS titular,
              b.direccion, b.telefono,
              m.serie AS medidor_serie, m.digitos, m.lectura_inicial
         FROM conexiones c
         JOIN beneficiarios b ON b.id = c.beneficiario_id
         LEFT JOIN medidores m ON m.conexion_id = c.id AND m.estado = 'ACTIVO'
        WHERE c.id = $1 AND c.eliminado_en IS NULL`,
      [req.params.id]
    );
    if (!conexion) return res.status(404).json({ error: 'La conexión no existe.' });

    const periodo = await periodoAbierto();

    const lecturaAnterior = await consultarUna(
      `SELECT COALESCE(
         (SELECT l.lectura_actual FROM lecturas l
           WHERE l.conexion_id = $1
             AND ($2::int IS NULL OR l.periodo_id IS DISTINCT FROM $2)
           ORDER BY l.id DESC LIMIT 1),
         $3, 0) AS valor`,
      [conexion.id, periodo ? periodo.id : null, conexion.lectura_inicial]
    );

    let lecturaPeriodo = null;
    let reciboPeriodo = null;
    if (periodo) {
      lecturaPeriodo = await consultarUna(
        `SELECT id, lectura_anterior, lectura_actual, consumo_litros,
                inconsistencia, inconsistencia_resuelta
           FROM lecturas WHERE periodo_id = $1 AND conexion_id = $2`,
        [periodo.id, conexion.id]
      );
      reciboPeriodo = await consultarUna(
        `SELECT id, correlativo, total_centavos, saldo_centavos, estado, emitido_en
           FROM recibos WHERE periodo_id = $1 AND conexion_id = $2`,
        [periodo.id, conexion.id]
      );
    }

    const historial = await consultar(
      `SELECT p.anio, p.mes, l.lectura_anterior, l.lectura_actual, l.consumo_litros
         FROM lecturas l JOIN periodos p ON p.id = l.periodo_id
        WHERE l.conexion_id = $1
        ORDER BY p.anio DESC, p.mes DESC LIMIT 6`,
      [conexion.id]
    );

    const recibos = await consultar(
      `SELECT r.id, r.correlativo, r.total_centavos, r.saldo_centavos, r.estado,
              p.anio, p.mes
         FROM recibos r JOIN periodos p ON p.id = r.periodo_id
        WHERE r.conexion_id = $1
        ORDER BY r.correlativo DESC LIMIT 8`,
      [conexion.id]
    );

    const saldo = await consultarUna(
      `SELECT COALESCE(SUM(saldo_centavos), 0)::int AS pendiente
         FROM recibos WHERE conexion_id = $1 AND saldo_centavos > 0`,
      [conexion.id]
    );

    res.json({
      conexion: conexion,
      periodo: periodo,
      lecturaAnterior: Number(lecturaAnterior.valor),
      lecturaPeriodo: lecturaPeriodo,
      reciboPeriodo: reciboPeriodo,
      historial: historial,
      recibos: recibos,
      saldoPendienteCentavos: saldo.pendiente,
    });
  } catch (e) { next(e); }
});

async function calcularVisita(conexionId, lecturaActual) {
  const periodo = await periodoAbierto();
  if (!periodo) {
    const err = new Error('No hay un periodo abierto para facturar. El tesorero o el administrador debe abrir el mes.');
    err.estado = 409;
    throw err;
  }

  const conexion = await consultarUna(
    `SELECT c.id, c.codigo, c.modalidad, c.estado,
            b.nombres || ' ' || b.apellidos AS titular, b.direccion, c.sector,
            m.id AS medidor_id, m.digitos, m.lectura_inicial
       FROM conexiones c
       JOIN beneficiarios b ON b.id = c.beneficiario_id
       LEFT JOIN medidores m ON m.conexion_id = c.id AND m.estado = 'ACTIVO'
      WHERE c.id = $1 AND c.eliminado_en IS NULL AND c.estado = 'ACTIVA'`,
    [conexionId]
  );
  if (!conexion) {
    const err = new Error('La conexión no existe o no está activa.');
    err.estado = 404;
    throw err;
  }

  const existente = await consultarUna(
    `SELECT id, correlativo, total_centavos, saldo_centavos, estado
       FROM recibos WHERE periodo_id = $1 AND conexion_id = $2`,
    [periodo.id, conexionId]
  );
  if (existente) {
    return {
      yaEmitido: true,
      periodo: periodo,
      conexion: conexion,
      recibo: await payloadRecibo(existente.id),
    };
  }

  const cargos = await cargosDeConexion(conexionId, periodo.id);
  const tarifa = await tarifaVigente(periodo.fecha_fin);

  let consumoLitros = 0;
  let resultadoLectura = null;
  let lecturaAnterior = 0;

  if (conexion.modalidad === 'MEDIDA') {
    const ant = await consultarUna(
      `SELECT COALESCE(
         (SELECT l.lectura_actual FROM lecturas l
           WHERE l.conexion_id = $1 AND l.periodo_id IS DISTINCT FROM $2
           ORDER BY l.id DESC LIMIT 1),
         $3, 0) AS valor`,
      [conexionId, periodo.id, conexion.lectura_inicial]
    );
    lecturaAnterior = Number(ant.valor);

    const actual = parseInt(lecturaActual, 10);
    if (!Number.isInteger(actual) || actual < 0) {
      const err = new Error('Indique la lectura actual del medidor.');
      err.estado = 400;
      throw err;
    }

    const historialFilas = await consultar(
      `SELECT consumo_litros FROM lecturas
        WHERE conexion_id = $1 ORDER BY id DESC LIMIT 6`,
      [conexionId]
    );
    const historial = historialFilas.map(function (f) { return f.consumo_litros; }).reverse();
    resultadoLectura = calcularConsumo(lecturaAnterior, actual, historial);
    if (resultadoLectura.inconsistencia === 'LECTURA_MENOR') {
      const err = new Error(resultadoLectura.mensaje);
      err.estado = 409;
      err.detalle = resultadoLectura;
      throw err;
    }
    consumoLitros = resultadoLectura.consumoLitros;
  }

  const desglose = calcularRecibo(consumoLitros, tarifa, conexion.modalidad, {
    moraCentavos: cargos.moraCentavos,
    saldoAnteriorCentavos: cargos.saldoAnteriorCentavos,
    saldoFavorCentavos: cargos.saldoFavorCentavos,
  });

  return {
    yaEmitido: false,
    periodo: periodo,
    conexion: conexion,
    lecturaAnterior: lecturaAnterior,
    lecturaActual: conexion.modalidad === 'MEDIDA' ? parseInt(lecturaActual, 10) : null,
    resultadoLectura: resultadoLectura,
    cargos: cargos,
    tarifa: tarifa,
    desglose: desglose,
  };
}

router.post('/cobro/preview', autenticar, exigirPermiso('cobro'), async function (req, res, next) {
  try {
    const conexionId = parseInt(req.body.conexionId, 10);
    const visita = await calcularVisita(conexionId, req.body.lecturaActual);
    if (visita.yaEmitido) {
      return res.json({
        yaEmitido: true,
        mensaje: 'Este periodo ya tiene recibo. Puede reimprimirlo o registrar el cobro sin volver a facturar.',
        recibo: visita.recibo,
      });
    }
    res.json({
      yaEmitido: false,
      titular: visita.conexion.titular,
      conexion: visita.conexion.codigo,
      direccion: visita.conexion.direccion,
      periodo: String(visita.periodo.mes).padStart(2, '0') + '/' + visita.periodo.anio,
      lecturaAnterior: visita.lecturaAnterior,
      lecturaActual: visita.lecturaActual,
      consumoLitros: visita.desglose.consumoLitros,
      desglose: visita.desglose,
      lineas: lineasDelRecibo(visita.desglose, visita.tarifa),
      advertencia: visita.resultadoLectura && visita.resultadoLectura.requiereRevision
        ? visita.resultadoLectura.mensaje
        : null,
    });
  } catch (e) {
    if (e.estado) return res.status(e.estado).json({ error: e.message, detalle: e.detalle });
    next(e);
  }
});

router.post('/cobro/confirmar', autenticar, exigirPermiso('cobro'), async function (req, res, next) {
  try {
    const conexionId = parseInt(req.body.conexionId, 10);
    const cobrar = Boolean(req.body.cobrar);
    const visita = await calcularVisita(conexionId, req.body.lecturaActual);

    if (visita.yaEmitido) {
      let recibo = visita.recibo;
      if (cobrar && recibo.saldoCentavos > 0) {
        await aplicarCobro(conexionId, recibo.saldoCentavos, req);
        recibo = await payloadRecibo(recibo.id);
      }
      return res.json({
        duplicadoEvitado: true,
        recibo: recibo,
        mensaje: 'No se emitió un recibo nuevo. Puede reimprimir el existente.',
      });
    }

    const reciboId = await enTransaccion(async function (cliente) {
      await cliente.query('SELECT id FROM conexiones WHERE id = $1 FOR UPDATE', [conexionId]);

      const otra = await cliente.query(
        `SELECT id FROM recibos WHERE periodo_id = $1 AND conexion_id = $2`,
        [visita.periodo.id, conexionId]
      );
      if (otra.rows[0]) return otra.rows[0].id;

      let lecturaId = null;
      if (visita.conexion.modalidad === 'MEDIDA') {
        const ins = await cliente.query(
          `INSERT INTO lecturas
             (periodo_id, conexion_id, medidor_id, lectura_anterior, lectura_actual,
              consumo_litros, lector_id, inconsistencia, inconsistencia_resuelta, observacion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (periodo_id, conexion_id) DO UPDATE SET
             lectura_actual = EXCLUDED.lectura_actual,
             consumo_litros = EXCLUDED.consumo_litros,
             inconsistencia = EXCLUDED.inconsistencia,
             inconsistencia_resuelta = EXCLUDED.inconsistencia_resuelta,
             observacion = EXCLUDED.observacion,
             tomada_en = NOW()
           RETURNING id`,
          [
            visita.periodo.id, conexionId, visita.conexion.medidor_id,
            visita.lecturaAnterior, visita.lecturaActual, visita.desglose.consumoLitros,
            req.usuario.id,
            visita.resultadoLectura.inconsistencia,
            !visita.resultadoLectura.requiereRevision,
            req.body.observacion || null,
          ]
        );
        lecturaId = ins.rows[0].id;
      }

      await cliente.query('LOCK TABLE recibos IN SHARE ROW EXCLUSIVE MODE');
      const ultimo = await cliente.query('SELECT COALESCE(MAX(correlativo), 0) AS n FROM recibos');
      const correlativo = Number(ultimo.rows[0].n) + 1;
      const d = visita.desglose;

      const insR = await cliente.query(
        `INSERT INTO recibos
           (correlativo, periodo_id, conexion_id, lectura_id, tarifa_id, consumo_litros,
            monto_basico_centavos, monto_exceso_centavos, bloques_cobrados,
            monto_mora_centavos, saldo_anterior_centavos, total_centavos,
            saldo_centavos, fecha_vencimiento, emitido_por_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [
          correlativo, visita.periodo.id, conexionId, lecturaId, visita.tarifa.id,
          d.consumoLitros, d.montoBasicoCentavos, d.montoExcesoCentavos,
          d.bloquesCobrados, d.montoMoraCentavos, d.saldoAnteriorCentavos,
          d.totalCentavos, d.totalCentavos, visita.periodo.fecha_vencimiento,
          req.usuario.id,
        ]
      );

      if (d.saldoAnteriorCentavos > 0) {
        await cliente.query(
          `UPDATE recibos SET saldo_centavos = 0, estado = 'PAGADO'
            WHERE conexion_id = $1 AND periodo_id IS DISTINCT FROM $2 AND saldo_centavos > 0`,
          [conexionId, visita.periodo.id]
        );
      }
      if (d.saldoFavorAplicadoCentavos > 0) {
        await cliente.query(
          `UPDATE conexiones
              SET saldo_favor_centavos = GREATEST(0, saldo_favor_centavos - $1)
            WHERE id = $2`,
          [d.saldoFavorAplicadoCentavos, conexionId]
        );
      }

      await registrarBitacora({
        actorId: req.usuario.id, accion: 'EMITIR_RECIBO', entidad: 'recibos',
        entidadId: insR.rows[0].id,
        valoresDespues: { correlativo: correlativo, conexion: visita.conexion.codigo },
        ip: req.ip,
      }, cliente);

      return insR.rows[0].id;
    });

    if (cobrar) {
      const rec = await consultarUna(
        `SELECT saldo_centavos FROM recibos WHERE id = $1`, [reciboId]
      );
      if (rec.saldo_centavos > 0) {
        await aplicarCobro(conexionId, rec.saldo_centavos, req);
      }
    }

    res.status(201).json({
      duplicadoEvitado: false,
      recibo: await payloadRecibo(reciboId),
      mensaje: cobrar ? 'Recibo emitido y cobro registrado.' : 'Recibo emitido. Queda pendiente de cobro.',
    });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({
        error: 'Este periodo ya tiene recibo para esa conexión. Reimprima el existente.',
      });
    }
    if (e.estado) return res.status(e.estado).json({ error: e.message, detalle: e.detalle });
    next(e);
  }
});

async function aplicarCobro(conexionId, monto, req) {
  await enTransaccion(async function (cliente) {
    await cliente.query('SELECT id FROM conexiones WHERE id = $1 FOR UPDATE', [conexionId]);
    const filas = await cliente.query(
      `SELECT id, correlativo, saldo_centavos FROM recibos
        WHERE conexion_id = $1 AND saldo_centavos > 0
        ORDER BY correlativo FOR UPDATE`,
      [conexionId]
    );
    const pendientes = filas.rows.map(function (r) {
      return { id: r.id, correlativo: r.correlativo, saldoCentavos: r.saldo_centavos };
    });
    if (!pendientes.length) return;
    const resultado = aplicarPago(pendientes, monto);

    await cliente.query('LOCK TABLE pagos IN SHARE ROW EXCLUSIVE MODE');
    const ultimo = await cliente.query('SELECT COALESCE(MAX(correlativo), 0) AS n FROM pagos');
    let correlativo = Number(ultimo.rows[0].n);
    for (const a of resultado.aplicaciones) {
      correlativo += 1;
      await cliente.query(
        `INSERT INTO pagos (correlativo, recibo_id, monto_centavos, forma_pago, recibido_por_id)
         VALUES ($1,$2,$3,'EFECTIVO',$4)`,
        [correlativo, a.reciboId, a.montoAplicadoCentavos, req.usuario.id]
      );
      await cliente.query(
        `UPDATE recibos SET saldo_centavos = $1,
                estado = CASE WHEN $1 = 0 THEN 'PAGADO'::estado_recibo
                              ELSE 'PARCIAL'::estado_recibo END
          WHERE id = $2`,
        [a.saldoRestanteCentavos, a.reciboId]
      );
    }
    await registrarBitacora({
      actorId: req.usuario.id, accion: 'REGISTRAR_PAGO', entidad: 'pagos',
      entidadId: conexionId,
      valoresDespues: { montoCentavos: monto, conexionId: conexionId },
      ip: req.ip,
    }, cliente);
  });
}

module.exports = router;
module.exports.payloadRecibo = payloadRecibo;
