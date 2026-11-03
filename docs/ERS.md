# Especificación de Requisitos de Software (ERS)

**Sistema de Gestión, Control de Consumo y Facturación de Agua Potable**  
Comité de Agua · Parcelamiento Santa Fe, Retalhuleu

| Campo | Dato |
| --- | --- |
| Institución | Universidad Mariano Gálvez de Guatemala, Centro Universitario de Retalhuleu |
| Proyecto | Proyecto de Graduación 2026 |
| Autor | Andy Daniel Rojop Orozco · Carné 2890-22-3916 |
| Asesor | Ing. Marco Vinicio Orizábal Hidalgo |
| Versión del ERS | 1.1 |
| Fecha | 23 de octubre de 2026 |
| Correspondencia | Este documento especifica el sistema en operación. Las reglas RN-01 a RN-22 se transcriben de la formulación ya fijada en el dominio y en el esquema, sin redactarlas de nuevo. |

---

## 1. Introducción

### 1.1 Propósito

Especificar los requisitos funcionales, las reglas de negocio y los requisitos no funcionales del sistema con el que el Comité de Agua del Parcelamiento Santa Fe registra el padrón, toma lecturas, cobra, emite recibos e informa morosidad.

Este documento es la referencia para el desarrollo, las pruebas y el capítulo de la tesis.

### 1.2 Alcance del producto

El producto es una **aplicación web** (React 18 + API REST Express + PostgreSQL) para la oficina y el trabajo de campo del tesorero (Chrome en teléfono Android). No es una aplicación nativa.

Nombre del producto: *Sistema de Gestión, Control de Consumo y Facturación de Agua Potable*.

El sistema:

- Distingue **usuarios del sistema** (Administrador, Tesorero, Fontanero) de **usuarios del servicio de agua** (beneficiarios / padrones).
- Calcula el consumo y el importe en el **servidor**. El navegador formatea; no es la fuente de verdad del cobro.
- Maneja dinero como **enteros en centavos** y volúmenes como **enteros en litros**. La interfaz de lecturas y cobro muestra **metros cúbicos con un decimal**.
- Emite **un recibo por conexión y periodo**. Reimprimir no factura ni registra un pago nuevo.
- Imprime el recibo térmico de 58 mm en la **Sigma portátil 58 mm** (SKU 1EFEE47253), por Bluetooth desde el teléfono del tesorero o por USB.

### 1.3 Definiciones

| Término | Significado en este sistema |
| --- | --- |
| Beneficiario | Titular del servicio de agua (padrón). No inicia sesión. |
| Conexión | Servicio vinculado a un beneficiario; código único (p. ej. SF-041). |
| Medidor | Aparato asociado a una conexión de modalidad MEDIDA. |
| Periodo | Mes de facturación. Solo puede haber uno no cerrado a la vez (RN-08). |
| Periodo abierto | Cualquier periodo cuyo estado no es `CERRADO` (`ABIERTO` o `EN_LECTURA`). |
| Lectura | Toma del contador en un periodo, en litros enteros. |
| Recibo | Documento de cobro de un periodo y una conexión, con desglose congelado. |
| Pago | Aplicación de dinero a uno o más recibos, del más antiguo al más reciente. |
| Centavos | Unidad interna de dinero. Q25.00 = 2500. |
| Litros | Unidad interna de volumen. 18.0 m³ = 18 000 L. |
| Junta | Comité de Agua del Parcelamiento Santa Fe. |
| RawBT | Aplicación auxiliar de Android que recibe ESC/POS y lo envía a la impresora térmica Sigma 58 mm. |

### 1.4 Referencias internas del producto

| Artefacto | Ubicación |
| --- | --- |
| Esquema (sección 13.3 de esta ERS en el propio SQL) | `bd/01-esquema.sql` |
| Tarifa y parámetros iniciales | `bd/02-datos-iniciales.sql` |
| Recibo único por periodo y conexión | `bd/05-recibo-unico-periodo.sql` |
| Motor tarifario RN-01 a RN-07 | `backend/src/dominio/tarifa.js` |
| Consumo RN-01 y RN-13 a RN-17 | `backend/src/dominio/consumo.js` |
| Pagos RN-18 a RN-22 | `backend/src/dominio/pagos.js` |
| Cierre RN-08 a RN-12 | `backend/src/dominio/cierre.js` |
| Matriz de permisos RF-06 | `backend/src/dominio/permisos.js` |
| Criterio CA-01 y Tabla 1 | `backend/src/dominio/dominio.test.js` |
| Impresión térmica 58 mm · Sigma 58 mm (SKU 1EFEE47253) | `docs/IMPRESION-TERMICA.md` |

