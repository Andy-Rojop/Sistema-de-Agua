/**
 * MATRIZ DE PERMISOS POR ROL (espejo del backend)
 * ---------------------------------------------------------------------------
 * Debe coincidir con backend/src/dominio/permisos.js.
 * Aquí solo se usa para armar el menú y bloquear vistas; la seguridad real
 * está en el servidor (RNF-SEG-03).
 */

export const ROLES = ['ADMINISTRADOR', 'TESORERO', 'FONTANERO'];

export const ROLES_INFO = {
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

const PERMISOS = {
  tablero:  ['ADMINISTRADOR', 'TESORERO'],
  cobro:    ['ADMINISTRADOR', 'TESORERO'],
  lecturas: ['ADMINISTRADOR', 'FONTANERO'],
  padron:   ['ADMINISTRADOR', 'TESORERO', 'FONTANERO'],
  cierre:   ['ADMINISTRADOR'],
  reportes: ['ADMINISTRADOR', 'TESORERO'],
  cuentas:  ['ADMINISTRADOR'],
  bitacora: ['ADMINISTRADOR'],
  // Operaciones (espejo del backend)
  alta_conexion: ['ADMINISTRADOR', 'TESORERO'],
  abrir_periodo: ['ADMINISTRADOR', 'TESORERO'],
};

export const VISTAS = [
  { id: 'tablero',  nombre: 'Panel',    permiso: 'tablero',  pie: 'Resumen del servicio' },
  { id: 'cobro',    nombre: 'Cobro',    permiso: 'cobro',    pie: 'Pagos, recibos e impresión' },
  { id: 'lecturas', nombre: 'Lecturas', permiso: 'lecturas', pie: 'Toma de lecturas del mes' },
  { id: 'padron',   nombre: 'Padrón',   permiso: 'padron',   pie: 'Usuarios y conexiones' },
  { id: 'cierre',   nombre: 'Cierre',   permiso: 'cierre',   pie: 'Cerrar el periodo y emitir' },
  { id: 'reportes', nombre: 'Reportes', permiso: 'reportes', pie: 'Morosos, ingresos y consumo' },
  { id: 'cuentas',  nombre: 'Cuentas',  permiso: 'cuentas',  pie: 'Invitaciones y personal' },
  { id: 'bitacora', nombre: 'Bitácora', permiso: 'bitacora', pie: 'Historial de operaciones' },
];

export function puede(rol, permiso) {
  return (PERMISOS[permiso] || []).includes(rol);
}

export function vistasPara(rol) {
  return VISTAS.filter((v) => puede(rol, v.permiso));
}

export function etiquetaRol(rol) {
  return ROLES_INFO[rol]?.nombre || rol;
}
