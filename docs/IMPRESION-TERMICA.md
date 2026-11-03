# Impresión térmica — Sigma portátil 58 mm

Impresora objetivo configurada en el sistema. El módulo de impresión está
aparte del cobro (`frontend/src/impresion/`) para cambiar el canal sin tocar
tarifas ni recibos.

## Equipo

| Dato | Valor |
| --- | --- |
| Modelo | **Sigma térmica portátil 58 mm** |
| SKU | **1EFEE47253** |
| Papel | Térmico de **58 mm** (384 puntos, 203 dpi) |
| Comandos | ESC/POS, página de códigos CP850, fuente A, **32 columnas** |
| Corte | Avance de papel para rasgado (sin cortador automático) |
| Bluetooth | SPP hacia Android (no Web Bluetooth de Chrome) |
| USB | Alternativa en computadora (PDF 58 mm o driver de Windows) |
| Puente Android | RawBT (`ru.a402d.rawbtprinter`), gráficos **GS v 0** |

Perfil en código: `frontend/src/impresion/perfil.js`.

## Cómo llega el recibo

```
Sistema web (Chrome)
        ↓  correlativo y desglose ya calculados en el servidor
Teléfono Android del tesorero
        ↓  RawBT (aplicación auxiliar)
Sigma 58 mm (SKU 1EFEE47253)  →  papel térmico de 58 mm
```

Reimprimir **no** crea otra factura ni otro pago.

## Configuración en el teléfono

1. Empareje la **Sigma 58 mm** en Ajustes → Bluetooth.
2. Instale **RawBT** desde Google Play.
3. En RawBT: impresora emparejada, papel **58 mm**, comando de gráfico **GS v 0**.
4. Entre al sistema por **HTTPS** en Chrome.
5. En **Cobro**, confirme la visita y pulse **Imprimir recibo**.
6. Rasgue el papel al terminar el avance.

Si RawBT no abre: instálela y pulse **Reimprimir recibo**. El cobro ya quedó
en el servidor.

RawBT no avisa al navegador si falta papel o la impresora está apagada. El
tesorero lo ve en la Sigma o en RawBT.

## Computadora (USB)

**Imprimir recibo** abre el PDF de 58 mm. Puede enviarlo a la Sigma por USB
si Windows la reconoció, o **Guardar PDF**.

## Base de datos

Un recibo por conexión y periodo:

```
psql "$DATABASE_URL" -f bd/05-recibo-unico-periodo.sql
```

## Prueba en el teléfono

1. Periodo abierto (`EN_LECTURA`).
2. Entre como tesorero.
3. Menú **Cobro**.
4. Busque un usuario, capture la lectura, revise el total, confirme.
5. «Pagado» solo si el servidor guardó el pago.
6. Imprima. Apague la impresora y pulse Reimprimir: no debe nacer otro recibo.
