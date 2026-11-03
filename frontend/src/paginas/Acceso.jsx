/**
 * Pantallas de acceso: panel de roles → iniciar sesión / crear cuenta / restablecer.
 */

import { useState } from 'react';
import { api, guardarSesion } from '../api';
import { ROLES, ROLES_INFO, etiquetaRol } from '../permisos';
import { Escudo } from '../componentes/Escudo';

function EncabezadoSitio({ extra }) {
  return (
    <header className="encabezado-sitio">
      <div className="encabezado-sitio-inner">
        <div className="encabezado-sitio-marca">
          <Escudo tam={72} compacto />
          <div className="encabezado-titular">
            <p className="encabezado-titular-nombre">Comité de Agua</p>
            <p className="encabezado-titular-lema">
              Sistema de gestión del servicio · Parcelamiento Santa Fe, Retalhuleu
            </p>
          </div>
        </div>
        {extra ? <div className="encabezado-sitio-acciones">{extra}</div> : null}
      </div>
    </header>
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
    <div className="panel-roles">
      <EncabezadoSitio
        extra={
          <button type="button" className="encabezado-sitio-btn" onClick={() => ir('registro')}>
            Crear cuenta
          </button>
        }
      />

      <main className="panel-roles-cuerpo">
        <h1 className="panel-roles-titulo">Seleccione su rol</h1>
        <p className="panel-roles-lead">
          Elija cómo ingresará. Después usará su correo y contraseña.
        </p>

        <div className="panel-roles-rejilla">
          {ROLES.map((clave) => {
            const info = ROLES_INFO[clave];
            const Icono = ICONOS_ROL[clave];
            return (
              <article key={clave} className="panel-rol-card">
                <Icono />
                <h2>{info.nombre.toUpperCase()}</h2>
                <p>{info.descripcion}</p>
                <button
                  type="button"
                  className="btn-entrar-rol"
                  onClick={() => alElegir(clave)}
                >
                  Entrar
                </button>
              </article>
            );
          })}
        </div>
      </main>
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
    <form className="ingreso-tarjeta" onSubmit={enviar}>
      <button type="button" className="ingreso-volver" onClick={() => ir('roles')}>
        ← Volver a roles
      </button>
      <h2>Iniciar sesión</h2>
      <p className="ingreso-lead">
        {rolSeleccionado
          ? 'Acceso como ' + etiquetaRol(rolSeleccionado) + '. Use su correo y contraseña.'
          : 'Acceda con su correo institucional.'}
      </p>

      <Campo id="login-correo" etiqueta="Correo electrónico" tipo="email"
        autoComplete="username" placeholder="nombre@correo.com"
        valor={correo} alCambiar={setCorreo} />

      <Campo id="login-clave" etiqueta="Contraseña" tipo="password"
        autoComplete="current-password" placeholder="••••••••••"
        valor={contrasena} alCambiar={setContrasena} />

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

      <Campo id="reg-clave" etiqueta="Contraseña" tipo="password"
        autoComplete="new-password" placeholder="Mínimo 10 caracteres, letras y números"
        valor={contrasena} alCambiar={setContrasena} />

      <Campo id="reg-confirm" etiqueta="Confirmar contraseña" tipo="password"
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

      <Campo id="rst-nueva" etiqueta="Nueva contraseña" tipo="password"
        autoComplete="new-password" placeholder="Mínimo 10 caracteres, letras y números"
        valor={nueva} alCambiar={setNueva} />

      <Campo id="rst-confirm" etiqueta="Confirmar contraseña" tipo="password"
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
    <div className="ingreso">
      <EncabezadoSitio
        extra={
          <button type="button" className="encabezado-sitio-btn claro" onClick={() => ir('roles')}>
            Cambiar rol
          </button>
        }
      />
      <div className="ingreso-marco">
        {formulario}
      </div>
    </div>
  );
}
