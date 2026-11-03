/**
 * PANTALLA DE CAPTURA DE LECTURAS (RF-02)
 * ---------------------------------------------------------------------------
 * Se usa caminando, bajo el sol, con una sola mano. Por eso:
 *
 *   - Listado con búsqueda y filtros (pendientes / visitadas).
 *   - Chequecito en los ya visitados.
 *   - Una conexión por captura, con teclado numérico grande.
 *   - Vista previa del consumo mientras se digita (el monto real lo cierra
 *     el servidor).
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { api, aLitrosDesdeMetros, metrosCubicos, quetzales, sanitizarMetros } from '../api';
import { puede } from '../permisos';
import { Medidor, Vacio, Cargando, Aviso, useCarga } from '../componentes/Comunes';
import { AbrirPeriodo } from '../componentes/AbrirPeriodo';

const VISTA_PREVIA = {
  basica: 2500, incluidos: 25000, bloque: 1000, precio: 100,
};

function montoAproximado(consumo) {
  const exceso = Math.max(0, consumo - VISTA_PREVIA.incluidos);
  const bloques = exceso > 0 ? Math.ceil(exceso / VISTA_PREVIA.bloque) : 0;
  return VISTA_PREVIA.basica + bloques * VISTA_PREVIA.precio;
}

function coincide(conexion, texto) {
  const q = texto.trim().toLowerCase();
  if (!q) return true;
  return [conexion.codigo, conexion.titular, conexion.sector, conexion.medidor_serie]
    .some((c) => String(c || '').toLowerCase().includes(q));
}

function periodoEtiqueta(periodo) {
  if (!periodo) return 'Periodo actual';
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return (meses[periodo.mes - 1] || periodo.mes) + ' ' + periodo.anio;
}

export default function Lecturas({ usuario, avisar }) {
  const { datos, cargando, error, recargar } = useCarga(() => api.pendientesDeLectura());
  const [seleccionId, setSeleccionId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [valor, setValor] = useState('');
  const [observacion, setObservacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const inputLecturaRef = useRef(null);
  const puedeAbrir = Boolean(usuario && puede(usuario.rol, 'abrir_periodo'));

  const conexiones = datos?.conexiones ?? datos?.pendientes ?? [];
  const visitadas = datos?.visitadas ?? conexiones.filter((c) => c.leida).length;
  const total = datos?.total ?? conexiones.length;
  const sinVisitar = datos?.pendientes_total ?? (total - visitadas);
  const pct = total ? Math.round((visitadas / total) * 100) : 0;

  const filtrados = useMemo(() => {
    return conexiones.filter((c) => {
      if (filtro === 'pendientes' && c.leida) return false;
      if (filtro === 'visitadas' && !c.leida) return false;
      return coincide(c, busqueda);
    });
  }, [conexiones, busqueda, filtro]);

  const conexion = useMemo(() => {
    if (seleccionId == null) return null;
    return conexiones.find((c) => c.id === seleccionId && !c.leida) ?? null;
  }, [conexiones, seleccionId]);

  useEffect(() => {
    if (conexion && inputLecturaRef.current) {
      inputLecturaRef.current.focus();
    }
  }, [conexion]);

  const vistaPrevia = useMemo(() => {
    if (!conexion || !valor) return null;
    const actual = aLitrosDesdeMetros(valor);
    if (actual == null) return null;
    const anterior = Number(conexion.lectura_anterior);
    if (actual < anterior) {
      return {
        consumo: 0, error: true,
        mensaje: 'La lectura es menor que la anterior. Verifique el dato antes de guardar.',
      };
    }
    return { consumo: actual - anterior, error: false, mensaje: null };
  }, [valor, conexion]);

  if (cargando) return <Cargando texto="Cargando conexiones…" />;
  if (error) return <Vacio titulo="No se pudo cargar">{error}</Vacio>;

  if (!datos?.periodo) {
    const siguiente = datos?.siguiente;
    return (
      <div className="lectura-escena">
        <p className="eyebrow">Toma de lecturas</p>
        <h2 className="titulo">Periodo cerrado</h2>
        <p className="subtitulo">Todavía no se pueden registrar lecturas del mes.</p>
        <Aviso tipo="ambar">
          {puedeAbrir
            ? 'No hay un periodo abierto. Ábralo usted para que el fontanero tome lecturas.'
            : 'El tesorero o el administrador debe abrir el siguiente periodo. El fontanero no puede abrir el mes. Mientras tanto puede consultar los padrones en Padrón.'}
        </Aviso>
        {puedeAbrir && siguiente && (
          <AbrirPeriodo siguiente={siguiente} avisar={avisar} alAbrir={recargar} />
        )}
      </div>
    );
  }

  if (!conexiones.length) {
    return (
      <Vacio titulo="No hay conexiones con medidor">
        Cuando el padrón tenga usuarios con medidor activo, aparecerán aquí
        para registrar la lectura del periodo.
      </Vacio>
    );
  }

  function limpiarFormulario() {
    setValor('');
    setObservacion('');
  }

  function volverAlListado() {
    limpiarFormulario();
    setSeleccionId(null);
  }

  function elegir(c) {
    if (c.leida) {
      avisar('Ya visitada · lectura ' + metrosCubicos(c.lectura_periodo));
      return;
    }
    limpiarFormulario();
    setSeleccionId(c.id);
  }

  async function guardar() {
    const litros = aLitrosDesdeMetros(valor);
    if (litros == null || !conexion || guardando) return;
    setGuardando(true);
    try {
      const r = await api.registrarLectura(conexion.id, litros, observacion || null);
      avisar(
        r.requiereRevision
          ? 'Lectura guardada y marcada para revisión.'
          : 'Lectura de ' + conexion.codigo + ' guardada.'
      );
      volverAlListado();
      recargar();
    } catch (e) {
      avisar(e.message, true);
    } finally {
      setGuardando(false);
    }
  }

  if (conexion) {
    return (
      <div className="lectura-escena">
        <button type="button" className="lectura-volver" onClick={volverAlListado}>
          <span aria-hidden="true">←</span> Listado
        </button>

        <header className="lectura-ficha">
          <div className="lectura-ficha-top">
            <span className="lectura-codigo">{conexion.codigo}</span>
            <span className="lectura-chip">{conexion.sector || 'Sin sector'}</span>
          </div>
          <h2 className="lectura-titular">{conexion.titular}</h2>
          {conexion.medidor_serie && (
            <p className="lectura-sector">Medidor {conexion.medidor_serie}</p>
          )}
        </header>

        <div className="panel lectura-panel-medidor">
          <Medidor valor={conexion.lectura_anterior} etiqueta="Lectura anterior" />
          <p className="mini" style={{ marginTop: 10 }}>
            Base del mes pasado. No se puede editar.
          </p>
        </div>

        <div className="panel lectura-panel-captura">
          <label className="etiqueta" htmlFor="lectura">Lectura de hoy</label>
          <div className="campo-lectura-caja">
            <input
              ref={inputLecturaRef}
              id="lectura"
              className="campo-lectura"
              type="text"
              inputMode="decimal"
              maxLength={8}
              placeholder=""
              autoComplete="off"
              value={valor}
              onChange={(e) => setValor(sanitizarMetros(e.target.value))}
            />
            <span className="campo-lectura-unidad" aria-hidden="true">m³</span>
          </div>
          <p className="mini" style={{ marginTop: 8 }}>
            Metros cúbicos que marca el contador, con un decimal.
          </p>

          {vistaPrevia && (
            <div className={'consumo-vivo' + (vistaPrevia.error ? ' error' : '')}>
              <div className="cifra">{metrosCubicos(vistaPrevia.consumo)}</div>
              <div className="unidad">consumo del mes</div>
              {!vistaPrevia.error && (
                <div className="monto">
                  Aprox. {quetzales(montoAproximado(vistaPrevia.consumo))}
                </div>
              )}
              {vistaPrevia.mensaje && (
                <div className="consumo-mensaje">{vistaPrevia.mensaje}</div>
              )}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <label className="etiqueta" htmlFor="obs">Observación</label>
            <input
              id="obs"
              className="campo"
              type="text"
              maxLength={300}
              placeholder="Opcional: medidor empañado, acceso obstruido…"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primario btn-ancho btn-grande"
            onClick={guardar}
            disabled={!valor || guardando}
          >
            {guardando ? 'Guardando…' : 'Guardar lectura'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lectura-escena lectura-escena-lista">
      <header className="lectura-cabecera-pagina">
        <p className="eyebrow">{periodoEtiqueta(datos?.periodo)}</p>
        <h2 className="titulo">Lecturas</h2>
        <p className="subtitulo">
          Busque al usuario del medidor y registre la lectura. El ✓ marca las visitas hechas.
        </p>

        <div className="lectura-avance" aria-label={visitadas + ' de ' + total + ' visitadas'}>
          <div className="lectura-avance-meta">
            <strong className="num">{visitadas}/{total}</strong>
            <span>{sinVisitar === 0 ? 'Todas visitadas' : sinVisitar + ' pendientes'}</span>
          </div>
          <div className="lectura-avance-pista">
            <div className="lectura-avance-lleno" style={{ width: pct + '%' }} />
          </div>
        </div>
      </header>

      <div className="lectura-controles">
        <div className="lectura-filtros" role="tablist" aria-label="Filtrar conexiones">
          {[
            { id: 'todas', etiqueta: 'Todas' },
            { id: 'pendientes', etiqueta: 'Pendientes' },
            { id: 'visitadas', etiqueta: 'Visitadas' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filtro === f.id}
              className={'lectura-filtro' + (filtro === f.id ? ' activo' : '')}
              onClick={() => setFiltro(f.id)}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>

        <div className="lectura-buscar">
          <span className="lectura-buscar-icono" aria-hidden="true">⌕</span>
          <input
            id="buscar-conexion"
            className="campo lectura-buscar-campo"
            type="search"
            autoComplete="off"
            placeholder="Código, nombre o sector…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar conexión"
          />
        </div>
      </div>

      {sinVisitar === 0 && filtro !== 'pendientes' && (
        <div className="aviso a-info lectura-aviso-listo">
          Todas las conexiones ya tienen lectura. El Administrador puede cerrar el periodo.
        </div>
      )}

      <div className="lectura-lista panel">
        {filtrados.length === 0 ? (
          <div className="lectura-vacio-filtro">
            <p className="vacio-titulo">Sin resultados</p>
            <p className="mini">
              {busqueda.trim()
                ? 'Nada coincide con «' + busqueda.trim() + '».'
                : 'No hay conexiones en este filtro.'}
            </p>
          </div>
        ) : (
          filtrados.map((c) => (
            <button
              key={c.id}
              type="button"
              className={'lectura-resultado' + (c.leida ? ' visitada' : '')}
              onClick={() => elegir(c)}
            >
              <span
                className={'lectura-check' + (c.leida ? ' ok' : '')}
                aria-label={c.leida ? 'Visitada' : 'Pendiente'}
              >
                {c.leida ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2 6.2 4.8 9 10 3.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
              <span className="lectura-resultado-cuerpo">
                <span className="lectura-resultado-linea">
                  <span className="lectura-resultado-nombre">{c.titular}</span>
                  <span className="lectura-resultado-codigo">{c.codigo}</span>
                </span>
                <span className="lectura-resultado-meta">
                  {c.leida
                    ? 'Visitada · ' + metrosCubicos(c.lectura_periodo)
                    : (c.sector || 'Sin sector') +
                      (c.medidor_serie ? ' · ' + c.medidor_serie : '')}
                </span>
              </span>
              {!c.leida && <span className="lectura-resultado-flecha" aria-hidden="true">›</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