### 1.5 Organización del documento

La sección 2 describe el producto y los actores. La sección 3 reúne los requisitos funcionales. La sección 4 las reglas RN-01 a RN-22. La sección 5 los requisitos no funcionales y las decisiones de arquitectura. La sección 6 el modelo de datos. La sección 7 los criterios de aceptación. La sección 8 las interfaces. La sección 9 el fuera de alcance. La sección 10 la trazabilidad.

---

## 2. Descripción general

### 2.1 Perspectiva del producto

Aplicación cliente-servidor:

| Capa | Tecnología |
| --- | --- |
| Lenguaje | JavaScript |
| Frontend | React 18, Vite |
| Backend | Node.js 20+, Express 5 |
| Base de datos | PostgreSQL en la nube (Supabase), con opción local de desarrollo |
| Acceso a datos | Controlador `pg`, consultas parametrizadas |
| Autenticación | JWT + bcrypt (factor 12) + `exigirPermiso` |
| Recibo en pantalla / USB | jsPDF, formato 58 mm |
| Recibo en campo Android | ESC/POS + RawBT → **Sigma 58 mm** |

Despliegue: API en Railway, web en Vercel, base de datos PostgreSQL en Supabase, con TLS en tránsito y HTTPS en producción.

### 2.2 Funciones del producto (módulos de la ERS)

| ID | Módulo | Cubierto por |
| --- | --- | --- |
| RF-01 | Registro de usuarios del servicio y medidores | Alta, listado, ficha, edición, baja lógica y carga masiva |
| RF-02 | Ingreso de lecturas mensuales | Apertura de periodo, captura, inconsistencias y cobro por promedio |
| RF-03 | Tesorería, cobro en campo y registro de pagos | Pago, anulación, recargos, corte de caja e impresión en campo |
| RF-04 | Emisión e impresión de recibos | Cierre, PDF 58 mm y ESC/POS en la Sigma 58 mm |
| RF-05 | Reportes administrativos y estados de cuenta | Tablero, morosos, ingresos, consumo y exportación |
| RF-06 | Usuarios del sistema y control de acceso | Sesión, roles, invitaciones, bitácora y bloqueo de cuenta |

### 2.3 Características de los usuarios (actores)

| Actor | Es usuario del sistema | Descripción en el producto |
| --- | --- | --- |
| Administrador | Sí | Configura el sistema, abre y cierra periodos, gestiona cuentas e invitaciones. |
| Tesorero | Sí | Abre el periodo de lecturas, cobra en campo, registra pagos y genera reportes de caja. |
| Fontanero | Sí | Toma lecturas mensuales y consulta el padrón (sin montos ni saldos). |
| Beneficiario | No | Titular del servicio. No inicia sesión. |

El rol lo asigna el administrador al emitir la invitación; el usuario **no elige su propio rol**.

### 2.4 Restricciones

- El primer usuario registrado queda como Administrador (arranque). Los siguientes requieren código de invitación.
- Contraseña: al menos 10 caracteres, con letras y números.
- Token JWT: caducidad configurada (`HORAS_SESION`, predeterminado 8 h). La sesión del navegador vive en `sessionStorage` (al cerrar la pestaña se pierde).
- En producción: `JWT_SECRET` de al menos 16 caracteres, distinto del valor de ejemplo; `DATABASE_URL` obligatoria; CORS según `ORIGEN_PERMITIDO`.
- Cuerpo JSON limitado a 1 MB.
- Cabeceras: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.

### 2.5 Supuestos y dependencias

- Existe un periodo de facturación mensual y una tarifa aprobada por la asamblea (tarifa 2026, redondeo `ARRIBA`).
- El tesorero opera desde Chrome en Android. La impresora del sistema es la **Sigma 58 mm** (58 mm, ESC/POS, USB y Bluetooth, SKU 1EFEE47253). Chrome no habla Bluetooth SPP; el puente es RawBT.
- La junta opera sin correo institucional: invitaciones y recuperación entregan el código en pantalla.
- El redondeo de bloque es `ARRIBA` (RN-03). Las lecturas se toman como números enteros (litros / m³ con un decimal en pantalla).

