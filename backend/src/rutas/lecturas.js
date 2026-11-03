/**
 * RUTAS: PERIODOS, LECTURAS, CIERRE Y RECIBOS
 * Módulos RF-02 y RF-04 de la ERS.
 */

'use strict';

const express = require('express');
const { consultar, consultarUna, enTransaccion, registrarBitacora } = require('../datos/bd');
const { autenticar, exigirPermiso } = require('./seguridad');
const { calcularConsumo } = require('../dominio/consumo');
const { vistaRecibo, SQL_RECIBO } = require('../dominio/recibo-vista');
const { validarCierre, generarRecibosDelPeriodo, resumirCierre } = require('../dominio/cierre');
const { calcularMora } = require('../dominio/pagos');
const { periodoAbierto, sugerirSiguientePeriodo } = require('../dominio/periodo');

const router = express.Router();

/** Tarifa vigente a la fecha indicada (RN-06). */
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

// ================================================================ periodos ==

// RF-02.1 y RF-02.2 — Apertura de periodo.
router.post('/periodos', autenticar, exigirPermiso('abrir_periodo'), async function (req, res, next) {
  try {
    if (await periodoAbierto()) {
      return res.status(409).json({
        error: 'Ya existe un periodo sin cerrar. Ciérrelo antes de abrir uno nuevo.',
      });
    }
    const b = req.body;
    if (!b.anio || !b.mes || !b.fechaInicio || !b.fechaFin || !b.fechaVencimiento) {
      return res.status(400).json({ error: 'Faltan datos del periodo.' });
    }

    const periodo = await consultarUna(
      `INSERT INTO periodos (anio, mes, fecha_inicio, fecha_fin, fecha_vencimiento, estado)
       VALUES ($1, $2, $3, $4, $5, 'EN_LECTURA') RETURNING *`,
      [b.anio, b.mes, b.fechaInicio, b.fechaFin, b.fechaVencimiento]
    );

    await registrarBitacora({
      actorId: req.usuario.id, accion: 'ABRIR_PERIODO', entidad: 'periodos',
      entidadId: periodo.id, valoresDespues: periodo, ip: req.ip,
    });

    res.status(201).json(periodo);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ese mes ya fue facturado.' });
    }
    next(e);
  }
});

// RF-02.9 — Avance de la toma de lecturas.
router.get('/periodos/actual', autenticar, async function (req, res, next) {
  try {
    const periodo = await periodoAbierto();
    if (!periodo) {
      return res.json({
        periodo: null,
        siguiente: await sugerirSiguientePeriodo(),
        avance: { total: 0, leidas: 0, por_revisar: 0 },
      });
    }

    const avance = await consultarUna(
      `SELECT
         (SELECT COUNT(*) FROM conexiones
           WHERE estado = 'ACTIVA' AND modalidad = 'MEDIDA' AND eliminado_en IS NULL) AS total,
         (SELECT COUNT(*) FROM lecturas WHERE periodo_id = $1) AS leidas,
         (SELECT COUNT(*) FROM lecturas
           WHERE periodo_id = $1 AND inconsistencia <> 'NINGUNA'
             AND inconsistencia_resuelta = FALSE) AS por_revisar`,
      [periodo.id]
    );

    res.json({ periodo: periodo, avance: avance });
  } catch (e) { next(e); }
});

