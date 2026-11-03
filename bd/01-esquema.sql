-- ===========================================================================
-- Sistema de Gestión, Control de Consumo y Facturación de Agua Potable
-- Parcelamiento Santa Fe, Retalhuleu
--
-- Esquema de base de datos (PostgreSQL 16). Corresponde a la sección 13.3
-- de la Especificación de Requisitos de Software.
--
-- CONVENCIONES
--   * Los montos se almacenan como ENTEROS EN CENTAVOS (RNF-MAN-03).
--     Q25.00 se guarda como 2500. Nunca se usa NUMERIC con decimales para
--     dinero ni, mucho menos, punto flotante.
--   * Los volúmenes se almacenan como ENTEROS EN LITROS (RNF-MAN-04).
--   * Las bajas son lógicas (campo eliminado_en), nunca físicas (ADR-07).
--
-- Ejecutar con:  psql -U postgres -d agua_santafe -f 01-esquema.sql
-- ===========================================================================

BEGIN;

-- ------------------------------------------------------------------ tipos --
CREATE TYPE rol_usuario      AS ENUM ('ADMINISTRADOR', 'TESORERO', 'FONTANERO');
CREATE TYPE modalidad_cobro  AS ENUM ('MEDIDA', 'CUOTA_FIJA');
CREATE TYPE estado_conexion  AS ENUM ('ACTIVA', 'SUSPENDIDA', 'BAJA');
CREATE TYPE estado_medidor   AS ENUM ('ACTIVO', 'RETIRADO', 'AVERIADO');
CREATE TYPE estado_periodo   AS ENUM ('ABIERTO', 'EN_LECTURA', 'CERRADO');
CREATE TYPE estado_recibo    AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADO', 'VENCIDO');
CREATE TYPE forma_pago       AS ENUM ('EFECTIVO', 'DEPOSITO', 'TRANSFERENCIA');
CREATE TYPE tipo_nota        AS ENUM ('CARGO', 'CREDITO');
CREATE TYPE redondeo_bloque  AS ENUM ('ARRIBA', 'COMPLETOS');
CREATE TYPE tipo_inconsistencia AS ENUM
  ('NINGUNA', 'LECTURA_MENOR', 'CONSUMO_EXCESIVO', 'CONSUMO_CERO', 'SIN_LECTURA');

-- ------------------------------------------------- 1. usuarios del sistema --
CREATE TABLE usuarios (
  id               SERIAL PRIMARY KEY,
  nombre           TEXT        NOT NULL,
  direccion        TEXT,
  correo           TEXT        NOT NULL UNIQUE,
  hash_contrasena  TEXT        NOT NULL,
  rol              rol_usuario NOT NULL,
  activo           BOOLEAN     NOT NULL DEFAULT TRUE,
  intentos_fallidos SMALLINT   NOT NULL DEFAULT 0,
  bloqueado_hasta  TIMESTAMPTZ,
  ultimo_acceso    TIMESTAMPTZ,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  eliminado_en     TIMESTAMPTZ
);
COMMENT ON TABLE usuarios IS 'Usuarios del sistema (RF-06), no usuarios del servicio de agua.';