### 2.6 Objetivo específico numerado en el código

El reporte de usuarios morosos (RF-05.2) **sustenta el objetivo OE-05**. Los módulos RF-01 a RF-06 son la descomposición funcional del producto.

---

## 3. Requisitos funcionales

Prioridad: **Alta** = flujo diario de la junta. **Media** = oficina. **Baja** = complemento.

### 3.1 RF-01 — Registro de usuarios del servicio y medidores

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-01.1 | Alta del usuario del servicio (beneficiario): nombres, apellidos, DPI, teléfono, dirección | Alta |
| RF-01.2 | Alta de la conexión: código, sector, modalidad MEDIDA o CUOTA_FIJA | Alta |
| RF-01.3 | Medidor asociado si la modalidad lo requiere (serie, marca, dígitos, lectura inicial) | Alta |
| RF-01.4 | Edición de datos del titular. No altera lecturas, recibos ni pagos | Alta |
| RF-01.5 | Baja lógica: nunca se borra el historial | Alta |
| RF-01.6 | Listado con búsqueda y filtros (código, nombre, DPI, teléfono, sector, dirección) | Alta |
| RF-01.8 | Carga masiva del padrón desde hoja de cálculo, con las mismas validaciones del alta individual | Media |

Reglas de RF-01:

- Código de conexión y código de beneficiario únicos; DPI único si se informa.
- DPI y teléfono son obligatorios al dar de alta.
- El alta (beneficiario + conexión + medidor) se guarda en una sola transacción.
- La edición no cambia el código de conexión.
- La baja exige motivo (mínimo 3 caracteres), pone estado `BAJA` y `eliminado_en`.
- Permiso `alta_conexion`: Administrador y Tesorero. Consulta del padrón: los tres roles.
- La carga masiva (RF-01.8) rechaza filas con código o DPI duplicado y no deja un padrón a medias: o se registra el lote válido o se informa el error de la fila.

### 3.2 RF-02 — Ingreso de lecturas mensuales

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-02.1 / RF-02.2 | Apertura de periodo (año, mes, fechas de inicio, fin y vencimiento) | Alta |
| RF-02.3 | Conexiones del periodo con marca de visita (lectura tomada o no) | Alta |
| RF-02.4 a RF-02.7 | Registro de una lectura: valor actual, consumo, inconsistencia, observación | Alta |
| RF-02.8 | Lecturas marcadas para revisión y resolución por una persona | Alta |
| RF-02.9 | Avance de la toma de lecturas | Alta |
| RF-02.11 | Cobro por promedio cuando no se pudo tomar la lectura | Media |

Reglas de RF-02:

- Permiso `abrir_periodo`: Administrador y Tesorero.
- Permiso `lecturas`: Administrador y Fontanero. El tesorero **no** registra lecturas por `/lecturas` (cobra en RF-03).
- Permiso `inconsistencias`: solo Administrador.
- No hay periodo abierto: el sistema sugiere el siguiente (mes posterior al último, o el mes calendario).
- Solo conexiones `ACTIVA` de modalidad `MEDIDA` entran a la ruta de lecturas.
- Una sola lectura por conexión y periodo (`UNIQUE`). Un nuevo envío actualiza la existente (corrección).
- La lectura anterior la aporta el servidor (RN-17).
- Inconsistencias: `LECTURA_MENOR`, `CONSUMO_EXCESIVO`, `CONSUMO_CERO` (RN-13, RN-15, RN-16). La resolución la decide una persona (RF-02.8), no el sistema.
- Interfaz: una conexión por captura, teclado numérico, vista previa del consumo mientras se digita; el monto que se guarda lo determina el servidor.
- RF-02.11: si no fue posible tomar la lectura, el sistema estima el consumo con el promedio histórico (`consumoPorPromedio`) y marca `SIN_LECTURA`. El recibo del periodo se emite con ese consumo; no se inventa una lectura de medidor.

### 3.3 RF-03 — Tesorería, cobro en campo y registro de pagos

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-03.1 a RF-03.3 | Registro del pago (monto, forma, distribución) | Alta |
| RF-03.2 | Vista previa de la distribución del pago, antes de confirmarlo | Alta |
| RF-03.4 | Anulación de pago. No elimina el registro (RN-21) | Alta |
| RF-03.5 | Proceso diario que marca recibos vencidos y aplica el recargo de mora (RN-19, RN-20) | Media |
| RF-03.7 | Corte de caja del día | Media |
| RF-03 (campo) | Búsqueda, ficha, lectura, emisión del recibo del periodo, cobro e impresión en la Sigma 58 mm | Alta |