// RF-02.3 — Conexiones del periodo con marca de visita (lectura tomada o no).
router.get('/periodos/actual/pendientes', autenticar,
  exigirPermiso('lecturas'), async function (req, res, next) {
  try {
    const periodo = await periodoAbierto();
    if (!periodo) {
      return res.json({
        periodo: null,
        siguiente: await sugerirSiguientePeriodo(),
        conexiones: [],
        pendientes: [],
        total: 0,
        visitadas: 0,
        pendientes_total: 0,
      });
    }

    const conexiones = await consultar(
      `SELECT c.id, c.codigo, c.sector, m.serie AS medidor_serie, m.digitos,
              b.nombres || ' ' || b.apellidos AS titular,
              COALESCE(
                (SELECT l.lectura_actual FROM lecturas l
                  WHERE l.conexion_id = c.id
                    AND (l.periodo_id IS DISTINCT FROM $1)
                  ORDER BY l.id DESC LIMIT 1),
                m.lectura_inicial, 0) AS lectura_anterior,
              EXISTS (
                SELECT 1 FROM lecturas l
                 WHERE l.periodo_id = $1 AND l.conexion_id = c.id
              ) AS leida,
              (SELECT l.lectura_actual FROM lecturas l
                WHERE l.periodo_id = $1 AND l.conexion_id = c.id
                LIMIT 1) AS lectura_periodo
         FROM conexiones c
         JOIN beneficiarios b ON b.id = c.beneficiario_id
         LEFT JOIN medidores m ON m.conexion_id = c.id AND m.estado = 'ACTIVO'
        WHERE c.estado = 'ACTIVA' AND c.modalidad = 'MEDIDA' AND c.eliminado_en IS NULL
        ORDER BY leida ASC, c.sector NULLS LAST, c.codigo`,
      [periodo.id]
    );

    const visitadas = conexiones.filter(function (c) { return c.leida; }).length;
    const pendientes = conexiones.filter(function (c) { return !c.leida; });

    res.json({
      periodo: periodo,
      conexiones: conexiones,
      pendientes: pendientes,
      total: conexiones.length,
      visitadas: visitadas,
      pendientes_total: pendientes.length,
    });
  } catch (e) { next(e); }
});

// ================================================================ lecturas ==

// RF-02.4 a RF-02.7 — Registro de una lectura.
router.post('/lecturas', autenticar, exigirPermiso('lecturas'),
  async function (req, res, next) {
  try {
    const conexionId = parseInt(req.body.conexionId, 10);
    const lecturaActual = parseInt(req.body.lecturaActual, 10);

    if (!Number.isInteger(conexionId) || !Number.isInteger(lecturaActual) || lecturaActual < 0) {
      return res.status(400).json({ error: 'Datos de lectura inválidos.' });
    }

    const periodo = await periodoAbierto();
    if (!periodo) return res.status(409).json({ error: 'No hay un periodo abierto.' });

    const conexion = await consultarUna(
      `SELECT c.id, c.codigo, c.modalidad,
              m.id AS medidor_id, m.digitos,
              COALESCE(
                (SELECT l.lectura_actual FROM lecturas l
                  WHERE l.conexion_id = c.id ORDER BY l.id DESC LIMIT 1),
                m.lectura_inicial, 0) AS lectura_anterior
         FROM conexiones c
         LEFT JOIN medidores m ON m.conexion_id = c.id AND m.estado = 'ACTIVO'
        WHERE c.id = $1 AND c.estado = 'ACTIVA' AND c.eliminado_en IS NULL`,
      [conexionId]
    );
    if (!conexion) return res.status(404).json({ error: 'La conexión no existe o no está activa.' });

    // Historial de consumos para detectar inconsistencias (RN-15, RN-16).
    const historialFilas = await consultar(
      `SELECT consumo_litros FROM lecturas
        WHERE conexion_id = $1 ORDER BY id DESC LIMIT 6`,
      [conexionId]
    );
    const historial = historialFilas.map(function (f) { return f.consumo_litros; }).reverse();

    // RN-17: la lectura anterior la aporta el servidor, NUNCA el cliente.
    // Aunque alguien manipule la petición, no puede alterar la base del cálculo.
    const resultado = calcularConsumo(conexion.lectura_anterior, lecturaActual, historial);

    const lectura = await consultarUna(
      `INSERT INTO lecturas
         (periodo_id, conexion_id, medidor_id, lectura_anterior, lectura_actual,
          consumo_litros, lector_id, inconsistencia, inconsistencia_resuelta, observacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (periodo_id, conexion_id) DO UPDATE SET
         lectura_actual = EXCLUDED.lectura_actual,
         consumo_litros = EXCLUDED.consumo_litros,
         inconsistencia = EXCLUDED.inconsistencia,
         inconsistencia_resuelta = EXCLUDED.inconsistencia_resuelta,
         observacion = EXCLUDED.observacion,
         tomada_en = NOW()
       RETURNING *`,
      [periodo.id, conexionId, conexion.medidor_id, conexion.lectura_anterior,
       lecturaActual, resultado.consumoLitros, req.usuario.id,
       resultado.inconsistencia, !resultado.requiereRevision,
       req.body.observacion || null]
    );

    await registrarBitacora({
      actorId: req.usuario.id, accion: 'REGISTRAR_LECTURA', entidad: 'lecturas',
      entidadId: lectura.id,
      valoresDespues: {
        conexion: conexion.codigo, lecturaActual: lecturaActual,
        consumo: resultado.consumoLitros, inconsistencia: resultado.inconsistencia,
      },
      ip: req.ip,
    });

    res.status(201).json({
      lectura: lectura,
      consumoLitros: resultado.consumoLitros,
      inconsistencia: resultado.inconsistencia,
      requiereRevision: resultado.requiereRevision,
      mensaje: resultado.mensaje,
      promedioHistorico: resultado.promedioHistorico,
    });
  } catch (e) { next(e); }
});

