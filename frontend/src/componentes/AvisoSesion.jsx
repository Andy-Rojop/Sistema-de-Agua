/**
 * Tras ~18 minutos sin actividad pregunta si desea seguir con la sesión.
 * También al volver al enlace: si pasaron esos minutos fuera, muestra el aviso.
 * Si no responde en 40 segundos, cierra la sesión.
 */

import { useEffect, useRef, useState } from 'react';

const MINUTOS_INACTIVIDAD = 18;
const SEGUNDOS_AVISO = 40;
const CLAVE_ACTIVIDAD = 'ultimaActividadSesion';

function ahora() {
  return Date.now();
}

function marcarActividad() {
  localStorage.setItem(CLAVE_ACTIVIDAD, String(ahora()));
}

function minutosInactivo() {
  const raw = localStorage.getItem(CLAVE_ACTIVIDAD);
  if (!raw) return 0;
  const t = Number(raw);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return (ahora() - t) / 60000;
}

export function AvisoSesion({ alCerrarSesion }) {
  const [aviso, setAviso] = useState(false);
  const [segundos, setSegundos] = useState(SEGUNDOS_AVISO);
  const timerInactividad = useRef(null);
  const timerCuenta = useRef(null);
  const avisoRef = useRef(false);

  function abrirAviso() {
    if (avisoRef.current) return;
    avisoRef.current = true;
    setAviso(true);
    setSegundos(SEGUNDOS_AVISO);
  }

  function programarInactividad() {
    clearTimeout(timerInactividad.current);
    if (avisoRef.current) return;
    timerInactividad.current = setTimeout(abrirAviso, MINUTOS_INACTIVIDAD * 60 * 1000);
  }

  function registrarActividad() {
    if (avisoRef.current) return;
    marcarActividad();
    programarInactividad();
  }

  function evaluarAlVolver() {
    if (avisoRef.current) return;
    if (minutosInactivo() >= MINUTOS_INACTIVIDAD) {
      clearTimeout(timerInactividad.current);
      abrirAviso();
    } else {
      programarInactividad();
    }
  }

  useEffect(function () {
    if (!localStorage.getItem(CLAVE_ACTIVIDAD)) {
      marcarActividad();
    }
    evaluarAlVolver();

    const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    function alActividad() {
      registrarActividad();
    }
    eventos.forEach(function (ev) {
      window.addEventListener(ev, alActividad, { passive: true });
    });

    function alVisibilidad() {
      if (document.visibilityState === 'visible') {
        evaluarAlVolver();
      }
    }
    document.addEventListener('visibilitychange', alVisibilidad);
    window.addEventListener('focus', evaluarAlVolver);

    return function () {
      eventos.forEach(function (ev) {
        window.removeEventListener(ev, alActividad);
      });
      document.removeEventListener('visibilitychange', alVisibilidad);
      window.removeEventListener('focus', evaluarAlVolver);
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
      localStorage.removeItem(CLAVE_ACTIVIDAD);
      alCerrarSesion();
    }
  }, [aviso, segundos, alCerrarSesion]);

  function continuar() {
    avisoRef.current = false;
    setAviso(false);
    setSegundos(SEGUNDOS_AVISO);
    marcarActividad();
    programarInactividad();
  }

  function cerrar() {
    localStorage.removeItem(CLAVE_ACTIVIDAD);
    alCerrarSesion();
  }

  if (!aviso) return null;

  return (
    <div className="sesion-velo" role="dialog" aria-modal="true" aria-labelledby="sesion-aviso-titulo">
      <div className="sesion-aviso">
        <p className="sesion-aviso-eyebrow">Sesión inactiva</p>
        <h2 id="sesion-aviso-titulo">¿Desea seguir con el inicio de sesión?</h2>
        <p className="sesion-aviso-texto">
          Han pasado unos minutos sin actividad. Si no responde, se cerrará el acceso
          por seguridad.
        </p>
        <p className="sesion-aviso-cuenta" aria-live="polite">
          <span className="sesion-aviso-numero">{segundos}</span>
          <span> segundos</span>
        </p>
        <div className="sesion-aviso-acciones">
          <button type="button" className="btn btn-primario btn-grande" onClick={continuar}>
            Sí, continuar
          </button>
          <button type="button" className="btn btn-borde" onClick={cerrar}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
