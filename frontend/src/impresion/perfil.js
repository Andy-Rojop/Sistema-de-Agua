/**
 * Impresora objetivo del sistema.
 *
 * Sigma térmica portátil 58 mm · USB · Bluetooth · ESC/POS.
 * SKU: 1EFEE47253
 *
 * El recibo (tarifas, correlativo, cobro) no depende de este archivo.
 * Si cambia el hardware, se adapta aquí y en canales.js.
 */

export const IMPRESORA = {
  marca: 'Sigma',
  modelo: 'Portatil 58 mm',
  sku: '1EFEE47253',
  etiqueta: 'Sigma 58 mm',
  papelMm: 58,
  puntosAncho: 384,
  dpi: 203,
  columnas: 32,
  fuente: 'A',
  comandos: 'ESC/POS',
  paginaCodigo: 'CP850',
  /** Portátil 58 mm: avance para rasgado (sin cortador automático). */
  corte: 'avance-rasgado',
  graficosRawBt: 'GS v 0',
  canales: {
    android: 'bluetooth-spp',
    escritorio: 'usb-pdf',
  },
  puenteAndroid: {
    nombre: 'RawBT',
    paquete: 'ru.a402d.rawbtprinter',
    esquema: 'rawbt',
  },
};

export function nombreImpresora() {
  return IMPRESORA.etiqueta;
}
