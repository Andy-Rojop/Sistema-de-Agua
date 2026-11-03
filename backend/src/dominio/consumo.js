/**
 * CÁLCULO Y VALIDACIÓN DEL CONSUMO
 * ---------------------------------------------------------------------------
 * Implementa las reglas RN-01 y RN-13 a RN-17 de la ERS.
 *
 * Este módulo decide si una lectura es confiable. Es la primera línea de
 * defensa del sistema: una lectura mal digitada que pase de aquí termina
 * convertida en un cobro incorrecto y en un reclamo del usuario.
 */

'use strict';

const PARAMETROS = {
  // Porcentaje sobre el promedio a partir del cual el consumo es
  // desproporcionado. 200 significa "más del triple del promedio" (RN-15).
  umbralConsumoExcesivo: 200,
  // Periodos consecutivos en cero antes de alertar (RN-16).
  periodosCeroParaAlerta: 3,
  // Últimos periodos que se promedian para la comparación.
  periodosAPromediar: 6,
};

/** Promedio de los últimos N periodos de la conexión. */
function promedioHistorico(consumos, ultimos) {
  ultimos = ultimos || PARAMETROS.periodosAPromediar;
  const muestra = (consumos || []).slice(-ultimos);
  if (muestra.length === 0) return null;
  const suma = muestra.reduce(function (a, b) { return a + b; }, 0);
  return Math.round(suma / muestra.length);
}

function cerosFinales(consumos) {
  let n = 0;
  for (let i = (consumos || []).length - 1; i >= 0; i--) {
    if (consumos[i] === 0) n++; else break;
  }
  return n;
}

/**
 * Calcula el consumo del periodo y detecta inconsistencias
 * (RN-01, RN-13, RN-15, RN-16).
 *
 * Importante: cuando la lectura actual es menor que la anterior, esta función
 * NO asume un reinicio de contador ni calcula el consumo por diferencia de
 * capacidad. Devuelve consumo 0 y marca la inconsistencia, porque el caso más
 * frecuente en campo no es el reinicio del medidor sino un error de
 * digitación. La resolución la decide una persona (RF-02.8), no el sistema.
 *
 * @param {number} lecturaAnterior  litros, la aporta el sistema (RN-17)
 * @param {number} lecturaActual    litros digitados por el Fontanero
 * @param {number[]} historial      consumos de periodos anteriores
 */
function calcularConsumo(lecturaAnterior, lecturaActual, historial, opciones) {
  const p = Object.assign({}, PARAMETROS, opciones || {});
  historial = historial || [];

  if (!Number.isInteger(lecturaAnterior) || !Number.isInteger(lecturaActual)) {
    throw new Error('Las lecturas deben expresarse en litros enteros.');
  }
  if (lecturaAnterior < 0 || lecturaActual < 0) {
    throw new Error('Las lecturas no pueden ser negativas.');
  }

  const promedio = promedioHistorico(historial, p.periodosAPromediar);

  // RN-13 — la lectura actual no puede ser menor que la anterior.
  if (lecturaActual < lecturaAnterior) {
    return {
      consumoLitros: 0,
      inconsistencia: 'LECTURA_MENOR',
      requiereRevision: true,
      promedioHistorico: promedio,
      mensaje:
        'La lectura ingresada (' + lecturaActual.toLocaleString('es-GT') + ') es menor ' +
        'que la anterior (' + lecturaAnterior.toLocaleString('es-GT') + '). Verifique el ' +
        'dato; si el medidor se reinici\u00F3 o fue cambiado, debe registrarse aparte.',
    };
  }

  const consumoLitros = lecturaActual - lecturaAnterior;

  // RN-16 — consumo cero repetido.
  if (consumoLitros === 0) {
    const previos = cerosFinales(historial);
    if (previos + 1 >= p.periodosCeroParaAlerta) {
      return {
        consumoLitros: 0,
        inconsistencia: 'CONSUMO_CERO',
        requiereRevision: true,
        promedioHistorico: promedio,
        mensaje:
          'Esta conexi\u00F3n registra consumo cero por ' + (previos + 1) + ' periodos ' +
          'seguidos. Revise si el medidor est\u00E1 trabado o el inmueble desocupado.',
      };
    }
  }

  // RN-15 — consumo desproporcionado respecto al promedio histórico.
  if (promedio !== null && promedio > 0) {
    const limite = promedio * (1 + p.umbralConsumoExcesivo / 100);
    if (consumoLitros > limite) {
      return {
        consumoLitros,
        inconsistencia: 'CONSUMO_EXCESIVO',
        requiereRevision: true,
        promedioHistorico: promedio,
        mensaje:
          'El consumo es ' + (consumoLitros / promedio).toFixed(1) + ' veces el promedio ' +
          'de esta conexi\u00F3n (' + promedio.toLocaleString('es-GT') + ' litros). Puede ' +
          'tratarse de una fuga. Confirme la lectura y avise al usuario antes de cerrar.',
      };
    }
  }

  return {
    consumoLitros,
    inconsistencia: 'NINGUNA',
    requiereRevision: false,
    promedioHistorico: promedio,
    mensaje: null,
  };
}

/**
 * Consumo cuando se cambió el medidor durante el periodo (RN-14):
 * tramo final del medidor retirado + tramo inicial del medidor nuevo.
 */
function consumoConCambioDeMedidor(anteriorViejo, finalViejo, inicialNuevo, actualNuevo) {
  const tramoViejo = finalViejo - anteriorViejo;
  const tramoNuevo = actualNuevo - inicialNuevo;
  if (tramoViejo < 0 || tramoNuevo < 0) {
    throw new Error(
      'Las lecturas del cambio de medidor son inconsistentes: la lectura final ' +
      'no puede ser menor que la inicial en ning\u00FAn tramo.'
    );
  }
  return tramoViejo + tramoNuevo;
}

/**
 * Consumo cuando el medidor se reinició por agotar su capacidad (RN-13).
 * Un medidor de 8 dígitos vuelve a cero después de 99,999,999 litros.
 * Solo debe usarse tras la confirmación explícita del Administrador.
 */
function consumoConReinicio(lecturaAnterior, lecturaActual, digitosMedidor) {
  const capacidad = Math.pow(10, digitosMedidor);
  return capacidad - lecturaAnterior + lecturaActual;
}

/** Cobro por promedio cuando no se pudo tomar la lectura (RF-02.11). */
function consumoPorPromedio(historial) {
  return promedioHistorico(historial) || 0;
}

module.exports = {
  PARAMETROS,
  promedioHistorico,
  calcularConsumo,
  consumoConCambioDeMedidor,
  consumoConReinicio,
  consumoPorPromedio,
};
