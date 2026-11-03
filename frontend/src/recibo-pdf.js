/**
 * GENERACIÓN DEL RECIBO EN PDF
 * ---------------------------------------------------------------------------
 * Implementa RF-04.6 usando jsPDF, conforme al marco teórico del proyecto.
 *
 * IMPORTANTE (ADR-05)
 * Este módulo NO calcula nada. Recibe del servidor el correlativo, el desglose
 * y el total ya resueltos, y se limita a darles formato. Si el cálculo se
 * hiciera aquí, cualquiera podría alterar el monto desde el navegador y el
 * recibo dejaría de ser un documento confiable.
 */

import { jsPDF } from 'jspdf';
import { quetzales, metrosCubicos } from './api';
import { IMPRESORA } from './impresion/perfil';

const ANCHO = IMPRESORA.papelMm;
const ALTO = 160;
const MARGEN = 5;

/**
 * Dibuja un recibo sobre la página actual del documento.
 * Se mantiene como función única para que el recibo individual y el lote
 * del periodo salgan siempre idénticos.
 *
 * @param {jsPDF} doc  documento destino, con la página ya creada
 * @param {object} r   respuesta de api.recibo(id)
 */
function dibujarRecibo(doc, r) {
  let y = 10;
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(255, 255, 255);

  const centrar = (texto, tamano, negrita) => {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(tamano);
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.text(texto, ANCHO / 2, y, { align: 'center' });
    y += tamano * 0.42 + 1.2;
  };

  const fila = (etiqueta, valor, negrita) => {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(String(etiqueta), MARGEN, y);
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.text(String(valor), ANCHO - MARGEN, y, { align: 'right' });
    y += 4.2;
  };

  const separador = () => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(MARGEN, y, ANCHO - MARGEN, y);
    y += 3.5;
  };

  const junta = r.junta || {};

  // ------------------------------------------------------------ encabezado --
  centrar(junta.junta_nombre || 'Comité de Agua', 9, true);
  centrar(junta.junta_direccion || 'Parcelamiento Santa Fe, Retalhuleu', 7);
  if (junta.junta_telefono) centrar('Tel. ' + junta.junta_telefono, 7);
  y += 1;
  centrar('RECIBO N.\u00BA ' + r.correlativo, 10, true);
  if (r.emitidoEn) centrar(new Date(r.emitidoEn).toLocaleString('es-GT'), 7);
  y += 1;
  separador();

  // -------------------------------------------------------------- usuario --
  fila('Usuario', r.titular);
  fila('Conexión', r.conexion);
  if (r.direccion) fila('Dirección', r.direccion);
  if (r.sector) fila('Sector', r.sector);
  fila('Periodo', r.periodo);
  separador();

  // -------------------------------------------------------------- lectura --
  if (r.lecturaActual !== null && r.lecturaActual !== undefined) {
    fila('Lectura anterior', metrosCubicos(r.lecturaAnterior));
    fila('Lectura actual', metrosCubicos(r.lecturaActual));
    fila('Consumo', metrosCubicos(r.desglose.consumoLitros));
  } else {
    fila('Modalidad', 'Cuota fija');
  }
  separador();

  // -------------------------------------------------------------- desglose --
  // Las líneas vienen calculadas por el servidor: aquí solo se imprimen.
  (r.lineas || []).forEach(([etiqueta, valor]) => fila(etiqueta, valor));
  separador();

  // ----------------------------------------------------------------- total --
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(MARGEN, y - 1.2, ANCHO - MARGEN, y - 1.2);
  y += 2.2;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL A PAGAR', MARGEN, y + 1.2);
  doc.setFontSize(12);
  doc.text(quetzales(r.desglose.totalCentavos), ANCHO - MARGEN, y + 1.6, { align: 'right' });
  y += 7;
  doc.setLineWidth(0.4);
  doc.line(MARGEN, y, ANCHO - MARGEN, y);
  y += 5;

  if (r.fechaVencimiento) {
    fila('Vence el', new Date(r.fechaVencimiento).toLocaleDateString('es-GT'), true);
  }
  fila('Estado', r.estado === 'PAGADO' ? 'Pagado' : r.estado === 'PARCIAL' ? 'Pago parcial' : 'Pendiente', true);
  if (r.saldoCentavos > 0 && r.estado !== 'PAGADO') {
    fila('Saldo', quetzales(r.saldoCentavos));
  }
  if (r.tesorero) fila('Tesorero', r.tesorero);
  y += 2;

  // ------------------------------------------------------------------ pie --
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('Gracias por su pago.', ANCHO / 2, y, { align: 'center' });
  y += 4;
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Conserve este recibo. Es un documento de control interno del Comité de Agua.',
    ANCHO / 2, y, { align: 'center', maxWidth: ANCHO - MARGEN * 2 });
}

/** Documento de un solo recibo. */
export function componerRecibo(r) {
  const doc = new jsPDF({ unit: 'mm', format: [ANCHO, ALTO] });
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, ANCHO, ALTO, 'F');
  dibujarRecibo(doc, r);
  return doc;
}

/** Abre el diálogo de impresión del navegador. */
export function imprimirRecibo(r) {
  const doc = componerRecibo(r);
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}

/** Descarga el recibo como archivo. */
export function descargarRecibo(r) {
  componerRecibo(r).save('recibo-' + r.correlativo + '-' + r.conexion + '.pdf');
}

/**
 * Genera un solo PDF con todos los recibos del periodo (RF-04.9),
 * una página por recibo, en el orden en que se reciben.
 */
export function descargarLotePeriodo(recibos, nombrePeriodo) {
  if (!recibos || !recibos.length) return;

  const doc = new jsPDF({ unit: 'mm', format: [ANCHO, ALTO] });
  recibos.forEach((r, i) => {
    if (i > 0) doc.addPage([ANCHO, ALTO]);
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, ANCHO, ALTO, 'F');
    dibujarRecibo(doc, r);
  });

  doc.save('recibos-' + String(nombrePeriodo).replace(/\//g, '-') + '.pdf');
}
