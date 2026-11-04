/**
 * AUTENTICACIÓN Y CONTROL DE ACCESO
 * ---------------------------------------------------------------------------
 * Implementa RF-06.1 a RF-06.4 y RNF-SEG-02, RNF-SEG-03.
 *
 * La verificación de permisos ocurre AQUÍ, en el servidor, en cada solicitud.
 * Ocultar un botón en React no es un control de seguridad: cualquiera puede
 * llamar al endpoint directamente con curl.
 */

'use strict';

const jwt = require('jsonwebtoken');
const { rolesDe } = require('../dominio/permisos');

const SECRETO = process.env.JWT_SECRET || 'cambiar-en-produccion';
/** El aviso de inactividad (~18 min) cierra en el cliente; el JWT cubre la jornada laboral. */
const HORAS_SESION = Number(process.env.HORAS_SESION || 8);

/** Genera el token de sesión tras un inicio de sesión válido. */
function firmarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
    SECRETO,
    { expiresIn: HORAS_SESION + 'h' }
  );
}

/** Exige un token válido. Sin esto, ninguna ruta protegida responde. */
function autenticar(req, res, next) {
  const cabecera = req.headers.authorization;
  if (!cabecera || cabecera.indexOf('Bearer ') !== 0) {
    return res.status(401).json({ error: 'Debe iniciar sesión.' });
  }
  try {
    req.usuario = jwt.verify(cabecera.slice(7), SECRETO);
    next();
  } catch (e) {
    res.status(401).json({ error: 'La sesión expiró o el token no es válido.' });
  }
}

/**
 * Exige uno de los roles indicados (RF-06.4).
 * Uso: router.post('/cerrar', autenticar, exigirRol('ADMINISTRADOR'), manejador)
 */
function exigirRol() {
  const roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.usuario || roles.indexOf(req.usuario.rol) === -1) {
      return res.status(403).json({ error: 'No tiene permiso para esta operación.' });
    }
    next();
  };
}

/**
 * Exige el permiso definido en dominio/permisos.js (matriz por rol).
 * Uso: autenticar, exigirPermiso('pagos'), manejador
 */
function exigirPermiso(clave) {
  const roles = rolesDe(clave);
  if (!roles.length) {
    throw new Error('Permiso desconocido: ' + clave);
  }
  return exigirRol.apply(null, roles);
}

/**
 * Limitador de intentos por dirección IP (RNF-SEG-08).
 * Implementación en memoria, suficiente para un servidor único.
 */
function limitarIntentos(maximo, ventanaMinutos) {
  const registros = new Map();
  const ventanaMs = ventanaMinutos * 60 * 1000;

  return function (req, res, next) {
    const ahora = Date.now();
    const clave = req.ip;
    const previo = registros.get(clave);

    if (!previo || ahora - previo.desde > ventanaMs) {
      registros.set(clave, { desde: ahora, intentos: 1 });
      return next();
    }
    previo.intentos += 1;
    if (previo.intentos > maximo) {
      return res.status(429).json({
        error: 'Demasiados intentos. Espere unos minutos antes de volver a intentarlo.',
      });
    }
    next();
  };
}

/**
 * Manejador central de errores. Los mensajes técnicos van a la consola del
 * servidor, nunca al navegador (RNF-SEG-06).
 */
function manejarErrores(err, req, res, next) {
  console.error('[error]', err.message);
  if (res.headersSent) return next(err);
  if (err.estado) {
    return res.status(err.estado).json({ error: err.message });
  }
  res.status(500).json({ error: 'Ocurrió un error al procesar la solicitud.' });
}

module.exports = {
  firmarToken, autenticar, exigirRol, exigirPermiso, limitarIntentos, manejarErrores,
};
