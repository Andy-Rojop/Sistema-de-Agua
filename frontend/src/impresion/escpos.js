/**
 * Comandos ESC/POS para la Sigma portátil 58 mm (384 puntos, Font A, 32 cols).
 * SKU 1EFEE47253. No calcula montos: formatea lo que ya vino del servidor.
 */

import { quetzales, metrosCubicos } from '../api';
import { IMPRESORA } from './perfil';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const ANCHO = IMPRESORA.columnas;

function encoder() {
  const partes = [];
  const push = function () {
    for (let i = 0; i < arguments.length; i++) partes.push(arguments[i] & 0xff);
  };
  return {
    raw: push,
    init() {
      push(ESC, 0x40);
      push(ESC, 0x74, 2);
      push(ESC, 0x52, 12);
      push(ESC, 0x4d, 0);
      return this;
    },
    align(cual) {
      const n = cual === 'center' ? 1 : cual === 'right' ? 2 : 0;
      push(ESC, 0x61, n);
      return this;
    },
    bold(on) { push(ESC, 0x45, on ? 1 : 0); return this; },
    size(n) { push(GS, 0x21, n); return this; },
    text(s) {
      const t = String(s == null ? '' : s);
      for (let i = 0; i < t.length; i++) {
        const c = t.charCodeAt(i);
        if (c === 0x0a) push(LF);
        else if (c < 128) push(c);
        else push(latin(c));
      }
      return this;
    },
    line(s) { this.text(s); push(LF); return this; },
    sep() { this.line('-'.repeat(ANCHO)); return this; },
    cut() {
      // Sin cortador: avanza papel para rasgar en la Sigma portátil 58 mm.
      push(LF, LF, LF, LF);
      return this;
    },
    bytes() { return Uint8Array.from(partes); },
  };
}

function latin(code) {
  const map = {
    0xC1: 0xB5, 0xC9: 0x90, 0xCD: 0xD6, 0xD3: 0xE0, 0xDA: 0xE9, 0xD1: 0xA5,
    0xE1: 0xA0, 0xE9: 0x82, 0xED: 0xA1, 0xF3: 0xA2, 0xFA: 0xA3, 0xF1: 0xA4,
    0xFC: 0x81, 0xB0: 0xF8, 0xBF: 0xA8, 0xA1: 0xAD, 0xAA: 0xA6, 0xBA: 0xA7,
  };
  if (code === 0xB3) return 0x33;
  return map[code] || 0x3F;
}

function fila(doc, etiqueta, valor) {
  const izq = String(etiqueta);
  const der = String(valor);
  const hueco = Math.max(1, ANCHO - izq.length - der.length);
  doc.line(izq + ' '.repeat(hueco) + der);
}

function estadoEtiqueta(estado) {
  if (estado === 'PAGADO') return 'PAGADO';
  if (estado === 'PARCIAL') return 'PAGO PARCIAL';
  if (estado === 'VENCIDO') return 'VENCIDO';
  return 'PENDIENTE';
}

export function componerEscPos(r) {
  const doc = encoder().init();
  const junta = r.junta || {};

  doc.align('center').bold(true).size(0x11);
  doc.line(junta.junta_nombre || 'Comité de Agua');
  doc.size(0).bold(false);
  if (junta.junta_direccion) doc.line(junta.junta_direccion);
  if (junta.junta_telefono) doc.line('Tel. ' + junta.junta_telefono);
  doc.line('Agua potable · Parcelamiento Santa Fe');
  doc.sep();
  doc.bold(true).size(0x11).line('RECIBO N. ' + r.correlativo);
  doc.size(0).bold(false);
  if (r.emitidoEn) {
    doc.line(new Date(r.emitidoEn).toLocaleString('es-GT'));
  }
  doc.align('left').sep();

  fila(doc, 'Usuario', r.titular);
  fila(doc, 'Codigo', r.conexion);
  if (r.direccion) fila(doc, 'Direccion', r.direccion);
  if (r.sector) fila(doc, 'Sector', r.sector);
  fila(doc, 'Periodo', r.periodo);
  doc.sep();

  if (r.lecturaActual != null) {
    fila(doc, 'Lect. anterior', metrosCubicos(r.lecturaAnterior).replace('³', '3'));
    fila(doc, 'Lect. actual', metrosCubicos(r.lecturaActual).replace('³', '3'));
    fila(doc, 'Consumo', metrosCubicos(r.desglose.consumoLitros).replace('³', '3'));
  } else {
    fila(doc, 'Modalidad', 'Cuota fija');
  }
  doc.sep();

  (r.lineas || []).forEach(function (par) { fila(doc, par[0], par[1]); });
  doc.sep();
  doc.bold(true);
  fila(doc, 'TOTAL', quetzales(r.desglose.totalCentavos));
  doc.bold(false);
  fila(doc, 'Estado', estadoEtiqueta(r.estado));
  if (r.saldoCentavos > 0 && r.estado !== 'PAGADO') {
    fila(doc, 'Saldo', quetzales(r.saldoCentavos));
  }
  if (r.fechaVencimiento) {
    fila(doc, 'Vence', new Date(r.fechaVencimiento).toLocaleDateString('es-GT'));
  }
  if (r.tesorero) fila(doc, 'Tesorero', r.tesorero);
  doc.sep();
  doc.align('center');
  doc.line('Gracias por su pago.');
  doc.line('Conserve este recibo.');
  doc.line('');
  doc.cut();
  return doc.bytes();
}
