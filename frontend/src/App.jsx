/**
 * COMPONENTE RAÍZ
 * ---------------------------------------------------------------------------
 * Arma el menú según el rol y decide qué pantalla mostrar.
 *
 * IMPORTANTE (RNF-SEG-03)
 * Ocultar una opción del menú NO es un control de seguridad. La verificación
 * real ocurre en el servidor, en cada solicitud. Esto solo evita mostrarle al
 * usuario botones que de todas formas le serían rechazados.
 */

import { useState } from 'react';
import { usuarioActual, cerrarSesion } from './api';
import { vistasPara } from './permisos';
import { Brindis } from './componentes/Comunes';
import Acceso from './paginas/Acceso';
import Lecturas from './paginas/Lecturas';
import Cobro from './paginas/Cobro';
import Cierre from './paginas/Cierre';
import { Tablero, Padron, Reportes, Bitacora, Cuentas } from './paginas/Modulos';
import { Escudo } from './componentes/Escudo';
import './estilos.css';

export default function App() {
  const [usuario, setUsuario] = useState(usuarioActual());
  const [vista, setVista] = useState(null);
  const [brindis, setBrindis] = useState({ mensaje: null, error: false });

  const avisar = (mensaje, error = false) => setBrindis({ mensaje, error });

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
  // Guardia de vista (estilo GraduaT): si el rol no puede ver la pantalla actual, se corrige.
  const permitida = disponibles.some((v) => v.id === vista);
  const actual = (vista && permitida) ? vista : disponibles[0]?.id;

  function salir() {
    cerrarSesion();
    setUsuario(null);
    setVista(null);
  }

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
        opciones={disponibles.filter((v) => v.id !== 'tablero')}
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
          <Escudo tam={56} compacto />
          <div className="encabezado-titular">
            <p className="encabezado-titular-nombre">Comité de Agua</p>
            <p className="encabezado-titular-lema">
              Parcelamiento Santa Fe, Retalhuleu
            </p>
          </div>
        </div>
      </header>

      <nav className="menu-app" aria-label="Secciones">
        {disponibles.map((v) => (
          <button
            key={v.id}
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
        <div className="contenedor">{contenido}</div>
      </main>

      <Brindis
        mensaje={brindis.mensaje}
        error={brindis.error}
        alCerrar={() => setBrindis({ mensaje: null, error: false })}
      />
    </div>
  );
}
