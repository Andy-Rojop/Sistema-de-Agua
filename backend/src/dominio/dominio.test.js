/**
 * PRUEBAS UNITARIAS DEL DOMINIO
 * ---------------------------------------------------------------------------
 * Verifican el criterio de aceptación CA-01 de la ERS: el monto calculado por
 * el sistema debe coincidir con el cálculo manual de control en consumos
 * variados, incluidos consumo cero, consumo dentro del rango incluido y
 * consumo con exceso fraccionado.
 *
 * Ejecutar con:  npm test
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  TARIFA_VIGENTE, calcularRecibo, calcularBloques, quetzales, lineasDelRecibo,
} = require('./tarifa');
const {
  calcularConsumo, consumoConCambioDeMedidor, consumoConReinicio, promedioHistorico,
} = require('./consumo');
const {
  aplicarPago, calcularMora, estadoDeMorosidad, estaVencido,
} = require('./pagos');
const {
  validarCierre, generarRecibosDelPeriodo, resumirCierre,
} = require('./cierre');

const T = TARIFA_VIGENTE;

// ===========================================================================
describe('Tabla 1 de la ERS - casos oficiales de la tarifa de la junta local', function () {
  const casos = [
    [18000, 2500, 'consumo dentro del rango incluido'],
    [25000, 2500, 'consumo exactamente igual al rango incluido'],
    [26000, 2600, 'un bloque exacto de exceso'],
    [31400, 3200, 'exceso fraccionado: 6,400 L = 7 bloques'],
    [50000, 5000, '25 bloques exactos de exceso'],
    [0, 2500, 'consumo cero: se cobra la tarifa basica integra (RN-02)'],
  ];

  casos.forEach(function (caso) {
    const consumo = caso[0], esperado = caso[1], desc = caso[2];
    test(consumo.toLocaleString('es-GT') + ' litros -> ' + quetzales(esperado) + ' (' + desc + ')', function () {
      assert.equal(calcularRecibo(consumo, T).totalCentavos, esperado);
    });
  });
});

// ===========================================================================
describe('Motor tarifario - reglas RN-02 a RN-07', function () {
  test('RN-02: la tarifa basica se cobra integra aunque el consumo sea menor', function () {
    assert.equal(calcularRecibo(1, T).totalCentavos, 2500);
    assert.equal(calcularRecibo(24999, T).totalCentavos, 2500);
  });

  test('RN-03: la fraccion de bloque se redondea hacia arriba', function () {
    const d = calcularRecibo(25001, T);
    assert.equal(d.bloquesCobrados, 1);
    assert.equal(d.totalCentavos, 2600);
  });

  test('RN-03: la politica alterna COMPLETOS cobra solo bloques enteros', function () {
    const alterna = Object.assign({}, T, { redondeoBloque: 'COMPLETOS' });
    const d = calcularRecibo(31400, alterna);
    assert.equal(d.bloquesCobrados, 6);
    assert.equal(d.totalCentavos, 3100); // Q31.00 en lugar de Q32.00
  });

  test('RN-04: mora y saldo anterior se suman al total', function () {
    const d = calcularRecibo(26000, T, 'MEDIDA', {
      moraCentavos: 500, saldoAnteriorCentavos: 2500,
    });
    assert.equal(d.totalCentavos, 2600 + 500 + 2500);
  });

  test('RN-04: el saldo a favor se descuenta y nunca produce total negativo', function () {
    const d = calcularRecibo(18000, T, 'MEDIDA', { saldoFavorCentavos: 4000 });
    assert.equal(d.totalCentavos, 0);
    assert.equal(d.saldoFavorAplicadoCentavos, 2500);
  });

  test('RN-07: la modalidad de cuota fija ignora el consumo medido', function () {
    const d = calcularRecibo(90000, T, 'CUOTA_FIJA');
    assert.equal(d.totalCentavos, 2500);
    assert.equal(d.bloquesCobrados, 0);
  });

  test('RN-05: cambiar la tarifa cambia el resultado sin tocar el codigo', function () {
    const nueva = Object.assign({}, T, {
      tarifaBasicaCentavos: 3000, precioBloqueCentavos: 150,
    });
    assert.equal(calcularRecibo(31400, nueva).totalCentavos, 3000 + 7 * 150);
  });

  test('rechaza consumos negativos o no enteros', function () {
    assert.throws(function () { calcularRecibo(-1, T); });
    assert.throws(function () { calcularRecibo(1.5, T); });
  });

  test('calcularBloques resuelve correctamente los bordes', function () {
    assert.equal(calcularBloques(0, 1000, 'ARRIBA'), 0);
    assert.equal(calcularBloques(1, 1000, 'ARRIBA'), 1);
    assert.equal(calcularBloques(1000, 1000, 'ARRIBA'), 1);
    assert.equal(calcularBloques(1001, 1000, 'ARRIBA'), 2);
    assert.equal(calcularBloques(999, 1000, 'COMPLETOS'), 0);
  });
});

// ===========================================================================
describe('Calculo de consumo - reglas RN-01 y RN-13 a RN-17', function () {
  test('RN-01: el consumo es la diferencia entre lecturas', function () {
    const r = calcularConsumo(120000, 151400, []);
    assert.equal(r.consumoLitros, 31400);
    assert.equal(r.inconsistencia, 'NINGUNA');
  });

  test('QA: 125 m3 a 143 m3 = 18 m3 = Q25.00', function () {
    const r = calcularConsumo(125000, 143000, []);
    assert.equal(r.consumoLitros, 18000);
    assert.equal(r.inconsistencia, 'NINGUNA');
    assert.equal(calcularRecibo(r.consumoLitros, T).totalCentavos, 2500);
  });

  test('lectura actual igual a la anterior cobra la tarifa basica', function () {
    const r = calcularConsumo(125000, 125000, []);
    assert.equal(r.consumoLitros, 0);
    assert.equal(r.inconsistencia, 'NINGUNA');
    assert.equal(calcularRecibo(0, T).totalCentavos, 2500);
  });

  test('RN-13: lectura menor a la anterior se marca y no calcula negativo', function () {
    const r = calcularConsumo(150000, 12000, []);
    assert.equal(r.consumoLitros, 0);
    assert.equal(r.inconsistencia, 'LECTURA_MENOR');
    assert.equal(r.requiereRevision, true);
  });

  test('RN-15: consumo muy superior al promedio se marca como posible fuga', function () {
    const r = calcularConsumo(100000, 200000, [20000, 22000, 19000, 21000, 20000, 23000]);
    assert.equal(r.inconsistencia, 'CONSUMO_EXCESIVO');
    assert.equal(r.requiereRevision, true);
    assert.equal(r.consumoLitros, 100000); // el consumo si se calcula
  });

  test('RN-15: un aumento moderado no se marca como inconsistente', function () {
    const r = calcularConsumo(100000, 128000, [20000, 22000, 19000, 21000, 20000, 23000]);
    assert.equal(r.inconsistencia, 'NINGUNA');
  });

  test('RN-16: consumo cero repetido genera alerta al tercer periodo', function () {
    assert.equal(calcularConsumo(50000, 50000, [0]).inconsistencia, 'NINGUNA');
    const tres = calcularConsumo(50000, 50000, [0, 0]);
    assert.equal(tres.inconsistencia, 'CONSUMO_CERO');
    assert.equal(tres.requiereRevision, true);
  });

  test('RN-14: cambio de medidor suma los dos tramos', function () {
    assert.equal(consumoConCambioDeMedidor(480000, 495000, 0, 8000), 23000);
  });

  test('RN-13: reinicio de contador por capacidad agotada', function () {
    assert.equal(consumoConReinicio(999000, 2000, 6), 3000);
  });

  test('promedioHistorico usa los ultimos seis periodos', function () {
    assert.equal(promedioHistorico([10, 10, 10, 10, 10, 10, 100]), 25);
    assert.equal(promedioHistorico([]), null);
  });
});

// ===========================================================================
describe('Aplicacion de pagos y morosidad - reglas RN-18 a RN-22', function () {
  function recibo(n, saldo, mes) {
    return {
      id: 'r' + n, correlativo: n, saldoCentavos: saldo,
      fechaVencimiento: new Date(2026, mes, 20),
    };
  }

  test('RN-18: el pago se aplica primero al recibo mas antiguo', function () {
    const r = aplicarPago([recibo(3, 2500, 4), recibo(1, 2500, 2), recibo(2, 2500, 3)], 3000);
    assert.equal(r.aplicaciones[0].correlativo, 1);
    assert.equal(r.aplicaciones[0].montoAplicadoCentavos, 2500);
    assert.equal(r.aplicaciones[0].quedaSaldado, true);
    assert.equal(r.aplicaciones[1].correlativo, 2);
    assert.equal(r.aplicaciones[1].montoAplicadoCentavos, 500);
    assert.equal(r.aplicaciones[1].quedaSaldado, false);
  });

  test('RN-18: el remanente que no cubre ningun recibo queda a favor', function () {
    const r = aplicarPago([recibo(1, 2500, 2)], 4000);
    assert.equal(r.totalAplicadoCentavos, 2500);
    assert.equal(r.saldoFavorCentavos, 1500);
  });

  test('acepta pagos parciales sin saldar el recibo', function () {
    const r = aplicarPago([recibo(1, 2500, 2)], 1000);
    assert.equal(r.aplicaciones[0].saldoRestanteCentavos, 1500);
    assert.equal(r.aplicaciones[0].quedaSaldado, false);
  });

  test('rechaza montos invalidos', function () {
    assert.throws(function () { aplicarPago([recibo(1, 2500, 2)], 0); });
    assert.throws(function () { aplicarPago([recibo(1, 2500, 2)], -100); });
  });

  test('RN-19: un recibo se considera vencido tras su fecha limite', function () {
    const r = recibo(1, 2500, 2); // vence el 20 de marzo de 2026
    assert.equal(estaVencido(r, new Date(2026, 2, 19)), false);
    assert.equal(estaVencido(r, new Date(2026, 2, 21)), true);
    assert.equal(estaVencido({ saldoCentavos: 0, fechaVencimiento: r.fechaVencimiento }, new Date(2026, 5, 1)), false);
  });

  test('RN-20: el recargo por mora admite monto fijo o porcentaje', function () {
    assert.equal(calcularMora(2500), 500);
    assert.equal(calcularMora(2500, { tipo: 'PORCENTAJE', valor: 10 }), 250);
    assert.equal(calcularMora(0), 0);
  });

  test('RN-22: se identifica al usuario moroso y la antiguedad de su deuda', function () {
    const r = estadoDeMorosidad(
      [recibo(1, 2500, 2), recibo(2, 2500, 3), recibo(3, 2500, 4)],
      new Date(2026, 7, 1)
    );
    assert.equal(r.esMoroso, true);
    assert.equal(r.periodosVencidos, 3);
    assert.equal(r.deudaTotalCentavos, 7500);
    assert.ok(r.antiguedadDias > 100);
  });

  test('RN-22: una conexion al dia no aparece como morosa', function () {
    const r = estadoDeMorosidad([recibo(1, 2500, 9)], new Date(2026, 7, 1));
    assert.equal(r.esMoroso, false);
  });
});

// ===========================================================================
describe('Cierre de periodo - reglas RN-08 a RN-12', function () {
  function conexion(id, extra) {
    return Object.assign({
      id: id, codigo: 'SF-' + id, modalidad: 'MEDIDA',
      saldoFavorCentavos: 0, saldoAnteriorCentavos: 0, moraCentavos: 0,
    }, extra || {});
  }
  function lectura(conexionId, consumo, extra) {
    return Object.assign({
      id: 'L-' + conexionId, conexionId: conexionId, consumoLitros: consumo,
      inconsistencia: 'NINGUNA', inconsistenciaResuelta: true,
    }, extra || {});
  }
  function base(conexiones, lecturas) {
    return {
      periodoId: 'P-2026-08', fechaVencimiento: new Date(2026, 8, 20),
      tarifa: T, tarifaId: 'T-2026',
      conexionesActivas: conexiones, lecturas: lecturas, ultimoCorrelativo: 400,
    };
  }

  test('RN-09: no permite cerrar si falta una lectura', function () {
    const v = validarCierre(base([conexion('001'), conexion('002')], [lectura('001', 18000)]));
    assert.equal(v.puedeCerrar, false);
    assert.equal(v.impedimentos[0].tipo, 'SIN_LECTURA');
    assert.ok(v.impedimentos[0].detalle.indexOf('SF-002') >= 0);
  });

  test('RN-09: no permite cerrar con inconsistencias sin resolver', function () {
    const datos = base([conexion('001')], [
      lectura('001', 90000, { inconsistencia: 'CONSUMO_EXCESIVO', inconsistenciaResuelta: false }),
    ]);
    assert.equal(validarCierre(datos).impedimentos[0].tipo, 'INCONSISTENCIA_SIN_RESOLVER');
  });

  test('las conexiones de cuota fija no requieren lectura', function () {
    const datos = base([conexion('003', { modalidad: 'CUOTA_FIJA' })], []);
    assert.equal(validarCierre(datos).puedeCerrar, true);
  });

  test('RN-12: genera un recibo por conexion con correlativo consecutivo', function () {
    const datos = base(
      [conexion('001'), conexion('002'), conexion('003')],
      [lectura('001', 18000), lectura('002', 31400), lectura('003', 0)]
    );
    const recibos = generarRecibosDelPeriodo(datos);
    assert.equal(recibos.length, 3);
    assert.deepEqual(recibos.map(function (r) { return r.correlativo; }), [401, 402, 403]);
    assert.equal(recibos[0].totalCentavos, 2500);
    assert.equal(recibos[1].totalCentavos, 3200);
    assert.equal(recibos[2].totalCentavos, 2500);
  });

  test('arrastra el saldo anterior y la mora al nuevo recibo', function () {
    const datos = base(
      [conexion('001', { saldoAnteriorCentavos: 2500, moraCentavos: 500 })],
      [lectura('001', 18000)]
    );
    const recibo = generarRecibosDelPeriodo(datos)[0];
    assert.equal(recibo.totalCentavos, 2500 + 2500 + 500);
    assert.equal(recibo.saldoCentavos, recibo.totalCentavos);
  });

  test('RN-10: el cierre se bloquea por completo si hay un solo impedimento', function () {
    const datos = base([conexion('001'), conexion('002')], [lectura('001', 18000)]);
    assert.throws(function () { generarRecibosDelPeriodo(datos); }, /No se puede cerrar/);
  });

  test('el cierre omite conexiones ya facturadas en campo (lista vacia restante)', function () {
    const datos = base([], []);
    assert.equal(validarCierre(datos).puedeCerrar, true);
    assert.equal(generarRecibosDelPeriodo(datos).length, 0);
  });

  test('el resumen refleja lo que se va a emitir', function () {
    const datos = base(
      [conexion('001'), conexion('002')],
      [lectura('001', 18000), lectura('002', 31400)]
    );
    const r = resumirCierre(generarRecibosDelPeriodo(datos));
    assert.equal(r.recibosEmitidos, 2);
    assert.equal(r.consumoTotalLitros, 49400);
    assert.equal(r.montoFacturadoCentavos, 5700);
    assert.equal(r.correlativoInicial, 401);
    assert.equal(r.correlativoFinal, 402);
  });
});

// ===========================================================================
describe('Presentacion del recibo', function () {
  test('formatea centavos como quetzales', function () {
    assert.equal(quetzales(2500), 'Q25.00');
    assert.equal(quetzales(3240), 'Q32.40');
    assert.equal(quetzales(5), 'Q0.05');
  });

  test('el desglose permite al usuario reconstruir la aritmetica', function () {
    const lineas = lineasDelRecibo(calcularRecibo(31400, T), T);
    const texto = JSON.stringify(lineas);
    assert.ok(texto.indexOf('Q25.00') >= 0);
    assert.ok(texto.indexOf('Q7.00') >= 0);
    assert.ok(texto.indexOf('7 \u00D7') >= 0);
  });
});
