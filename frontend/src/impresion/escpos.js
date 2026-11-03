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
      push(LF, LF, LF, LF);
      return this;
    },
    bytes() { return Uint8Array.from(partes); },
  };
}

/** Símbolos que en CP850/58 mm salen como "?" → ASCII seguro. */
function sanear(s) {
  return String(s == null ? '' : s)
    .replace(/\u00B7/g, '-')   // ·
    .replace(/\u00D7/g, 'x')   // ×
    .replace(/\u2212/g, '-')   // −
    .replace(/\u00B3/g, '3')   // ³
    .replace(/\u2013|\u2014/g, '-');
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

/** Parte por palabras; no corta a mitad de palabra. */
function envolver(texto, ancho) {
  const limpio = sanear(texto).trim();
  if (!limpio) return [''];
  const palabras = limpio.split(/\s+/);
  const out = [];
  let linea = '';
  for (let i = 0; i < palabras.length; i++) {
    let p = palabras[i];
    while (p.length > ancho) {
      if (linea) { out.push(linea); linea = ''; }
      out.push(p.slice(0, ancho));
      p = p.slice(ancho);
    }
    if (!linea) linea = p;
    else if (linea.length + 1 + p.length <= ancho) linea += ' ' + p;
    else { out.push(linea); linea = p; }
  }
  if (linea) out.push(linea);
  return out;
}

function lineasCentradas(doc, texto, ancho) {
  envolver(texto, ancho).forEach(function (l) { doc.line(l); });
}

function fila(doc, etiqueta, valor) {
  const izq = sanear(etiqueta);
  const der = sanear(valor);
  if (izq.length + 1 + der.length <= ANCHO) {
    const hueco = Math.max(1, ANCHO - izq.length - der.length);
    doc.line(izq + ' '.repeat(hueco) + der);
    return;
  }
  envolver(izq, ANCHO).forEach(function (l) { doc.line(l); });
  const pad = Math.max(0, ANCHO - der.length);
  doc.line(' '.repeat(pad) + der);
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

  // 58 mm: sin doble ancho en el encabezado (con 0x11 solo caben ~16 caracteres).
  const titulo = junta.junta_nombre
    || 'Comité de Agua Potable, Parcelamiento Santa Fé';
  doc.align('center').bold(true).size(0);
  lineasCentradas(doc, titulo, ANCHO);
  doc.bold(false);
  if (junta.junta_telefono) lineasCentradas(doc, 'Tel. ' + junta.junta_telefono, ANCHO);
  doc.sep();

  doc.bold(true).size(0x11);
  lineasCentradas(doc, 'RECIBO N. ' + r.correlativo, Math.floor(ANCHO / 2));
  doc.size(0).bold(false);
  if (r.emitidoEn) {
    lineasCentradas(doc, new Date(r.emitidoEn).toLocaleString('es-GT'), ANCHO);
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
