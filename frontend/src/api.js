/**
 * CLIENTE DE LA API
 * ---------------------------------------------------------------------------
 * Único punto por el que el frontend habla con el servidor.
 *
 * El token vive en localStorage para recuperar la sesión al volver al enlace.
 * La inactividad (~18 min) la controla AvisoSesion: pregunta si desea seguir
 * o cierra. Salir y el JWT vencido también terminan la sesión.
 */

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function leerGuardado(clave) {
  return localStorage.getItem(clave) || sessionStorage.getItem(clave) || null;
}

let token = leerGuardado('token');

export function guardarSesion(nuevoToken, usuario) {
  token = nuevoToken;
  localStorage.setItem('token', nuevoToken);
  localStorage.setItem('usuario', JSON.stringify(usuario));
  localStorage.setItem('ultimaActividadSesion', String(Date.now()));
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('usuario');
}

export function cerrarSesion() {
  token = null;
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  localStorage.removeItem('ultimaActividadSesion');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('usuario');
}

export function usuarioActual() {
  const guardado = leerGuardado('usuario');
  return guardado ? JSON.parse(guardado) : null;
}

async function peticion(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(BASE + ruta, {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(opciones.headers || {}),
      },
    });
  } catch {
    throw new Error(
      'No se pudo conectar con el servidor. Compruebe su conexión o que la API esté disponible.'
    );
  }

  // Sesión vencida: se limpia y se recarga para volver al inicio de sesión.
  if (respuesta.status === 401 && token) {
    cerrarSesion();
    window.location.reload();
    return;
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(datos.error || 'Ocurrió un error.');
    error.detalle = datos;
    error.estado = respuesta.status;
    throw error;
  }
  return datos;
}

