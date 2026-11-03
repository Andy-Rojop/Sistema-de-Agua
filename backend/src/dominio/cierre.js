/**
 * CIERRE DE PERIODO
 * ---------------------------------------------------------------------------
 * Implementa las reglas RN-08 a RN-12 de la ERS: la operación más crítica.
 *
 * El cierre convierte cientos de lecturas en cientos de recibos. Es "todo o
 * nada": si falla a la mitad, la junta queda con un periodo medio facturado y
 * sin forma de saber dónde se detuvo. Por eso valida ANTES de escribir nada, y
 * por eso quien lo llama debe envolver la escritura en una transacción.
 *
 * Este módulo no conoce PostgreSQL. Recibe los datos ya leídos y devuelve los
 * recibos a crear, de modo que el cierre completo puede probarse sin levantar
 * una base de datos.
 */

'use strict';

const { calcularRecibo } = require('./tarifa');

/**
 * Verifica si el periodo puede cerrarse (RN-09).
 * Se ejecuta ANTES de escribir nada. El mensaje debe decirle al Administrador
 * exactamente qué conexiones lo impiden, no un "faltan datos" genérico.
 *
 * @param {object} datos {conexionesActivas, lecturas}
 */
function validarCierre(datos) {
  const impedimentos = [];
  const lecturaPorConexion = {};
  datos.lecturas.forEach(function (l) { lecturaPorConexion[l.conexionId] = l; });

  datos.conexionesActivas.forEach(function (c) {
    // Las conexiones de cuota fija no requieren lectura (RN-07).
    if (c.modalidad === 'CUOTA_FIJA') return;

    const lectura = lecturaPorConexion[c.id];

    if (!lectura) {
      impedimentos.push({
        tipo: 'SIN_LECTURA',
        codigoConexion: c.codigo,
        detalle: 'La conexi\u00F3n ' + c.codigo + ' no tiene lectura registrada en este periodo.',
      });
      return;
    }

    if (lectura.inconsistencia !== 'NINGUNA' && !lectura.inconsistenciaResuelta) {
      impedimentos.push({
        tipo: 'INCONSISTENCIA_SIN_RESOLVER',
        codigoConexion: c.codigo,
        detalle: 'La conexi\u00F3n ' + c.codigo + ' tiene una lectura inconsistente sin resolver (' +
          lectura.inconsistencia + ').',
      });
    }
  });

  return { puedeCerrar: impedimentos.length === 0, impedimentos };
}

/**
 * Calcula todos los recibos del periodo (RN-10, RN-12).
 * No escribe nada: devuelve la lista para que el llamador la persista dentro
 * de una única transacción.
 */
function generarRecibosDelPeriodo(datos) {
  const validacion = validarCierre(datos);
  if (!validacion.puedeCerrar) {
    throw new Error(
      'No se puede cerrar el periodo: ' + validacion.impedimentos.length +
      ' conexi\u00F3n(es) con problemas.'
    );
  }

  const lecturaPorConexion = {};
  datos.lecturas.forEach(function (l) { lecturaPorConexion[l.conexionId] = l; });

  const recibos = [];
  let correlativo = datos.ultimoCorrelativo;

  datos.conexionesActivas.forEach(function (c) {
    const lectura = lecturaPorConexion[c.id] || null;
    const consumoLitros = lectura ? lectura.consumoLitros : 0;

    const desglose = calcularRecibo(consumoLitros, datos.tarifa, c.modalidad, {
      moraCentavos: c.moraCentavos || 0,
      saldoAnteriorCentavos: c.saldoAnteriorCentavos || 0,
      saldoFavorCentavos: c.saldoFavorCentavos || 0,
    });

    correlativo += 1;

    recibos.push({
      correlativo: correlativo,
      periodoId: datos.periodoId,
      conexionId: c.id,
      lecturaId: lectura ? lectura.id : null,
      tarifaId: datos.tarifaId,
      consumoLitros: consumoLitros,
      montoBasicoCentavos: desglose.montoBasicoCentavos,
      montoExcesoCentavos: desglose.montoExcesoCentavos,
      bloquesCobrados: desglose.bloquesCobrados,
      montoMoraCentavos: desglose.montoMoraCentavos,
      saldoAnteriorCentavos: desglose.saldoAnteriorCentavos,
      totalCentavos: desglose.totalCentavos,
      // Al emitirse, el saldo pendiente es el total. Los pagos lo reducen.
      saldoCentavos: desglose.totalCentavos,
      fechaVencimiento: datos.fechaVencimiento,
    });
  });

  return recibos;
}

/** Resumen del cierre para mostrar al Administrador antes de confirmar. */
function resumirCierre(recibos) {
  return {
    recibosEmitidos: recibos.length,
    consumoTotalLitros: recibos.reduce(function (a, r) { return a + r.consumoLitros; }, 0),
    montoFacturadoCentavos: recibos.reduce(function (a, r) { return a + r.totalCentavos; }, 0),
    correlativoInicial: recibos.length ? recibos[0].correlativo : null,
    correlativoFinal: recibos.length ? recibos[recibos.length - 1].correlativo : null,
  };
}

module.exports = { validarCierre, generarRecibosDelPeriodo, resumirCierre };