Formas de pago: `EFECTIVO`, `DEPOSITO`, `TRANSFERENCIA`.

Reglas de cobro en campo:

- Permiso `cobro` y `pagos`: Administrador y Tesorero.
- Un recibo por `(periodo_id, conexion_id)`. Si ya existe, confirmar responde `duplicadoEvitado` y **no emite otro**.
- Reimprimir consulta el recibo existente (GET). No crea factura ni pago.
- El tesorero puede emitir el recibo del periodo abierto (misma tarifa del cierre) y, si marca cobro, registrar el pago en la misma operación.
- Distinción: registrar lectura ≠ el usuario ya pagó. «Pagado» solo si el servidor guardó el pago.
- Los pagos bloquean conexión y recibos (`SELECT … FOR UPDATE`) para no aplicar el mismo saldo dos veces.
- Anulación: motivo de al menos 5 caracteres; el monto vuelve al saldo del recibo; el registro de pago permanece.
- RF-03.5: cada día el sistema identifica recibos cuya fecha límite ya pasó, los marca `VENCIDO` y aplica el recargo una sola vez por periodo (RN-20). No acumula mora diaria.

### 3.4 RF-04 — Emisión e impresión de recibos

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-04.3 | Vista previa del cierre. No escribe nada | Alta |
| RF-04.4 | Cierre del periodo. Todo o nada | Alta |
| RF-04.6 | Datos del recibo para que jsPDF (o ESC/POS) los componga. El desglose y el correlativo vienen del servidor | Alta |
| RF-04.9 | Un PDF con todos los recibos del periodo, una página por recibo | Media |

Reglas de RF-04:

- Permiso `cierre`: solo Administrador.
- El cierre valida RN-09 antes de escribir. Transacción: se emiten todos los recibos restantes o ninguno.
- Omite conexiones que ya tienen recibo del periodo (emitidos en campo).
- El recibo se reimprime idéntico, sin recalcular (ADR-04).
- Recibo térmico de 58 mm configurado para la **Sigma 58 mm** (SKU 1EFEE47253): 384 puntos, CP850, fuente A, 32 columnas, avance para rasgado.
- Android: ESC/POS vía RawBT hacia Bluetooth SPP. Escritorio: PDF de 58 mm por USB.
- Reimprimir no duplica factura ni pago. `ok: true` del canal es envío al puente; el tesorero confirma el papel en la impresora.

### 3.5 RF-05 — Reportes administrativos y estados de cuenta

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-05.1 | Estado de cuenta de una conexión (recibos, pagos, morosidad) | Alta |
| RF-05.2 | Usuarios morosos (sustenta OE-05) | Alta |
| RF-05.3 | Ingresos por periodo, desglosados por concepto | Media |
| RF-05.4 | Consumo total de la comunidad por periodo | Media |
| RF-05.5 | Indicadores del tablero | Alta |
| RF-05.7 | Exportación de reportes a hoja de cálculo | Media |
| RF-05.8 | Historial de consumo de una conexión, para la gráfica | Media |

El tablero informa conexiones activas, lecturas tomadas, por revisar, facturado y recaudado del periodo, conexiones morosas (cartera vencida) y consumo total. El «pendiente de cobro» del recuadro de caja es el del **periodo actual**, no necesariamente toda la cartera.

La exportación (RF-05.7) entrega en hoja de cálculo los reportes de morosos, ingresos y consumo, con los mismos datos que se ven en pantalla.

### 3.6 RF-06 — Usuarios del sistema y control de acceso

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-06.1 | Inicio de sesión | Alta |
| RF-06.2 | Administración de cuentas (solo Administrador) | Alta |
| RF-06.4 | Exigir rol / permiso en cada operación de API | Alta |
| RF-06.5 | Bitácora de operaciones sensibles; solo admite inserción | Alta |
| RF-06.6 | Cambio de contraseña propia | Media |
| RF-06.10 | Cuenta bloqueada por intentos fallidos | Alta |
| RF-06.11 | Consulta de la bitácora | Media |
| RF-06 | Invitaciones de registro (código 7 días, un uso) | Alta |
| RF-06 | Recuperación de contraseña (código 1 hora) | Alta |

