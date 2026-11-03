/**
 * ACCESO A LA BASE DE DATOS
 * ---------------------------------------------------------------------------
 * Envuelve el controlador `pg`. Todas las consultas del sistema pasan por aquí.
 *
 * REGLA INNEGOCIABLE (RNF-SEG-05)
 * Los valores SIEMPRE viajan como parámetros ($1, $2, ...), nunca concatenados
 * dentro del texto de la consulta. Esto elimina la inyección SQL por
 * construcción, no por disciplina del programador.
 *
 *   CORRECTO:   consultar('SELECT * FROM usuarios WHERE correo = $1', [correo])
 *   INCORRECTO: consultar("SELECT * FROM usuarios WHERE correo = '" + correo + "'")
 */

'use strict';

const { Pool } = require('pg');

function usarSsl() {
  if (process.env.DATABASE_SSL === 'true') return true;
  if (process.env.DATABASE_SSL === 'false') return false;
  const url = String(process.env.DATABASE_URL || '');
  // Supabase, Railway Postgres y pools en la nube exigen TLS.
  return /supabase|railway|amazonaws|neon\.tech|render\.com/i.test(url);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ssl: usarSsl() ? { rejectUnauthorized: false } : false,
});

pool.on('error', function (err) {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

/** Ejecuta una consulta parametrizada y devuelve las filas. */
async function consultar(texto, parametros) {
  const resultado = await pool.query(texto, parametros || []);
  return resultado.rows;
}

/** Ejecuta una consulta y devuelve la primera fila, o null. */
async function consultarUna(texto, parametros) {
  const filas = await consultar(texto, parametros);
  return filas.length ? filas[0] : null;
}

/**
 * Ejecuta varias operaciones dentro de una transacción.
 * Si cualquiera falla, se deshacen todas.
 *
 * Es indispensable en el cierre de periodo (RN-10): se emiten los 400 recibos
 * o no se emite ninguno. Sin esto, un corte de energía a la mitad deja a la
 * junta con un periodo medio facturado y sin forma de saber dónde se detuvo.
 *
 *   await enTransaccion(async (cliente) => {
 *     await cliente.query('INSERT ...', [...]);
 *     await cliente.query('UPDATE ...', [...]);
 *   });
 */
async function enTransaccion(operaciones) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await operaciones(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * Registra una operación sensible en la bitácora (RF-06.5).
 * Se llama desde las rutas que modifican montos, estados o datos del padrón.
 * Nunca interrumpe la operación principal: si la bitácora falla, se anota en
 * consola pero la transacción del usuario sigue su curso.
 */
async function registrarBitacora(datos, cliente) {
  const ejecutor = cliente || pool;
  try {
    await ejecutor.query(
      `INSERT INTO bitacora (actor_id, accion, entidad, entidad_id, valores_antes, valores_despues, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        datos.actorId || null,
        datos.accion,
        datos.entidad,
        datos.entidadId != null ? String(datos.entidadId) : null,
        datos.valoresAntes ? JSON.stringify(datos.valoresAntes) : null,
        datos.valoresDespues ? JSON.stringify(datos.valoresDespues) : null,
        datos.ip || null,
      ]
    );
  } catch (error) {
    console.error('No se pudo registrar en bitácora:', error.message);
  }
}

/** Verifica la conexión al arrancar el servidor. */
async function probarConexion() {
  const fila = await consultarUna('SELECT NOW() AS ahora');
  return fila.ahora;
}

module.exports = {
  pool,
  consultar,
  consultarUna,
  enTransaccion,
  registrarBitacora,
  probarConexion,
};
