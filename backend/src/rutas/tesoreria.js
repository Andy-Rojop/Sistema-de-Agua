/**
 * RUTAS: TESORERÍA, PAGOS Y REPORTES
 * Módulos RF-03 y RF-05 de la ERS.
 */

'use strict';

const express = require('express');
const { consultar, consultarUna, enTransaccion, registrarBitacora } = require('../datos/bd');
const { autenticar, exigirPermiso } = require('./seguridad');
const { aplicarPago, estadoDeMorosidad } = require('../dominio/pagos');
const { periodoAbierto, sugerirSiguientePeriodo } = require('../dominio/periodo');

const router = express.Router();

// =============================================================== tesorería ==

// RF-05.1 — Estado de cuenta de una conexión.
router.get('/conexiones/:id/estado-cuenta', autenticar,
  exigirPermiso('pagos'), async function (req, res, next) {
  try {
    const conexion = await consultarUna(
      `SELECT c.id, c.codigo, c.saldo_favor_centavos,
              b.nombres || ' ' || b.apellidos AS titular
         FROM conexiones c
         JOIN beneficiarios b ON b.id = c.beneficiario_id
        WHERE c.id = $1`,
      [req.params.id]
    );
    if (!conexion) return res.status(404).json({ error: 'La conexión no existe.' });

    const recibos = await consultar(
      `SELECT r.id, r.correlativo, r.consumo_litros, r.total_centavos,
              r.saldo_centavos, r.estado, r.fecha_vencimiento, r.emitido_en,
              p.anio, p.mes
         FROM recibos r JOIN periodos p ON p.id = r.periodo_id
        WHERE r.conexion_id = $1
        ORDER BY r.correlativo DESC`,
      [req.params.id]
    );

    const pagos = await consultar(
      `SELECT pg.id, pg.correlativo, pg.monto_centavos, pg.fecha_pago,
              pg.forma_pago, pg.referencia, pg.anulado, u.nombre AS recibido_por
         FROM pagos pg
         JOIN recibos r ON r.id = pg.recibo_id
         JOIN usuarios u ON u.id = pg.recibido_por_id
        WHERE r.conexion_id = $1
        ORDER BY pg.fecha_pago DESC, pg.id DESC`,
      [req.params.id]
    );

    const pendientes = recibos
      .filter(function (r) { return r.saldo_centavos > 0; })
      .map(function (r) {
        return {
          id: r.id, correlativo: r.correlativo,
          saldoCentavos: r.saldo_centavos, fechaVencimiento: r.fecha_vencimiento,
        };
      });

    res.json({
      conexion: conexion,
      recibos: recibos,
      pagos: pagos,
      morosidad: estadoDeMorosidad(pendientes, new Date()),
      saldoPendienteCentavos: pendientes.reduce(function (a, r) {
        return a + r.saldoCentavos;
      }, 0),
    });
  } catch (e) { next(e); }
});

// RF-03.2 — Vista previa de la distribución del pago, antes de confirmarlo.
router.post('/pagos/previsualizar', autenticar, exigirPermiso('pagos'),
  async function (req, res, next) {
  try {
    const conexionId = parseInt(req.body.conexionId, 10);
    const monto = Math.round(Number(req.body.montoCentavos));

    if (!Number.isInteger(conexionId) || !Number.isInteger(monto) || monto <= 0) {
      return res.status(400).json({ error: 'Indique una conexión y un monto válidos.' });
    }

    const pendientes = (await consultar(
      `SELECT id, correlativo, saldo_centavos FROM recibos
        WHERE conexion_id = $1 AND saldo_centavos > 0 ORDER BY correlativo`,
      [conexionId]
    )).map(function (r) {
      return { id: r.id, correlativo: r.correlativo, saldoCentavos: r.saldo_centavos };
    });

    if (!pendientes.length) {
      return res.status(409).json({ error: 'Esta conexión no tiene saldos pendientes.' });
    }

    res.json(aplicarPago(pendientes, monto));
  } catch (e) { next(e); }
});