Política de acceso:

- Mensaje de login idéntico exista o no el usuario: no se revela qué correos están registrados (RNF-SEG-06).
- Cinco intentos fallidos consecutivos bloquean la cuenta 15 minutos (HTTP 423).
- Limitador por IP: 10 intentos de login / 15 minutos (RNF-SEG-08); registro 8 / 15 minutos.
- Invitaciones y recuperación: el código se entrega en la respuesta JSON (junta local sin correo).
- La bitácora registra actor, acción, entidad, valores antes/después e IP. `UPDATE` y `DELETE` lanzan excepción en PostgreSQL.
- La sesión caduca con el JWT. Cerrar la pestaña la termina (`sessionStorage`).

### 3.7 Matriz de permisos (RF-06)

| Permiso | Administrador | Tesorero | Fontanero |
| --- | --- | --- | --- |
| tablero | Sí | Sí | No |
| cobro | Sí | Sí | No |
| lecturas | Sí | No | Sí |
| padron (consulta) | Sí | Sí | Sí |
| cierre | Sí | No | No |
| reportes | Sí | Sí | No |
| cuentas / usuarios / invitaciones | Sí | No | No |
| bitacora | Sí | No | No |
| pagos | Sí | Sí | No |
| abrir_periodo | Sí | Sí | No |
| inconsistencias | Sí | No | No |
| alta_conexion | Sí | Sí | No |

Ocultar un botón en React no es control de seguridad. La verificación ocurre en el servidor, en cada solicitud (RNF-SEG-03).

---

## 4. Reglas de negocio RN-01 a RN-22

Formulación tomada del dominio, de las pruebas unitarias y del esquema. No se reescriben.

### 4.1 Tarifa y cálculo (RN-01 a RN-07)

**RN-01.** El consumo es la diferencia entre lecturas.

**RN-02.** La tarifa básica se cobra íntegra aunque el consumo sea menor.

**RN-03.** La fracción de bloque se redondea hacia arriba. Tamaño del bloque de exceso: 1 000 litros. Precio del bloque: Q1.00. (La política alterna `COMPLETOS` cobra solo bloques enteros; el parámetro `redondeo_bloque` admite ambas.)

**RN-04.** Mora y saldo anterior se suman al total. El saldo a favor se descuenta y nunca produce un total negativo.

**RN-05.** Cambiar la tarifa cambia el resultado sin tocar el código. Tarifa vigente aprobada por la asamblea.

**RN-06.** La tarifa está versionada. Nunca se modifica una tarifa ya aplicada a recibos. Se usa la tarifa vigente a la fecha indicada.

**RN-07.** La modalidad de cuota fija ignora el consumo medido. Sin medidor: monto constante, sin cálculo de exceso. Las conexiones de cuota fija no requieren lectura.

### 4.2 Periodo y cierre (RN-08 a RN-12)

**RN-08.** Solo puede existir un periodo abierto a la vez.

**RN-09.** No permite cerrar si falta una lectura. No permite cerrar con inconsistencias sin resolver.

**RN-10.** Las lecturas de un periodo cerrado no se pueden modificar. El cierre se bloquea por completo si hay un solo impedimento.

**RN-11.** El desglose y el correlativo de un recibo emitido son inmutables; solo el saldo cambia, por efecto de los pagos. El único mecanismo de corrección tras el cierre es la nota de ajuste.

**RN-12.** Genera un recibo por conexión con correlativo consecutivo.

Complemento de integridad (migración `bd/05-recibo-unico-periodo.sql`): un recibo por conexión y periodo, también cuando el tesorero emite en campo.

### 4.3 Lecturas e inconsistencias (RN-13 a RN-17)

**RN-13.** La lectura actual no puede ser menor que la anterior: se marca y no se calcula un consumo negativo. El reinicio de contador por capacidad agotada se registra aparte, tras confirmación.

**RN-14.** El cambio de medidor suma los dos tramos: tramo final del medidor retirado más tramo inicial del medidor nuevo.

**RN-15.** Un consumo desproporcionado respecto al promedio histórico se marca como posible fuga. Umbral: 200 sobre el promedio (más del triple). Se promedian hasta los últimos seis periodos.

**RN-16.** El consumo cero repetido genera alerta al tercer periodo.

**RN-17.** La lectura anterior la aporta el sistema, no el cliente. Nunca se toma del cuerpo de la petición.

