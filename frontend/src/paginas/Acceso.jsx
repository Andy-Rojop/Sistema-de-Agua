/**
 * Pantallas de acceso: panel de roles → iniciar sesión / crear cuenta / restablecer.
 */

import { useState } from 'react';
import { api, guardarSesion } from '../api';
import { ROLES, ROLES_INFO, etiquetaRol } from '../permisos';
import { Escudo } from '../componentes/Escudo';

function MarcaInicio({ chico }) {
  return (
    <div className={'inicio-marca' + (chico ? ' chica' : '')}>
      <Escudo tam={chico ? 56 : 72} compacto />
      <h1 className="inicio-marca-titulo">Agua potable Santa Fe</h1>
      <p className="inicio-marca-lugar">Retalhuleu</p>
    </div>
  );
}

function IconoChevron() {
  return (
    <svg className="inicio-rol-flecha" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoAdmin() {
  return (
    <svg className="rol-panel-icono" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" fill="#E7F1F6" />
      <path d="M60 22c0 0-22 24-22 38a22 22 0 0 0 44 0C82 46 60 22 60 22z" fill="#1B6B93" />
      <rect x="48" y="48" width="24" height="28" rx="4" fill="#FFFFFF" />
      <circle cx="60" cy="58" r="4" fill="#1B6B93" />
      <path d="M60 62v8" stroke="#1B6B93" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconoTesorero() {
  return (
    <svg className="rol-panel-icono" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" fill="#E7F1F6" />
      <path d="M60 22c0 0-22 24-22 38a22 22 0 0 0 44 0C82 46 60 22 60 22z" fill="#1B6B93" />
      <rect x="42" y="52" width="36" height="26" rx="4" fill="#FFFFFF" />
      <path d="M42 60h36" stroke="#1B6B93" strokeWidth="2" />
      <circle cx="60" cy="68" r="5" fill="#1B6B93" />
    </svg>
  );
}

function IconoFontanero() {
  return (
    <svg className="rol-panel-icono" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" fill="#E7F1F6" />
      <path d="M60 22c0 0-22 24-22 38a22 22 0 0 0 44 0C82 46 60 22 60 22z" fill="#1B6B93" />
      <path d="M48 50h10v8H48zM62 50h10v8H62z" fill="#FFFFFF" />
      <path d="M53 58h14v6a8 8 0 0 1-14 0v-6z" fill="#FFFFFF" />
      <path d="M60 72v10" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="86" r="4" fill="#1B6B93" />
    </svg>
  );
}

const ICONOS_ROL = {
  ADMINISTRADOR: IconoAdmin,
  TESORERO: IconoTesorero,
  FONTANERO: IconoFontanero,
};

function Campo({ id, etiqueta, tipo = 'text', valor, alCambiar, autoComplete, placeholder, required = true }) {
  return (
    <>
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        type={tipo}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
      />
    </>
  );
}

function IconoOjo({ abierto }) {
  if (abierto) {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="currentColor" d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5A2.5 2.5 0 1 0 12 9a2.5 2.5 0 0 0 0 5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="currentColor" d="M3.3 2.3 2 3.6l3.1 3.1C3.2 8 1.7 9.7 1 12c1.7 3.9 6 7 11 7 1.7 0 3.3-.3 4.8-.9l3.6 3.6 1.3-1.3L3.3 2.3zM12 17c-3.9 0-7.2-2.3-8.7-5 .7-1.3 1.8-2.5 3.1-3.3l1.7 1.7A4.9 4.9 0 0 0 7 12a5 5 0 0 0 5 5c.7 0 1.3-.1 1.9-.4l1.6 1.6c-1.1.5-2.3.8-3.5.8zm9.7-1.3-1.5-1.5c1-.9 1.8-2 2.2-3.2-1.7-3.9-6-7-11-7-1.1 0-2.1.1-3.1.4L6.6 2.7C8.2 2.2 10 2 12 2c5 0 9.3 3.1 11 7-.6 1.4-1.6 2.7-2.9 3.7l1.6 1.6zM9.1 8.4l1.6 1.6c.4-.2.8-.3 1.3-.3a2.5 2.5 0 0 1 2.5 2.5c0 .5-.1.9-.3 1.3l1.6 1.6c.7-.8 1.2-1.8 1.2-2.9A5 5 0 0 0 12 7c-1.1 0-2.1.4-2.9 1.1z" />
    </svg>
  );
}

function CampoContrasena({
  id, etiqueta, valor, alCambiar, autoComplete, placeholder, required = true,
}) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <label htmlFor={id}>{etiqueta}</label>
      <div className="campo-clave">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required={required}
          placeholder={placeholder}
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
        />
        <button
          type="button"
          className="campo-clave-ojo"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
        >
          <IconoOjo abierto={visible} />
        </button>
      </div>
    </>
  );
}

function Enlaces({ vista, ir }) {
  return (
    <div className="ingreso-enlaces">
      {vista !== 'login' && (
        <button type="button" className="ingreso-enlace" onClick={() => ir('login')}>
          Iniciar sesión
        </button>
      )}
      {vista !== 'registro' && (
        <button type="button" className="ingreso-enlace" onClick={() => ir('registro')}>
          Crear cuenta
        </button>
      )}
      {vista !== 'recuperar' && vista !== 'restablecer' && (
        <button type="button" className="ingreso-enlace" onClick={() => ir('recuperar')}>
          Restablecer contraseña
        </button>
      )}
      <button type="button" className="ingreso-enlace" onClick={() => ir('roles')}>
        Cambiar rol
      </button>
    </div>
  );
}

function PanelRoles({ alElegir, ir }) {
  return (
    <div className="inicio-fb">
      <div className="inicio-fb-centro">
        <MarcaInicio />
        <hr className="inicio-fb-linea" />
        <p className="inicio-fb-aviso">
          Elija su rol para continuar. El acceso queda en este dispositivo.
        </p>

        <div className="inicio-roles" role="list">
          {ROLES.map((clave) => {
            const info = ROLES_INFO[clave];
            const Icono = ICONOS_ROL[clave];
            return (
              <button
                key={clave}
                type="button"
                className="inicio-rol"
                role="listitem"
                onClick={() => alElegir(clave)}
              >
                <span className="inicio-rol-avatar">
                  <Icono />
                </span>
                <span className="inicio-rol-nombre">{info.nombre}</span>
                <IconoChevron />
              </button>
            );
          })}
        </div>

        <div className="inicio-fb-acciones">
          <button type="button" className="inicio-btn-secundario" onClick={() => ir('recuperar')}>
            Restablecer contraseña
          </button>
          <button type="button" className="inicio-btn-contorno" onClick={() => ir('registro')}>
            Crear cuenta
          </button>
        </div>
      </div>
    </div>
  );
}

function Login({ alEntrar, ir, rolSeleccionado }) {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const r = await api.login(correo, contrasena);
      if (rolSeleccionado && r.usuario.rol !== rolSeleccionado) {
        setError(
          'Contraseña correcta, pero esta cuenta es de '
          + etiquetaRol(r.usuario.rol)
          + '. Vuelva atrás y elija ese rol.'
        );
        return;
      }
      guardarSesion(r.token, r.usuario);
      alEntrar(r.usuario);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <form className="ingreso-tarjeta ingreso-login inicio-form" onSubmit={enviar}>
      <button type="button" className="ingreso-volver" onClick={() => ir('roles')}>
        ← Volver
      </button>

      <MarcaInicio chico />
      <h2>Iniciar sesión</h2>
      {rolSeleccionado ? (
        <span className="ingreso-rol-pill">{etiquetaRol(rolSeleccionado)}</span>
      ) : null}

      <div className="ingreso-campos">
        <Campo id="login-correo" etiqueta="Correo electrónico" tipo="email"
          autoComplete="username" placeholder="nombre@correo.com"
          valor={correo} alCambiar={setCorreo} />

        <CampoContrasena id="login-clave" etiqueta="Contraseña"
          autoComplete="current-password" placeholder="••••••••••"
          valor={contrasena} alCambiar={setContrasena} />
      </div>

      {error && <p className="ingreso-error">{error}</p>}

      <button className="btn btn-primario btn-ancho btn-grande" disabled={cargando}>
        {cargando ? 'Entrando…' : 'Entrar'}
      </button>

      <Enlaces vista="login" ir={ir} />
    </form>
  );
}

function Registro({ ir }) {
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [invitacion, setInvitacion] = useState('');
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    setExito(null);

    if (contrasena !== confirmacion) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    try {
      const r = await api.registrar({
        nombre, direccion, correo, contrasena,
        invitacion: invitacion.trim() || undefined,
      });
      setExito(r.mensaje || 'Cuenta creada. Ya puede iniciar sesión.');
      setNombre('');
      setDireccion('');
      setCorreo('');
      setContrasena('');
      setConfirmacion('');
      setInvitacion('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <form className="ingreso-tarjeta" onSubmit={enviar}>
      <button type="button" className="ingreso-volver" onClick={() => ir('roles')}>
        ← Volver a roles
      </button>
      <h2>Crear cuenta</h2>
      <p className="ingreso-lead">
        Registre sus datos. El rol (Administrador, Tesorero o Fontanero) lo define
        el código de invitación que le entregue el administrador.
      </p>

      <Campo id="reg-nombre" etiqueta="Nombre completo"
        autoComplete="name" placeholder="Nombre y apellidos"
        valor={nombre} alCambiar={setNombre} />

      <Campo id="reg-direccion" etiqueta="Dirección"
        autoComplete="street-address" placeholder="Sector, lote o referencia"
        valor={direccion} alCambiar={setDireccion} />

      <Campo id="reg-correo" etiqueta="Correo electrónico" tipo="email"
        autoComplete="email" placeholder="nombre@correo.com"
        valor={correo} alCambiar={setCorreo} />

      <Campo id="reg-invitacion" etiqueta="Código de invitación"
        autoComplete="one-time-code" placeholder="Lo entrega el administrador"
        valor={invitacion} alCambiar={setInvitacion} required={false} />

      <CampoContrasena id="reg-clave" etiqueta="Contraseña"
        autoComplete="new-password" placeholder="Mínimo 10 caracteres, letras y números"
        valor={contrasena} alCambiar={setContrasena} />

      <CampoContrasena id="reg-confirm" etiqueta="Confirmar contraseña"
        autoComplete="new-password" placeholder="Repita la contraseña"
        valor={confirmacion} alCambiar={setConfirmacion} />

      {error && <p className="ingreso-error">{error}</p>}
      {exito && <p className="ingreso-exito">{exito}</p>}

      <button className="btn btn-primario btn-ancho btn-grande" disabled={cargando}>
        {cargando ? 'Creando…' : 'Crear cuenta'}
      </button>

      <Enlaces vista="registro" ir={ir} />
    </form>
  );
}

function Recuperar({ ir, alCodigo }) {
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const r = await api.recuperar(correo);
      alCodigo(r.codigo || '');
      ir('restablecer');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <form className="ingreso-tarjeta" onSubmit={enviar}>
      <button type="button" className="ingreso-volver" onClick={() => ir('roles')}>
        ← Volver a roles
      </button>
      <h2>Restablecer contraseña</h2>
      <p className="ingreso-lead">
        Indique el correo de su cuenta. Se generará un código válido por una hora.
      </p>

      <Campo id="rec-correo" etiqueta="Correo electrónico" tipo="email"
        autoComplete="email" placeholder="nombre@correo.com"
        valor={correo} alCambiar={setCorreo} />

      {error && <p className="ingreso-error">{error}</p>}

      <button className="btn btn-primario btn-ancho btn-grande" disabled={cargando}>
        {cargando ? 'Generando…' : 'Continuar'}
      </button>

      <Enlaces vista="recuperar" ir={ir} />
    </form>
  );
}

function Restablecer({ ir, codigoInicial }) {
  const [codigo, setCodigo] = useState(codigoInicial || '');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    setExito(null);

    if (nueva !== confirmacion) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    try {
      const r = await api.restablecer(codigo, nueva);
      setExito(r.mensaje || 'Contraseña restablecida.');
      setNueva('');
      setConfirmacion('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <form className="ingreso-tarjeta" onSubmit={enviar}>
      <button type="button" className="ingreso-volver" onClick={() => ir('roles')}>
        ← Volver a roles
      </button>
      <h2>Nueva contraseña</h2>
      <p className="ingreso-lead">
        {codigoInicial
          ? 'Se generó un código. Defina su nueva contraseña.'
          : 'Ingrese el código recibido y su nueva contraseña.'}
      </p>

      <Campo id="rst-codigo" etiqueta="Código de restablecimiento"
        autoComplete="one-time-code" placeholder="Código"
        valor={codigo} alCambiar={setCodigo} />

      <CampoContrasena id="rst-nueva" etiqueta="Nueva contraseña"
        autoComplete="new-password" placeholder="Mínimo 10 caracteres, letras y números"
        valor={nueva} alCambiar={setNueva} />

      <CampoContrasena id="rst-confirm" etiqueta="Confirmar contraseña"
        autoComplete="new-password" placeholder="Repita la contraseña"
        valor={confirmacion} alCambiar={setConfirmacion} />

      {error && <p className="ingreso-error">{error}</p>}
      {exito && <p className="ingreso-exito">{exito}</p>}

      <button className="btn btn-primario btn-ancho btn-grande" disabled={cargando}>
        {cargando ? 'Guardando…' : 'Guardar contraseña'}
      </button>

      <Enlaces vista="restablecer" ir={ir} />
    </form>
  );
}

export default function Acceso({ alEntrar }) {
  const [vista, setVista] = useState('roles');
  const [rolSeleccionado, setRolSeleccionado] = useState(null);
  const [codigo, setCodigo] = useState('');

  function ir(destino) {
    setVista(destino);
    if (destino === 'roles') setRolSeleccionado(null);
    if (destino !== 'restablecer') setCodigo('');
  }

  function alElegirRol(rol) {
    setRolSeleccionado(rol);
    setVista('login');
  }

  if (vista === 'roles') {
    return <PanelRoles alElegir={alElegirRol} ir={ir} />;
  }

  let formulario;
  if (vista === 'registro') formulario = <Registro ir={ir} />;
  else if (vista === 'recuperar') formulario = <Recuperar ir={ir} alCodigo={setCodigo} />;
  else if (vista === 'restablecer') formulario = <Restablecer ir={ir} codigoInicial={codigo} />;
  else formulario = <Login alEntrar={alEntrar} ir={ir} rolSeleccionado={rolSeleccionado} />;

  return (
    <div className="inicio-fb ingreso">
      <div className="ingreso-marco">
        {formulario}
      </div>
    </div>
  );
}