-- Tokens de un solo uso para restablecer contraseña (válidos 1 hora).
CREATE TABLE tokens_recuperacion (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER     NOT NULL REFERENCES usuarios (id),
  token_hash  TEXT        NOT NULL UNIQUE,
  expira_en   TIMESTAMPTZ NOT NULL,
  usado_en    TIMESTAMPTZ,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tokens_recuperacion_usuario ON tokens_recuperacion (usuario_id);

-- Códigos de invitación para registrar cuentas nuevas (solo quien tenga un
-- código válido puede crear usuario; el primero del sistema no lo necesita).
CREATE TABLE tokens_invitacion (
  id          SERIAL PRIMARY KEY,
  token_hash  TEXT        NOT NULL UNIQUE,
  rol         rol_usuario NOT NULL DEFAULT 'FONTANERO',
  creado_por  INTEGER     NOT NULL REFERENCES usuarios (id),
  expira_en   TIMESTAMPTZ NOT NULL,
  usado_en    TIMESTAMPTZ,
  usado_por   INTEGER     REFERENCES usuarios (id),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tokens_invitacion_pendientes
  ON tokens_invitacion (expira_en) WHERE usado_en IS NULL;

-- --------------------------------------- 2. beneficiarios (usuarios agua) --
CREATE TABLE beneficiarios (
  id            SERIAL PRIMARY KEY,
  codigo        TEXT        NOT NULL UNIQUE,
  nombres       TEXT        NOT NULL,
  apellidos     TEXT        NOT NULL,
  dpi           TEXT        UNIQUE,
  telefono      TEXT,
  direccion     TEXT,
  fecha_ingreso DATE        NOT NULL DEFAULT CURRENT_DATE,
  observacion   TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  eliminado_en  TIMESTAMPTZ
);
CREATE INDEX idx_beneficiarios_nombre ON beneficiarios (apellidos, nombres);

-- --------------------------------------------------------- 3. conexiones --
CREATE TABLE conexiones (
  id                   SERIAL PRIMARY KEY,
  codigo               TEXT            NOT NULL UNIQUE,
  beneficiario_id      INTEGER         NOT NULL REFERENCES beneficiarios (id),
  sector               TEXT,
  modalidad            modalidad_cobro NOT NULL DEFAULT 'MEDIDA',
  estado               estado_conexion NOT NULL DEFAULT 'ACTIVA',
  saldo_favor_centavos INTEGER         NOT NULL DEFAULT 0 CHECK (saldo_favor_centavos >= 0),
  fecha_alta           DATE            NOT NULL DEFAULT CURRENT_DATE,
  motivo_baja          TEXT,
  creado_en            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  eliminado_en         TIMESTAMPTZ
);
CREATE INDEX idx_conexiones_beneficiario ON conexiones (beneficiario_id);
CREATE INDEX idx_conexiones_sector       ON conexiones (sector, estado);
COMMENT ON COLUMN conexiones.saldo_favor_centavos IS 'Remanente de pagos a favor del usuario (RN-18).';

-- ---------------------------------------------------------- 4. medidores --
CREATE TABLE medidores (
  id                SERIAL PRIMARY KEY,
  conexion_id       INTEGER       NOT NULL REFERENCES conexiones (id),
  serie             TEXT          NOT NULL,
  marca             TEXT,
  digitos           SMALLINT      NOT NULL DEFAULT 8 CHECK (digitos BETWEEN 4 AND 12),
  lectura_inicial   INTEGER       NOT NULL DEFAULT 0 CHECK (lectura_inicial >= 0),
  lectura_final     INTEGER       CHECK (lectura_final >= 0),
  fecha_instalacion DATE          NOT NULL DEFAULT CURRENT_DATE,
  fecha_retiro      DATE,
  estado            estado_medidor NOT NULL DEFAULT 'ACTIVO',
  creado_en         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_medidores_conexion ON medidores (conexion_id, estado);

-- ------------------------------------------------------------ 5. tarifas --
CREATE TABLE tarifas (
  id                     SERIAL PRIMARY KEY,
  nombre                 TEXT            NOT NULL,
  vigente_desde          DATE            NOT NULL,
  vigente_hasta          DATE,
  tarifa_basica_centavos INTEGER         NOT NULL CHECK (tarifa_basica_centavos >= 0),
  litros_incluidos       INTEGER         NOT NULL CHECK (litros_incluidos >= 0),
  litros_por_bloque      INTEGER         NOT NULL CHECK (litros_por_bloque > 0),
  precio_bloque_centavos INTEGER         NOT NULL CHECK (precio_bloque_centavos >= 0),
  cuota_fija_centavos    INTEGER         NOT NULL DEFAULT 2500,
  redondeo_bloque        redondeo_bloque NOT NULL DEFAULT 'ARRIBA',
  acuerdo_asamblea       TEXT,
  creado_en              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tarifas_vigencia ON tarifas (vigente_desde);
COMMENT ON TABLE tarifas IS 'Versionada (RN-06). Nunca se modifica una tarifa ya aplicada a recibos.';

-- ----------------------------------------------------------- 6. periodos --
CREATE TABLE periodos (
  id                SERIAL PRIMARY KEY,
  anio              SMALLINT       NOT NULL,
  mes               SMALLINT       NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_inicio      DATE           NOT NULL,
  fecha_fin         DATE           NOT NULL,
  fecha_vencimiento DATE           NOT NULL,
  estado            estado_periodo NOT NULL DEFAULT 'ABIERTO',
  cerrado_por_id    INTEGER        REFERENCES usuarios (id),
  cerrado_en        TIMESTAMPTZ,
  creado_en         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (anio, mes)
);

-- RN-08: solo puede existir un periodo abierto a la vez.
CREATE UNIQUE INDEX idx_un_solo_periodo_abierto
  ON periodos ((estado <> 'CERRADO'))
  WHERE estado <> 'CERRADO';

-- ----------------------------------------------------------- 7. lecturas --
CREATE TABLE lecturas (
  id                       SERIAL PRIMARY KEY,
  periodo_id               INTEGER  NOT NULL REFERENCES periodos (id),
  conexion_id              INTEGER  NOT NULL REFERENCES conexiones (id),
  medidor_id               INTEGER  REFERENCES medidores (id),
  lectura_anterior         INTEGER  NOT NULL CHECK (lectura_anterior >= 0),
  lectura_actual           INTEGER  NOT NULL CHECK (lectura_actual >= 0),
  consumo_litros           INTEGER  NOT NULL CHECK (consumo_litros >= 0),
  lector_id                INTEGER  REFERENCES usuarios (id),
  tomada_en                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inconsistencia           tipo_inconsistencia NOT NULL DEFAULT 'NINGUNA',
  inconsistencia_resuelta  BOOLEAN  NOT NULL DEFAULT TRUE,
  resolucion_nota          TEXT,
  observacion              TEXT,
  creado_en                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Una sola lectura por conexión y periodo.
  UNIQUE (periodo_id, conexion_id)
);
CREATE INDEX idx_lecturas_periodo ON lecturas (periodo_id, inconsistencia);
COMMENT ON COLUMN lecturas.lectura_anterior IS
  'La aporta el sistema, no el cliente (RN-17). Nunca se toma del cuerpo de la petición.';

-- ------------------------------------------------------------ 8. recibos --
CREATE TABLE recibos (
  id                      SERIAL PRIMARY KEY,
  correlativo             INTEGER       NOT NULL UNIQUE,
  periodo_id              INTEGER       NOT NULL REFERENCES periodos (id),
  conexion_id             INTEGER       NOT NULL REFERENCES conexiones (id),
  lectura_id              INTEGER       UNIQUE REFERENCES lecturas (id),
  tarifa_id               INTEGER       NOT NULL REFERENCES tarifas (id),
  consumo_litros          INTEGER       NOT NULL DEFAULT 0,
  -- Desglose congelado en el momento de la emisión (ADR-04).
  monto_basico_centavos   INTEGER       NOT NULL,
  monto_exceso_centavos   INTEGER       NOT NULL DEFAULT 0,
  bloques_cobrados        INTEGER       NOT NULL DEFAULT 0,
  monto_mora_centavos     INTEGER       NOT NULL DEFAULT 0,
  saldo_anterior_centavos INTEGER       NOT NULL DEFAULT 0,
  total_centavos          INTEGER       NOT NULL CHECK (total_centavos >= 0),
  saldo_centavos          INTEGER       NOT NULL CHECK (saldo_centavos >= 0),
  estado                  estado_recibo NOT NULL DEFAULT 'PENDIENTE',
  fecha_vencimiento       DATE          NOT NULL,
  emitido_en              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_recibos_conexion ON recibos (conexion_id, estado);
CREATE INDEX idx_recibos_periodo  ON recibos (periodo_id);
COMMENT ON TABLE recibos IS
  'Conserva el desglose aplicado. El recibo se reimprime idéntico sin recalcular (ADR-04).';

-- -------------------------------------------------------------- 9. pagos --
CREATE TABLE pagos (
  id               SERIAL PRIMARY KEY,
  correlativo      INTEGER     NOT NULL UNIQUE,
  recibo_id        INTEGER     NOT NULL REFERENCES recibos (id),
  monto_centavos   INTEGER     NOT NULL CHECK (monto_centavos > 0),
  fecha_pago       DATE        NOT NULL DEFAULT CURRENT_DATE,
  forma_pago       forma_pago  NOT NULL DEFAULT 'EFECTIVO',
  referencia       TEXT,
  recibido_por_id  INTEGER     NOT NULL REFERENCES usuarios (id),
  anulado          BOOLEAN     NOT NULL DEFAULT FALSE,
  motivo_anulacion TEXT,
  anulado_en       TIMESTAMPTZ,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pagos_recibo ON pagos (recibo_id);
CREATE INDEX idx_pagos_fecha  ON pagos (fecha_pago);
COMMENT ON COLUMN pagos.anulado IS 'La anulación no elimina el registro (RN-21).';

-- ------------------------------------------------------- 10. notas_ajuste --
CREATE TABLE notas_ajuste (
  id                 SERIAL PRIMARY KEY,
  recibo_id          INTEGER     NOT NULL REFERENCES recibos (id),
  tipo               tipo_nota   NOT NULL,
  monto_centavos     INTEGER     NOT NULL CHECK (monto_centavos > 0),
  motivo             TEXT        NOT NULL,
  autorizado_por_id  INTEGER     NOT NULL REFERENCES usuarios (id),
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE notas_ajuste IS 'Único mecanismo de corrección tras el cierre (RN-11).';

-- ----------------------------------------------------------- 11. bitacora --
CREATE TABLE bitacora (
  id              BIGSERIAL PRIMARY KEY,
  actor_id        INTEGER REFERENCES usuarios (id),
  accion          TEXT        NOT NULL,
  entidad         TEXT        NOT NULL,
  entidad_id      TEXT,
  valores_antes   JSONB,
  valores_despues JSONB,
  ip              TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bitacora_entidad ON bitacora (entidad, entidad_id);
CREATE INDEX idx_bitacora_fecha   ON bitacora (creado_en DESC);

-- --------------------------------------------------------- 12. parametros --
CREATE TABLE parametros (
  clave               TEXT PRIMARY KEY,
  valor               TEXT        NOT NULL,
  descripcion         TEXT,
  actualizado_por_id  INTEGER REFERENCES usuarios (id),
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===========================================================================
-- INTEGRIDAD APLICADA EN LA BASE DE DATOS
-- ---------------------------------------------------------------------------
-- Estas reglas se implementan aquí y no solo en la aplicación. Si la regla
-- vive únicamente en el código, cualquiera que entre por otra vía la salta.
-- ===========================================================================

-- RF-06.5: la bitácora solo admite inserción.
CREATE OR REPLACE FUNCTION fn_bitacora_inmutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora no admite modificación ni borrado.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bitacora_inmutable
  BEFORE UPDATE OR DELETE ON bitacora
  FOR EACH ROW EXECUTE FUNCTION fn_bitacora_inmutable();

-- RN-10: las lecturas de un periodo cerrado no se modifican.
CREATE OR REPLACE FUNCTION fn_lectura_periodo_cerrado() RETURNS TRIGGER AS $$
DECLARE v_estado estado_periodo;
BEGIN
  SELECT estado INTO v_estado FROM periodos WHERE id = OLD.periodo_id;
  IF v_estado = 'CERRADO' THEN
    RAISE EXCEPTION 'El periodo está cerrado: las lecturas no pueden modificarse.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lectura_periodo_cerrado
  BEFORE UPDATE OR DELETE ON lecturas
  FOR EACH ROW EXECUTE FUNCTION fn_lectura_periodo_cerrado();

-- RN-10 y RN-11: en un periodo cerrado solo puede cambiar el saldo del recibo
-- (por efecto de los pagos). El desglose y el total quedan congelados.
CREATE OR REPLACE FUNCTION fn_recibo_desglose_inmutable() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_centavos          <> OLD.total_centavos
  OR NEW.monto_basico_centavos   <> OLD.monto_basico_centavos
  OR NEW.monto_exceso_centavos   <> OLD.monto_exceso_centavos
  OR NEW.consumo_litros          <> OLD.consumo_litros
  OR NEW.correlativo             <> OLD.correlativo THEN
    RAISE EXCEPTION 'El desglose de un recibo emitido no se modifica. Use una nota de ajuste.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recibo_desglose_inmutable
  BEFORE UPDATE ON recibos
  FOR EACH ROW EXECUTE FUNCTION fn_recibo_desglose_inmutable();

CREATE RULE regla_no_borrar_recibos AS ON DELETE TO recibos DO INSTEAD NOTHING;

COMMIT;
