/**
 * COMPONENTES REUTILIZABLES
 * Piezas de interfaz que aparecen en varias pantallas del sistema.
 */

import { useEffect, useState } from 'react';
import { textoMetros, metrosCubicos } from '../api';

/** Lectura como en el contador: metros cúbicos, un decimal. Sin ruedas ni colores. */
export function Medidor({ valor, etiqueta, chico }) {
  return (
    <div className={'cifra-lectura' + (chico ? ' chica' : '')}>
      {etiqueta && <span className="cifra-lectura-etq">{etiqueta}</span>}
      <p className="cifra-lectura-valor">
        <span>{textoMetros(valor)}</span>
        <abbr title="metros cúbicos">m³</abbr>
      </p>
    </div>
  );
}

export function Aviso({ tipo = 'info', children }) {
  return <div className={'aviso a-' + tipo}>{children}</div>;
}

export function Indicador({ etiqueta, valor, pie, alerta, onClick, accion }) {
  const clase = 'indicador'
    + (alerta ? ' alerta' : '')
    + (onClick ? ' indicador-accion' : '');
  const interior = (
    <>
      <div className="etq">{etiqueta}</div>
      <div className="val num">{valor}</div>
      {pie && <div className="pie">{pie}</div>}
      {onClick && accion ? <div className="indicador-cta">{accion}</div> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={clase} onClick={onClick}>
        {interior}
      </button>
    );
  }
  return <div className={clase}>{interior}</div>;
}

export function EstadoRecibo({ estado }) {
  const mapa = {
    PAGADO: ['e-ok', 'Pagado'],
    PARCIAL: ['e-aviso', 'Parcial'],
    VENCIDO: ['e-mal', 'Vencido'],
    PENDIENTE: ['e-pend', 'Pendiente'],
  };
  const [clase, texto] = mapa[estado] || ['e-pend', estado];
  return <span className={'etiqueta-est ' + clase}>{texto}</span>;
}

export function Vacio({ titulo, children }) {
  return (
    <div className="panel">
      <div className="vacio">
        <div className="vacio-titulo">{titulo}</div>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }) {
  return <div className="vacio"><p>{texto}</p></div>;
}

/** Notificación breve al pie de la pantalla. */
export function Brindis({ mensaje, error, alCerrar }) {
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(alCerrar, 3200);
    return () => clearTimeout(t);
  }, [mensaje, alCerrar]);

  if (!mensaje) return null;
  return <div className={'brindis' + (error ? ' error' : '')}>{mensaje}</div>;
}

/** Gráfica sencilla de barras para el historial de consumo (RF-05.8). */
export function BarrasConsumo({ datos, litrosIncluidos = 25000 }) {
  if (!datos?.length) return null;
  const maximo = Math.max(...datos.map((d) => d.consumo_litros), 1);
  return (
    <>
      <div className="barras">
        {datos.map((d, i) => (
          <div className="barra-col" key={i}>
            <span className="barra-etq">{textoMetros(d.consumo_litros)}</span>
            <div
              className={'barra' + (d.consumo_litros > litrosIncluidos ? ' alta' : '')}
              style={{ height: Math.max(3, Math.round((d.consumo_litros / maximo) * 88)) }}
            />
            <span className="barra-etq">{String(d.mes).padStart(2, '0')}</span>
          </div>
        ))}
      </div>
      <p className="mini">
        Consumo en m³. Las barras en ámbar superaron los{' '}
        {metrosCubicos(litrosIncluidos)} de la tarifa básica.
      </p>
    </>
  );
}

/** Envuelve una carga de datos con manejo de error y estado de carga. */
export function useCarga(fn, dependencias = []) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    fn()
      .then((d) => { if (vigente) { setDatos(d); setError(null); } })
      .catch((e) => { if (vigente) setError(e.message); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, version]);

  return { datos, error, cargando, recargar: () => setVersion((v) => v + 1) };
}