export const api = {
  // ------------------------------------------------------- autenticación --
  login: (correo, contrasena) =>
    peticion('/auth/login', { method: 'POST', body: JSON.stringify({ correo, contrasena }) }),
  registrar: (datos) =>
    peticion('/auth/registrar', { method: 'POST', body: JSON.stringify(datos) }),
  recuperar: (correo) =>
    peticion('/auth/recuperar', { method: 'POST', body: JSON.stringify({ correo }) }),
  restablecer: (codigo, nueva) =>
    peticion('/auth/restablecer', { method: 'POST', body: JSON.stringify({ codigo, nueva }) }),
  yo: () => peticion('/auth/yo'),
  usuarios: () => peticion('/usuarios'),
  crearUsuario: (datos) =>
    peticion('/usuarios', { method: 'POST', body: JSON.stringify(datos) }),
  crearInvitacion: (rol) =>
    peticion('/auth/invitaciones', { method: 'POST', body: JSON.stringify({ rol }) }),
  invitaciones: () => peticion('/auth/invitaciones'),

  // -------------------------------------------------------------- padrón --
  conexiones: (filtros = {}) => {
    const q = new URLSearchParams(
      Object.entries(filtros).filter(([, v]) => v)
    ).toString();
    return peticion('/conexiones' + (q ? '?' + q : ''));
  },
  crearConexion: (datos) =>
    peticion('/conexiones', { method: 'POST', body: JSON.stringify(datos) }),
  actualizarConexion: (id, datos) =>
    peticion('/conexiones/' + id, { method: 'PATCH', body: JSON.stringify(datos) }),
  bajaConexion: (id, motivo) =>
    peticion('/conexiones/' + id, {
      method: 'DELETE',
      body: JSON.stringify({ motivo }),
    }),

  // ------------------------------------------------- periodos y lecturas --
  periodoActual: () => peticion('/periodos/actual'),
  pendientesDeLectura: () => peticion('/periodos/actual/pendientes'),
  abrirPeriodo: (datos) =>
    peticion('/periodos', { method: 'POST', body: JSON.stringify(datos) }),
  registrarLectura: (conexionId, lecturaActual, observacion) =>
    peticion('/lecturas', {
      method: 'POST',
      body: JSON.stringify({ conexionId, lecturaActual, observacion }),
    }),
  lecturasInconsistentes: () => peticion('/lecturas/inconsistentes'),
  resolverInconsistencia: (id, nota) =>
    peticion('/lecturas/' + id + '/resolver', {
      method: 'POST', body: JSON.stringify({ nota }),
    }),

  // ------------------------------------------------------------- cierre --
  validarCierre: () => peticion('/periodos/actual/validar-cierre'),
  cerrarPeriodo: () => peticion('/periodos/actual/cerrar', { method: 'POST' }),
  recibo: (id) => peticion('/recibos/' + id),

  cobroBuscar: (q = '') =>
    peticion('/cobro/buscar' + (q ? '?q=' + encodeURIComponent(q) : '')),
  cobroFicha: (id) => peticion('/cobro/conexiones/' + id),
  cobroPreview: (datos) =>
    peticion('/cobro/preview', { method: 'POST', body: JSON.stringify(datos) }),
  cobroConfirmar: (datos) =>
    peticion('/cobro/confirmar', { method: 'POST', body: JSON.stringify(datos) }),

  // ---------------------------------------------------------- tesorería --
  estadoCuenta: (conexionId) => peticion('/conexiones/' + conexionId + '/estado-cuenta'),
  previsualizarPago: (conexionId, montoCentavos) =>
    peticion('/pagos/previsualizar', {
      method: 'POST', body: JSON.stringify({ conexionId, montoCentavos }),
    }),
  registrarPago: (datos) =>
    peticion('/pagos', { method: 'POST', body: JSON.stringify(datos) }),
  anularPago: (id, motivo) =>
    peticion('/pagos/' + id + '/anular', {
      method: 'POST', body: JSON.stringify({ motivo }),
    }),

  // ----------------------------------------------------------- reportes --
  tablero: () => peticion('/reportes/tablero'),
  morosos: (sector) => peticion('/reportes/morosos' + (sector ? '?sector=' + sector : '')),
  ingresos: () => peticion('/reportes/ingresos'),
  consumo: () => peticion('/reportes/consumo'),
  corteCaja: (fecha) => peticion('/reportes/corte-caja' + (fecha ? '?fecha=' + fecha : '')),
  historial: (conexionId) => peticion('/conexiones/' + conexionId + '/historial'),
  bitacora: (filtros = {}) => {
    const q = new URLSearchParams(
      Object.entries(filtros).filter(([, v]) => v)
    ).toString();
    return peticion('/bitacora' + (q ? '?' + q : ''));
  },
};

// ===========================================================================
// Presentación de cifras
// El servidor entrega enteros en centavos; el formato se aplica solo aquí.
// ===========================================================================

export function quetzales(centavos) {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos || 0);
  return signo + 'Q' + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
}

export function miles(n) {
  return Number(n || 0).toLocaleString('es-GT');
}

/** Cifra del contador: metros cúbicos, un decimal (el dígito rojo del medidor). */
export function textoMetros(litros) {
  return (Number(litros || 0) / 1000).toLocaleString('es-GT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function metrosCubicos(litros) {
  return textoMetros(litros) + ' m³';
}

export function metrosParaCampo(litros) {
  if (litros == null || litros === '') return '';
  const m = Math.round((Number(litros) / 1000) * 10) / 10;
  if (!isFinite(m) || m < 0) return '';
  return String(m);
}

export function sanitizarMetros(texto) {
  let t = String(texto).replace(/[^\d.,]/g, '').replace(',', '.');
  const i = t.indexOf('.');
  if (i === -1) return t.slice(0, 6);
  return t.slice(0, i).slice(0, 6) + '.' + t.slice(i + 1).replace(/\./g, '').slice(0, 1);
}

export function aLitrosDesdeMetros(texto) {
  const n = Number(String(texto || '').trim().replace(',', '.'));
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}

/** Convierte "25.50" escrito por el tesorero a 2550 centavos. */
export function aCentavos(texto) {
  const n = Number(String(texto).replace(',', '.'));
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
