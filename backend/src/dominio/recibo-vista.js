/**
 * Vista de impresión de un recibo ya persistido.
 * El navegador no calcula montos: solo formatea este objeto (ADR-05).
 */

'use strict';

const { lineasDelRecibo } = require('./tarifa');

function vistaRecibo(r, junta) {
  const desglose = {
    consumoLitros: r.consumo_litros,
    litrosIncluidos: r.litros_incluidos,
    litrosExceso: Math.max(0, r.consumo_litros - r.litros_incluidos),
    bloquesCobrados: r.bloques_cobrados,
    montoBasicoCentavos: r.monto_basico_centavos,
    montoExcesoCentavos: r.monto_exceso_centavos,
    montoMoraCentavos: r.monto_mora_centavos,
    saldoAnteriorCentavos: r.saldo_anterior_centavos,
    saldoFavorAplicadoCentavos: 0,
    totalCentavos: r.total_centavos,
  };

  return {
    id: r.id,
    correlativo: r.correlativo,
    titular: r.titular,
    conexion: r.conexion_codigo,
    sector: r.sector,
    direccion: r.direccion,
    periodo: String(r.mes).padStart(2, '0') + '/' + r.anio,
    lecturaAnterior: r.lectura_anterior,
    lecturaActual: r.lectura_actual,
    fechaVencimiento: r.fecha_vencimiento,
    emitidoEn: r.emitido_en,
    estado: r.estado,
    saldoCentavos: r.saldo_centavos,
    tesorero: r.emitido_por_nombre || r.recibido_por_nombre || null,
    desglose: desglose,
    lineas: lineasDelRecibo(desglose, {
      precioBloqueCentavos: r.precio_bloque_centavos,
      litrosPorBloque: r.litros_por_bloque,
    }),
    junta: junta || {},
  };
}

const SQL_RECIBO = `
  SELECT r.*, c.codigo AS conexion_codigo, c.sector,
         b.nombres || ' ' || b.apellidos AS titular, b.direccion,
         p.anio, p.mes,
         l.lectura_anterior, l.lectura_actual,
         t.precio_bloque_centavos, t.litros_incluidos, t.litros_por_bloque,
         ue.nombre AS emitido_por_nombre,
         (SELECT u.nombre FROM pagos pg
            JOIN usuarios u ON u.id = pg.recibido_por_id
           WHERE pg.recibo_id = r.id AND pg.anulado = FALSE
           ORDER BY pg.id DESC LIMIT 1) AS recibido_por_nombre
    FROM recibos r
    JOIN conexiones c    ON c.id = r.conexion_id
    JOIN beneficiarios b ON b.id = c.beneficiario_id
    JOIN periodos p      ON p.id = r.periodo_id
    JOIN tarifas t       ON t.id = r.tarifa_id
    LEFT JOIN lecturas l ON l.id = r.lectura_id
    LEFT JOIN usuarios ue ON ue.id = r.emitido_por_id
   WHERE r.id = $1`;

module.exports = { vistaRecibo, SQL_RECIBO };
