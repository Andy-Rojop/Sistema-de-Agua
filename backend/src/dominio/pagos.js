/**
 * APLICACIÓN DE PAGOS Y MOROSIDAD
 * ---------------------------------------------------------------------------
 * Implementa las reglas RN-18 a RN-22 de la ERS.
 *
 * Aplicar el pago al recibo más antiguo no es un detalle técnico: es la
 * política que evita que un usuario pague el mes corriente mientras arrastra
 * deuda vieja de forma indefinida.
 */

'use strict';

const MORA_POR_DEFECTO = {
  tipo: 'FIJO',   // 'FIJO' (centavos) o 'PORCENTAJE' (sobre el saldo)
  valor: 500,     // Q5.00 por periodo vencido
  diasGracia: 0,
};

/**
 * Distribuye un pago entre los recibos pendientes, del más antiguo al más
 * reciente (RN-18). No persiste nada: devuelve la distribución para que la
 * interfaz se la muestre al Tesorero antes de confirmar (RF-03.2).
 *
 * @param {Array} recibosPendientes  [{id, correlativo, saldoCentavos}]
 * @param {number} montoCentavos     monto entregado por el usuario
 */
function aplicarPago(recibosPendientes, montoCentavos) {
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    throw new Error('El monto del pago debe ser un valor entero mayor a cero.');
  }

  // El correlativo es secuencial y lo asigna el servidor, así que ordenar por
  // correlativo equivale a ordenar por antigüedad de emisión.
  const ordenados = recibosPendientes
    .filter(function (r) { return r.saldoCentavos > 0; })
    .sort(function (a, b) { return a.correlativo - b.correlativo; });

  const aplicaciones = [];
  let restante = montoCentavos;

  for (let i = 0; i < ordenados.length; i++) {
    if (restante <= 0) break;
    const recibo = ordenados[i];
    const aplicado = Math.min(restante, recibo.saldoCentavos);
    restante -= aplicado;
    aplicaciones.push({
      reciboId: recibo.id,
      correlativo: recibo.correlativo,
      montoAplicadoCentavos: aplicado,
      saldoRestanteCentavos: recibo.saldoCentavos - aplicado,
      quedaSaldado: recibo.saldoCentavos - aplicado === 0,
    });
  }

  return {
    aplicaciones,
    saldoFavorCentavos: restante,
    totalAplicadoCentavos: montoCentavos - restante,
  };
}

/** Indica si un recibo está vencido a una fecha dada (RN-19). */
function estaVencido(recibo, fecha, diasGracia) {
  diasGracia = diasGracia || 0;
  if (recibo.saldoCentavos <= 0) return false;
  const limite = new Date(recibo.fechaVencimiento);
  limite.setDate(limite.getDate() + diasGracia);
  return fecha > limite;
}

/**
 * Recargo por mora de un recibo vencido (RN-20). Se aplica una sola vez por
 * periodo vencido, no de forma acumulativa diaria: la política de la junta es
 * de recargo único, y aplicarlo por día produciría deudas impagables.
 */
function calcularMora(saldoCentavos, config) {
  config = config || MORA_POR_DEFECTO;
  if (saldoCentavos <= 0) return 0;
  if (config.tipo === 'FIJO') return config.valor;
  return Math.round((saldoCentavos * config.valor) / 100);
}

/**
 * Determina la condición de morosidad de una conexión (RN-22).
 * Alimenta el reporte de usuarios morosos (RF-05.2).
 */
function estadoDeMorosidad(recibosPendientes, fecha) {
  const vencidos = recibosPendientes.filter(function (r) {
    return estaVencido(r, fecha);
  });
  const deudaTotalCentavos = recibosPendientes.reduce(function (a, r) {
    return a + r.saldoCentavos;
  }, 0);

  let antiguedadDias = 0;
  if (vencidos.length > 0) {
    const masViejo = vencidos.reduce(function (a, b) {
      return new Date(a.fechaVencimiento) < new Date(b.fechaVencimiento) ? a : b;
    });
    antiguedadDias = Math.floor(
      (fecha - new Date(masViejo.fechaVencimiento)) / (1000 * 60 * 60 * 24)
    );
  }

  return {
    esMoroso: vencidos.length > 0,
    periodosVencidos: vencidos.length,
    deudaTotalCentavos,
    antiguedadDias,
  };
}

module.exports = {
  MORA_POR_DEFECTO,
  aplicarPago,
  estaVencido,
  calcularMora,
  estadoDeMorosidad,
};
