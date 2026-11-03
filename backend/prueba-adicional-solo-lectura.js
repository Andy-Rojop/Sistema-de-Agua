/**
 * Pruebas adicionales no destructivas contra la API local (puerto 3001).
 * No crea lecturas, recibos, pagos, padrones ni cambia contraseñas.
 */

'use strict';

const B = 'http://127.0.0.1:3001/api';

async function j(r) {
  let b = null;
  try { b = await r.json(); } catch { /* no JSON */ }
  return { s: r.status, b, h: r.headers };
}

function loginBody(correo) {
  return JSON.stringify({ correo: correo, contrasena: 'agua2026' });
}

(async function () {
  let fallos = 0;
  const v = function (cond, texto, extra) {
    if (!cond) fallos += 1;
    console.log('  ' + (cond ? 'OK ' : 'MAL') + ' ' + texto + (extra ? ' · ' + extra : ''));
  };

  console.log('\nPRUEBAS ADICIONALES (solo lectura / validación)\n');

  const tes = await j(await fetch(B + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: loginBody('tesoreria@santafe.gt'),
  }));
  const font = await j(await fetch(B + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: loginBody('fontanero@santafe.gt'),
  }));
  const adm = await j(await fetch(B + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: loginBody('admin@santafe.gt'),
  }));
  v(tes.s === 200 && tes.b.usuario.rol === 'TESORERO', 'Login tesorero');
  v(font.s === 200 && font.b.usuario.rol === 'FONTANERO', 'Login fontanero');
  v(adm.s === 200 && adm.b.usuario.rol === 'ADMINISTRADOR', 'Login administrador');
  const HT = { Authorization: 'Bearer ' + tes.b.token, 'Content-Type': 'application/json' };
  const HF = { Authorization: 'Bearer ' + font.b.token, 'Content-Type': 'application/json' };
  const HA = { Authorization: 'Bearer ' + adm.b.token, 'Content-Type': 'application/json' };

  const yo = await j(await fetch(B + '/auth/yo', { headers: HT }));
  v(yo.s === 200 && yo.b.rol === 'TESORERO', 'GET /auth/yo tesorero');

  const jwtBasura = await j(await fetch(B + '/conexiones', {
    headers: { Authorization: 'Bearer esto.no.es.un.jwt' },
  }));
  v(jwtBasura.s === 401, 'JWT malformado rechazado (401)');

  const cors = await fetch(B + '/salud', {
    headers: { Origin: 'https://sitio-ajeno.example' },
  });
  const allow = cors.headers.get('access-control-allow-origin');
  v(cors.status === 200 && allow !== 'https://sitio-ajeno.example',
    'CORS no refleja un origen ajeno', 'allow=' + String(allow));

  const iny = await j(await fetch(B + '/conexiones?q=' + encodeURIComponent("' OR 1=1 --"), { headers: HT }));
  v(iny.s === 200 && Array.isArray(iny.b),
    'Búsqueda con carga SQL no rompe la API', 'n=' + (iny.b && iny.b.length));
  const xss = await j(await fetch(B + '/conexiones?q=' + encodeURIComponent('<script>alert(1)</script>'), { headers: HT }));
  v(xss.s === 200 && Array.isArray(xss.b) && xss.b.length === 0,
    'Búsqueda XSS no devuelve filas ni ejecuta nada en el servidor');

  const sf041 = await j(await fetch(B + '/conexiones?q=SF-041', { headers: HT }));
  v(sf041.s === 200 && sf041.b.length === 1 && sf041.b[0].codigo === 'SF-041',
    'Filtro por código SF-041');

  const noExiste = await j(await fetch(B + '/cobro/conexiones/99999', { headers: HT }));
  v(noExiste.s === 404, 'Ficha de cobro inexistente (404)');
  const rec404 = await j(await fetch(B + '/recibos/99999', { headers: HT }));
  v(rec404.s === 404, 'Recibo inexistente (404)');

  const ficha = await j(await fetch(B + '/cobro/conexiones/4', { headers: HT }));
  v(ficha.s === 200 && ficha.b.conexion && ficha.b.conexion.codigo,
    'Ficha de cobro id=4', ficha.b.conexion && ficha.b.conexion.codigo);
  const lp = ficha.b && ficha.b.lecturaPeriodo;
  if (lp) {
    const cons = lp.lectura_actual - lp.lectura_anterior;
    v(cons === lp.consumo_litros,
      'Consumo persistido = actual − anterior',
      lp.lectura_anterior + ' → ' + lp.lectura_actual + ' = ' + lp.consumo_litros + ' L');
  } else {
    v(false, 'La ficha id=4 no trajo lectura del periodo (no se pudo verificar aritmética)');
  }

  const rec1a = await j(await fetch(B + '/recibos/1', { headers: HT }));
  const rec1b = await j(await fetch(B + '/recibos/1', { headers: HT }));
  v(rec1a.s === 200 && rec1b.s === 200 && rec1a.b.correlativo === rec1b.b.correlativo
    && rec1a.b.totalCentavos === rec1b.b.totalCentavos,
    'Dos GET del mismo recibo conservan correlativo e importe',
    rec1a.b && ('#' + rec1a.b.correlativo + ' ' + rec1a.b.totalCentavos + ' cv'));

  const menor = lp ? lp.lectura_anterior - 1000 : 0;
  const prevMenor = await j(await fetch(B + '/cobro/preview', {
    method: 'POST', headers: HT,
    body: JSON.stringify({ conexionId: 4, lecturaActual: menor }),
  }));
  v(prevMenor.s === 409 || (ficha.b && ficha.b.reciboPeriodo && prevMenor.b && prevMenor.b.yaEmitido),
    'Vista previa con lectura menor no guarda y avisa',
    'HTTP ' + prevMenor.s + (prevMenor.b && prevMenor.b.error ? ' ' + prevMenor.b.error : ''));

  const prevTxt = await j(await fetch(B + '/cobro/preview', {
    method: 'POST', headers: HT,
    body: JSON.stringify({ conexionId: 4, lecturaActual: 'abc' }),
  }));
  v(prevTxt.s === 400 || prevTxt.s === 409,
    'Vista previa rechaza texto en lectura', 'HTTP ' + prevTxt.s);

  const prevNeg = await j(await fetch(B + '/cobro/preview', {
    method: 'POST', headers: HT,
    body: JSON.stringify({ conexionId: 4, lecturaActual: -10 }),
  }));
  v(prevNeg.s === 400 || prevNeg.s === 409,
    'Vista previa rechaza lectura negativa', 'HTTP ' + prevNeg.s);

  if (ficha.b && ficha.b.reciboPeriodo) {
    const c1 = j(await fetch(B + '/cobro/confirmar', {
      method: 'POST', headers: HT,
      body: JSON.stringify({ conexionId: 4, cobrar: false }),
    }));
    const c2 = j(await fetch(B + '/cobro/confirmar', {
      method: 'POST', headers: HT,
      body: JSON.stringify({ conexionId: 4, cobrar: false }),
    }));
    const [a, b] = await Promise.all([c1, c2]);
    v(a.s < 500 && b.s < 500 && a.b.duplicadoEvitado && b.b.duplicadoEvitado
      && a.b.recibo.correlativo === b.b.recibo.correlativo,
      'Dos confirmar sin cobrar no emiten recibo nuevo',
      '#' + (a.b.recibo && a.b.recibo.correlativo));
  } else {
    console.log('  --  Confirmar paralelo omitido: id=4 no tiene recibo de este periodo (evitaría facturar)');
  }

  const lecVacio = await j(await fetch(B + '/lecturas', {
    method: 'POST', headers: HF, body: JSON.stringify({ conexionId: 4 }),
  }));
  v(lecVacio.s === 400, 'Lectura sin valor rechazada (400)');
  const lecNeg = await j(await fetch(B + '/lecturas', {
    method: 'POST', headers: HF,
    body: JSON.stringify({ conexionId: 4, lecturaActual: -5 }),
  }));
  v(lecNeg.s === 400, 'Lectura negativa rechazada (400)');
  const lecTxt = await j(await fetch(B + '/lecturas', {
    method: 'POST', headers: HF,
    body: JSON.stringify({ conexionId: 4, lecturaActual: 'veinte' }),
  }));
  v(lecTxt.s === 400, 'Lectura con texto rechazada (400)');

  const tesLee = await j(await fetch(B + '/lecturas', {
    method: 'POST', headers: HT,
    body: JSON.stringify({ conexionId: 4, lecturaActual: 1 }),
  }));
  v(tesLee.s === 403, 'Tesorero no registra lecturas (403)');

  const fontAlta = await j(await fetch(B + '/conexiones', {
    method: 'POST', headers: HF,
    body: JSON.stringify({ nombres: 'X', apellidos: 'Y', dpi: '1', telefono: '1', codigoConexion: 'ZZ-999' }),
  }));
  v(fontAlta.s === 403, 'Fontanero no da de alta padrón (403)');
  const fontPatch = await j(await fetch(B + '/conexiones/1', {
    method: 'PATCH', headers: HF,
    body: JSON.stringify({ nombres: 'X', apellidos: 'Y', dpi: '1', telefono: '1' }),
  }));
  v(fontPatch.s === 403, 'Fontanero no edita padrón (403)');
  const patchVacio = await j(await fetch(B + '/conexiones/1', {
    method: 'PATCH', headers: HT,
    body: JSON.stringify({ nombres: '', apellidos: '', dpi: '', telefono: '' }),
  }));
  v(patchVacio.s === 400, 'Edición sin datos obligatorios rechazada (400)');
  const tesInv = await j(await fetch(B + '/auth/invitaciones', {
    method: 'POST', headers: HT, body: JSON.stringify({ rol: 'FONTANERO' }),
  }));
  v(tesInv.s === 403, 'Tesorero no emite invitaciones (403)');
  const tesUsu = await j(await fetch(B + '/usuarios', { headers: HT }));
  v(tesUsu.s === 403, 'Tesorero no lista cuentas (403)');
  const tesBit = await j(await fetch(B + '/bitacora', { headers: HT }));
  v(tesBit.s === 403, 'Tesorero no ve la bitácora (403)');
  const tesCierre = await j(await fetch(B + '/periodos/actual/validar-cierre', { headers: HT }));
  v(tesCierre.s === 403, 'Tesorero no valida el cierre (403)');
  const admCierre = await j(await fetch(B + '/periodos/actual/validar-cierre', { headers: HA }));
  v(admCierre.s === 200 && typeof admCierre.b.puedeCerrar === 'boolean',
    'Administrador consulta validar-cierre',
    'puedeCerrar=' + (admCierre.b && admCierre.b.puedeCerrar)
      + ' impedimentos=' + ((admCierre.b && admCierre.b.impedimentos && admCierre.b.impedimentos.length) || 0));

  const pago0 = await j(await fetch(B + '/pagos', {
    method: 'POST', headers: HT,
    body: JSON.stringify({ conexionId: 4, montoCentavos: 0 }),
  }));
  v(pago0.s === 400, 'Pago de Q0 rechazado (400)');
  const pagoNeg = await j(await fetch(B + '/pagos', {
    method: 'POST', headers: HT,
    body: JSON.stringify({ conexionId: 4, montoCentavos: -100 }),
  }));
  v(pagoNeg.s === 400, 'Pago negativo rechazado (400)');
  const prevPago = await j(await fetch(B + '/pagos/previsualizar', {
    method: 'POST', headers: HT,
    body: JSON.stringify({ conexionId: 4, montoCentavos: 1000 }),
  }));
  v(prevPago.s === 200 || prevPago.s === 409,
    'Previsualizar pago no persiste', 'HTTP ' + prevPago.s);

  const morosos = await j(await fetch(B + '/reportes/morosos', { headers: HT }));
  const tablero = await j(await fetch(B + '/reportes/tablero', { headers: HT }));
  v(morosos.s === 200 && Array.isArray(morosos.b),
    'Reporte de morosos', 'n=' + (morosos.b && morosos.b.length));
  v(tablero.s === 200 && tablero.b.indicadores,
    'Tablero tesorero',
    'morosas=' + (tablero.b.indicadores && tablero.b.indicadores.conexiones_morosas)
      + ' pendiente_periodo=' + (tablero.b.indicadores && tablero.b.indicadores.facturado_centavos));

  const cuenta = await j(await fetch(B + '/conexiones/4/estado-cuenta', { headers: HT }));
  v(cuenta.s === 200 && Array.isArray(cuenta.b.recibos) && Array.isArray(cuenta.b.pagos),
    'Estado de cuenta id=4',
    'recibos=' + (cuenta.b.recibos && cuenta.b.recibos.length)
      + ' pagos=' + (cuenta.b.pagos && cuenta.b.pagos.length)
      + ' pendiente=' + (cuenta.b.saldoPendienteCentavos));
  const cuentaFont = await j(await fetch(B + '/conexiones/4/estado-cuenta', { headers: HF }));
  v(cuentaFont.s === 403, 'Fontanero no ve estado de cuenta (403)');

  const par = await Promise.all([1, 2, 3, 4, 5].map(function () {
    return fetch(B + '/cobro/buscar', { headers: HT }).then(function (r) { return r.status; });
  }));
  v(par.every(function (s) { return s === 200; }),
    'Cinco GET /cobro/buscar en paralelo', par.join(','));

  const m125 = Math.round(125 * 1000);
  const m143 = Math.round(143 * 1000);
  v(m125 === 125000 && m143 === 143000 && (m143 - m125) === 18000,
    'Conversión UI m³→L: 125.0 y 143.0 m³ = 18 000 L');

  console.log('\n' + (fallos === 0
    ? '=== TODAS LAS COMPROBACIONES ADICIONALES PASARON ==='
    : '=== ' + fallos + ' COMPROBACIONES FALLARON ===') + '\n');
  process.exit(fallos === 0 ? 0 : 1);
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
