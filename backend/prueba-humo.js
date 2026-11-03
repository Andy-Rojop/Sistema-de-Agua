/**
 * PRUEBA DE HUMO DE LA API
 * Sustituye la capa de datos por una simulada para comprobar que las rutas,
 * la autenticación y el control por rol funcionan sin necesidad de PostgreSQL.
 * No forma parte del sistema: es una herramienta de verificación.
 */

'use strict';

const path = require('path');
const bcrypt = require('bcryptjs');

// ---- Sustitución del módulo de acceso a datos antes de cargar las rutas ----
const rutaBd = require.resolve('./src/datos/bd.js');

const hash = bcrypt.hashSync('agua2026', 12);
const almacen = {
  usuarios: [
    { id: 1, nombre: 'Junta Directiva', correo: 'admin@santafe.gt', hash_contrasena: hash, rol: 'ADMINISTRADOR', activo: true },
    { id: 3, nombre: 'Encargado', correo: 'fontanero@santafe.gt', hash_contrasena: hash, rol: 'FONTANERO', activo: true },
  ],
  periodo: { id: 1, anio: 2026, mes: 8, fecha_fin: '2026-08-25', fecha_vencimiento: '2026-09-20', estado: 'EN_LECTURA' },
  conexiones: [
    { id: 1, codigo: 'SF-001', titular: 'María Xocop', sector: 'Sector A', modalidad: 'MEDIDA', estado: 'ACTIVA', saldo_favor_centavos: 0, ultima_lectura: 120000, saldo_pendiente: 0, digitos: 8 },
    { id: 4, codigo: 'SF-041', titular: 'Carlos Ixcoy', sector: 'Sector B', modalidad: 'MEDIDA', estado: 'ACTIVA', saldo_favor_centavos: 0, ultima_lectura: 210000, saldo_pendiente: 0, digitos: 8 },
  ],
  lecturas: [],
  historial: { 4: [21000, 20000, 22000, 19500, 20500, 21500], 1: [17000, 18500, 17800] },
};

function responder(texto, p) {
  const t = texto.replace(/\s+/g, ' ').trim();

  if (t.indexOf('FROM usuarios WHERE correo') >= 0) {
    return almacen.usuarios.filter((u) => u.correo === p[0]);
  }
  if (t.indexOf('UPDATE usuarios') === 0) return [];
  if (t.indexOf('INSERT INTO bitacora') >= 0) return [];
  if (t.indexOf("FROM periodos WHERE estado <> 'CERRADO'") >= 0) {
    return almacen.periodo.estado !== 'CERRADO' ? [almacen.periodo] : [];
  }
  if (t.indexOf('FROM conexiones c JOIN beneficiarios') >= 0 && t.indexOf('AS leida') >= 0) {
    return almacen.conexiones.map((c) => {
      const tomada = almacen.lecturas.find((l) => l.conexion_id === c.id);
      return {
        ...c,
        lectura_anterior: c.ultima_lectura,
        medidor_serie: 'MD-' + c.id,
        leida: Boolean(tomada),
        lectura_periodo: tomada ? tomada.lectura_actual : null,
      };
    });
  }
  if (t.indexOf('FROM conexiones c JOIN beneficiarios') >= 0) {
    return almacen.conexiones.map(function (c) {
      const copia = Object.assign({}, c);
      delete copia.saldo_pendiente;
      delete copia.saldo_favor_centavos;
      return copia;
    });
  }
  if (t.indexOf('FROM conexiones c LEFT JOIN medidores') >= 0) {
    const c = almacen.conexiones.find((x) => x.id === p[0]);
    return c ? [{ ...c, medidor_id: c.id, lectura_anterior: c.ultima_lectura }] : [];
  }
  if (t.indexOf('SELECT consumo_litros FROM lecturas') >= 0) {
    return (almacen.historial[p[0]] || []).slice().reverse().map((v) => ({ consumo_litros: v }));
  }
  if (t.indexOf('INSERT INTO lecturas') >= 0) {
    const fila = {
      id: almacen.lecturas.length + 1, periodo_id: p[0], conexion_id: p[1],
      lectura_anterior: p[3], lectura_actual: p[4], consumo_litros: p[5],
      inconsistencia: p[7], inconsistencia_resuelta: p[8],
    };
    almacen.lecturas.push(fila);
    return [fila];
  }
  if (t.indexOf('FROM conexiones c WHERE c.estado') >= 0) {
    return almacen.conexiones.map((c) => ({ ...c, saldo_anterior: 0 }));
  }
  if (t.indexOf('SELECT id, conexion_id, consumo_litros') >= 0) return almacen.lecturas;
  if (t.indexOf('MAX(correlativo)') >= 0) return [{ n: 400 }];
  if (t.indexOf('FROM tarifas') >= 0) {
    return [{
      id: 1, tarifa_basica_centavos: 2500, litros_incluidos: 25000,
      litros_por_bloque: 1000, precio_bloque_centavos: 100,
      cuota_fija_centavos: 2500, redondeo_bloque: 'ARRIBA',
    }];
  }
  if (t.indexOf('COUNT(*)') >= 0 && t.indexOf('FROM usuarios') >= 0) {
    return [{ n: almacen.usuarios.length }];
  }
  if (t.indexOf('INSERT INTO tokens_invitacion') >= 0) {
    return [{ id: 1, rol: p[1], expira_en: new Date(Date.now() + 7 * 864e5).toISOString() }];
  }
  if (t.indexOf('FROM tokens_invitacion') >= 0) {
    return [];
  }
  return [];
}