// RF-02.8 — Lecturas marcadas para revisión.
router.get('/lecturas/inconsistentes', autenticar, exigirPermiso('inconsistencias'),
  async function (req, res, next) {
  try {
    const periodo = await periodoAbierto();
    if (!periodo) return res.json([]);

    res.json(await consultar(
      `SELECT l.*, c.codigo, b.nombres || ' ' || b.apellidos AS titular
         FROM lecturas l
         JOIN conexiones c ON c.id = l.conexion_id
         JOIN beneficiarios b ON b.id = c.beneficiario_id
        WHERE l.periodo_id = $1 AND l.inconsistencia <> 'NINGUNA'
          AND l.inconsistencia_resuelta = FALSE
        ORDER BY c.codigo`,
      [periodo.id]
    ));
  } catch (e) { next(e); }
});

router.post('/lecturas/:id/resolver', autenticar, exigirPermiso('inconsistencias'),
  async function (req, res, next) {
  try {
    const nota = String(req.body.nota || '').trim();
    if (nota.length < 3) {
      return res.status(400).json({ error: 'Indique cómo se resolvió la inconsistencia.' });
    }

    const lectura = await consultarUna(
      `UPDATE lecturas SET inconsistencia_resuelta = TRUE, resolucion_nota = $1
        WHERE id = $2 RETURNING *`,
      [nota, req.params.id]
    );
    if (!lectura) return res.status(404).json({ error: 'La lectura no existe.' });

    await registrarBitacora({
      actorId: req.usuario.id, accion: 'RESOLVER_INCONSISTENCIA', entidad: 'lecturas',
      entidadId: lectura.id, valoresDespues: { nota: nota }, ip: req.ip,
    });

    res.json(lectura);
  } catch (e) { next(e); }
});

// ============================================================ cierre y recibos ==

/** Reúne los datos que el módulo de dominio necesita para cerrar. */
async function armarDatosCierre(periodo) {
  const tarifa = await tarifaVigente(periodo.fecha_fin);

  const conexionesActivas = (await consultar(
    `SELECT c.id, c.codigo, c.modalidad, c.saldo_favor_centavos,
            COALESCE((SELECT SUM(r.saldo_centavos) FROM recibos r
                       WHERE r.conexion_id = c.id AND r.saldo_centavos > 0), 0) AS saldo_anterior
       FROM conexiones c
      WHERE c.estado = 'ACTIVA' AND c.eliminado_en IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM recibos r WHERE r.periodo_id = $1 AND r.conexion_id = c.id
        )
      ORDER BY c.sector NULLS LAST, c.codigo`,
    [periodo.id]
  )).map(function (c) {
    const saldoAnterior = Number(c.saldo_anterior);
    return {
      id: c.id, codigo: c.codigo, modalidad: c.modalidad,
      saldoFavorCentavos: c.saldo_favor_centavos,
      saldoAnteriorCentavos: saldoAnterior,
      // RN-20: recargo por mora si arrastra saldo de periodos anteriores.
      moraCentavos: saldoAnterior > 0 ? calcularMora(saldoAnterior) : 0,
    };
  });

  const lecturas = (await consultar(
    `SELECT id, conexion_id, consumo_litros, inconsistencia, inconsistencia_resuelta
       FROM lecturas WHERE periodo_id = $1`,
    [periodo.id]
  )).map(function (l) {
    return {
      id: l.id, conexionId: l.conexion_id, consumoLitros: l.consumo_litros,
      inconsistencia: l.inconsistencia, inconsistenciaResuelta: l.inconsistencia_resuelta,
    };
  });

  const ultimo = await consultarUna('SELECT COALESCE(MAX(correlativo), 0) AS n FROM recibos');

  return {
    periodoId: periodo.id,
    fechaVencimiento: periodo.fecha_vencimiento,
    tarifa: tarifa,
    tarifaId: tarifa.id,
    conexionesActivas: conexionesActivas,
    lecturas: lecturas,
    ultimoCorrelativo: Number(ultimo.n),
  };
}