### 4.4 Pagos y morosidad (RN-18 a RN-22)

**RN-18.** El pago se aplica primero al recibo más antiguo. El remanente que no cubre ningún recibo queda a favor.

**RN-19.** Un recibo se considera vencido tras su fecha límite.

**RN-20.** El recargo por mora admite monto fijo o porcentaje. Se aplica una sola vez por periodo vencido, no de forma acumulativa diaria. Valor inicial: Q5.00 fijo (`mora_valor` = 500 centavos).

**RN-21.** La anulación no elimina el registro.

**RN-22.** Se identifica al usuario moroso y la antigüedad de su deuda. Una conexión al día no aparece como morosa.

---

## 5. Requisitos no funcionales y decisiones de arquitectura

### 5.1 Manejo de dinero y volúmenes

| ID | Requisito |
| --- | --- |
| RNF-MAN-03 | Los montos se almacenan como enteros en centavos. Q25.00 se guarda como 2500. Nunca NUMERIC decimal ni punto flotante para dinero |
| RNF-MAN-04 | Los volúmenes se almacenan como enteros en litros. La UI muestra m³ con un decimal |

### 5.2 Seguridad

| ID | Requisito |
| --- | --- |
| RNF-SEG-01 | Cifrado en tránsito (TLS) hacia PostgreSQL en la nube y HTTPS en producción |
| RNF-SEG-02 | Autenticación por JWT firmado |
| RNF-SEG-03 | Autorización en el servidor en cada solicitud; el menú no es el control |
| RNF-SEG-05 | Consultas parametrizadas (`$1`, `$2`, …). Nunca concatenar valores en el SQL |
| RNF-SEG-06 | Errores genéricos al cliente; no revelar si un correo está registrado |
| RNF-SEG-08 | Limitación de intentos por dirección IP en login y registro |

### 5.3 Disponibilidad y respaldo

| ID | Requisito |
| --- | --- |
| RNF-DIS-02 | Respaldo diario de la base de datos en una ubicación distinta a la de producción. PostgreSQL en la nube aporta el respaldo automatizado; se complementa con `pg_dump` programado |

### 5.4 Usabilidad (campo)

- Una conexión por captura; teclado numérico; búsqueda por código, nombre o sector.
- Confirmación antes de cerrar el periodo y antes de cobrar.
- Prevención de doble envío en confirmar cobro.
- El fontanero no ve montos ni saldos en el listado de conexiones ni en recibos.
- El tesorero imprime el recibo en la Sigma 58 mm desde Cobro, sin salir del flujo de visita.

### 5.5 Decisiones de arquitectura (ADR)

| ID | Decisión |
| --- | --- |
| ADR-04 | El recibo conserva el desglose aplicado. Se reimprime idéntico, sin recalcular. |
| ADR-05 | El navegador no calcula montos que se guarden. jsPDF y ESC/POS solo formatean correlativo, desglose y total resueltos por el servidor. |
| ADR-07 | Las bajas son lógicas (`eliminado_en`), nunca físicas. |
| ADR-08 | El dominio (tarifa, consumo, pagos, cierre) es JavaScript puro, sin Express ni PostgreSQL ni React, para probarlo aislado. |

### 5.6 Integridad aplicada en PostgreSQL

Una regla que solo vive en la aplicación se salta por otra vía. Por eso:

1. La bitácora solo admite inserción (RF-06.5).
2. Las lecturas de un periodo cerrado no se pueden modificar (RN-10).
3. El desglose y el correlativo de un recibo emitido no se modifican; el saldo sí, por pagos (RN-11). Use nota de ajuste.
4. Un solo periodo no cerrado a la vez (RN-08).
5. Una lectura por conexión y periodo.
6. Un recibo por conexión y periodo.
7. Correlativos únicos de recibo y de pago.

---

## 6. Modelo de datos (sección 13.3 de la ERS)

Fuente: `bd/01-esquema.sql`.

### 6.1 Tipos enumerados

`rol_usuario`: ADMINISTRADOR, TESORERO, FONTANERO  
`modalidad_cobro`: MEDIDA, CUOTA_FIJA  
`estado_conexion`: ACTIVA, SUSPENDIDA, BAJA  
`estado_medidor`: ACTIVO, RETIRADO, AVERIADO  
`estado_periodo`: ABIERTO, EN_LECTURA, CERRADO  
`estado_recibo`: PENDIENTE, PARCIAL, PAGADO, VENCIDO  
`forma_pago`: EFECTIVO, DEPOSITO, TRANSFERENCIA  
`tipo_nota`: CARGO, CREDITO  
`redondeo_bloque`: ARRIBA, COMPLETOS  
`tipo_inconsistencia`: NINGUNA, LECTURA_MENOR, CONSUMO_EXCESIVO, CONSUMO_CERO, SIN_LECTURA