require.cache[rutaBd] = {
  id: rutaBd, filename: rutaBd, loaded: true, exports: {
    consultar: async (texto, p) => responder(texto, p || []),
    consultarUna: async (texto, p) => (responder(texto, p || [])[0] ?? null),
    enTransaccion: async (fn) => fn({ query: async (t, p) => ({ rows: responder(t, p || []) }) }),
    registrarBitacora: async () => {},
    probarConexion: async () => new Date(),
    pool: {},
  },
};

// ------------------------------------------------------ montaje de la app --
const express = require('express');
const app = express();
app.use(express.json());
app.set('trust proxy', 1);
app.use('/api', require('./src/rutas/padron'));
app.use('/api', require('./src/rutas/lecturas'));
app.use('/api', require('./src/rutas/tesoreria'));
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(require('./src/rutas/seguridad').manejarErrores);

const servidor = app.listen(3099, async () => {
  const B = 'http://127.0.0.1:3099/api';
  const j = async (r) => ({ s: r.status, b: await r.json() });
  const ok = (c) => (c ? 'OK ' : 'MAL');
  let fallos = 0;
  const v = (cond, texto) => { if (!cond) fallos++; console.log('  ' + ok(cond) + ' ' + texto); };

  console.log('\nPRUEBA DE HUMO DE LA API\n');

  // 1. Inicio de sesión
  const login = await j(await fetch(B + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'fontanero@santafe.gt', contrasena: 'agua2026' }),
  }));
  v(login.s === 200 && login.b.usuario.rol === 'FONTANERO', 'Inicio de sesión del Fontanero');
  const H = { Authorization: 'Bearer ' + login.b.token, 'Content-Type': 'application/json' };

  // 2. Contraseña incorrecta
  const malo = await j(await fetch(B + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'fontanero@santafe.gt', contrasena: 'incorrecta' }),
  }));
  v(malo.s === 401, 'Contraseña incorrecta rechazada (401)');

  // 3. Sin token
  const sinToken = await j(await fetch(B + '/conexiones'));
  v(sinToken.s === 401, 'Petición sin token rechazada (401)');

  // 4. El Fontanero no ve saldos (mínimo privilegio)
  const padron = await j(await fetch(B + '/conexiones', { headers: H }));
  v(padron.s === 200 && padron.b[0].saldo_pendiente === undefined
    && padron.b[0].saldo_favor_centavos === undefined,
    'El Fontanero no recibe montos ni saldos');

  const reciboFont = await j(await fetch(B + '/recibos/1', { headers: H }));
  v(reciboFont.s === 403, 'El Fontanero no consulta recibos con montos (403)');

  const consumoFont = await j(await fetch(B + '/reportes/consumo', { headers: H }));
  v(consumoFont.s === 403, 'El Fontanero no consulta el reporte de consumo (403)');

  // 5. Listado de conexiones para toma de lecturas
  const pend = await j(await fetch(B + '/periodos/actual/pendientes', { headers: H }));
  v(pend.s === 200 && pend.b.total === 2 && pend.b.pendientes_total === 2,
    'Conexiones del periodo: ' + pend.b.total + ' (' + pend.b.pendientes_total + ' sin visitar)');

  // 6. Lectura normal
  const normal = await j(await fetch(B + '/lecturas', {
    method: 'POST', headers: H,
    body: JSON.stringify({ conexionId: 1, lecturaActual: 138000 }),
  }));
  v(normal.s === 201 && normal.b.consumoLitros === 18000 && normal.b.inconsistencia === 'NINGUNA',
    'Lectura normal: ' + normal.b.consumoLitros + ' L, sin inconsistencia');

  // 7. Lectura con posible fuga (RN-15)
  const fuga = await j(await fetch(B + '/lecturas', {
    method: 'POST', headers: H,
    body: JSON.stringify({ conexionId: 4, lecturaActual: 310000 }),
  }));
  v(fuga.s === 201 && fuga.b.inconsistencia === 'CONSUMO_EXCESIVO' && fuga.b.requiereRevision,
    'Posible fuga detectada: ' + fuga.b.inconsistencia);

  // 8. El Fontanero no puede cerrar el periodo (RF-06.4)
  const cerrar = await j(await fetch(B + '/periodos/actual/cerrar', { method: 'POST', headers: H }));
  v(cerrar.s === 403, 'El Fontanero no puede cerrar el periodo (403)');

  // 9. El Administrador ve que el cierre está bloqueado (RN-09)
  const admin = await j(await fetch(B + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'admin@santafe.gt', contrasena: 'agua2026' }),
  }));
  const HA = { Authorization: 'Bearer ' + admin.b.token, 'Content-Type': 'application/json' };
  const val = await j(await fetch(B + '/periodos/actual/validar-cierre', { headers: HA }));
  v(val.s === 200 && val.b.puedeCerrar === false && val.b.impedimentos.length > 0,
    'Cierre bloqueado por inconsistencia sin resolver');
  if (val.b.impedimentos) val.b.impedimentos.forEach((i) => console.log('       · ' + i.detalle));

  // 10. Ruta inexistente
  const noExiste = await j(await fetch(B + '/no-existe', { headers: HA }));
  v(noExiste.s === 404 || noExiste.s === 401, 'Ruta inexistente responde 404');

  // 11. Registro sin invitación rechazado (ya hay usuarios)
  const sinInv = await j(await fetch(B + '/auth/registrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: 'Prueba', direccion: 'Sector A', correo: 'nuevo@santafe.gt',
      contrasena: 'claveSegura1',
    }),
  }));
  v(sinInv.s === 400, 'Registro sin código de invitación rechazado');

  // 12. Administrador puede emitir invitación
  const inv = await j(await fetch(B + '/auth/invitaciones', {
    method: 'POST', headers: HA,
    body: JSON.stringify({ rol: 'FONTANERO' }),
  }));
  v(inv.s === 201 && !!inv.b.codigo, 'Administrador emite código de invitación');

  console.log('\n' + (fallos === 0
    ? '=== TODAS LAS COMPROBACIONES PASARON ==='
    : '=== ' + fallos + ' COMPROBACIONES FALLARON ===') + '\n');

  servidor.close();
  process.exit(fallos === 0 ? 0 : 1);
});