// RF-04.3 — Vista previa del cierre. No escribe nada.
router.get('/periodos/actual/validar-cierre', autenticar, exigirPermiso('cierre'),
  async function (req, res, next) {
  try {
    const periodo = await periodoAbierto();
    if (!periodo) return res.status(404).json({ error: 'No hay un periodo abierto.' });

    const datos = await armarDatosCierre(periodo);
    const validacion = validarCierre(datos);

    if (!validacion.puedeCerrar) return res.json(validacion);
    res.json({
      puedeCerrar: true, impedimentos: [],
      resumen: resumirCierre(generarRecibosDelPeriodo(datos)),
    });
  } catch (e) { next(e); }
});

// RF-04.4 — Cierre del periodo. Todo o nada.
router.post('/periodos/actual/cerrar', autenticar, exigirPermiso('cierre'),
  async function (req, res, next) {
  try {
    const periodo = await periodoAbierto();
    if (!periodo) return res.status(404).json({ error: 'No hay un periodo abierto.' });

    const datos = await armarDatosCierre(periodo);
    const validacion = validarCierre(datos);
    if (!validacion.puedeCerrar) {
      return res.status(409).json({
        error: 'El periodo no puede cerrarse todavía.',
        impedimentos: validacion.impedimentos,
      });
    }

    const recibos = generarRecibosDelPeriodo(datos);

    // La transacción es indispensable: se emiten los 400 recibos o ninguno.
    await enTransaccion(async function (cliente) {
      for (const r of recibos) {
        await cliente.query(
          `INSERT INTO recibos
             (correlativo, periodo_id, conexion_id, lectura_id, tarifa_id, consumo_litros,
              monto_basico_centavos, monto_exceso_centavos, bloques_cobrados,
              monto_mora_centavos, saldo_anterior_centavos, total_centavos,
              saldo_centavos, fecha_vencimiento)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [r.correlativo, r.periodoId, r.conexionId, r.lecturaId, r.tarifaId,
           r.consumoLitros, r.montoBasicoCentavos, r.montoExcesoCentavos,
           r.bloquesCobrados, r.montoMoraCentavos, r.saldoAnteriorCentavos,
           r.totalCentavos, r.saldoCentavos, r.fechaVencimiento]
        );
      }

      // El saldo anterior ya quedó incorporado en el recibo nuevo.
      await cliente.query(
        `UPDATE recibos SET saldo_centavos = 0, estado = 'PAGADO'
          WHERE periodo_id <> $1 AND saldo_centavos > 0`,
        [periodo.id]
      );
      await cliente.query(`UPDATE conexiones SET saldo_favor_centavos = 0`);

      await cliente.query(
        `UPDATE periodos SET estado = 'CERRADO', cerrado_por_id = $1, cerrado_en = NOW()
          WHERE id = $2`,
        [req.usuario.id, periodo.id]
      );

      await registrarBitacora({
        actorId: req.usuario.id, accion: 'CERRAR_PERIODO', entidad: 'periodos',
        entidadId: periodo.id,
        valoresDespues: { recibosEmitidos: recibos.length }, ip: req.ip,
      }, cliente);
    });

    res.json({ resumen: resumirCierre(recibos), mensaje: 'Periodo cerrado y recibos emitidos.' });
  } catch (e) { next(e); }
});

// RF-04.6 — Datos del recibo para que jsPDF lo componga en el navegador.
// El desglose y el correlativo vienen del servidor (ADR-05): el navegador
// solo les da formato, nunca los calcula.
router.get('/recibos/:id', autenticar, exigirPermiso('cobro'), async function (req, res, next) {
  try {
    const r = await consultarUna(SQL_RECIBO, [req.params.id]);
    if (!r) return res.status(404).json({ error: 'El recibo no existe.' });
    const parametros = await consultar(
      `SELECT clave, valor FROM parametros WHERE clave LIKE 'junta_%'`
    );
    const junta = {};
    parametros.forEach(function (p) { junta[p.clave] = p.valor; });
    res.json(vistaRecibo(r, junta));
  } catch (e) { next(e); }
});

module.exports = router;
