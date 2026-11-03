/**
 * Matriz de permisos por rol (RF-06).
 * Cubre las reglas que usa exigirPermiso() en las rutas.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { puede } = require('./permisos');

describe('Permisos por rol', function () {
  test('el tesorero cobra, paga y abre periodo; no toma lecturas ni cierra', function () {
    assert.equal(puede('TESORERO', 'cobro'), true);
    assert.equal(puede('TESORERO', 'pagos'), true);
    assert.equal(puede('TESORERO', 'abrir_periodo'), true);
    assert.equal(puede('TESORERO', 'reportes'), true);
    assert.equal(puede('TESORERO', 'alta_conexion'), true);
    assert.equal(puede('TESORERO', 'lecturas'), false);
    assert.equal(puede('TESORERO', 'cierre'), false);
    assert.equal(puede('TESORERO', 'invitaciones'), false);
  });

  test('el fontanero toma lecturas y consulta el padron; no cobra ni ve reportes', function () {
    assert.equal(puede('FONTANERO', 'lecturas'), true);
    assert.equal(puede('FONTANERO', 'padron'), true);
    assert.equal(puede('FONTANERO', 'cobro'), false);
    assert.equal(puede('FONTANERO', 'pagos'), false);
    assert.equal(puede('FONTANERO', 'reportes'), false);
    assert.equal(puede('FONTANERO', 'abrir_periodo'), false);
    assert.equal(puede('FONTANERO', 'alta_conexion'), false);
  });

  test('el administrador cubre las operaciones de oficina y de campo', function () {
    assert.equal(puede('ADMINISTRADOR', 'cierre'), true);
    assert.equal(puede('ADMINISTRADOR', 'cobro'), true);
    assert.equal(puede('ADMINISTRADOR', 'lecturas'), true);
    assert.equal(puede('ADMINISTRADOR', 'invitaciones'), true);
  });
});
