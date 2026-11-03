-- ===========================================================================
-- Tokens de invitación para el registro (instalaciones ya existentes)
--
-- Ejecutar una sola vez:
--   psql -U postgres -d agua_santafe -f 05-tokens-invitacion.sql
-- En Supabase: SQL Editor → pegar y Run.
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tokens_invitacion (
  id          SERIAL PRIMARY KEY,
  token_hash  TEXT        NOT NULL UNIQUE,
  rol         rol_usuario NOT NULL DEFAULT 'FONTANERO',
  creado_por  INTEGER     NOT NULL REFERENCES usuarios (id),
  expira_en   TIMESTAMPTZ NOT NULL,
  usado_en    TIMESTAMPTZ,
  usado_por   INTEGER     REFERENCES usuarios (id),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tokens_invitacion_pendientes
  ON tokens_invitacion (expira_en) WHERE usado_en IS NULL;

COMMIT;
