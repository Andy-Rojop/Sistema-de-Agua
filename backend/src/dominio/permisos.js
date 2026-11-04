/**
 * MATRIZ DE PERMISOS POR ROL (RF-06)
 * ---------------------------------------------------------------------------
 * Fuente de verdad del backend. El frontend tiene un espejo en
 * frontend/src/permisos.js — mantener ambos alineados.
 *
 * Idea tomada de GraduaT (guards por rol), pero aquí sí se aplica en el
 * servidor con exigirPermiso(). El rol lo asigna el administrador al emitir
 * la invitación; el usuario no elige su propio rol.
 */

'use strict';

const ROLES = ['ADMINISTRADOR', 'TESORERO', 'FONTANERO'];

const ROLES_INFO = {
  ADMINISTRADOR: {
    nombre: 'Administrador',
    descripcion: 'Configura el sistema, abre y cierra periodos, gestiona cuentas e invitaciones.',
  },
  TESORERO: {
    nombre: 'Tesorero',
    descripcion: 'Abre el periodo de lecturas, cobra en campo, registra pagos y genera reportes de caja.',
  },
  FONTANERO: {
    nombre: 'Fontanero',
    descripcion: 'Toma lecturas mensuales y consulta el padrón (sin montos ni saldos).',
  },
};

/** Clave de permiso → roles que pueden ejecutarla. */
const PERMISOS = {
  // Pantallas
  tablero:   ['ADMINISTRADOR', 'TESORERO'],
  lecturas:  ['ADMINISTRADOR', 'FONTANERO'],
  padron:    ['ADMINISTRADOR', 'TESORERO', 'FONTANERO'],
  cierre:    ['ADMINISTRADOR'],
  reportes:  ['ADMINISTRADOR', 'TESORERO'],
  cuentas:   ['ADMINISTRADOR'],
  bitacora:  ['ADMINISTRADOR'],

  // Operaciones de API (alineadas con las pantallas)
  pagos:              ['ADMINISTRADOR', 'TESORERO'],
  cobro:              ['ADMINISTRADOR', 'TESORERO'],
  abrir_periodo:      ['ADMINISTRADOR', 'TESORERO'],
  inconsistencias:    ['ADMINISTRADOR'],
  // Consulta de avance (quién ya tiene lectura). Tesorero ve; no registra.
  avance_lecturas:    ['ADMINISTRADOR', 'TESORERO', 'FONTANERO'],
  // Admin y Tesorero cargan el padrón desde los cuadernos de la junta.
  alta_conexion:      ['ADMINISTRADOR', 'TESORERO'],
  usuarios:           ['ADMINISTRADOR'],
  invitaciones:       ['ADMINISTRADOR'],
};

const VISTAS = [
  { id: 'tablero',  nombre: 'Tablero',  permiso: 'tablero' },
  { id: 'cobro',    nombre: 'Cobro',    permiso: 'cobro' },
  { id: 'lecturas', nombre: 'Lecturas', permiso: 'lecturas' },
  { id: 'padron',   nombre: 'Padrón',   permiso: 'padron' },
  { id: 'cierre',   nombre: 'Cierre',   permiso: 'cierre' },
  { id: 'reportes', nombre: 'Reportes', permiso: 'reportes' },
  { id: 'cuentas',  nombre: 'Cuentas',  permiso: 'cuentas' },
  { id: 'bitacora', nombre: 'Bitácora', permiso: 'bitacora' },
];

function rolesDe(permiso) {
  return PERMISOS[permiso] || [];
}

function puede(rol, permiso) {
  return rolesDe(permiso).indexOf(rol) !== -1;
}

function vistasPara(rol) {
  return VISTAS.filter((v) => puede(rol, v.permiso));
}

module.exports = {
  ROLES, ROLES_INFO, PERMISOS, VISTAS,
  rolesDe, puede, vistasPara,
};