// RF-03.1 a RF-03.3 — Registro del pago.
router.post('/pagos', autenticar, exigirPermiso('pagos'),
  async function (req, res, next) {
  try {
    const conexionId = parseInt(req.body.conexionId, 10);
    const monto = Math.round(Number(req.body.montoCentavos));
    const formaPago = req.body.formaPago || 'EFECTIVO';

    if (!Number.isInteger(conexionId) || !Number.isInteger(monto) || monto <= 0) {
      return res.status(400).json({ error: 'Indique una conexión y un monto válidos.' });
    }
    if (['EFECTIVO', 'DEPOSITO', 'TRANSFERENCIA'].indexOf(formaPago) === -1) {
      return res.status(400).json({ error: 'Forma de pago no válida.' });
    }

    const resultado = await enTransaccion(async function (cliente) {
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
      if (!pendientes.length) {
        const err = new Error('Esta conexión no tiene saldos pendientes.');
        err.estado = 409;
        throw err;
      }

      // RN-18: la distribución la decide el dominio, no la base de datos.
      const resultado = aplicarPago(pendientes, monto);

      await cliente.query('LOCK TABLE pagos IN SHARE ROW EXCLUSIVE MODE');
      const ultimo = await cliente.query('SELECT COALESCE(MAX(correlativo), 0) AS n FROM pagos');
      let correlativo = Number(ultimo.rows[0].n);

      for (const a of resultado.aplicaciones) {
        correlativo += 1;
        await cliente.query(
          `INSERT INTO pagos (correlativo, recibo_id, monto_centavos, forma_pago,
                              referencia, recibido_por_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [correlativo, a.reciboId, a.montoAplicadoCentavos, formaPago,
           req.body.referencia || null, req.usuario.id]
        );
        await cliente.query(
          `UPDATE recibos SET saldo_centavos = $1,
                  estado = CASE WHEN $1 = 0 THEN 'PAGADO'::estado_recibo
                                ELSE 'PARCIAL'::estado_recibo END
            WHERE id = $2`,
          [a.saldoRestanteCentavos, a.reciboId]
        );
      }

      if (resultado.saldoFavorCentavos > 0) {
        await cliente.query(
          `UPDATE conexiones SET saldo_favor_centavos = saldo_favor_centavos + $1
            WHERE id = $2`,
          [resultado.saldoFavorCentavos, conexionId]
        );
      }

      await registrarBitacora({
        actorId: req.usuario.id, accion: 'REGISTRAR_PAGO', entidad: 'conexiones',
        entidadId: conexionId,
        valoresDespues: {
          montoCentavos: monto, formaPago: formaPago,
          aplicaciones: resultado.aplicaciones,
          saldoFavor: resultado.saldoFavorCentavos,
        },
        ip: req.ip,
      }, cliente);

      return resultado;
    });

    res.status(201).json(resultado);
  } catch (e) {
    if (e.estado) return res.status(e.estado).json({ error: e.message });
    next(e);
  }
});

// RF-03.4 — Anulación de pago. No elimina el registro (RN-21).
router.post('/pagos/:id/anular', autenticar, exigirPermiso('pagos'),
  async function (req, res, next) {
  try {
    const motivo = String(req.body.motivo || '').trim();
    if (motivo.length < 5) {
      return res.status(400).json({ error: 'Indique el motivo de la anulación.' });
    }

    const pago = await consultarUna('SELECT * FROM pagos WHERE id = $1', [req.params.id]);
    if (!pago) return res.status(404).json({ error: 'El pago no existe.' });
    if (pago.anulado) return res.status(409).json({ error: 'El pago ya estaba anulado.' });

    await enTransaccion(async function (cliente) {
      await cliente.query('SELECT id FROM pagos WHERE id = $1 FOR UPDATE', [pago.id]);
      await cliente.query('SELECT id FROM recibos WHERE id = $1 FOR UPDATE', [pago.recibo_id]);
      await cliente.query(
        `UPDATE pagos SET anulado = TRUE, motivo_anulacion = $1, anulado_en = NOW()
          WHERE id = $2`,
        [motivo, pago.id]
      );
      // El monto vuelve al saldo del recibo.
      await cliente.query(
        `UPDATE recibos
            SET saldo_centavos = saldo_centavos + $1,
                estado = CASE WHEN saldo_centavos + $1 >= total_centavos
                              THEN 'PENDIENTE'::estado_recibo
                              ELSE 'PARCIAL'::estado_recibo END
          WHERE id = $2`,
        [pago.monto_centavos, pago.recibo_id]
      );

      await registrarBitacora({
        actorId: req.usuario.id, accion: 'ANULAR_PAGO', entidad: 'pagos',
        entidadId: pago.id, valoresAntes: pago,
        valoresDespues: { anulado: true, motivo: motivo }, ip: req.ip,
      }, cliente);
    });

    res.json({ mensaje: 'Pago anulado. El registro se conserva en la bitácora.' });
  } catch (e) { next(e); }
});

// RF-03.7 — Corte de caja del día.
router.get('/reportes/corte-caja', autenticar, exigirPermiso('reportes'),
  async function (req, res, next) {
  try {
    const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
    res.json({
      fecha: fecha,
      detalle: await consultar(
        `SELECT u.nombre AS recibido_por, pg.forma_pago,
                COUNT(*)::int AS cantidad, SUM(pg.monto_centavos)::int AS total_centavos
           FROM pagos pg JOIN usuarios u ON u.id = pg.recibido_por_id
          WHERE pg.fecha_pago = $1 AND pg.anulado = FALSE
          GROUP BY u.nombre, pg.forma_pago
          ORDER BY u.nombre`,
        [fecha]
      ),
    });
  } catch (e) { next(e); }
});

// ================================================================ reportes ==

// RF-05.2 — Usuarios morosos. Es el reporte que sustenta el objetivo OE-05.
router.get('/reportes/morosos', autenticar, exigirPermiso('reportes'),
  async function (req, res, next) {
  try {
    const sector = req.query.sector || null;
    res.json(await consultar(
      `SELECT c.id, c.codigo, c.sector,
              b.nombres || ' ' || b.apellidos AS titular, b.telefono,
              COUNT(r.id)::int              AS recibos_vencidos,
              SUM(r.saldo_centavos)::int    AS deuda_centavos,
              MIN(r.fecha_vencimiento)      AS vencimiento_mas_antiguo,
              (CURRENT_DATE - MIN(r.fecha_vencimiento))::int AS dias_atraso
         FROM recibos r
         JOIN conexiones c    ON c.id = r.conexion_id
         JOIN beneficiarios b ON b.id = c.beneficiario_id
        WHERE r.saldo_centavos > 0 AND r.fecha_vencimiento < CURRENT_DATE
          AND ($1::text IS NULL OR c.sector = $1)
        GROUP BY c.id, c.codigo, c.sector, b.nombres, b.apellidos, b.telefono
        ORDER BY dias_atraso DESC, deuda_centavos DESC`,
      [sector]
    ));
  } catch (e) { next(e); }
});

// RF-05.3 — Ingresos por periodo, desglosados por concepto.
router.get('/reportes/ingresos', autenticar, exigirPermiso('reportes'),
  async function (req, res, next) {
  try {
    res.json(await consultar(
      `SELECT p.anio, p.mes,
              COUNT(r.id)::int                   AS recibos,
              SUM(r.monto_basico_centavos)::int  AS tarifa_basica_centavos,
              SUM(r.monto_exceso_centavos)::int  AS exceso_centavos,
              SUM(r.monto_mora_centavos)::int    AS mora_centavos,
              SUM(r.total_centavos)::int         AS facturado_centavos,
              SUM(r.total_centavos - r.saldo_centavos)::int AS recaudado_centavos
         FROM recibos r JOIN periodos p ON p.id = r.periodo_id
        GROUP BY p.anio, p.mes
        ORDER BY p.anio DESC, p.mes DESC`
    ));
  } catch (e) { next(e); }
});

// RF-05.4 — Consumo total de la comunidad por periodo.
router.get('/reportes/consumo', autenticar, exigirPermiso('reportes'), async function (req, res, next) {
  try {
    res.json(await consultar(
      `SELECT p.anio, p.mes,
              COUNT(l.id)::int              AS lecturas,
              SUM(l.consumo_litros)::bigint AS consumo_total_litros,
              ROUND(AVG(l.consumo_litros))::int AS consumo_promedio_litros,
              MAX(l.consumo_litros)::int    AS consumo_maximo_litros
         FROM lecturas l JOIN periodos p ON p.id = l.periodo_id
        GROUP BY p.anio, p.mes
        ORDER BY p.anio DESC, p.mes DESC`
    ));
  } catch (e) { next(e); }
});

// RF-05.5 — Indicadores del tablero.
router.get('/reportes/tablero', autenticar, exigirPermiso('tablero'),
  async function (req, res, next) {
  try {
    const periodo = await consultarUna(
      `SELECT * FROM periodos ORDER BY anio DESC, mes DESC LIMIT 1`
    );
    const abierto = await periodoAbierto();
    const siguiente = abierto ? null : await sugerirSiguientePeriodo();
    if (!periodo) return res.json({ periodo: null, siguiente: siguiente });

    const indicadores = await consultarUna(
      `SELECT
         (SELECT COUNT(*) FROM conexiones
           WHERE estado = 'ACTIVA' AND eliminado_en IS NULL)::int AS conexiones_activas,
         (SELECT COUNT(*) FROM conexiones
           WHERE estado = 'ACTIVA' AND modalidad = 'MEDIDA' AND eliminado_en IS NULL)::int AS con_medidor,
         (SELECT COUNT(*) FROM lecturas WHERE periodo_id = $1)::int AS lecturas_tomadas,
         (SELECT COUNT(*) FROM lecturas WHERE periodo_id = $1
            AND inconsistencia <> 'NINGUNA' AND inconsistencia_resuelta = FALSE)::int AS por_revisar,
         COALESCE((SELECT SUM(total_centavos) FROM recibos WHERE periodo_id = $1), 0)::int AS facturado_centavos,
         COALESCE((SELECT SUM(total_centavos - saldo_centavos) FROM recibos WHERE periodo_id = $1), 0)::int AS recaudado_centavos,
         (SELECT COUNT(DISTINCT conexion_id) FROM recibos
           WHERE saldo_centavos > 0 AND fecha_vencimiento < CURRENT_DATE)::int AS conexiones_morosas,
         COALESCE((SELECT SUM(consumo_litros) FROM lecturas WHERE periodo_id = $1), 0)::bigint AS consumo_total_litros`,
      [periodo.id]
    );

    res.json({ periodo: periodo, indicadores: indicadores, siguiente: siguiente });
  } catch (e) { next(e); }
});

// RF-05.8 — Historial de consumo de una conexión, para la gráfica.
router.get('/conexiones/:id/historial', autenticar, exigirPermiso('pagos'), async function (req, res, next) {
  try {
    res.json(await consultar(
      `SELECT p.anio, p.mes, l.consumo_litros, l.lectura_anterior, l.lectura_actual
         FROM lecturas l JOIN periodos p ON p.id = l.periodo_id
        WHERE l.conexion_id = $1
        ORDER BY p.anio DESC, p.mes DESC LIMIT 12`,
      [req.params.id]
    ));
  } catch (e) { next(e); }
});

// RF-06.11 — Consulta de la bitácora.
router.get('/bitacora', autenticar, exigirPermiso('bitacora'), async function (req, res, next) {
  try {
    res.json(await consultar(
      `SELECT b.id, b.accion, b.entidad, b.entidad_id, b.valores_antes,
              b.valores_despues, b.creado_en, u.nombre AS actor, u.rol
         FROM bitacora b LEFT JOIN usuarios u ON u.id = b.actor_id
        WHERE ($1::text IS NULL OR b.entidad = $1)
          AND ($2::text IS NULL OR b.accion = $2)
        ORDER BY b.creado_en DESC LIMIT 200`,
      [req.query.entidad || null, req.query.accion || null]
    ));
  } catch (e) { next(e); }
});

module.exports = router;
