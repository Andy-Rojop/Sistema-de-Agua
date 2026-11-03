/**
 * Tras ~18 minutos sin actividad pregunta si desea continuar.
 * Si no responde en 40 segundos, cierra la sesión.
 */

import { useEffect, useRef, useState } from 'react';

const MINUTOS_INACTIVIDAD = 18;
const SEGUNDOS_AVISO = 40;

export function AvisoSesion({ alCerrarSesion }) {
  const [aviso, setAviso] = useState(false);
  const [segundos, setSegundos] = useState(SEGUNDOS_AVISO);
  const timerInactividad = useRef(null);
  const timerCuenta = useRef(null);
  const avisoRef = useRef(false);

  function programarInactividad() {
    clearTimeout(timerInactividad.current);
    if (avisoRef.current) return;
    timerInactividad.current = setTimeout(function () {
      avisoRef.current = true;
      setAviso(true);
      setSegundos(SEGUNDOS_AVISO);
    }, MINUTOS_INACTIVIDAD * 60 * 1000);
  }

  useEffect(function () {
    const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    function alActividad() {
      if (avisoRef.current) return;
      programarInactividad();
    }
    eventos.forEach(function (ev) {
      window.addEventListener(ev, alActividad, { passive: true });
    });
    programarInactividad();
    return function () {
      eventos.forEach(function (ev) {
        window.removeEventListener(ev, alActividad);
      });
      clearTimeout(timerInactividad.current);
      clearInterval(timerCuenta.current);
    };
  }, []);

  useEffect(function () {
    if (!aviso) return undefined;
    clearInterval(timerCuenta.current);
    timerCuenta.current = setInterval(function () {
      setSegundos(function (s) {
        return s <= 1 ? 0 : s - 1;
      });
    }, 1000);
    return function () {
      clearInterval(timerCuenta.current);
    };
  }, [aviso]);

  useEffect(function () {
    if (aviso && segundos === 0) {
      clearInterval(timerCuenta.current);
      alCerrarSesion();
    }
  }, [aviso, segundos, alCerrarSesion]);

  function continuar() {
    avisoRef.current = false;
    setAviso(false);
    setSegundos(SEGUNDOS_AVISO);
    programarInactividad();
  }

  if (!aviso) return null;

  return (
    <div className="sesion-velo" role="dialog" aria-modal="true" aria-labelledby="sesion-aviso-titulo">
      <div className="sesion-aviso">
        <p className="sesion-aviso-eyebrow">Sesión inactiva</p>
        <h2 id="sesion-aviso-titulo">¿Desea continuar con la sesión?</h2>
        <p className="sesion-aviso-texto">
          Por seguridad, si no responde se cerrará el acceso automáticamente.
        </p>
        <p className="sesion-aviso-cuenta" aria-live="polite">
          <span className="sesion-aviso-numero">{segundos}</span>
          <span> segundos</span>
        </p>
        <div className="sesion-aviso-acciones">
          <button type="button" className="btn btn-primario btn-grande" onClick={continuar}>
            Continuar
          </button>
          <button type="button" className="btn btn-borde" onClick={alCerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
