/**
 * Cobro (tesorero).
 * Busca al usuario, ve el estado de cuenta, recibe pagos, emite e imprime
 * recibos. Reimprimir no vuelve a facturar.
 */

import { useEffect, useRef, useState } from 'react';
import { api, aLitrosDesdeMetros, metrosCubicos, metrosParaCampo, quetzales, sanitizarMetros } from '../api';
import { puede } from '../permisos';
import { Aviso, Cargando, Medidor } from '../componentes/Comunes';
import { AbrirPeriodo } from '../componentes/AbrirPeriodo';
import { imprimirReciboTermico, guardarPdfRecibo } from '../impresion/canales';
import { Tesoreria } from './Modulos';

function etiquetaEstado(estado) {
  if (estado === 'PAGADO') return 'Pagado';
  if (estado === 'PARCIAL') return 'Pago parcial';
  if (estado === 'VENCIDO') return 'Vencido';
  return 'Pendiente';
}

export default function Cobro({ usuario, avisar }) {
  const [paso, setPaso] = useState('buscar');
  const [q, setQ] = useState('');
  const [todos, setTodos] = useState([]);
  const [buscando, setBuscando] = useState(true);
  const [periodoInfo, setPeriodoInfo] = useState(null);
  const [ficha, setFicha] = useState(null);
  const [lectura, setLectura] = useState('');
  const [preview, setPreview] = useState(null);
  const [cobrar, setCobrar] = useState(true);
  const [recibo, setRecibo] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [impresion, setImpresion] = useState(null);
  const inputRef = useRef(null);

  function cargarPeriodo() {
    api.periodoActual()
      .then(setPeriodoInfo)
      .catch(() => setPeriodoInfo(null));
  }

  useEffect(() => {
    let vivo = true;
    setBuscando(true);
    api.cobroBuscar('')
      .then((filas) => { if (vivo) setTodos(filas); })
      .catch((e) => { if (vivo) avisar(e.message, true); })
      .finally(() => { if (vivo) setBuscando(false); });
    api.periodoActual()
      .then((p) => { if (vivo) setPeriodoInfo(p); })
      .catch(() => { if (vivo) setPeriodoInfo(null); });
    return () => { vivo = false; };
  }, [avisar]);

  const puedeAbrir = Boolean(usuario && puede(usuario.rol, 'abrir_periodo'));
  const sinPeriodo = !periodoInfo?.periodo;

  const texto = q.trim().toLowerCase();
  const resultados = !texto
    ? todos
    : todos.filter((c) =>
      [c.titular, c.codigo, c.sector, c.direccion, c.medidor_serie]
        .join(' ')
        .toLowerCase()
        .includes(texto)
    );

  async function abrir(id) {
    setOcupado(true);
    try {
      const datos = await api.cobroFicha(id);
      setFicha(datos);
      setLectura(datos.lecturaPeriodo ? metrosParaCampo(datos.lecturaPeriodo.lectura_actual) : '');
      setPreview(null);
      setImpresion(null);
      setCobrar(true);
      let cargado = null;
      if (datos.reciboPeriodo) {
        cargado = await api.recibo(datos.reciboPeriodo.id);
      } else if (datos.recibos && datos.recibos[0]) {
        cargado = await api.recibo(datos.recibos[0].id);
      }
      setRecibo(cargado);
      setPaso('cuenta');
    } catch (e) {
      avisar(e.message, true);
    } finally {
      setOcupado(false);
    }
  }

  async function recargarFicha() {
    if (!ficha) return;
    const datos = await api.cobroFicha(ficha.conexion.id);
    setFicha(datos);
    if (datos.reciboPeriodo) {
      setRecibo(await api.recibo(datos.reciboPeriodo.id));
    }
    return datos;
  }

  async function volverCuenta() {
    setOcupado(true);
    try {
      await recargarFicha();
    } catch (e) {
      avisar(e.message, true);
    } finally {
      setPaso('cuenta');
      setOcupado(false);
    }
  }

  async function armarPreview(datosFicha, lecturaActual) {
    const d = datosFicha || ficha;
    const r = await api.cobroPreview({
      conexionId: d.conexion.id,
      lecturaActual: d.conexion.modalidad === 'MEDIDA' ? aLitrosDesdeMetros(lecturaActual) : undefined,
    });
    if (r.yaEmitido) {
      setRecibo(r.recibo);
      setPaso('resultado');
      avisar(r.mensaje);
      return r;
    }
    setPreview(r);
    setPaso('confirmar');
    return r;
  }

  async function irAEmitir() {
    if (!ficha.periodo) {
      avisar('No hay un periodo abierto para facturar. Ábralo usted desde este mismo cobro.', true);
      return;
    }
    if (ficha.conexion.modalidad === 'CUOTA_FIJA') {
      setOcupado(true);
      try {
        await armarPreview(ficha, '');
      } catch (err) {
        avisar(err.message, true);
      } finally {
        setOcupado(false);
      }
      return;
    }
    setPaso('lectura');
  }

  async function irAConfirmar(e) {
    e.preventDefault();
    if (ficha.conexion.modalidad === 'MEDIDA') {
      const n = aLitrosDesdeMetros(lectura);
      if (n == null) return avisar('Indique la lectura actual en m³.', true);
    }
    setOcupado(true);
    try {
      await armarPreview(ficha, lectura);
    } catch (err) {
      avisar(err.message, true);
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await api.cobroConfirmar({
        conexionId: ficha.conexion.id,
        lecturaActual: ficha.conexion.modalidad === 'MEDIDA' ? aLitrosDesdeMetros(lectura) : undefined,
        cobrar: cobrar,
      });
      setRecibo(r.recibo);
      setFicha({
        ...ficha,
        reciboPeriodo: {
          id: r.recibo.id,
          correlativo: r.recibo.correlativo,
          total_centavos: r.recibo.desglose?.totalCentavos,
          saldo_centavos: r.recibo.saldoCentavos,
          estado: r.recibo.estado,
        },
      });
      setPaso('resultado');
      avisar(r.mensaje);
    } catch (err) {
      avisar(err.message, true);
    } finally {
      setOcupado(false);
    }
  }

  async function imprimir() {
    if (!recibo) return;
    setOcupado(true);
    try {
      const r = await imprimirReciboTermico(recibo);
      setImpresion(r);
      avisar(r.mensaje, !r.ok);
    } catch (err) {
      setImpresion({ ok: false, mensaje: err.message });
      avisar(err.message, true);
    } finally {
      setOcupado(false);
    }
  }

  function volverLista() {
    setPaso('buscar');
    setFicha(null);
    setPreview(null);
    setRecibo(null);
    setImpresion(null);
  }

  const puedeEmitir = Boolean(ficha && ficha.periodo && !ficha.reciboPeriodo);
  const periodoEtiqueta = ficha?.periodo
    ? String(ficha.periodo.mes).padStart(2, '0') + '/' + ficha.periodo.anio
    : null;

  if (ocupado && paso === 'buscar' && !ficha) return <Cargando texto="Cargando…" />;

  return (
    <div className="cobro">
      {paso === 'cuenta' && (
        <button type="button" className="lectura-volver" onClick={volverLista}>
          ← Volver al listado
        </button>
      )}
      {paso !== 'buscar' && paso !== 'cuenta' && (
        <button type="button" className="lectura-volver" onClick={volverCuenta}>
          ← Volver a la cuenta
        </button>
      )}

      {paso === 'buscar' && (
        <>
          <p className="eyebrow">{todos.length} registros</p>
          <h2 className="titulo">Cobro</h2>
          <p className="subtitulo">
            Pulse un padrón para ver el estado de cuenta, recibir el pago e imprimir el recibo.
          </p>
          {puedeAbrir && sinPeriodo && (
            <>
              <Aviso tipo="ambar">
                No hay un periodo abierto. Ábralo usted para que el fontanero tome
                lecturas y usted pueda emitir recibos del mes.
              </Aviso>
              <AbrirPeriodo
                siguiente={periodoInfo?.siguiente}
                avisar={avisar}
                alAbrir={cargarPeriodo}
              />
            </>
          )}
          <div className="lectura-buscar cobro-buscar">
            <span className="lectura-buscar-icono" aria-hidden="true">⌕</span>
            <input
              className="campo lectura-buscar-campo"
              type="search"
              autoComplete="off"
              placeholder="Filtrar por nombre, código, medidor o dirección…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="lectura-lista panel">
            {buscando && <p className="mini" style={{ padding: 12 }}>Cargando padrones…</p>}
            {resultados.length === 0 && !buscando && (
              <div className="lectura-vacio-filtro">
                <p className="vacio-titulo">{texto ? 'Sin coincidencias' : 'No hay padrones'}</p>
                <p className="mini">
                  {texto
                    ? 'Nada coincide con «' + q.trim() + '».'
                    : 'Registre padrones en Padrón para poder cobrar.'}
                </p>
              </div>
            )}
            {resultados.map((c) => (
              <button
                key={c.id}
                type="button"
                className="lectura-resultado"
                onClick={() => abrir(c.id)}
              >
                <span className="lectura-resultado-cuerpo">
                  <span className="lectura-resultado-linea">
                    <span className="lectura-resultado-nombre">{c.titular}</span>
                    <span className="lectura-resultado-codigo">{c.codigo}</span>
                  </span>
                  <span className="lectura-resultado-meta">
                    {(c.direccion || c.sector || 'Sin dirección')}
                    {Number(c.saldo_pendiente) > 0
                      ? ' · Debe ' + quetzales(Number(c.saldo_pendiente))
                      : ' · Al día'}
                  </span>
                </span>
                <span className="lectura-resultado-flecha" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </>
      )}

      {paso === 'cuenta' && ficha && (
        <div className="cobro-cuenta">
          <p className="eyebrow">{ficha.conexion.codigo}</p>
          <h2 className="titulo">{ficha.conexion.titular}</h2>
          <p className="subtitulo">
            {[ficha.conexion.sector, ficha.conexion.direccion].filter(Boolean).join(' · ')
              || 'Sin dirección'}
            {periodoEtiqueta ? ' · Periodo ' + periodoEtiqueta : ''}
          </p>

          {!ficha.periodo && (
            <>
              <Aviso tipo="ambar">
                No hay un periodo abierto para facturar. Puede recibir pagos e imprimir
                recibos ya emitidos. Ábralo usted para que el fontanero tome lecturas.
              </Aviso>
              {puedeAbrir && (
                <AbrirPeriodo
                  siguiente={periodoInfo?.siguiente}
                  avisar={avisar}
                  alAbrir={async () => {
                    cargarPeriodo();
                    await recargarFicha();
                  }}
                  compacto
                />
              )}
            </>
          )}

          <div className="cobro-acciones">
            {puedeEmitir && (
              <button
                type="button"
                className="btn btn-primario cobro-btn"
                onClick={irAEmitir}
                disabled={ocupado}
              >
                {ficha.conexion.modalidad === 'CUOTA_FIJA'
                  ? 'Emitir recibo del periodo'
                  : 'Registrar lectura y emitir recibo'}
              </button>
            )}
            {recibo && (
              <button
                type="button"
                className={'btn cobro-btn ' + (puedeEmitir ? 'btn-borde' : 'btn-primario')}
                onClick={() => setPaso('resultado')}
              >
                {ficha.reciboPeriodo ? 'Ver e imprimir recibo del periodo' : 'Ver e imprimir último recibo'}
              </button>
            )}
          </div>

          {ficha.conexion.modalidad === 'MEDIDA' && (
            <div className="panel cobro-lecturas">
              <div className="panel-titulo">Lecturas</div>
              <div className="cobro-lecturas-cifras">
                <Medidor
                  valor={ficha.lecturaPeriodo?.lectura_anterior ?? ficha.lecturaAnterior}
                  etiqueta="Lectura anterior"
                />
                {ficha.lecturaPeriodo ? (
                  <Medidor
                    valor={ficha.lecturaPeriodo.lectura_actual}
                    etiqueta="Lectura actual"
                  />
                ) : (
                  <div className="cifra-lectura">
                    <span className="cifra-lectura-etq">Lectura actual</span>
                    <p className="cifra-lectura-valor cifra-lectura-pendiente">Pendiente</p>
                  </div>
                )}
              </div>
              {ficha.lecturaPeriodo ? (
                <p className="mini" style={{ marginTop: 12 }}>
                  Consumo del mes: {metrosCubicos(ficha.lecturaPeriodo.consumo_litros)}.
                </p>
              ) : (
                <p className="mini" style={{ marginTop: 12 }}>
                  Todavía no hay lectura de este periodo. Pulse «Registrar lectura y emitir recibo»
                  o tome la lectura en Lecturas.
                </p>
              )}
            </div>
          )}

          <Tesoreria conexionId={ficha.conexion.id} avisar={avisar} compacto />
        </div>
      )}

      {ficha && paso === 'lectura' && (
        <form onSubmit={irAConfirmar} className="cobro-captura">
          <div className="lectura-ficha">
            <div className="lectura-ficha-top">
              <span className="lectura-codigo">{ficha.conexion.codigo}</span>
              {ficha.conexion.sector && <span className="lectura-chip">{ficha.conexion.sector}</span>}
            </div>
            <h2 className="lectura-titular">{ficha.conexion.titular}</h2>
            <p className="lectura-sector">
              {ficha.conexion.direccion || 'Sin dirección'} · Lectura anterior {metrosCubicos(ficha.lecturaAnterior)}
            </p>
          </div>
          <label htmlFor="cobro-lectura">Lectura actual</label>
          <div className="campo-lectura-caja">
            <input
              id="cobro-lectura"
              ref={inputRef}
              className="campo-lectura"
              inputMode="decimal"
              maxLength={8}
              placeholder=""
              value={lectura}
              onChange={(e) => setLectura(sanitizarMetros(e.target.value))}
              autoFocus
            />
            <span className="campo-lectura-unidad" aria-hidden="true">m³</span>
          </div>
          <button className="btn btn-primario cobro-btn" type="submit" disabled={ocupado}>
            {ocupado ? 'Calculando…' : 'Calcular importe'}
          </button>
        </form>
      )}

      {paso === 'confirmar' && preview && (
        <div className="cobro-confirma">
          <p className="eyebrow">Confirme antes de registrar</p>
          <h2 className="titulo">{preview.titular}</h2>
          <p className="subtitulo">{preview.conexion} · Periodo {preview.periodo}</p>
          {preview.advertencia && <Aviso tipo="ambar">{preview.advertencia}</Aviso>}
          <div className="panel">
            {preview.lecturaActual != null && (
              <>
                <p className="mini">Lectura anterior {metrosCubicos(preview.lecturaAnterior)} · actual {metrosCubicos(preview.lecturaActual)}</p>
                <p className="tablero-cifra num">{metrosCubicos(preview.consumoLitros)}</p>
              </>
            )}
            <p className="cobro-total num">{quetzales(preview.desglose.totalCentavos)}</p>
            {(preview.lineas || []).map((par) => (
              <p key={par[0]} className="cobro-linea"><span>{par[0]}</span><strong>{par[1]}</strong></p>
            ))}
            <p className="mini">Total a pagar según la tarifa vigente. Todavía no se ha guardado nada.</p>
            <label className="cobro-check">
              <input type="checkbox" checked={cobrar} onChange={(e) => setCobrar(e.target.checked)} />
              Registrar cobro en efectivo por el total
            </label>
            <p className="mini">
              Si no marca el cobro, el recibo queda pendiente. El estado «Pagado» solo aparece
              cuando el pago se guarda en el servidor.
            </p>
          </div>
          <button className="btn btn-primario cobro-btn" type="button" onClick={confirmar} disabled={ocupado}>
            {ocupado ? 'Guardando…' : 'Confirmar y emitir recibo'}
          </button>
          <button
            className="btn btn-borde cobro-btn"
            type="button"
            onClick={() => setPaso(ficha.conexion.modalidad === 'CUOTA_FIJA' ? 'cuenta' : 'lectura')}
            disabled={ocupado}
          >
            {ficha.conexion.modalidad === 'CUOTA_FIJA' ? 'Volver a la cuenta' : 'Volver a la lectura'}
          </button>
        </div>
      )}

      {paso === 'resultado' && recibo && (
        <div className="cobro-resultado">
          <p className="eyebrow">Recibo N.º {recibo.correlativo}</p>
          <h2 className="titulo">{recibo.titular}</h2>
          <p className="subtitulo">{recibo.conexion} · Periodo {recibo.periodo}</p>
          <div className="rejilla c2" style={{ marginBottom: 16 }}>
            <div className="indicador">
              <div className="etq">Consumo</div>
              <div className="val num">
                {recibo.lecturaActual != null ? metrosCubicos(recibo.desglose.consumoLitros) : 'Cuota fija'}
              </div>
            </div>
            <div className="indicador">
              <div className="etq">Total</div>
              <div className="val num">{quetzales(recibo.desglose.totalCentavos)}</div>
            </div>
          </div>
          <p className="cobro-estado">
            Cobro: <strong>{etiquetaEstado(recibo.estado)}</strong>
            {recibo.tesorero ? ' · ' + recibo.tesorero : ''}
          </p>
          {impresion && (
            <Aviso tipo={impresion.ok ? 'info' : 'ambar'}>{impresion.mensaje}</Aviso>
          )}
          <button className="btn btn-primario cobro-btn" type="button" onClick={imprimir} disabled={ocupado}>
            {impresion ? 'Reimprimir recibo' : 'Imprimir recibo'}
          </button>
          <p className="mini" style={{ marginTop: 6 }}>
            Impresora configurada: Sigma 58 mm (SKU 1EFEE47253). Reimprimir no duplica el cobro.
          </p>
          <button className="btn btn-borde cobro-btn" type="button" onClick={() => guardarPdfRecibo(recibo)}>
            Guardar PDF
          </button>
          {recibo.saldoCentavos > 0 && (
            <button
              className="btn btn-borde cobro-btn"
              type="button"
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                try {
                  const r = await api.cobroConfirmar({
                    conexionId: ficha.conexion.id,
                    cobrar: true,
                  });
                  setRecibo(r.recibo);
                  avisar(r.mensaje);
                } catch (err) {
                  avisar(err.message, true);
                } finally {
                  setOcupado(false);
                }
              }}
            >
              Registrar cobro ahora
            </button>
          )}
        </div>
      )}
    </div>
  );
}
