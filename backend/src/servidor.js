/**
 * SERVIDOR — API REST
 * ---------------------------------------------------------------------------
 * Sistema de Gestión, Control de Consumo y Facturación de Agua Potable
 * Parcelamiento Santa Fe, Retalhuleu
 *
 * Local:     npm run dev
 * Railway:   npm start  (PORT lo asigna la plataforma)
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { probarConexion } = require('./datos/bd');
const { manejarErrores } = require('./rutas/seguridad');
const rutasPadron = require('./rutas/padron');
const rutasLecturas = require('./rutas/lecturas');
const rutasTesoreria = require('./rutas/tesoreria');
const rutasCobro = require('./rutas/cobro');

const app = express();
const PUERTO = Number(process.env.PORT || 3001);
const EN_PRODUCCION = Boolean(
  process.env.RAILWAY_ENVIRONMENT
  || process.env.NODE_ENV === 'production'
);

function listaOrigenes() {
  const raw = String(process.env.ORIGEN_PERMITIDO || '').trim();
  if (!raw || raw === '*') return null;
  return raw.split(',').map(function (o) { return o.trim(); }).filter(Boolean);
}

const origenes = listaOrigenes();

app.set('trust proxy', 1);
app.use(cors({
  origin: function (origin, callback) {
    // Peticiones sin Origin (health checks, curl, mismo servidor).
    if (!origin) return callback(null, true);
    if (!origenes) return callback(null, true);
    if (origenes.indexOf(origin) !== -1) return callback(null, true);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

app.use(function (req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/api/salud', function (req, res) {
  res.json({ estado: 'ok', fecha: new Date() });
});

app.use('/api', rutasPadron);
app.use('/api', rutasLecturas);
app.use('/api', rutasTesoreria);
app.use('/api', rutasCobro);

app.use(function (req, res) {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});
app.use(manejarErrores);

async function arrancar() {
  if (EN_PRODUCCION) {
    const secreto = process.env.JWT_SECRET;
    if (!secreto || secreto === 'cambiar-en-produccion' || secreto.length < 16) {
      console.error('\n  JWT_SECRET debe ser una cadena segura (mín. 16 caracteres) en producción.\n');
      process.exit(1);
    }
    if (!process.env.DATABASE_URL) {
      console.error('\n  DATABASE_URL es obligatoria en producción.\n');
      process.exit(1);
    }
  }

  try {
    const ahora = await probarConexion();
    console.log('  Base de datos conectada:', ahora);
  } catch (e) {
    console.error('\n  No se pudo conectar a PostgreSQL:', e.message);
    console.error('  Revise DATABASE_URL (y DATABASE_SSL si usa Supabase).\n');
    process.exit(1);
  }

  app.listen(PUERTO, '0.0.0.0', function () {
    console.log('  API escuchando en 0.0.0.0:' + PUERTO);
    console.log('  Sistema de Agua Potable — Parcelamiento Santa Fe\n');
  });
}

arrancar();

module.exports = app;
