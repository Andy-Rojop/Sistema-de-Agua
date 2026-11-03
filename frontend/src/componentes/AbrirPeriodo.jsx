import { useState } from 'react';
import { api } from '../api';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function etiquetaPeriodo(p) {
  if (!p) return '';
  return (MESES[p.mes - 1] || p.mes) + ' ' + p.anio;
}

function fechaGt(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-GT');
}

export function AbrirPeriodo({ siguiente, avisar, alAbrir, compacto }) {
  const [abriendo, setAbriendo] = useState(false);
  if (!siguiente) return null;

  async function abrir() {
    setAbriendo(true);
    try {
      await api.abrirPeriodo(siguiente);
      avisar('Periodo abierto: ' + etiquetaPeriodo(siguiente) + '. El fontanero ya puede tomar lecturas.');
      if (alAbrir) alAbrir();
    } catch (e) {
      avisar(e.message, true);
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <div className={compacto ? '' : 'panel'} style={compacto ? { marginTop: 12 } : undefined}>
      {!compacto && (
        <div className="panel-titulo">Abrir {etiquetaPeriodo(siguiente)}</div>
      )}
      <p className="mini" style={{ marginBottom: 12 }}>
        Del {fechaGt(siguiente.fechaInicio)} al {fechaGt(siguiente.fechaFin)}.
        Vencimiento de pago: {fechaGt(siguiente.fechaVencimiento)}.
        Así el fontanero puede registrar las lecturas del mes.
      </p>
      <button type="button" className="btn btn-primario" disabled={abriendo} onClick={abrir}>
        {abriendo ? 'Abriendo…' : 'Abrir ' + etiquetaPeriodo(siguiente)}
      </button>
    </div>
  );
}
