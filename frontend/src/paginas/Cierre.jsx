/**
 * PANTALLA DE CIERRE DE PERIODO (RF-04)
 * ---------------------------------------------------------------------------
 * El cierre es irreversible: congela las lecturas y emite los recibos de todo
 * el mes. Por eso la pantalla hace tres cosas antes de permitirlo:
 *
 *   1. Muestra exactamente qué impide cerrar, conexión por conexión (RN-09).
 *   2. Permite resolver las lecturas inconsistentes sin cambiar de pantalla.
 *   3. Muestra el resumen de lo que se va a emitir antes de confirmar.
 */

import { useState } from 'react';
import { api, quetzales, metrosCubicos } from '../api';
import { Aviso, Cargando, Vacio, Medidor, useCarga } from '../componentes/Comunes';

export default function Cierre({ avisar }) {
  const validacion = useCarga(() => api.validarCierre());
  const inconsistentes = useCarga(() => api.lecturasInconsistentes());
  const [cerrando, setCerrando] = useState(false);

  if (validacion.cargando) return <Cargando texto="Revisando el periodo…" />;
  if (validacion.error) {
    return <Vacio titulo="No hay periodo abierto">{validacion.error}</Vacio>;
  }

  const v = validacion.datos;

  async function resolver(id) {
    const nota = window.prompt(
      'Explique cómo se resolvió esta inconsistencia.\n' +
      'La justificación queda registrada en la bitácora.'
    );
    if (!nota || nota.trim().length < 3) return;
    try {
      await api.resolverInconsistencia(id, nota.trim());
      avisar('Inconsistencia resuelta. Quedó registrada en la bitácora.');
      inconsistentes.recargar();
      validacion.recargar();
    } catch (e) { avisar(e.message, true); }
  }

  async function cerrar() {
    const confirmado = window.confirm(
      '¿Cerrar el periodo?\n\n' +
      'Se emiten los recibos y ya no se podrán modificar las lecturas ni los ' +
      'montos de este mes. Esta acción no se puede deshacer.'
    );
    if (!confirmado) return;

    setCerrando(true);
    try {
      const r = await api.cerrarPeriodo();
      avisar('Periodo cerrado. Se emitieron ' + r.resumen.recibosEmitidos + ' recibos.');
      validacion.recargar();
    } catch (e) {
      avisar(e.message, true);
    } finally {
      setCerrando(false);
    }
  }

  return (
    <>
      <div className="eyebrow">Cierre de periodo</div>
      <h2 className="titulo">Emisión de recibos</h2>
      <p className="subtitulo">Revisión previa antes de facturar el mes.</p>

      {v.puedeCerrar ? (
        <>
          <Aviso tipo="info">
            <div>
              Todo está listo. Se van a emitir{' '}
              <strong>{v.resumen.recibosEmitidos} recibos</strong> por{' '}
              <strong>{quetzales(v.resumen.montoFacturadoCentavos)}</strong>, con
              correlativos del {v.resumen.correlativoInicial} al {v.resumen.correlativoFinal}.
              El consumo total del periodo fue de{' '}
              {metrosCubicos(v.resumen.consumoTotalLitros)}.
            </div>
          </Aviso>

          <div className="panel">
            <div className="panel-titulo">Cerrar el periodo</div>
            <p style={{ fontSize: 14, color: 'var(--tinta-media)' }}>
              Esta acción no se puede deshacer. Al cerrar, las lecturas y los montos
              quedan congelados para siempre. Cualquier corrección posterior se hará
              mediante una nota de ajuste sobre el recibo, que queda registrada.
            </p>
            <div className="fila-btn">
              <button className="btn btn-oscuro btn-grande" onClick={cerrar} disabled={cerrando}>
                {cerrando ? 'Emitiendo recibos…' : 'Cerrar periodo y emitir recibos'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <Aviso tipo="ambar">
            <div>
              <strong>El periodo no se puede cerrar todavía.</strong> Hay{' '}
              {v.impedimentos.length}{' '}
              {v.impedimentos.length === 1 ? 'cosa pendiente' : 'cosas pendientes'}.
              El sistema indica exactamente cuáles, para no tener que buscarlas a mano.
            </div>
          </Aviso>

          <div className="panel">
            <div className="panel-titulo">Qué falta</div>
            {v.impedimentos.map((i, k) => (
              <div key={k} style={{ display: 'flex', gap: 11, padding: '10px 0', borderBottom: '1px solid #E2EAE9' }}>
                <span
                  className={'etiqueta-est ' + (i.tipo === 'SIN_LECTURA' ? 'e-pend' : 'e-aviso')}
                  style={{ flex: 'none', alignSelf: 'flex-start' }}
                >
                  {i.tipo === 'SIN_LECTURA' ? 'Sin lectura' : 'Por revisar'}
                </span>
                <span style={{ fontSize: 13.5 }}>{i.detalle}</span>
              </div>
            ))}
            <button className="btn btn-oscuro btn-grande btn-ancho" disabled style={{ marginTop: 16 }}>
              Cerrar periodo y emitir recibos
            </button>
          </div>
        </>
      )}

      {inconsistentes.datos?.length > 0 && (
        <div className="panel">
          <div className="panel-titulo">Lecturas que necesitan su decisión</div>
          {inconsistentes.datos.map((l) => (
            <div key={l.id} style={{ padding: '14px 0', borderBottom: '1px solid #E2EAE9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14.5 }}>{l.codigo} · {l.titular}</strong>
                <span className="etiqueta-est e-aviso">
                  {l.inconsistencia === 'CONSUMO_EXCESIVO' ? 'Posible fuga'
                    : l.inconsistencia === 'CONSUMO_CERO' ? 'Medidor en cero'
                    : 'Lectura menor'}
                </span>
              </div>
              <div style={{ margin: '9px 0' }}>
                <Medidor valor={l.lectura_actual} chico />
              </div>
              <p className="mini">
                Anterior {metrosCubicos(l.lectura_anterior)} · actual {metrosCubicos(l.lectura_actual)} ·
                consumo {metrosCubicos(l.consumo_litros)}
              </p>
              <div className="fila-btn" style={{ marginTop: 10 }}>
                <button className="btn btn-borde btn-mini" onClick={() => resolver(l.id)}>
                  Confirmar que la lectura está bien
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
