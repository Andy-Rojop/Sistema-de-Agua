-- ===========================================================================
-- Un recibo por conexión y periodo, y quién lo emitió.
--
-- Permite el cobro en campo (tesorero) sin duplicar la factura del cierre.
-- Ejecutar una sola vez en la base ya existente:
--   psql "$DATABASE_URL" -f bd/05-recibo-unico-periodo.sql
-- ===========================================================================

BEGIN;

ALTER TABLE recibos
  ADD COLUMN IF NOT EXISTS emitido_por_id INTEGER REFERENCES usuarios (id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recibos_periodo_conexion
  ON recibos (periodo_id, conexion_id);

COMMIT;
