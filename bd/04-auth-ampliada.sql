-- ===========================================================================
-- Ampliación de autenticación (instalaciones ya existentes)
--
-- Agrega dirección en usuarios y la tabla de tokens de recuperación.
-- Ejecutar una sola vez:
--   psql -U postgres -d agua_santafe -f 04-auth-ampliada.sql
-- ===========================================================================

BEGIN;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS direccion TEXT;

CREATE TABLE IF NOT EXISTS tokens_recuperacion (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER     NOT NULL REFERENCES usuarios (id),
  token_hash  TEXT        NOT NULL UNIQUE,
  expira_en   TIMESTAMPTZ NOT NULL,
  usado_en    TIMESTAMPTZ,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tokens_recuperacion_usuario
  ON tokens_recuperacion (usuario_id);

COMMIT;