### 6.2 Entidades

| Tabla | Propósito |
| --- | --- |
| usuarios | Cuentas del sistema (RF-06), no del servicio de agua |
| tokens_recuperacion | Códigos de un uso, 1 hora |
| tokens_invitacion | Códigos de registro, 7 días |
| beneficiarios | Titulares del servicio |
| conexiones | Servicio (código, sector, modalidad, saldo a favor) |
| medidores | Aparato por conexión |
| tarifas | Versiones de tarifa (RN-06) |
| periodos | Mes de facturación |
| lecturas | Toma del periodo |
| recibos | Documento con desglose congelado |
| pagos | Aplicaciones de dinero; anulado no borra |
| notas_ajuste | Corrección posterior al cierre (RN-11) |
| bitacora | Auditoría inmutable |
| parametros | Mora, umbrales, encabezado de junta |

### 6.3 Tarifa y parámetros iniciales

Tarifa 2026 (`bd/02-datos-iniciales.sql`):

- Tarifa básica: Q25.00 (2500 centavos)
- Incluidos: 25 000 litros (25.0 m³)
- Bloque: 1 000 litros
- Precio de bloque: Q1.00
- Cuota fija: Q25.00
- Redondeo: ARRIBA
- Mora: Q5.00 fija por periodo vencido
- Umbral de exceso: 200 % sobre el promedio
- Periodos en cero para alerta: 3
- Encabezado: Comité de Agua · Parcelamiento Santa Fe, Retalhuleu

La instalación limpia **no crea usuarios ni padrón**. El primer administrador se registra en «Crear cuenta».

---

## 7. Criterios de aceptación y Tabla 1 de tarifa

### 7.1 CA-01

El monto calculado por el sistema debe coincidir con el cálculo manual de control en consumos variados, incluidos consumo cero, consumo dentro del rango incluido y consumo con exceso fraccionado.

Verificación: `backend` → `npm test` (pruebas del dominio).

### 7.2 Tabla 1 — casos oficiales de la tarifa de la junta local

| Consumo (litros) | Total | Comentario |
| ---: | ---: | --- |
| 18 000 | Q25.00 | Consumo dentro del rango incluido |
| 25 000 | Q25.00 | Consumo exactamente igual al rango incluido |
| 26 000 | Q26.00 | Un bloque exacto de exceso |
| 31 400 | Q32.00 | Exceso fraccionado: 6 400 L = 7 bloques (ARRIBA) |
| 50 000 | Q50.00 | 25 bloques exactos de exceso |
| 0 | Q25.00 | Consumo cero: se cobra la tarifa básica íntegra (RN-02) |

Escenario de control: lectura anterior 125.0 m³, actual 143.0 m³ → consumo 18.0 m³ → Q25.00.

### 7.3 Otros criterios cubiertos por pruebas

- Lectura menor: consumo 0, inconsistencia `LECTURA_MENOR`.
- Pago parcial y pago que deja saldo a favor (RN-18).
- Cierre bloqueado sin lectura o con inconsistencia (RN-09, RN-10).
- Un recibo por conexión, correlativos consecutivos (RN-12).
- Fontanero: 401 sin token; 403 en cobro, recibos, reportes, cierre, alta de padrón.
- Reimpresión: dos GET del mismo recibo conservan correlativo e importe.
- Impresión: el perfil activo es Sigma 58 mm (SKU 1EFEE47253), ESC/POS, USB y Bluetooth.

---

## 8. Interfaces

### 8.1 Interfaz de usuario (pantallas)

| Vista | Permiso | Contenido |
| --- | --- | --- |
| Acceso | — | Selección de rol, login, crear cuenta, restablecer contraseña |
| Panel | tablero | Indicadores del periodo |
| Cobro | cobro | Búsqueda, ficha, lectura, emitir, cobrar, imprimir en Sigma 58 mm / PDF |
| Lecturas | lecturas | Recorrido, captura en m³, pendientes / visitadas |
| Padrón | padron | Listado, ficha; alta / editar / baja / carga masiva si `alta_conexion` |
| Cierre | cierre | Impedimentos, resolver inconsistencias, confirmar emisión |
| Reportes | reportes | Morosos, ingresos, consumo y exportación a hoja de cálculo |
| Cuentas | cuentas | Invitaciones y alta de personal |
| Bitácora | bitacora | Historial de operaciones |

