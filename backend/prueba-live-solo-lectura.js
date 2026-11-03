/**
 * Comprobaciones de solo lectura contra la API local (puerto 3001).
 * No crea lecturas, recibos ni pagos.
 */

'use strict';

const B = 'http://127.0.0.1:3001/api';

async function j(r) {
  let b = null;
  try { b = await r.json(); } catch { /* respuesta no JSON */ }
  return { s: r.status, b };
}

(async function () {
  const salud = await j(await fetch(B.replace('/api', '/api/salud')));
  console.log('salud', salud.s, salud.b && salud.b.estado);

  const sin = await j(await fetch(B + '/conexiones'));
  console.log('sin_token_conexiones', sin.s);

  const malo = await j(await fetch(B + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'admin@santafe.gt', contrasena: 'incorrecta' }),
  }));
  console.log('login_incorrecto', malo.s, malo.b && malo.b.error);

  const cuentas = [
    'admin@santafe.gt',
    'tesoreria@santafe.gt',
    'fontanero@santafe.gt',
  ];

  for (const correo of cuentas) {
    const login = await j(await fetch(B + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: correo, contrasena: 'agua2026' }),
    }));
    const rol = login.b && login.b.usuario && login.b.usuario.rol;
    console.log('login', correo, login.s, rol || (login.b && login.b.error));
    if (login.s !== 200) continue;

    const H = { Authorization: 'Bearer ' + login.b.token };
    const pad = await j(await fetch(B + '/conexiones', { headers: H }));
    const muestra = pad.b && pad.b[0];
    console.log(
      '  conexiones', pad.s, 'n=' + (Array.isArray(pad.b) ? pad.b.length : '?'),
      muestra ? 'saldo_pendiente=' + String(muestra.saldo_pendiente) : 'vacio'
    );
    const rec = await j(await fetch(B + '/recibos/1', { headers: H }));
    console.log('  recibos/1', rec.s);
    const cons = await j(await fetch(B + '/reportes/consumo', { headers: H }));
    console.log('  reportes/consumo', cons.s);
    const hist = await j(await fetch(B + '/conexiones/1/historial', { headers: H }));
    console.log('  historial', hist.s);
    const per = await j(await fetch(B + '/periodos/actual', { headers: H }));
    const p = per.b && per.b.periodo;
    console.log(
      '  periodo', per.s,
      p ? (p.anio + '-' + p.mes + ' ' + p.estado) : 'sin_periodo'
    );
    if (rol === 'FONTANERO') {
      const cerrar = await j(await fetch(B + '/periodos/actual/cerrar', {
        method: 'POST', headers: H,
      }));
      console.log('  cerrar_periodo', cerrar.s);
    }
  }
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
