/**
 * MOTOR DE CÁLCULO TARIFARIO
 * ---------------------------------------------------------------------------
 * Implementa las reglas RN-01 a RN-07 de la ERS.
 *
 * Este módulo es JavaScript puro: no conoce Express, ni PostgreSQL, ni React.
 * Esa independencia es deliberada (ADR-08) y permite probarlo de forma aislada,
 * que es donde se concentra el riesgo real del proyecto: un error aquí se
 * propaga a los cobros de toda la comunidad.
 *
 * REGLA SOBRE EL DINERO
 * Todos los montos se manejan como ENTEROS EN CENTAVOS de quetzal.
 * Q25.00 -> 2500. Nunca se usa punto flotante: 0.1 + 0.2 !== 0.3 en binario,
 * y ese error, multiplicado por 400 recibos mensuales, descuadra la caja.
 */

'use strict';

/** Tarifa vigente aprobada por la asamblea (RN-05, RN-06). */
const TARIFA_VIGENTE = {
  tarifaBasicaCentavos: 2500,   // Q25.00                          (RN-02)
  litrosIncluidos: 25000,       // que cubre la tarifa básica      (RN-02)
  litrosPorBloque: 1000,        // tamaño del bloque de exceso     (RN-03)
  precioBloqueCentavos: 100,    // Q1.00 por bloque                (RN-03)
  cuotaFijaCentavos: 2500,      // conexiones sin medidor          (RN-07)
  // ARRIBA: 6,400 L de exceso -> 7 bloques -> Q7.00
  // COMPLETOS: 6,400 L de exceso -> 6 bloques -> Q6.00
  // PENDIENTE DE CONFIRMAR CON LA JUNTA LOCAL. Parametrizado a propósito
  // para que el cambio de criterio no exija tocar el código.
  redondeoBloque: 'ARRIBA',
};

/**
 * Bloques de exceso cobrables (RN-03).
 * Aísla la decisión de redondeo en un solo lugar de todo el sistema.
 */
function calcularBloques(litrosExceso, litrosPorBloque, redondeo) {
  if (litrosExceso <= 0) return 0;
  if (litrosPorBloque <= 0) {
    throw new Error('El tamaño del bloque debe ser mayor a cero.');
  }
  const exactos = litrosExceso / litrosPorBloque;
  return redondeo === 'ARRIBA' ? Math.ceil(exactos) : Math.floor(exactos);
}

/**
 * Desglose completo del recibo (RN-02, RN-03, RN-04, RN-07).
 *
 * @param {number} consumoLitros  consumo del periodo, en litros enteros
 * @param {object} tarifa         tarifa vigente a la fecha de cierre
 * @param {string} modalidad      'MEDIDA' o 'CUOTA_FIJA'
 * @param {object} cargos         mora, saldo anterior y saldo a favor
 */
function calcularRecibo(consumoLitros, tarifa, modalidad, cargos) {
  tarifa = tarifa || TARIFA_VIGENTE;
  modalidad = modalidad || 'MEDIDA';
  cargos = cargos || {};

  if (!Number.isInteger(consumoLitros)) {
    throw new Error('El consumo debe expresarse en litros enteros.');
  }
  if (consumoLitros < 0) {
    // Un consumo negativo nunca debe llegar hasta aquí: lo bloquea
    // calcularConsumo (RN-13).
    throw new Error('El consumo no puede ser negativo. Revise la lectura.');
  }

  const mora = cargos.moraCentavos || 0;
  const saldoAnterior = cargos.saldoAnteriorCentavos || 0;
  const saldoFavor = cargos.saldoFavorCentavos || 0;

  let montoBasico;
  let litrosExceso = 0;
  let bloquesCobrados = 0;
  let montoExceso = 0;

  if (modalidad === 'CUOTA_FIJA') {
    // Sin medidor: monto constante, sin cálculo de exceso (RN-07).
    montoBasico = tarifa.cuotaFijaCentavos;
  } else {
    // La tarifa básica se cobra íntegra aunque el consumo sea menor (RN-02).
    montoBasico = tarifa.tarifaBasicaCentavos;
    litrosExceso = Math.max(0, consumoLitros - tarifa.litrosIncluidos);
    bloquesCobrados = calcularBloques(
      litrosExceso, tarifa.litrosPorBloque, tarifa.redondeoBloque
    );
    montoExceso = bloquesCobrados * tarifa.precioBloqueCentavos;
  }

  const subtotal = montoBasico + montoExceso + mora + saldoAnterior;

  // El saldo a favor nunca produce un total negativo: el remanente
  // permanece en la conexión para el siguiente periodo.
  const saldoFavorAplicado = Math.min(saldoFavor, subtotal);

  return {
    consumoLitros,
    litrosIncluidos: modalidad === 'CUOTA_FIJA' ? 0 : tarifa.litrosIncluidos,
    litrosExceso,
    bloquesCobrados,
    montoBasicoCentavos: montoBasico,
    montoExcesoCentavos: montoExceso,
    montoMoraCentavos: mora,
    saldoAnteriorCentavos: saldoAnterior,
    saldoFavorAplicadoCentavos: saldoFavorAplicado,
    totalCentavos: subtotal - saldoFavorAplicado,
  };
}

/** Convierte centavos a texto: 3240 -> "Q32.40". */
function quetzales(centavos) {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return signo + 'Q' + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
}

/** Convierte litros a metros cúbicos: 31400 -> "31.4 m³". */
function metrosCubicos(litros) {
  return (litros / 1000).toFixed(1) + ' m\u00B3';
}

/**
 * Líneas del desglose tal como deben aparecer en el recibo.
 * El usuario debe poder rehacer la cuenta con lápiz y papel: eso es lo que
 * evita los reclamos y sustenta la transparencia planteada en la hipótesis.
 */
function lineasDelRecibo(d, tarifa) {
  tarifa = tarifa || TARIFA_VIGENTE;
  const lineas = [];

  lineas.push([
    'Tarifa b\u00E1sica (incluye ' + metrosCubicos(d.litrosIncluidos) + ')',
    quetzales(d.montoBasicoCentavos),
  ]);

  if (d.bloquesCobrados > 0) {
    lineas.push([
      'Exceso ' + metrosCubicos(d.litrosExceso) + ' = ' + d.bloquesCobrados +
        ' \u00D7 ' + quetzales(tarifa.precioBloqueCentavos),
      quetzales(d.montoExcesoCentavos),
    ]);
  }
  if (d.saldoAnteriorCentavos > 0) {
    lineas.push(['Saldo anterior', quetzales(d.saldoAnteriorCentavos)]);
  }
  if (d.montoMoraCentavos > 0) {
    lineas.push(['Recargo por mora', quetzales(d.montoMoraCentavos)]);
  }
  if (d.saldoFavorAplicadoCentavos > 0) {
    lineas.push(['Saldo a favor aplicado', '\u2212' + quetzales(d.saldoFavorAplicadoCentavos)]);
  }
  return lineas;
}

module.exports = {
  TARIFA_VIGENTE,
  calcularBloques,
  calcularRecibo,
  quetzales,
  metrosCubicos,
  lineasDelRecibo,
};
