/**
 * COMPONENTE RAÍZ
 * ---------------------------------------------------------------------------
 * Arma el menú según el rol y decide qué pantalla mostrar.
 *
 * IMPORTANTE (RNF-SEG-03)
 * Ocultar una opción del menú NO es un control de seguridad. La verificación
 * real ocurre en el servidor, en cada solicitud.
 */

import { useCallback, useState } from 'react';
import { usuarioActual, cerrarSesion } from './api';
import { vistasPara } from './permisos';
import { Brindis } from './componentes/Comunes';
import { AvisoSesion } from './componentes/AvisoSesion';
import Acceso from './paginas/Acceso';
import Lecturas from './paginas/Lecturas';
import Cobro from './paginas/Cobro';
import Cierre from './paginas/Cierre';
import { Tablero, Padron, Reportes, Bitacora, Cuentas } from './paginas/Modulos';
import { Escudo } from './componentes/Escudo';
import './estilos.css';

function IconoNav({ id }) {
  const p = { viewBox: '0 0 24 24', width: '22', height: '22', 'aria-hidden': true };
  if (id === 'tablero') {
    return (
      <svg {...p}>
        <rect x="3" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="3" width="8" height="5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="10" width="8" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (id === 'cobro') {
    return (
      <svg {...p}>
        <rect x="3" y="6" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16" cy="14" r="1.4" fill="currentColor" />
      </svg>
    );
  }
  if (id === 'lecturas') {
    return (
      <svg {...p}>
        <rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'padron') {
    return (
      <svg {...p}>
        <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 19c.6-3 2.6-5 5-5s4.4 2 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16 8h5M18.5 5.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'reportes') {
    return (
      <svg {...p}>
        <path d="M5 19V9M10 19V5M15 19v-7M20 19V8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'cierre') {
    return (
      <svg {...p}>
        <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 12l2.5 2.5L16 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === 'cuentas') {
    return (
      <svg {...p}>
        <circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 19c1-3.5 3.5-5.5 7-5.5s6 2 7 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'bitacora') {
    return (
      <svg {...p}>
        <path d="M5 6h14M5 12h14M5 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'salir') {
    return (
      <svg {...p}>
        <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M3 12h11M10 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return null;
}

export default function App() {
  const [usuario, setUsuario] = useState(usuarioActual());
  const [vista, setVista] = useState(null);
  const [brindis, setBrindis] = useState({ mensaje: null, error: false });

  const avisar = (mensaje, error = false) => setBrindis({ mensaje, error });

  const salir = useCallback(function () {
    cerrarSesion();
    setUsuario(null);
    setVista(null);
  }, []);

  if (!usuario) {
    return (
      <Acceso
        alEntrar={(u) => {
          setUsuario(u);
          const primeras = vistasPara(u.rol);
          setVista(primeras[0]?.id || null);
        }}
      />
    );
  }

  const disponibles = vistasPara(usuario.rol);
  const permitida = disponibles.some((v) => v.id === vista);
  const actual = (vista && permitida) ? vista : disponibles[0]?.id;

  function ir(id) {
    if (!disponibles.some((v) => v.id === id)) return;
    setVista(id);
    window.scrollTo(0, 0);
  }

  let contenido;
  if (actual === 'tablero') {
    contenido = (
      <Tablero
        usuario={usuario}
        alIr={ir}
        avisar={avisar}
      />
    );
  } else if (actual === 'cobro') {
    contenido = <Cobro usuario={usuario} avisar={avisar} />;
  } else if (actual === 'lecturas') {
    contenido = <Lecturas usuario={usuario} avisar={avisar} />;
  } else if (actual === 'padron') {
    contenido = <Padron usuario={usuario} avisar={avisar} />;
  } else if (actual === 'cierre') {
    contenido = <Cierre avisar={avisar} />;
  } else if (actual === 'reportes') {
    contenido = <Reportes />;
  } else if (actual === 'cuentas') {
    contenido = <Cuentas avisar={avisar} />;
  } else if (actual === 'bitacora') {
    contenido = <Bitacora />;
  }

  return (
    <div className="app">
      <header className="encabezado-app">
        <div className="encabezado-app-inner">
          <Escudo tam={48} compacto />
          <div className="encabezado-titular">
            <p className="encabezado-titular-nombre encabezado-titular-corto">Santa Fé</p>
            <p className="encabezado-titular-nombre encabezado-titular-largo">
              Comité de Agua Potable, Parcelamiento Santa Fé
            </p>
            <p className="encabezado-titular-lema">Retalhuleu</p>
          </div>
          <div className="encabezado-app-sesion">
            <span className="encabezado-app-nombre">{usuario.nombre?.split(/\s+/)[0] || 'Sesión'}</span>
            <span className="encabezado-app-rol">{usuario.rol}</span>
          </div>
        </div>
      </header>

      <nav className="menu-app menu-app-escritorio" aria-label="Secciones">
        {disponibles.map((v) => (
          <button
            key={v.id}
            type="button"
            className="menu-pildora"
            aria-current={actual === v.id ? 'page' : undefined}
            onClick={() => ir(v.id)}
          >
            {v.nombre}
          </button>
        ))}
        <button type="button" className="menu-pildora menu-salir" onClick={salir}>
          Salir
        </button>
      </nav>

      <main>
        <div className="contenedor anim-entrar">{contenido}</div>
      </main>

      <nav className="dock-movil" aria-label="Navegación principal">
        <div className="dock-movil-pista">
          {disponibles.map((v) => (
            <button
              key={v.id}
              type="button"
              className={'dock-item' + (actual === v.id ? ' activo' : '')}
              aria-current={actual === v.id ? 'page' : undefined}
              onClick={() => ir(v.id)}
            >
              <span className="dock-icono"><IconoNav id={v.id} /></span>
              <span className="dock-etiqueta">{v.nombre}</span>
            </button>
          ))}
          <button type="button" className="dock-item dock-salir" onClick={salir}>
            <span className="dock-icono"><IconoNav id="salir" /></span>
            <span className="dock-etiqueta">Salir</span>
          </button>
        </div>
      </nav>

      <AvisoSesion alCerrarSesion={salir} />

      <Brindis
        mensaje={brindis.mensaje}
        error={brindis.error}
        alCerrar={() => setBrindis({ mensaje: null, error: false })}
      />
    </div>
  );
}
