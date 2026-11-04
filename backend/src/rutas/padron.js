/**
 * RUTAS: AUTENTICACIÓN, PADRÓN Y MEDIDORES
 * Módulos RF-01 y RF-06 de la ERS.
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { consultar, consultarUna, enTransaccion, registrarBitacora } = require('../datos/bd');
const { firmarToken, autenticar, exigirPermiso, limitarIntentos } = require('./seguridad');
const { ROLES } = require('../dominio/permisos');

const router = express.Router();

function validarPoliticaContrasena(clave) {
  const texto = String(clave || '');
  if (texto.length < 10 || !/[a-zA-Z]/.test(texto) || !/[0-9]/.test(texto)) {
    return 'La contraseña debe tener al menos 10 caracteres e incluir letras y números.';
  }
  return null;
}

function correoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

// =========================================================== autenticación ==

// RF-06.1 — Inicio de sesión.
router.post('/auth/login', limitarIntentos(10, 15), async function (req, res, next) {
  try {
    const correo = String(req.body.correo || '').trim().toLowerCase();
    const contrasena = String(req.body.contrasena || '');

    if (!correo || !contrasena) {
      return res.status(400).json({ error: 'Ingrese su correo y contraseña.' });
    }

    const usuario = await consultarUna(
      `SELECT id, nombre, correo, hash_contrasena, rol, activo, bloqueado_hasta
         FROM usuarios WHERE correo = $1 AND eliminado_en IS NULL`,
      [correo]
    );

    // Mensaje idéntico exista o no el usuario: no se revela qué correos están
    // registrados (RNF-SEG-06).
    const generico = { error: 'Correo o contraseña incorrectos.' };
    if (!usuario || !usuario.activo) return res.status(401).json(generico);

    // RF-06.10 — cuenta bloqueada por intentos fallidos.
    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      return res.status(423).json({
        error: 'La cuenta está bloqueada temporalmente. Intente más tarde.',
      });
    }

    const valida = await bcrypt.compare(contrasena, usuario.hash_contrasena);

    if (!valida) {
      // Cinco intentos fallidos consecutivos bloquean la cuenta 15 minutos.
      await consultar(
        `UPDATE usuarios
            SET intentos_fallidos = intentos_fallidos + 1,
                bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= 5
                                       THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
          WHERE id = $1`,
        [usuario.id]
      );
      return res.status(401).json(generico);
    }

    await consultar(
      `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = NOW()
        WHERE id = $1`,
      [usuario.id]
    );

    await registrarBitacora({
      actorId: usuario.id, accion: 'INICIAR_SESION', entidad: 'usuarios',
      entidadId: usuario.id, ip: req.ip,
    });

    res.json({
      token: firmarToken(usuario),
      usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    });
  } catch (e) { next(e); }
});

router.get('/auth/yo', autenticar, function (req, res) {
  res.json({ id: req.usuario.id, nombre: req.usuario.nombre, rol: req.usuario.rol });
});

// Registro: el primer usuario del sistema no necesita código (bootstrap) y
// queda como ADMINISTRADOR. A partir del segundo, hace falta un código de
// invitación emitido por un administrador (RF-06 / control de acceso).
router.post('/auth/registrar', limitarIntentos(8, 15), async function (req, res, next) {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const direccion = String(req.body.direccion || '').trim();
    const correo = String(req.body.correo || '').trim().toLowerCase();
    const contrasena = String(req.body.contrasena || '');
    const invitacion = String(req.body.invitacion || '').trim();

    if (!nombre || !direccion || !correo || !contrasena) {
      return res.status(400).json({
        error: 'Nombre completo, dirección, correo y contraseña son obligatorios.',
      });
    }
    if (!correoValido(correo)) {
      return res.status(400).json({ error: 'Ingrese un correo electrónico válido.' });
    }
    const falloClave = validarPoliticaContrasena(contrasena);
    if (falloClave) return res.status(400).json({ error: falloClave });

    const existentes = await consultarUna(
      `SELECT COUNT(*)::int AS n FROM usuarios WHERE eliminado_en IS NULL`
    );

    let rol = 'ADMINISTRADOR';
    let invitacionId = null;

    if (existentes.n === 0) {
      // Arranque del sistema: sin código.
      rol = 'ADMINISTRADOR';
    } else {
      if (!invitacion) {
        return res.status(400).json({
          error: 'Se requiere un código de invitación. Solicítelo al administrador.',
        });
      }
      const tokenHash = crypto.createHash('sha256').update(invitacion).digest('hex');
      const registro = await consultarUna(
        `SELECT id, rol FROM tokens_invitacion
          WHERE token_hash = $1 AND usado_en IS NULL AND expira_en > NOW()`,
        [tokenHash]
      );
      if (!registro) {
        return res.status(400).json({
          error: 'El código de invitación no es válido o ya expiró.',
        });
      }
      rol = registro.rol;
      invitacionId = registro.id;
    }

    const creado = await consultarUna(
      `INSERT INTO usuarios (nombre, direccion, correo, hash_contrasena, rol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, direccion, correo, rol, activo`,
      [nombre, direccion, correo, await bcrypt.hash(contrasena, 12), rol]
    );

    if (invitacionId) {
      await consultar(
        `UPDATE tokens_invitacion
            SET usado_en = NOW(), usado_por = $1
          WHERE id = $2 AND usado_en IS NULL`,
        [creado.id, invitacionId]
      );
    }

    await registrarBitacora({
      actorId: creado.id, accion: 'REGISTRAR_USUARIO', entidad: 'usuarios',
      entidadId: creado.id, valoresDespues: { id: creado.id, correo: creado.correo, rol },
      ip: req.ip,
    });

    res.status(201).json({
      mensaje: rol === 'ADMINISTRADOR' && existentes.n === 0
        ? 'Cuenta creada. Es el primer usuario: queda como administrador.'
        : 'Cuenta creada. Ya puede iniciar sesión.',
      usuario: { id: creado.id, nombre: creado.nombre, rol: creado.rol },
    });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }
    next(e);
  }
});

// Emite un código de invitación (solo Administrador). El código se entrega
// en la respuesta para operar sin correo (junta local). Válido 7 días.
router.post('/auth/invitaciones', autenticar, exigirPermiso('invitaciones'), async function (req, res, next) {
  try {
    const rol = String(req.body.rol || 'FONTANERO').toUpperCase();
    if (ROLES.indexOf(rol) === -1) {
      return res.status(400).json({ error: 'El rol indicado no es válido.' });
    }

    const token = crypto.randomBytes(18).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const fila = await consultarUna(
      `INSERT INTO tokens_invitacion (token_hash, rol, creado_por, expira_en)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
       RETURNING id, rol, expira_en`,
      [tokenHash, rol, req.usuario.id]
    );

    await registrarBitacora({
      actorId: req.usuario.id, accion: 'EMITIR_INVITACION', entidad: 'tokens_invitacion',
      entidadId: fila.id, valoresDespues: { rol: fila.rol, expira_en: fila.expira_en },
      ip: req.ip,
    });

    res.status(201).json({
      mensaje: 'Código de invitación generado. Entrégueselo a la persona que se registrará.',
      codigo: token,
      rol: fila.rol,
      expira_en: fila.expira_en,
    });
  } catch (e) { next(e); }
});

// Listado de invitaciones pendientes (solo Administrador).
router.get('/auth/invitaciones', autenticar, exigirPermiso('invitaciones'), async function (req, res, next) {
  try {
    res.json(await consultar(
      `SELECT i.id, i.rol, i.expira_en, i.usado_en, i.creado_en,
              u.nombre AS creado_por_nombre,
              uu.nombre AS usado_por_nombre
         FROM tokens_invitacion i
         JOIN usuarios u ON u.id = i.creado_por
         LEFT JOIN usuarios uu ON uu.id = i.usado_por
        ORDER BY i.creado_en DESC
        LIMIT 50`
    ));
  } catch (e) { next(e); }
});

// Solicitud de restablecimiento. Respuesta genérica; el código se entrega
// en la respuesta para operar sin correo (junta local). Válido 1 hora.
router.post('/auth/recuperar', limitarIntentos(8, 15), async function (req, res, next) {
  try {
    const correo = String(req.body.correo || '').trim().toLowerCase();
    const generico = {
      mensaje: 'Si el correo está registrado, use el código para restablecer la contraseña.',
    };

    if (!correo || !correoValido(correo)) {
      return res.status(400).json({ error: 'Ingrese un correo electrónico válido.' });
    }

    const usuario = await consultarUna(
      `SELECT id FROM usuarios
        WHERE correo = $1 AND eliminado_en IS NULL AND activo = TRUE`,
      [correo]
    );

    if (!usuario) return res.json(generico);

    const token = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await consultar(
      `UPDATE tokens_recuperacion SET usado_en = NOW()
        WHERE usuario_id = $1 AND usado_en IS NULL`,
      [usuario.id]
    );

    await consultar(
      `INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [usuario.id, tokenHash]
    );

    await registrarBitacora({
      actorId: usuario.id, accion: 'SOLICITAR_RECUPERACION', entidad: 'usuarios',
      entidadId: usuario.id, ip: req.ip,
    });

    res.json({ ...generico, codigo: token });
  } catch (e) { next(e); }
});

// Aplica el código de recuperación y fija la nueva contraseña.
router.post('/auth/restablecer', limitarIntentos(8, 15), async function (req, res, next) {
  try {
    const codigo = String(req.body.codigo || '').trim();
    const nueva = String(req.body.nueva || '');

    if (!codigo) {
      return res.status(400).json({ error: 'Ingrese el código de restablecimiento.' });
    }
    const falloClave = validarPoliticaContrasena(nueva);
    if (falloClave) return res.status(400).json({ error: falloClave });

    const tokenHash = crypto.createHash('sha256').update(codigo).digest('hex');
    const registro = await consultarUna(
      `SELECT id, usuario_id FROM tokens_recuperacion
        WHERE token_hash = $1 AND usado_en IS NULL AND expira_en > NOW()`,
      [tokenHash]
    );

    if (!registro) {
      return res.status(400).json({
        error: 'El código no es válido o ya expiró. Solicite uno nuevo.',
      });
    }

    await consultar('UPDATE usuarios SET hash_contrasena = $1, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $2',
      [await bcrypt.hash(nueva, 12), registro.usuario_id]);

    await consultar(
      `UPDATE tokens_recuperacion SET usado_en = NOW() WHERE id = $1`,
      [registro.id]
    );

    await registrarBitacora({
      actorId: registro.usuario_id, accion: 'RESTABLECER_CONTRASENA', entidad: 'usuarios',
      entidadId: registro.usuario_id, ip: req.ip,
    });

    res.json({ mensaje: 'Contraseña restablecida. Ya puede iniciar sesión.' });
  } catch (e) { next(e); }
});

// RF-06.6 — Cambio de contraseña propia.
router.post('/auth/contrasena', autenticar, async function (req, res, next) {
  try {
    const actual = String(req.body.actual || '');
    const nueva = String(req.body.nueva || '');

    const falloClave = validarPoliticaContrasena(nueva);
    if (falloClave) return res.status(400).json({ error: falloClave });

    const usuario = await consultarUna('SELECT hash_contrasena FROM usuarios WHERE id = $1',
      [req.usuario.id]);
    if (!await bcrypt.compare(actual, usuario.hash_contrasena)) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
    }

    await consultar('UPDATE usuarios SET hash_contrasena = $1 WHERE id = $2',
      [await bcrypt.hash(nueva, 12), req.usuario.id]);

    await registrarBitacora({
      actorId: req.usuario.id, accion: 'CAMBIAR_CONTRASENA', entidad: 'usuarios',
      entidadId: req.usuario.id, ip: req.ip,
    });

    res.json({ mensaje: 'Contraseña actualizada.' });
  } catch (e) { next(e); }
});

// RF-06.2 — Administración de cuentas (solo Administrador).
router.get('/usuarios', autenticar, exigirPermiso('usuarios'), async function (req, res, next) {
  try {
    res.json(await consultar(
      `SELECT id, nombre, direccion, correo, rol, activo, ultimo_acceso
         FROM usuarios WHERE eliminado_en IS NULL ORDER BY nombre`
    ));
  } catch (e) { next(e); }
});

router.post('/usuarios', autenticar, exigirPermiso('usuarios'), async function (req, res, next) {
  try {
    const { nombre, direccion, correo, contrasena, rol } = req.body;

    if (!nombre || !correo || !contrasena) {
      return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios.' });
    }
    if (ROLES.indexOf(rol) === -1) {
      return res.status(400).json({ error: 'El rol indicado no es válido.' });
    }
    const falloClave = validarPoliticaContrasena(contrasena);
    if (falloClave) return res.status(400).json({ error: falloClave });

    const creado = await consultarUna(
      `INSERT INTO usuarios (nombre, direccion, correo, hash_contrasena, rol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, direccion, correo, rol, activo`,
      [
        String(nombre).trim(),
        direccion ? String(direccion).trim() : null,
        String(correo).toLowerCase().trim(),
        await bcrypt.hash(contrasena, 12),
        rol,
      ]
    );

    await registrarBitacora({
      actorId: req.usuario.id, accion: 'CREAR_USUARIO', entidad: 'usuarios',
      entidadId: creado.id, valoresDespues: creado, ip: req.ip,
    });

    res.status(201).json(creado);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }
    next(e);
  }
});

// ================================================================== padrón ==

// RF-01.6 — Listado con búsqueda y filtros.
router.get('/conexiones', autenticar, exigirPermiso('padron'), async function (req, res, next) {
  try {
    const texto = req.query.q ? '%' + String(req.query.q).toLowerCase() + '%' : null;
    const sector = req.query.sector || null;

    const filas = await consultar(
      `SELECT c.id, c.codigo, c.sector, c.modalidad, c.estado, c.fecha_alta,
              b.nombres || ' ' || b.apellidos AS titular,
              b.dpi, b.telefono, b.direccion, b.fecha_ingreso,
              m.serie AS medidor_serie, m.marca AS medidor_marca, m.digitos,
              m.lectura_inicial, m.fecha_instalacion,
              COALESCE(
                (SELECT l.lectura_actual FROM lecturas l
                  WHERE l.conexion_id = c.id ORDER BY l.id DESC LIMIT 1),
                m.lectura_inicial, 0) AS ultima_lectura
         FROM conexiones c
         JOIN beneficiarios b ON b.id = c.beneficiario_id
         LEFT JOIN medidores m ON m.conexion_id = c.id AND m.estado = 'ACTIVO'
        WHERE c.eliminado_en IS NULL
          AND ($1::text IS NULL OR LOWER(c.codigo) LIKE $1
               OR LOWER(b.nombres || ' ' || b.apellidos) LIKE $1
               OR LOWER(COALESCE(b.dpi, '')) LIKE $1
               OR LOWER(COALESCE(b.telefono, '')) LIKE $1
               OR LOWER(COALESCE(c.sector, '')) LIKE $1
               OR LOWER(COALESCE(b.direccion, '')) LIKE $1)
          AND ($2::text IS NULL OR c.sector = $2)
        ORDER BY c.sector NULLS LAST, c.codigo`,
      [texto, sector]
    );

    res.json(filas);
  } catch (e) { next(e); }
});

async function siguienteCodigoSf(cliente) {
  const r = await cliente.query(
    `SELECT COALESCE(MAX(
       CASE WHEN codigo ~ '^SF-[0-9]+$'
            THEN CAST(substring(codigo from 4) AS INTEGER)
       END
     ), 0) + 1 AS n
       FROM conexiones
      WHERE eliminado_en IS NULL`
  );
  const n = Number(r.rows[0].n) || 1;
  return 'SF-' + String(n).padStart(3, '0');
}

// RF-01.1 y RF-01.2 — Alta de usuario del servicio y su conexión.
router.post('/conexiones', autenticar, exigirPermiso('alta_conexion'), async function (req, res, next) {
  try {
    const b = req.body;
    const tipoTitular = String(b.tipoTitular || 'PARTICULAR').toUpperCase() === 'INSTITUCION'
      ? 'INSTITUCION'
      : 'PARTICULAR';

    if (!b.nombres || !b.apellidos) {
      return res.status(400).json({
        error: 'El nombre del titular es obligatorio.',
      });
    }
    if (!String(b.telefono || '').trim()) {
      return res.status(400).json({
        error: 'El teléfono de contacto es obligatorio.',
      });
    }
    const dpi = String(b.dpi || '').trim();
    if (tipoTitular === 'PARTICULAR' && !dpi) {
      return res.status(400).json({
        error: 'DPI y teléfono son obligatorios para un particular.',
      });
    }

    const conexion = await enTransaccion(async function (cliente) {
      const codigoConexion = String(b.codigoConexion || '').trim() || await siguienteCodigoSf(cliente);

      const beneficiario = await cliente.query(
        `INSERT INTO beneficiarios (codigo, nombres, apellidos, dpi, telefono, direccion, observacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          b.codigoBeneficiario || codigoConexion,
          String(b.nombres).trim(),
          String(b.apellidos).trim(),
          dpi || null,
          String(b.telefono).trim(),
          b.direccion ? String(b.direccion).trim() : null,
          tipoTitular === 'INSTITUCION'
            ? ('INSTITUCION' + (b.categoriaInstitucion ? ':' + String(b.categoriaInstitucion).trim() : ''))
            : null,
        ]
      );

      const creada = await cliente.query(
        `INSERT INTO conexiones (codigo, beneficiario_id, sector, modalidad)
         VALUES ($1, $2, $3, $4) RETURNING id, codigo`,
        [
          codigoConexion,
          beneficiario.rows[0].id,
          b.sector ? String(b.sector).trim() : null,
          b.modalidad || 'MEDIDA',
        ]
      );

      // RF-01.3 — medidor asociado, si la modalidad lo requiere.
      if ((b.modalidad || 'MEDIDA') === 'MEDIDA' && b.serieMedidor) {
        await cliente.query(
          `INSERT INTO medidores (conexion_id, serie, marca, digitos, lectura_inicial)
           VALUES ($1, $2, $3, $4, $5)`,
          [creada.rows[0].id, b.serieMedidor, b.marcaMedidor || null,
           b.digitos || 8, b.lecturaInicial || 0]
        );
      }

      await registrarBitacora({
        actorId: req.usuario.id, accion: 'CREAR_CONEXION', entidad: 'conexiones',
        entidadId: creada.rows[0].id, valoresDespues: creada.rows[0], ip: req.ip,
      }, cliente);

      return creada.rows[0];
    });

    res.status(201).json(conexion);
  } catch (e) {
    if (e.code === '23505') {
      const detalle = String(e.detail || e.message || '');
      if (detalle.includes('dpi')) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese DPI.' });
      }
      if (detalle.includes('beneficiarios_codigo') || detalle.includes('codigo')) {
        return res.status(409).json({ error: 'Ya existe una conexión o usuario con ese código.' });
      }
      return res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
    }
    next(e);
  }
});

// RF-01.4 — Edición de datos del titular. No altera lecturas, recibos ni pagos.
router.patch('/conexiones/:id', autenticar, exigirPermiso('alta_conexion'), async function (req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Identificador no válido.' });
    }

    const b = req.body;
    const nombres = String(b.nombres || '').trim();
    const apellidos = String(b.apellidos || '').trim();
    const dpi = String(b.dpi || '').trim();
    const telefono = String(b.telefono || '').trim();
    const direccion = b.direccion != null ? String(b.direccion).trim() : '';
    const sector = b.sector != null ? String(b.sector).trim() : '';

    if (!nombres || !apellidos || !dpi || !telefono) {
      return res.status(400).json({ error: 'Nombre, DPI y teléfono son obligatorios.' });
    }

    const antes = await consultarUna(
      `SELECT c.id, c.codigo, c.sector, c.beneficiario_id,
              b.nombres, b.apellidos, b.dpi, b.telefono, b.direccion
         FROM conexiones c
         JOIN beneficiarios b ON b.id = c.beneficiario_id
        WHERE c.id = $1 AND c.eliminado_en IS NULL`,
      [id]
    );
    if (!antes) return res.status(404).json({ error: 'La conexión no existe.' });

    await enTransaccion(async function (cliente) {
      await cliente.query(
        `UPDATE beneficiarios
            SET nombres = $1, apellidos = $2, dpi = $3, telefono = $4, direccion = $5
          WHERE id = $6`,
        [nombres, apellidos, dpi, telefono, direccion || null, antes.beneficiario_id]
      );
      await cliente.query(
        'UPDATE conexiones SET sector = $1 WHERE id = $2',
        [sector || null, id]
      );
      await registrarBitacora({
        actorId: req.usuario.id, accion: 'EDITAR_CONEXION', entidad: 'conexiones',
        entidadId: id,
        valoresAntes: {
          nombres: antes.nombres, apellidos: antes.apellidos, dpi: antes.dpi,
          telefono: antes.telefono, direccion: antes.direccion, sector: antes.sector,
        },
        valoresDespues: { nombres: nombres, apellidos: apellidos, dpi: dpi, telefono: telefono, direccion: direccion, sector: sector },
        ip: req.ip,
      }, cliente);
    });

    res.json({
      mensaje: 'Datos actualizados. Lecturas, facturas y pagos históricos no se modificaron.',
      id: id,
      codigo: antes.codigo,
    });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese DPI.' });
    }
    next(e);
  }
});

// RF-01.5 — Baja lógica: nunca se borra el historial.
router.delete('/conexiones/:id', autenticar, exigirPermiso('alta_conexion'), async function (req, res, next) {
  try {
    const motivo = String(req.body.motivo || '').trim();
    if (motivo.length < 3) {
      return res.status(400).json({ error: 'Indique el motivo de la baja.' });
    }

    const antes = await consultarUna('SELECT * FROM conexiones WHERE id = $1', [req.params.id]);
    if (!antes) return res.status(404).json({ error: 'La conexión no existe.' });

    await consultar(
      `UPDATE conexiones SET estado = 'BAJA', motivo_baja = $1, eliminado_en = NOW()
        WHERE id = $2`,
      [motivo, req.params.id]
    );

    await registrarBitacora({
      actorId: req.usuario.id, accion: 'BAJA_CONEXION', entidad: 'conexiones',
      entidadId: req.params.id, valoresAntes: antes,
      valoresDespues: { estado: 'BAJA', motivo: motivo }, ip: req.ip,
    });

    res.json({ mensaje: 'Conexión dada de baja. Su historial se conserva.' });
  } catch (e) { next(e); }
});

module.exports = router;
