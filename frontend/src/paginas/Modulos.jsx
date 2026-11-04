/**
 * PANTALLAS RESTANTES DEL SISTEMA
 * Tablero (RF-05.5), Padrón (RF-01), Tesorería (RF-03),
 * Reportes (RF-05) y Bitácora (RF-06.11).
 */

import { useState } from 'react';
import { api, quetzales, miles, metrosCubicos, aCentavos, aLitrosDesdeMetros } from '../api';
import { ROLES, ROLES_INFO, etiquetaRol, puede } from '../permisos';
import { descargarRecibo } from '../recibo-pdf';
import { imprimirReciboTermico } from '../impresion/canales';
import {
  Aviso, Indicador, EstadoRecibo, Vacio, Cargando, BarrasConsumo, useCarga,
} from '../componentes/Comunes';
import { AbrirPeriodo } from '../componentes/AbrirPeriodo';

/* ============================== TABLERO ================================= */
const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function etiquetaEstadoPeriodo(estado) {
  if (estado === 'CERRADO') return ['e-pend', 'Cerrado'];
  if (estado === 'EN_LECTURA') return ['e-aviso', 'En lectura'];
  return ['e-ok', 'Abierto'];
}

function IconoOpcion({ id }) {
  const props = { viewBox: '0 0 24 24', width: '26', height: '26', 'aria-hidden': true };
  if (id === 'cobro') {
    return (
      <svg {...props}>
        <rect x="3" y="6" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="16" cy="14" r="1.5" fill="currentColor" />
      </svg>
    );
  }
  if (id === 'padron') {
    return (
      <svg {...props}>
        <circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path d="M3.8 19c.7-3.2 2.8-5.2 5.2-5.2s4.5 2 5.2 5.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M16 8h5M18.5 5.5v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'lecturas') {
    return (
      <svg {...props}>
        <rect x="5" y="3" width="14" height="18" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'reportes') {
    return (
      <svg {...props}>
        <path d="M5 19V9M10 19V5M15 19v-7M20 19V8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'cierre') {
    return (
      <svg {...props}>
        <rect x="4" y="5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path d="M8 12l2.5 2.5L16 9" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === 'cuentas') {
    return (
      <svg {...props}>
        <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path d="M5 19c1-3.5 3.5-5.5 7-5.5s6 2 7 5.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M5 6h14M5 12h14M5 18h10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function IconoFlecha() {
  return (
    <svg className="opcion-flecha" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function etiquetaInconsistencia(tipo) {
  if (tipo === 'LECTURA_MENOR') return 'Lectura menor a la anterior';
  if (tipo === 'CONSUMO_EXCESIVO') return 'Consumo excesivo';
  if (tipo === 'CONSUMO_CERO') return 'Consumo cero repetido';
  if (tipo === 'SIN_LECTURA') return 'Sin lectura';
  return tipo || 'Revisión';
}

export function Tablero({ usuario, alIr, avisar }) {
  const { datos, cargando, error, recargar } = useCarga(() => api.tablero());
  const revision = useCarga(() => api.lecturasInconsistentes(), []);
  const avanceLecturas = useCarga(() => api.pendientesDeLectura(), []);
  const [detalle, setDetalle] = useState(null); // 'revision' | 'lecturas' | null
  const puedeAbrir = Boolean(usuario && puede(usuario.rol, 'abrir_periodo'));
  const puedeResolver = Boolean(usuario && puede(usuario.rol, 'inconsistencias'));
  const puedeCobro = Boolean(usuario && puede(usuario.rol, 'cobro'));
  const puedeCierre = Boolean(usuario && puede(usuario.rol, 'cierre'));
  const puedeReportes = Boolean(usuario && puede(usuario.rol, 'reportes'));

  if (cargando) return <Cargando />;
  if (error) return <Vacio titulo="No se pudo cargar">{error}</Vacio>;
  if (!datos.periodo) {
    return (
      <div className="tablero">
        <Vacio titulo="Todavía no hay periodos">
          Abra el primer periodo para que el fontanero tome lecturas.
        </Vacio>
        {puedeAbrir && (
          <AbrirPeriodo siguiente={datos.siguiente} avisar={avisar} alAbrir={recargar} />
        )}
      </div>
    );
  }

  const i = datos.indicadores;
  const avance = i.con_medidor ? Math.round((i.lecturas_tomadas / i.con_medidor) * 100) : 0;
  const pendienteCentavos = Math.max(0, i.facturado_centavos - i.recaudado_centavos);
  const cobradoPct = i.facturado_centavos
    ? Math.min(100, Math.round((i.recaudado_centavos / i.facturado_centavos) * 100))
    : 0;
  const [, textoEstado] = etiquetaEstadoPeriodo(datos.periodo.estado);
  const [claseEstado] = etiquetaEstadoPeriodo(datos.periodo.estado);
  const mesNombre = (MESES_LARGOS[datos.periodo.mes - 1] || datos.periodo.mes) + ' ' + datos.periodo.anio;
  const vencimiento = new Date(datos.periodo.fecha_vencimiento).toLocaleDateString('es-GT');
  const listaRevision = Array.isArray(revision.datos) ? revision.datos : [];
  const conexionesAvance = Array.isArray(avanceLecturas.datos?.conexiones)
    ? avanceLecturas.datos.conexiones
    : [];
  const visitadas = conexionesAvance.filter(function (c) { return c.leida; });
  const sinVisita = conexionesAvance.filter(function (c) { return !c.leida; });

  async function resolverRevision(id) {
    const nota = window.prompt(
      'Explique cómo se resolvió esta inconsistencia.\n' +
      'La justificación queda registrada en la bitácora.'
    );
    if (!nota || nota.trim().length < 3) return;
    try {
      await api.resolverInconsistencia(id, nota.trim());
      avisar('Inconsistencia resuelta.');
      revision.recargar();
      recargar();
    } catch (e) {
      avisar(e.message, true);
    }
  }

  function abrirDetalle(cual) {
    setDetalle(cual);
    if (cual === 'revision') revision.recargar();
    if (cual === 'lecturas') avanceLecturas.recargar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (detalle === 'revision') {
    return (
      <div className="tablero anim-entrar">
        <button type="button" className="lectura-volver" onClick={() => setDetalle(null)}>
          ← Volver al resumen
        </button>
        <p className="eyebrow">Periodo {mesNombre}</p>
        <h2 className="titulo">Por revisar</h2>
        <p className="subtitulo">
          Lecturas que impiden cerrar el periodo.
          {puedeResolver
            ? ' Puede resolverlas aquí.'
            : ' Puede consultarlas; solo el administrador puede resolverlas.'}
        </p>

        {revision.cargando && <Cargando texto="Cargando revisiones…" />}
        {revision.error && <Aviso tipo="rojo">{revision.error}</Aviso>}

        {!revision.cargando && !revision.error && listaRevision.length === 0 && (
          <Vacio titulo="Nada pendiente">
            No hay lecturas por revisar en este periodo.
          </Vacio>
        )}

        <div className="revision-lista">
          {listaRevision.map((l) => (
            <article key={l.id} className="revision-card">
              <div className="revision-card-top">
                <span className="revision-codigo">{l.codigo}</span>
                <span className="etiqueta-est e-aviso">{etiquetaInconsistencia(l.inconsistencia)}</span>
              </div>
              <h3 className="revision-titular">{l.titular}</h3>
              <p className="revision-meta">
                Anterior {metrosCubicos(l.lectura_anterior)} · actual {metrosCubicos(l.lectura_actual)}
                {l.observacion ? ' · ' + l.observacion : ''}
              </p>
              <div className="revision-acciones">
                {puedeCobro && (
                  <button type="button" className="btn btn-borde btn-mini" onClick={() => alIr('cobro')}>
                    Ir a cobro
                  </button>
                )}
                {puedeResolver && (
                  <button type="button" className="btn btn-primario btn-mini" onClick={() => resolverRevision(l.id)}>
                    Resolver
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        {puedeCierre && listaRevision.length > 0 && (
          <button type="button" className="btn btn-borde btn-ancho" style={{ marginTop: 14 }} onClick={() => alIr('cierre')}>
            Abrir cierre de periodo
          </button>
        )}
      </div>
    );
  }

  if (detalle === 'lecturas') {
    return (
      <div className="tablero anim-entrar">
        <button type="button" className="lectura-volver" onClick={() => setDetalle(null)}>
          ← Volver al resumen
        </button>
        <p className="eyebrow">Periodo {mesNombre}</p>
        <h2 className="titulo">Lecturas del periodo</h2>
        <p className="subtitulo">
          {visitadas.length} visitadas · {sinVisita.length} pendientes de toma.
        </p>

        {avanceLecturas.cargando && <Cargando texto="Cargando lecturas…" />}
        {avanceLecturas.error && <Aviso tipo="rojo">{avanceLecturas.error}</Aviso>}

        {!avanceLecturas.cargando && !avanceLecturas.error && (
          <>
            <div className="panel-titulo" style={{ marginTop: 8 }}>Ya se tomó lectura</div>
            {visitadas.length === 0 ? (
              <Vacio titulo="Aún no hay visitas">
                Cuando el fontanero registre lecturas, aparecerán aquí.
              </Vacio>
            ) : (
              <div className="revision-lista">
                {visitadas.map((c) => (
                  <article key={c.id} className="revision-card">
                    <div className="revision-card-top">
                      <span className="revision-codigo">{c.codigo}</span>
                      <span className="etiqueta-est e-ok">Visitada</span>
                    </div>
                    <h3 className="revision-titular">{c.titular}</h3>
                    <p className="revision-meta">
                      {(c.sector || 'Sin sector')}
                      {c.lectura_periodo != null
                        ? ' · Lectura ' + metrosCubicos(c.lectura_periodo)
                        : ''}
                    </p>
                    {puedeCobro && (
                      <div className="revision-acciones">
                        <button type="button" className="btn btn-borde btn-mini" onClick={() => alIr('cobro')}>
                          Ir a cobro
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            {sinVisita.length > 0 && (
              <>
                <div className="panel-titulo" style={{ marginTop: 18 }}>Pendientes de visita</div>
                <div className="revision-lista">
                  {sinVisita.map((c) => (
                    <article key={c.id} className="revision-card revision-card-suave">
                      <div className="revision-card-top">
                        <span className="revision-codigo">{c.codigo}</span>
                        <span className="etiqueta-est e-pend">Pendiente</span>
                      </div>
                      <h3 className="revision-titular">{c.titular}</h3>
                      <p className="revision-meta">{c.sector || 'Sin sector'}</p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="tablero anim-entrar">
      <section className="tablero-pulso">
        <div className="tablero-pulso-meta">
          <span className={'etiqueta-est ' + claseEstado}>{textoEstado}</span>
          <strong>{mesNombre}</strong>
          <span>Vence {vencimiento}</span>
        </div>
        <p className="tablero-pulso-etiqueta">Recaudado del periodo</p>
        <p className="tablero-pulso-monto num">{quetzales(i.recaudado_centavos)}</p>
        <p className="tablero-pulso-sub">
          de {quetzales(i.facturado_centavos)} facturados · {cobradoPct}%
        </p>
        <div className="tablero-progreso tablero-pulso-barra">
          <div className="tablero-progreso-barra" aria-hidden="true">
            <i style={{ width: cobradoPct + '%' }} />
          </div>
        </div>
        {pendienteCentavos > 0 && puedeCobro && (
          <button type="button" className="btn btn-primario tablero-pulso-cta" onClick={() => alIr('cobro')}>
            Cobrar pendiente · {quetzales(pendienteCentavos)}
          </button>
        )}
      </section>

      {puedeAbrir && datos.periodo.estado === 'CERRADO' && datos.siguiente && (
        <>
          <Aviso tipo="ambar">
            El periodo está cerrado. Ábralo usted para que el fontanero pueda
            tomar las lecturas del mes siguiente.
          </Aviso>
          <AbrirPeriodo siguiente={datos.siguiente} avisar={avisar} alAbrir={recargar} />
        </>
      )}

      <div className="rejilla c2 tablero-kpis">
        <Indicador
          etiqueta="Lecturas"
          valor={i.lecturas_tomadas + '/' + i.con_medidor}
          pie={avance + '% de medidores visitados'}
          onClick={() => abrirDetalle('lecturas')}
          accion="Ver usuarios →"
        />
        <Indicador
          etiqueta="Por revisar"
          valor={i.por_revisar}
          pie={i.por_revisar ? 'Toque para ver usuarios' : 'Sin pendientes'}
          alerta={i.por_revisar > 0}
          onClick={() => abrirDetalle('revision')}
          accion={i.por_revisar > 0 ? 'Ver lista →' : 'Consultar'}
        />
        <Indicador
          etiqueta="Pendiente"
          valor={quetzales(pendienteCentavos)}
          pie={i.conexiones_activas + ' conexiones activas'}
          onClick={puedeCobro ? () => alIr('cobro') : undefined}
          accion={puedeCobro ? 'Ir a cobro →' : undefined}
        />
        <Indicador
          etiqueta="Morosos"
          valor={i.conexiones_morosas}
          pie="Cartera vencida"
          alerta={i.conexiones_morosas > 0}
          onClick={puedeReportes ? () => alIr('reportes') : undefined}
          accion={puedeReportes ? 'Ver reportes →' : undefined}
        />
      </div>

      <div className="rejilla c2">
        <div className="panel tablero-bloque">
          <div className="panel-titulo">Consumo del periodo</div>
          <p className="tablero-cifra num">{metrosCubicos(Number(i.consumo_total_litros))}</p>
          <p className="mini">{miles(Number(i.consumo_total_litros))} litros en total</p>
          <div className="tablero-progreso">
            <div className="tablero-progreso-etq">
              <span>Avance de lecturas</span>
              <strong>{avance}%</strong>
            </div>
            <div className="tablero-progreso-barra" aria-hidden="true">
              <i style={{ width: avance + '%' }} />
            </div>
          </div>
        </div>

        <div className="panel tablero-bloque">
          <div className="panel-titulo">Caja del periodo</div>
          <dl className="tablero-caja">
            <div>
              <dt>Facturado</dt>
              <dd className="num">{quetzales(i.facturado_centavos)}</dd>
            </div>
            <div>
              <dt>Recaudado</dt>
              <dd className="num">{quetzales(i.recaudado_centavos)}</dd>
            </div>
            <div>
              <dt>Pendiente de cobro</dt>
              <dd className="num">{quetzales(pendienteCentavos)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

/* =============================== PADRÓN ================================= */
function fechaGt(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-GT');
}

function DatoFicha({ etiqueta, valor }) {
  return (
    <div className="padron-dato">
      <dt>{etiqueta}</dt>
      <dd>{valor == null || valor === '' ? '—' : valor}</dd>
    </div>
  );
}

function lugarPadron(c) {
  const sector = (c.sector || '').trim();
  const direccion = (c.direccion || '').trim();
  if (direccion && sector && direccion.toLowerCase().includes(sector.toLowerCase())) {
    return direccion;
  }
  return [sector, direccion].filter(Boolean).join(' · ') || 'Sin dirección';
}

export function Padron({ usuario, avisar }) {
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const [abiertoId, setAbiertoId] = useState(null);
  const { datos, cargando, error, recargar } = useCarga(
    () => api.conexiones({ q: consulta }), [consulta]
  );
  const puedeAlta = puede(usuario.rol, 'alta_conexion');
  const abierto = (datos || []).find((c) => c.id === abiertoId) || null;

  const vacio = {
    nombreCompleto: '', dpi: '', telefono: '',
    codigoConexion: '', sector: '', direccion: '',
    modalidad: 'MEDIDA', serieMedidor: '', lecturaInicial: '0',
  };
  const [alta, setAlta] = useState(vacio);
  const [guardando, setGuardando] = useState(false);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [edicion, setEdicion] = useState({
    nombreCompleto: '', dpi: '', telefono: '', sector: '', direccion: '',
  });

  function partirNombre(completo) {
    const partes = String(completo || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
    if (partes.length === 0) return { nombres: '', apellidos: '' };
    if (partes.length === 1) return { nombres: partes[0], apellidos: partes[0] };
    if (partes.length === 2) return { nombres: partes[0], apellidos: partes[1] };
    if (partes.length === 3) {
      return { nombres: partes[0], apellidos: partes.slice(1).join(' ') };
    }
    const mitad = Math.ceil(partes.length / 2);
    return {
      nombres: partes.slice(0, mitad).join(' '),
      apellidos: partes.slice(mitad).join(' '),
    };
  }

  async function registrar(e) {
    e.preventDefault();
    const { nombres, apellidos } = partirNombre(alta.nombreCompleto);
    if (!nombres || !apellidos) {
      avisar('Indique el nombre completo del usuario.', true);
      return;
    }
    if (!alta.dpi.trim() || !alta.telefono.trim() || !alta.codigoConexion.trim()) {
      avisar('Código, DPI y teléfono son obligatorios.', true);
      return;
    }

    setGuardando(true);
    try {
      const creado = await api.crearConexion({
        nombres,
        apellidos,
        dpi: alta.dpi.trim(),
        telefono: alta.telefono.trim(),
        direccion: alta.direccion.trim() || undefined,
        codigoConexion: alta.codigoConexion.trim(),
        sector: alta.sector.trim() || undefined,
        modalidad: alta.modalidad,
        serieMedidor: alta.serieMedidor.trim() || undefined,
        lecturaInicial: aLitrosDesdeMetros(alta.lecturaInicial) || 0,
      });
      avisar('Usuario registrado en el padrón: ' + creado.codigo + ' · ' + alta.nombreCompleto.trim());
      setAlta(vacio);
      setMostrarAlta(false);
      recargar();
    } catch (err) {
      avisar(err.message, true);
    } finally {
      setGuardando(false);
    }
  }

  function abrirFicha(conexion) {
    setAbiertoId(conexion.id);
    setEditando(false);
    window.scrollTo(0, 0);
  }

  function empezarEdicion() {
    if (!abierto) return;
    setEdicion({
      nombreCompleto: abierto.titular || '',
      dpi: abierto.dpi || '',
      telefono: abierto.telefono || '',
      sector: abierto.sector || '',
      direccion: abierto.direccion || '',
    });
    setEditando(true);
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    if (!abierto) return;
    const { nombres, apellidos } = partirNombre(edicion.nombreCompleto);
    if (!nombres || !apellidos || !edicion.dpi.trim() || !edicion.telefono.trim()) {
      avisar('Nombre, DPI y teléfono son obligatorios.', true);
      return;
    }
    setGuardando(true);
    try {
      const r = await api.actualizarConexion(abierto.id, {
        nombres,
        apellidos,
        dpi: edicion.dpi.trim(),
        telefono: edicion.telefono.trim(),
        direccion: edicion.direccion.trim(),
        sector: edicion.sector.trim(),
      });
      avisar(r.mensaje || 'Datos actualizados.');
      setEditando(false);
      recargar();
    } catch (err) {
      avisar(err.message, true);
    } finally {
      setGuardando(false);
    }
  }

  async function darBaja() {
    if (!abierto) return;
    const motivo = window.prompt(
      'Motivo de la baja. El historial de lecturas, facturas y pagos se conserva.'
    );
    if (motivo == null) return;
    if (motivo.trim().length < 3) {
      avisar('Indique un motivo de al menos 3 caracteres.', true);
      return;
    }
    setGuardando(true);
    try {
      const r = await api.bajaConexion(abierto.id, motivo.trim());
      avisar(r.mensaje || 'Conexión dada de baja.');
      setAbiertoId(null);
      recargar();
    } catch (err) {
      avisar(err.message, true);
    } finally {
      setGuardando(false);
    }
  }

  if (abierto) {
    const medida = abierto.modalidad !== 'CUOTA_FIJA';
    return (
      <div className="padron">
        <button type="button" className="lectura-volver" onClick={() => setAbiertoId(null)}>
          ← Volver al listado
        </button>
        <div className="lectura-ficha-top">
          <span className="lectura-codigo">{abierto.codigo}</span>
          <span className={'etiqueta-est ' + (abierto.estado === 'ACTIVA' ? 'e-ok' : 'e-mal')}>
            {abierto.estado === 'ACTIVA' ? 'Activa' : abierto.estado}
          </span>
          <span className="etiqueta-est e-pend">
            {medida ? 'Medida' : 'Cuota fija'}
          </span>
        </div>
        <h2 className="titulo">{abierto.titular}</h2>
        <p className="subtitulo">Ficha del padrón. El cobro se hace en Cobro.</p>

        {puedeAlta && !editando && (
          <div className="padron-ficha-acciones">
            <button type="button" className="btn btn-borde" onClick={empezarEdicion} disabled={guardando}>
              Editar datos
            </button>
            {abierto.estado === 'ACTIVA' && (
              <button type="button" className="btn btn-borde" onClick={darBaja} disabled={guardando}>
                Dar de baja
              </button>
            )}
          </div>
        )}

        {editando && (
          <div className="panel padron-seccion">
            <div className="panel-titulo">Editar titular</div>
            <p className="mini" style={{ margin: '-6px 0 14px' }}>
              El código de conexión no cambia. Lecturas, facturas y pagos se conservan.
            </p>
            <form onSubmit={guardarEdicion}>
              <div className="padron-alta">
                <label className="etiqueta" style={{ gridColumn: '1 / -1' }}>
                  Nombre completo *
                  <input className="campo" required
                    value={edicion.nombreCompleto}
                    onChange={(e) => setEdicion({ ...edicion, nombreCompleto: e.target.value })} />
                </label>
                <label className="etiqueta">
                  DPI *
                  <input className="campo" required inputMode="numeric"
                    value={edicion.dpi}
                    onChange={(e) => setEdicion({ ...edicion, dpi: e.target.value })} />
                </label>
                <label className="etiqueta">
                  Teléfono *
                  <input className="campo" required inputMode="tel"
                    value={edicion.telefono}
                    onChange={(e) => setEdicion({ ...edicion, telefono: e.target.value })} />
                </label>
                <label className="etiqueta">
                  Sector / lote
                  <input className="campo"
                    value={edicion.sector}
                    onChange={(e) => setEdicion({ ...edicion, sector: e.target.value })} />
                </label>
                <label className="etiqueta" style={{ gridColumn: '1 / -1' }}>
                  Dirección
                  <input className="campo"
                    value={edicion.direccion}
                    onChange={(e) => setEdicion({ ...edicion, direccion: e.target.value })} />
                </label>
              </div>
              <div className="padron-ficha-acciones" style={{ marginTop: 14 }}>
                <button className="btn btn-primario" disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button type="button" className="btn btn-borde" disabled={guardando}
                  onClick={() => setEditando(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="panel padron-seccion">
          <div className="panel-titulo">Titular</div>
          <dl className="padron-ficha-grid">
            <DatoFicha etiqueta="Nombre" valor={abierto.titular} />
            <DatoFicha etiqueta="DPI" valor={abierto.dpi} />
            <DatoFicha etiqueta="Teléfono" valor={abierto.telefono} />
            <DatoFicha etiqueta="Ingreso al servicio" valor={fechaGt(abierto.fecha_ingreso)} />
          </dl>
        </div>

        <div className="panel padron-seccion">
          <div className="panel-titulo">Conexión</div>
          <dl className="padron-ficha-grid">
            <DatoFicha etiqueta="Código" valor={abierto.codigo} />
            <DatoFicha etiqueta="Sector" valor={abierto.sector} />
            <DatoFicha etiqueta="Dirección" valor={abierto.direccion} />
            <DatoFicha etiqueta="Fecha de alta" valor={fechaGt(abierto.fecha_alta)} />
          </dl>
        </div>

        <div className="panel padron-seccion">
          <div className="panel-titulo">{medida ? 'Medidor' : 'Modalidad'}</div>
          <dl className="padron-ficha-grid">
            <DatoFicha etiqueta="Tipo de servicio" valor={medida ? 'Medida (con medidor)' : 'Cuota fija'} />
            {medida && (
              <>
                <DatoFicha etiqueta="Serie" valor={abierto.medidor_serie} />
                <DatoFicha etiqueta="Marca" valor={abierto.medidor_marca} />
                <DatoFicha etiqueta="Dígitos" valor={abierto.digitos} />
                <DatoFicha
                  etiqueta="Lectura inicial"
                  valor={abierto.lectura_inicial != null ? metrosCubicos(abierto.lectura_inicial) : '—'}
                />
                <DatoFicha
                  etiqueta="Última lectura"
                  valor={abierto.ultima_lectura != null ? metrosCubicos(abierto.ultima_lectura) : '—'}
                />
                <DatoFicha etiqueta="Instalación" valor={fechaGt(abierto.fecha_instalacion)} />
              </>
            )}
          </dl>
        </div>
      </div>
    );
  }

  return (
    <div className="padron">
      <p className="eyebrow">{datos?.length ?? 0} padrones</p>
      <h2 className="titulo">Padrón</h2>
      <p className="subtitulo">
        Pulse un padrón para ver su ficha. El cobro se hace en Cobro.
      </p>

      {puedeAlta && mostrarAlta && (
        <div className="panel">
          <div className="panel-titulo">Nuevo padrón</div>
          <p className="mini" style={{ margin: '-6px 0 14px' }}>
            Registre al titular y su conexión: nombre, DPI, teléfono y código.
          </p>
          <form onSubmit={registrar}>
            <div className="padron-alta">
              <label className="etiqueta" style={{ gridColumn: '1 / -1' }}>
                Nombre completo *
                <input className="campo" required
                  placeholder="Como aparece en el cuaderno"
                  value={alta.nombreCompleto}
                  onChange={(e) => setAlta({ ...alta, nombreCompleto: e.target.value })} />
              </label>
              <label className="etiqueta">
                DPI *
                <input className="campo" required
                  placeholder="13 dígitos" inputMode="numeric"
                  value={alta.dpi}
                  onChange={(e) => setAlta({ ...alta, dpi: e.target.value })} />
              </label>
              <label className="etiqueta">
                Teléfono *
                <input className="campo" required
                  placeholder="Ej. 55123456" inputMode="tel"
                  value={alta.telefono}
                  onChange={(e) => setAlta({ ...alta, telefono: e.target.value })} />
              </label>
              <label className="etiqueta">
                Código de conexión *
                <input className="campo" required
                  placeholder="Del cuaderno / correlativo"
                  value={alta.codigoConexion}
                  onChange={(e) => setAlta({ ...alta, codigoConexion: e.target.value })} />
              </label>
              <label className="etiqueta">
                Sector / lote
                <input className="campo"
                  placeholder="Ej. Sector 2"
                  value={alta.sector}
                  onChange={(e) => setAlta({ ...alta, sector: e.target.value })} />
              </label>
              <label className="etiqueta" style={{ gridColumn: '1 / -1' }}>
                Dirección
                <input className="campo"
                  placeholder="Referencia del predio"
                  value={alta.direccion}
                  onChange={(e) => setAlta({ ...alta, direccion: e.target.value })} />
              </label>
              <label className="etiqueta">
                Modalidad
                <select className="campo"
                  value={alta.modalidad}
                  onChange={(e) => setAlta({ ...alta, modalidad: e.target.value })}>
                  <option value="MEDIDA">Medida (con medidor)</option>
                  <option value="CUOTA_FIJA">Cuota fija</option>
                </select>
              </label>
              {alta.modalidad === 'MEDIDA' && (
                <>
                  <label className="etiqueta">
                    Serie del medidor
                    <input className="campo"
                      placeholder="Opcional si aún no está instalado"
                      value={alta.serieMedidor}
                      onChange={(e) => setAlta({ ...alta, serieMedidor: e.target.value })} />
                  </label>
                  <label className="etiqueta">
                    Lectura inicial (m³)
                    <input className="campo"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.0"
                      value={alta.lecturaInicial}
                      onChange={(e) => setAlta({ ...alta, lecturaInicial: e.target.value.replace(/[^\d.,]/g, '') })} />
                  </label>
                </>
              )}
              <button className="btn btn-primario" disabled={guardando}
                style={{ gridColumn: '1 / -1' }}>
                {guardando ? 'Guardando…' : 'Guardar padrón'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="panel padron-lista-panel">
        <div className="padron-buscar">
          <input
            className="campo"
            placeholder="Buscar por código, nombre, DPI o sector…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setConsulta(busqueda)}
          />
          <button className="btn btn-borde" onClick={() => setConsulta(busqueda)}>Buscar</button>
          {puedeAlta && (
            <button
              type="button"
              className={'btn ' + (mostrarAlta ? 'btn-borde' : 'btn-primario')}
              onClick={() => setMostrarAlta((v) => !v)}
            >
              {mostrarAlta ? 'Cerrar' : 'Crear padrón'}
            </button>
          )}
        </div>

        {cargando && <Cargando />}
        {error && <p className="mini">{error}</p>}

        {datos && datos.length === 0 && !cargando && (
          <Vacio titulo="El padrón está vacío">
            {puedeAlta
              ? 'Use «Crear padrón» para registrar a las personas de los cuadernos.'
              : 'El administrador o tesorero debe cargar los padrones del servicio.'}
          </Vacio>
        )}

        {datos && datos.length > 0 && (
          <div className="padron-lista">
            {datos.map((c) => (
              <button
                key={c.id}
                type="button"
                className="padron-fila"
                onClick={() => abrirFicha(c)}
              >
                <span className="padron-fila-codigo">{c.codigo}</span>
                <span className="padron-fila-cuerpo">
                  <span className="padron-fila-nombre">{c.titular}</span>
                  <span className="padron-fila-meta">{lugarPadron(c)}</span>
                </span>
                <span className="etiqueta-est e-pend">
                  {c.modalidad === 'CUOTA_FIJA' ? 'Cuota fija' : 'Medida'}
                </span>
                <span className="padron-fila-flecha" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================= TESORERÍA =============================== */
export function Tesoreria({ conexionId, avisar, alVolver, compacto }) {
  const { datos, cargando, error, recargar } = useCarga(
    () => api.estadoCuenta(conexionId), [conexionId]
  );
  const historial = useCarga(() => api.historial(conexionId), [conexionId]);

  if (cargando) return <Cargando />;
  if (error) return <Vacio titulo="No se pudo cargar">{error}</Vacio>;

  async function cobrar() {
    const texto = window.prompt(
      'Cobro a ' + datos.conexion.titular + '\n\n' +
      'Saldo pendiente: ' + quetzales(datos.saldoPendienteCentavos) + '\n\n' +
      '¿Cuánto entregó? (en quetzales)',
      (datos.saldoPendienteCentavos / 100).toFixed(2)
    );
    if (texto === null) return;

    const centavos = aCentavos(texto);
    if (!centavos) return avisar('Escriba un monto válido, por ejemplo 25.00', true);

    try {
      // RF-03.2: primero se muestra la distribución, luego se confirma.
      const previa = await api.previsualizarPago(conexionId, centavos);
      const detalle = previa.aplicaciones
        .map((a) => 'Recibo #' + a.correlativo + ': ' + quetzales(a.montoAplicadoCentavos) +
          (a.quedaSaldado ? ' (saldado)' : ' (queda ' + quetzales(a.saldoRestanteCentavos) + ')'))
        .join('\n');
      const extra = previa.saldoFavorCentavos > 0
        ? '\n\nQueda a favor: ' + quetzales(previa.saldoFavorCentavos) : '';

      if (!window.confirm('El pago se aplicará así:\n\n' + detalle + extra + '\n\n¿Confirmar?')) return;

      await api.registrarPago({ conexionId, montoCentavos: centavos, formaPago: 'EFECTIVO' });
      avisar('Pago registrado.');
      recargar();
    } catch (e) { avisar(e.message, true); }
  }

  async function anular(pagoId) {
    const motivo = window.prompt('Motivo de la anulación (queda en la bitácora):');
    if (!motivo || motivo.trim().length < 5) return;
    try {
      await api.anularPago(pagoId, motivo.trim());
      avisar('Pago anulado. El registro se conserva.');
      recargar();
    } catch (e) { avisar(e.message, true); }
  }

  async function verRecibo(id) {
    try {
      descargarRecibo(await api.recibo(id));
    } catch (e) { avisar(e.message, true); }
  }

  async function imprimirRecibo(id) {
    try {
      const r = await imprimirReciboTermico(await api.recibo(id));
      avisar(r.mensaje, !r.ok);
    } catch (e) { avisar(e.message, true); }
  }

  return (
    <>
      {alVolver && (
        <button className="btn btn-borde btn-mini" onClick={alVolver} style={{ marginBottom: 14 }}>
          ← Volver a cobro
        </button>
      )}

      {!compacto && (
        <>
          <div className="eyebrow">{datos.conexion.codigo}</div>
          <h2 className="titulo">{datos.conexion.titular}</h2>
          <p className="subtitulo">Estado de cuenta, cobro e impresión de recibos.</p>
        </>
      )}

      <div className="rejilla c3" style={{ marginBottom: 16 }}>
        <Indicador
          etiqueta="Saldo pendiente"
          valor={quetzales(datos.saldoPendienteCentavos)}
          pie={datos.morosidad.periodosVencidos + ' recibos vencidos'}
          alerta={datos.morosidad.esMoroso}
        />
        <Indicador
          etiqueta="Saldo a favor"
          valor={quetzales(datos.conexion.saldo_favor_centavos)}
          pie="Se aplica al próximo recibo"
        />
        <Indicador
          etiqueta="Atraso"
          valor={datos.morosidad.antiguedadDias + ' días'}
          pie={datos.morosidad.esMoroso ? 'Usuario moroso' : 'Al día'}
        />
      </div>

      {datos.saldoPendienteCentavos > 0 && (
        <div className="panel">
          <div className="panel-titulo">Registrar cobro</div>
          <p className="mini" style={{ marginBottom: 12 }}>
            El pago se aplica primero al recibo más viejo que deba. Así nadie va
            pagando el mes corriente mientras arrastra deuda vieja.
          </p>
          <button className="btn btn-primario" onClick={cobrar}>Recibir pago</button>
        </div>
      )}

      <div className="panel">
        <div className="panel-titulo">Recibos</div>
        <div className="envoltura-tabla">
          <table className="tabla">
            <thead>
              <tr>
                <th>Recibo</th><th>Periodo</th>
                <th className="der">Consumo</th><th className="der">Total</th>
                <th className="der">Saldo</th><th>Estado</th><th />
              </tr>
            </thead>
            <tbody>
              {datos.recibos.map((r) => (
                <tr key={r.id}>
                  <td className="num" style={{ fontWeight: 600 }}>#{r.correlativo}</td>
                  <td className="num">{String(r.mes).padStart(2, '0')}/{r.anio}</td>
                  <td className="der num">{metrosCubicos(r.consumo_litros)}</td>
                  <td className="der num">{quetzales(r.total_centavos)}</td>
                  <td className="der num" style={{ fontWeight: 600 }}>{quetzales(r.saldo_centavos)}</td>
                  <td><EstadoRecibo estado={r.estado} /></td>
                  <td className="der">
                    <button className="btn btn-borde btn-mini" onClick={() => imprimirRecibo(r.id)}>Imprimir</button>
                    <button className="btn btn-borde btn-mini" onClick={() => verRecibo(r.id)}>PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {datos.pagos.length > 0 && (
        <div className="panel">
          <div className="panel-titulo">Pagos recibidos</div>
          <div className="envoltura-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Comprobante</th><th>Fecha</th><th>Forma</th>
                  <th className="der">Monto</th><th>Recibió</th><th />
                </tr>
              </thead>
              <tbody>
                {datos.pagos.map((p) => (
                  <tr key={p.id} style={p.anulado ? { opacity: .5 } : undefined}>
                    <td className="num">#{p.correlativo}</td>
                    <td>{new Date(p.fecha_pago).toLocaleDateString('es-GT')}</td>
                    <td className="mini">{p.forma_pago}</td>
                    <td className="der num">{quetzales(p.monto_centavos)}</td>
                    <td className="mini">{p.recibido_por}</td>
                    <td className="der">
                      {p.anulado
                        ? <span className="etiqueta-est e-mal">Anulado</span>
                        : <button className="btn btn-borde btn-mini" onClick={() => anular(p.id)}>Anular</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-titulo">Historial de lecturas</div>
        {historial.datos?.length > 0 ? (
          <div className="envoltura-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th className="der">Anterior</th>
                  <th className="der">Actual</th>
                  <th className="der">Consumo</th>
                </tr>
              </thead>
              <tbody>
                {historial.datos.map((d, i) => (
                  <tr key={i}>
                    <td className="num">{String(d.mes).padStart(2, '0')}/{d.anio}</td>
                    <td className="der num">{metrosCubicos(d.lectura_anterior)}</td>
                    <td className="der num">{metrosCubicos(d.lectura_actual)}</td>
                    <td className="der num" style={{ fontWeight: 600 }}>{metrosCubicos(d.consumo_litros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mini">Todavía no hay lecturas registradas.</p>
        )}
        <BarrasConsumo datos={historial.datos} />
      </div>
    </>
  );
}

/* =============================== REPORTES =============================== */
export function Reportes() {
  const [cual, setCual] = useState('morosos');
  const morosos = useCarga(() => api.morosos());
  const ingresos = useCarga(() => api.ingresos());
  const consumo = useCarga(() => api.consumo());

  return (
    <>
      <div className="eyebrow">Reportes administrativos</div>
      <h2 className="titulo">Reportes</h2>
      <p className="subtitulo">Información para la junta local y la asamblea.</p>

      <div className="fila-btn" style={{ marginTop: 0, marginBottom: 16 }}>
        {[['morosos', 'Usuarios morosos'], ['ingresos', 'Ingresos'], ['consumo', 'Consumo']].map(([id, texto]) => (
          <button
            key={id}
            className={'btn ' + (cual === id ? 'btn-primario' : 'btn-borde')}
            onClick={() => setCual(id)}
          >
            {texto}
          </button>
        ))}
      </div>

      {cual === 'morosos' && (
        <div className="panel">
          <div className="panel-titulo">Usuarios morosos</div>
          {morosos.cargando && <Cargando />}
          {morosos.datos?.length === 0 && <p className="mini">No hay usuarios morosos. Toda la cartera está al día.</p>}
          {morosos.datos?.length > 0 && (
            <div className="envoltura-tabla">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Conexión</th><th>Titular</th><th>Teléfono</th>
                    <th className="der">Recibos</th><th className="der">Deuda</th><th className="der">Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {morosos.datos.map((m) => (
                    <tr key={m.id}>
                      <td className="num" style={{ fontWeight: 600 }}>{m.codigo}</td>
                      <td>{m.titular}<br /><span className="mini">{m.sector}</span></td>
                      <td className="num mini">{m.telefono || '—'}</td>
                      <td className="der num">{m.recibos_vencidos}</td>
                      <td className="der num" style={{ fontWeight: 600, color: 'var(--ladrillo)' }}>
                        {quetzales(m.deuda_centavos)}
                      </td>
                      <td className="der num">{m.dias_atraso} d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {cual === 'ingresos' && (
        <div className="panel">
          <div className="panel-titulo">Ingresos por periodo</div>
          {ingresos.cargando && <Cargando />}
          {ingresos.datos?.length > 0 && (
            <div className="envoltura-tabla">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Periodo</th><th className="der">Recibos</th>
                    <th className="der">Tarifa básica</th><th className="der">Exceso</th>
                    <th className="der">Mora</th><th className="der">Facturado</th><th className="der">Recaudado</th>
                  </tr>
                </thead>
                <tbody>
                  {ingresos.datos.map((r, k) => (
                    <tr key={k}>
                      <td className="num">{String(r.mes).padStart(2, '0')}/{r.anio}</td>
                      <td className="der num">{r.recibos}</td>
                      <td className="der num">{quetzales(r.tarifa_basica_centavos)}</td>
                      <td className="der num">{quetzales(r.exceso_centavos)}</td>
                      <td className="der num">{quetzales(r.mora_centavos)}</td>
                      <td className="der num" style={{ fontWeight: 600 }}>{quetzales(r.facturado_centavos)}</td>
                      <td className="der num">{quetzales(r.recaudado_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {cual === 'consumo' && (
        <div className="panel">
          <div className="panel-titulo">Consumo de la comunidad</div>
          {consumo.cargando && <Cargando />}
          {consumo.datos?.length > 0 && (
            <div className="envoltura-tabla">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Periodo</th><th className="der">Lecturas</th>
                    <th className="der">Consumo total</th><th className="der">Promedio</th><th className="der">Máximo</th>
                  </tr>
                </thead>
                <tbody>
                  {consumo.datos.map((r, k) => (
                    <tr key={k}>
                      <td className="num">{String(r.mes).padStart(2, '0')}/{r.anio}</td>
                      <td className="der num">{r.lecturas}</td>
                      <td className="der num" style={{ fontWeight: 600 }}>
                        {metrosCubicos(Number(r.consumo_total_litros))}
                      </td>
                      <td className="der num">{metrosCubicos(r.consumo_promedio_litros)}</td>
                      <td className="der num">{metrosCubicos(r.consumo_maximo_litros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* =============================== BITÁCORA =============================== */
export function Bitacora() {
  const { datos, cargando, error } = useCarga(() => api.bitacora());

  return (
    <>
      <div className="eyebrow">{datos?.length ?? 0} movimientos</div>
      <h2 className="titulo">Bitácora</h2>
      <p className="subtitulo">Quién hizo qué y cuándo. No se puede borrar ni modificar.</p>

      <Aviso tipo="info">
        <div>
          Se administra dinero de la comunidad. Esta bitácora es lo que permite
          responderle a la asamblea con datos y no con explicaciones. En la base
          de datos se protege con un <strong>trigger</strong>, para que no pueda
          alterarse ni entrando por otra vía.
        </div>
      </Aviso>

      <div className="panel">
        {cargando && <Cargando />}
        {error && <p className="mini">{error}</p>}
        {datos?.map((b) => (
          <div key={b.id} style={{ display: 'flex', gap: 13, padding: '11px 0', borderBottom: '1px solid #E2EAE9' }}>
            <span className="num mini" style={{ flex: 'none', width: 96, paddingTop: 2 }}>
              {new Date(b.creado_en).toLocaleString('es-GT', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5 }}>
                <strong>{b.accion.replace(/_/g, ' ').toLowerCase()}</strong>
                <span className="mini"> · {b.entidad} {b.entidad_id}</span>
              </div>
              <div className="mini">{b.actor} ({b.rol})</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ======================== CUENTAS / INVITACIONES ======================== */
export function Cuentas({ avisar }) {
  const { datos: usuarios, cargando, error, recargar: recargarUsuarios } = useCarga(() => api.usuarios());
  const { datos: invitaciones, recargar: recargarInv } = useCarga(() => api.invitaciones());
  const [rol, setRol] = useState('FONTANERO');
  const [codigo, setCodigo] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [alta, setAlta] = useState({
    nombre: '', direccion: '', correo: '', contrasena: '', confirmar: '', rol: 'FONTANERO',
  });
  const [guardandoAlta, setGuardandoAlta] = useState(false);

  function elegirRol(clave) {
    setRol(clave);
    setAlta((prev) => ({ ...prev, rol: clave }));
  }

  async function emitir() {
    setGenerando(true);
    setCodigo(null);
    try {
      const r = await api.crearInvitacion(rol);
      setCodigo(r.codigo);
      avisar(r.mensaje || 'Código generado.');
      recargarInv();
    } catch (err) {
      avisar(err.message, true);
    } finally {
      setGenerando(false);
    }
  }

  async function copiar() {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      avisar('Código copiado al portapapeles.');
    } catch {
      avisar('No se pudo copiar; selecciónelo manualmente.', true);
    }
  }

  async function crearDirecto(e) {
    e.preventDefault();
    if (alta.contrasena !== alta.confirmar) {
      avisar('Las contraseñas no coinciden.', true);
      return;
    }
    setGuardandoAlta(true);
    try {
      const creado = await api.crearUsuario({
        nombre: alta.nombre,
        direccion: alta.direccion,
        correo: alta.correo.trim().toLowerCase(),
        contrasena: alta.contrasena,
        rol: alta.rol,
      });
      avisar(
        'Cuenta creada: ' + creado.correo + ' · rol ' + etiquetaRol(creado.rol)
        + '. Ya puede iniciar sesión con esa contraseña.'
      );
      setAlta({
        nombre: '', direccion: '', correo: '', contrasena: '', confirmar: '', rol,
      });
      recargarUsuarios();
    } catch (err) {
      avisar(err.message, true);
    } finally {
      setGuardandoAlta(false);
    }
  }

  return (
    <>
      <div className="eyebrow">{usuarios?.length ?? 0} cuentas</div>
      <h2 className="titulo">Cuentas</h2>
      <p className="subtitulo">
        Roles del sistema, invitaciones y alta directa de usuarios.
      </p>

      <Aviso tipo="info">
        <div>
          Como en un sistema por roles: cada persona entra con un perfil
          (Administrador, Tesorero o Fontanero). El rol lo define usted al
          generar el código o al crear la cuenta; quien se registra no elige
          su propio privilegio.
        </div>
      </Aviso>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Roles del comité</h3>
        <div className="roles-rejilla">
          {ROLES.map((clave) => {
            const info = ROLES_INFO[clave];
            const activo = rol === clave;
            return (
              <button
                key={clave}
                type="button"
                className={'rol-tarjeta' + (activo ? ' rol-tarjeta-activa' : '')}
                onClick={() => elegirRol(clave)}
              >
                <strong>{info.nombre}</strong>
                <span>{info.descripcion}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>
          Nueva invitación · {ROLES_INFO[rol].nombre}
        </h3>
        <p className="mini" style={{ marginBottom: 12 }}>
          Genere un código, entrégueselo en persona y la persona lo usa en
          «Crear cuenta». Un solo uso, válido 7 días.
        </p>
        <button className="btn btn-primario" disabled={generando} onClick={emitir}>
          {generando ? 'Generando…' : 'Generar código de invitación'}
        </button>
        {codigo && (
          <div style={{ marginTop: 14, padding: '12px 14px', background: '#EEF6F5', borderRadius: 8 }}>
            <div className="mini" style={{ marginBottom: 6 }}>Entregue este código:</div>
            <code className="num" style={{ fontSize: 15, wordBreak: 'break-all' }}>{codigo}</code>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-borde btn-mini" onClick={copiar}>
                Copiar código
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>
          Alta directa (oficina) · {ROLES_INFO[alta.rol].nombre}
        </h3>
        <p className="mini" style={{ marginBottom: 12 }}>
          Si la persona está presente, puede crear la cuenta aquí sin código.
          El rol se toma de la tarjeta seleccionada arriba (o del selector).
        </p>
        <form onSubmit={crearDirecto}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
            <input className="campo" style={{ marginBottom: 0 }} required
              placeholder="Nombre completo"
              value={alta.nombre}
              onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} />
            <input className="campo" style={{ marginBottom: 0 }}
              placeholder="Dirección"
              value={alta.direccion}
              onChange={(e) => setAlta({ ...alta, direccion: e.target.value })} />
            <input className="campo" style={{ marginBottom: 0 }} type="email" required
              placeholder="Correo"
              value={alta.correo}
              onChange={(e) => setAlta({ ...alta, correo: e.target.value })} />
            <select className="campo" style={{ marginBottom: 0 }}
              value={alta.rol}
              onChange={(e) => elegirRol(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLES_INFO[r].nombre}</option>
              ))}
            </select>
            <input className="campo" style={{ marginBottom: 0 }} type="password" required
              placeholder="Contraseña (mín. 10, letras y números)"
              autoComplete="new-password"
              value={alta.contrasena}
              onChange={(e) => setAlta({ ...alta, contrasena: e.target.value })} />
            <input className="campo" style={{ marginBottom: 0 }} type="password" required
              placeholder="Confirmar contraseña"
              autoComplete="new-password"
              value={alta.confirmar}
              onChange={(e) => setAlta({ ...alta, confirmar: e.target.value })} />
            <button className="btn btn-primario" disabled={guardandoAlta}
              style={{ gridColumn: '1 / -1' }}>
              {guardandoAlta ? 'Guardando…' : 'Crear cuenta como ' + ROLES_INFO[alta.rol].nombre}
            </button>
          </div>
        </form>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Cuentas activas</h3>
        {cargando && <Cargando />}
        {error && <p className="mini">{error}</p>}
        {usuarios && (
          <div className="envoltura-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>{u.nombre}</td>
                    <td className="mini">{u.correo}</td>
                    <td><span className="etiqueta-est e-pend">{etiquetaRol(u.rol)}</span></td>
                    <td className="mini">{u.activo ? 'Activo' : 'Inactivo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="btn btn-borde btn-mini" style={{ marginTop: 10 }}
          onClick={recargarUsuarios}>
          Actualizar
        </button>
      </div>

      <div className="panel">
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Invitaciones recientes</h3>
        {!invitaciones?.length && <p className="mini">Todavía no hay invitaciones.</p>}
        {invitaciones?.map((i) => {
          const usada = !!i.usado_en;
          const vencida = !usada && new Date(i.expira_en) < new Date();
          let estado = 'Pendiente';
          if (usada) estado = 'Usada';
          else if (vencida) estado = 'Vencida';
          return (
            <div key={i.id} style={{ display: 'flex', gap: 13, padding: '10px 0', borderBottom: '1px solid #E2EAE9' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5 }}>
                  <strong>{etiquetaRol(i.rol)}</strong>
                  <span className="mini"> · {estado}</span>
                </div>
                <div className="mini">
                  Creada {new Date(i.creado_en).toLocaleString('es-GT')}
                  {i.usado_por_nombre ? ` · usada por ${i.usado_por_nombre}` : ''}
                  {!usada && !vencida
                    ? ` · vence ${new Date(i.expira_en).toLocaleDateString('es-GT')}`
                    : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