### 8.2 Interfaz de impresión

Impresora del sistema: **Sigma portátil 58 mm**, SKU **1EFEE47253** (`frontend/src/impresion/perfil.js`).

```
Sistema web en Internet
        ↓
Teléfono Android del tesorero (Chrome + RawBT)
        ↓ Bluetooth SPP
Sigma 58 mm (SKU 1EFEE47253) · recibo térmico de 58 mm
```

| Canal | Uso |
| --- | --- |
| Bluetooth + RawBT | Campo, Chrome Android |
| USB + PDF 58 mm | Oficina, computadora |

- Reimprimir no duplica factura ni pago.
- RawBT no informa al navegador falta de papel o impresora apagada; el tesorero lo verifica en el equipo.

### 8.3 Interfaz de software (API REST)

Prefijo `/api`. Autenticación: cabecera `Authorization: Bearer <token>` salvo login, registro, recuperar, restablecer y `/api/salud`.

Grupos principales:

- Autenticación: `/auth/login`, `/auth/yo`, `/auth/registrar`, `/auth/invitaciones`, `/auth/recuperar`, `/auth/restablecer`, `/auth/contrasena`
- Padrón: `GET/POST /conexiones`, `PATCH/DELETE /conexiones/:id`
- Periodos y lecturas: `POST /periodos`, `GET /periodos/actual`, `GET /periodos/actual/pendientes`, `POST /lecturas`, inconsistencias, `validar-cierre`, `cerrar`
- Cobro: `/cobro/buscar`, `/cobro/conexiones/:id`, `/cobro/preview`, `/cobro/confirmar`
- Tesorería: `/pagos`, `/pagos/previsualizar`, `/pagos/:id/anular`, estado de cuenta, historial
- Reportes: morosos, ingresos, consumo, tablero, corte de caja
- Recibos: `GET /recibos/:id`
- Bitácora: `GET /bitacora`

Códigos de respuesta usados: 200, 201, 400, 401, 403, 404, 409, 423, 429, 500.

---

## 9. Fuera de alcance

Queda fuera de este producto:

- Aplicación nativa iOS/Android (el cliente es web).
- Web Bluetooth clásico hacia la impresora (Chrome no lo ofrece para SPP; el puente es RawBT).
- Portal de autoservicio del beneficiario.
- Facturación electrónica SAT / FEL.
- Correo masivo de recibos.

---

## 10. Trazabilidad resumida

| Origen | Destino |
| --- | --- |
| RN-01 a RN-07 | `tarifa.js`, Tabla 1, `tarifas` |
| RN-08 a RN-12 | `cierre.js`, triggers, índice de periodo abierto |
| RN-13 a RN-17 | `consumo.js`, `POST /lecturas`, `POST /cobro/preview` |
| RN-18 a RN-22 | `pagos.js`, `POST /pagos`, `aplicarCobro` |
| RF-01 | `padron.js`, pantalla Padrón |
| RF-02 | `lecturas.js`, pantalla Lecturas |
| RF-03 | `tesoreria.js`, `cobro.js`, pantalla Cobro |
| RF-04 | cierre, `recibo-pdf.js`, `impresion/canales.js`, Sigma 58 mm |
| RF-05 | reportes y Tablero |
| RF-06 | `seguridad.js`, `padron.js` (auth), Cuentas, Bitácora |
| CA-01 | `dominio.test.js` |
| OE-05 | RF-05.2 usuarios morosos |
| ADR-05 | `recibo-vista.js`, jsPDF, ESC/POS |

---

## 11. Aprobación

Este ERS describe el sistema en operación al 23 de octubre de 2026. Cualquier cambio de tarifa, redondeo, mora o roles actualiza este documento y las pruebas CA-01.

| Rol | Nombre | Fecha |
| --- | --- | --- |
| Autor | Andy Daniel Rojop Orozco | |
| Asesor | Ing. Marco Vinicio Orizábal Hidalgo | |
| Junta local (tarifa y redondeo) | Comité de Agua, Parcelamiento Santa Fe | |
