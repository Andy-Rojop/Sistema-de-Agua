# Sistema de Gestión, Control de Consumo y Facturación de Agua Potable
### Parcelamiento Santa Fe, Retalhuleu

Proyecto de Graduación 2026 — Universidad Mariano Gálvez de Guatemala, Centro Universitario de Retalhuleu.
Andy Daniel Rojop Orozco · Carné 2890-22-3916 · Asesor: Ing. Marco Vinicio Orizábal Hidalgo

---

## Estado del desarrollo

| Módulo de la ERS | Estado |
|---|---|
| RF-01 Registro de usuarios y medidores | Backend completo · Frontend: listado y búsqueda |
| RF-02 Ingreso de lecturas mensuales | Completo, con validación de inconsistencias |
| RF-03 Tesorería y registro de pagos | Completo |
| RF-04 Imprimir recibos de consumos | Completo, con PDF en jsPDF |
| RF-05 Reportes administrativos y estados de cuenta | Completo |
| RF-06 Usuarios y control de acceso | Completo |

**Pruebas:** 40 pruebas unitarias del dominio, todas en verde.
**Prueba de humo de la API:** 12 comprobaciones, todas en verde.

---

## Tecnologías

Corresponden a las declaradas en el Capítulo II del Proyecto de Graduación.

| Capa | Tecnología |
|---|---|
| Lenguaje | JavaScript |
| Frontend | React 18 (con Vite) |
| Backend | Node.js + Express.js |
| Base de datos | PostgreSQL 16 en Supabase |
| Acceso a datos | Controlador `pg` con consultas parametrizadas |
| Generación de PDF | jsPDF |
| Autenticación | JSON Web Token + bcrypt + matriz de permisos por rol |
| Control de versiones | Git y GitHub |

---

## Estructura

```
backend/                    API REST — Node.js + Express.js
  src/
    dominio/                Lógica de negocio. JavaScript puro, sin frameworks.
      tarifa.js             Motor de cálculo tarifario (RN-01 a RN-07)
      consumo.js            Consumo e inconsistencias (RN-13 a RN-17)
      pagos.js              Pagos, mora y morosidad (RN-18 a RN-22)
      cierre.js             Cierre de periodo (RN-08 a RN-12)
      permisos.js           Matriz de roles (RF-06): quién puede qué
      dominio.test.js       40 pruebas unitarias
    datos/bd.js             Pool de PostgreSQL y transacciones
    rutas/
      seguridad.js          JWT, exigirPermiso, límite de intentos
      padron.js             RF-01 y RF-06
      lecturas.js           RF-02 y RF-04
      tesoreria.js          RF-03 y RF-05
    servidor.js             Punto de entrada
  prueba-humo.js            Verificación de la API sin base de datos

frontend/                   Aplicación React
  src/
    api.js                  Único punto de comunicación con el servidor
    permisos.js             Espejo de la matriz de roles (menú y guardias)
    recibo-pdf.js           Composición del recibo con jsPDF
    App.jsx                 Raíz: menú por rol y enrutado
    paginas/                Lecturas, Cierre, Cuentas y demás módulos
    componentes/            Piezas reutilizables

bd/
  01-esquema.sql            Tablas, triggers de integridad y auth
  02-datos-iniciales.sql    Tarifa vigente y parámetros (sin usuarios ni padrón)
  03-supabase-seguridad.sql Blindaje de las tablas (solo si se usa Supabase)
  04-auth-ampliada.sql      Migración: dirección y tokens (BD ya instaladas)
  05-tokens-invitacion.sql  Migración: códigos de invitación para registro

SUPABASE.md                 Guía de conexión con Supabase paso a paso
```

---

## Dos decisiones técnicas que conviene poder defender

**El dinero se maneja como enteros en centavos.** Q25.00 se guarda como `2500`, nunca como `25.00`. En punto flotante binario `0.1 + 0.2 !== 0.3`, y ese error, multiplicado por 400 recibos mensuales durante años, termina descuadrando la caja de la junta. Todo el sistema opera con enteros y solo convierte a texto al mostrar.

**El navegador nunca calcula un monto que después se guarde.** La pantalla de lecturas muestra un consumo aproximado mientras el Fontanero digita, pero el monto real lo determina el servidor al cerrar el periodo. jsPDF compone el recibo, pero el correlativo y el desglose vienen del servidor (ADR-05). Si alguien altera el consumo desde las herramientas del navegador, no pasa nada.

---

## Instalación

Requisitos: Node.js 20 o superior. La base de datos es **PostgreSQL en Supabase**
(no hace falta instalar PostgreSQL en la computadora).

### 1. Base de datos (Supabase)

Siga la guía `SUPABASE.md`. Son cinco pasos: crear el proyecto, pegar
`DATABASE_URL` en el backend, ejecutar los scripts SQL de la carpeta `bd/`
en el editor SQL de Supabase y listo.

Supabase **es** PostgreSQL en la nube: el mismo esquema (`01-esquema.sql`,
`02-datos-iniciales.sql`, etc.) corre ahí. No se usa una instalación local
de SQL Server ni de PostgreSQL para el despliegue del sistema.

### 2. Backend (API)

```bash
cd backend
npm install
cp .env.ejemplo .env      # y completá DATABASE_URL y JWT_SECRET
npm test                  # 40 pruebas del dominio
npm run dev               # http://localhost:3001
```

### 3. Frontend (aplicación web)

```bash
cd frontend
npm install
cp .env.ejemplo .env
npm run dev               # http://localhost:5173
```

### Primer acceso

El sistema arranca **sin usuarios ni padrón**. En la pantalla de acceso:

1. **Crear cuenta** — el **primer** usuario queda como Administrador (sin código).
2. A partir de ahí, solo quien tenga un **código de invitación** puede registrarse.
3. El administrador genera códigos en el menú **Cuentas** (válidos 7 días, un solo uso) y los entrega en persona.
4. Con **Restablecer contraseña** se genera un código (válido 1 hora) para fijar una nueva clave.

La contraseña debe tener al menos 10 caracteres e incluir letras y números.

---

## Verificación sin base de datos

Si todavía no tenés PostgreSQL configurado:

```bash
cd backend
npm test              # pruebas del dominio: cálculo, consumo, pagos, cierre
node prueba-humo.js   # rutas, autenticación y control por rol
```

---

## Integridad aplicada en la base de datos

Tres reglas viven en PostgreSQL y no solo en el código, porque una regla que solo existe en la aplicación se salta entrando por otra vía:

- La bitácora solo admite inserción: `UPDATE` y `DELETE` lanzan excepción (RF-06.5).
- Las lecturas de un periodo cerrado no se pueden modificar (RN-10).
- El desglose y el correlativo de un recibo emitido son inmutables; solo el saldo cambia, por efecto de los pagos (RN-11).

---

## Pendiente

1. Formulario de alta de usuarios y medidores en el frontend (el endpoint ya existe).
2. Carga masiva del padrón desde hoja de cálculo (RF-01.8).
3. Exportación de reportes a hoja de cálculo (RF-05.7).
4. Tarea programada diaria para marcar vencidos y aplicar recargos (RF-03.5).
5. Despliegue en producción y carga del padrón real.
