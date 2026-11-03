/**
 * Canales de impresión desacoplados del cobro.
 *
 * Impresora objetivo: Sigma portátil 58 mm (SKU 1EFEE47253).
 * Chrome en Android no habla Bluetooth clásico/SPP. El puente es RawBT.
 * En escritorio: PDF de 58 mm por USB.
 */

import { componerEscPos } from './escpos';
import { IMPRESORA } from './perfil';
import { imprimirRecibo as imprimirPdf, descargarRecibo } from '../recibo-pdf';

function esAndroid() {
  return /Android/i.test(navigator.userAgent || '');
}

function aBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function canalRawBt(bytes) {
  const uri = IMPRESORA.puenteAndroid.esquema + ':base64,' + aBase64(bytes);
  const intent =
    'intent://print/#Intent;scheme=' + IMPRESORA.puenteAndroid.esquema +
    ';package=' + IMPRESORA.puenteAndroid.paquete + ';end';
  try {
    window.location.href = uri;
    return {
      ok: true,
      canal: 'rawbt',
      impresora: IMPRESORA.etiqueta,
      mensaje:
        'Se envió el recibo a ' + IMPRESORA.puenteAndroid.nombre +
        ' para la ' + IMPRESORA.etiqueta +
        '. Si no salió papel, reimprima. El cobro no se duplica.',
    };
  } catch {
    window.location.href = intent;
    return {
      ok: true,
      canal: 'rawbt',
      impresora: IMPRESORA.etiqueta,
      mensaje: 'Abra ' + IMPRESORA.puenteAndroid.nombre + ' para completar la impresión.',
    };
  }
}

async function canalCompartir(bytes, recibo) {
  const archivo = new File([bytes], 'recibo-' + recibo.correlativo + '.bin', {
    type: 'application/octet-stream',
  });
  if (!navigator.share || !navigator.canShare || !navigator.canShare({ files: [archivo] })) {
    return null;
  }
  await navigator.share({
    files: [archivo],
    title: 'Recibo N.º ' + recibo.correlativo,
  });
  return {
    ok: true,
    canal: 'share',
    impresora: IMPRESORA.etiqueta,
    mensaje: 'Elija ' + IMPRESORA.puenteAndroid.nombre + ' para imprimir en la ' + IMPRESORA.etiqueta + '.',
  };
}

export async function imprimirReciboTermico(recibo) {
  if (!recibo) throw new Error('No hay recibo para imprimir.');
  const bytes = componerEscPos(recibo);

  if (esAndroid()) {
    try {
      const compartido = await canalCompartir(bytes, recibo);
      if (compartido) return compartido;
    } catch (e) {
      if (e && e.name === 'AbortError') {
        return {
          ok: false,
          canal: 'share',
          impresora: IMPRESORA.etiqueta,
          mensaje: 'La impresión se canceló. El recibo no se duplicó.',
        };
      }
    }
    return canalRawBt(bytes);
  }

  imprimirPdf(recibo);
  return {
    ok: true,
    canal: 'pdf',
    impresora: IMPRESORA.etiqueta,
    mensaje:
      'Se abrió el PDF de 58 mm. En este equipo puede enviarlo a la ' +
      IMPRESORA.etiqueta + ' por USB, o guardarlo.',
  };
}

export function guardarPdfRecibo(recibo) {
  descargarRecibo(recibo);
}
