-- ===========================================================================
-- Datos iniciales del sistema (instalación limpia)
--
-- Ejecutar DESPUÉS de 01-esquema.sql:
--   psql -U postgres -d agua_santafe -f 02-datos-iniciales.sql
--
-- No crea usuarios ni padrón: el primer administrador se registra desde
-- la pantalla «Crear cuenta» del sistema.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------- tarifa vigente ----
-- Q25.00 hasta 25,000 litros; Q1.00 por cada 1,000 litros de exceso.
INSERT INTO tarifas (
  nombre, vigente_desde, tarifa_basica_centavos, litros_incluidos,
  litros_por_bloque, precio_bloque_centavos, cuota_fija_centavos,
  redondeo_bloque, acuerdo_asamblea
) VALUES (
  'Tarifa 2026', '2026-01-01', 2500, 25000, 1000, 100, 2500,
  'ARRIBA', 'Pendiente de registrar el número de acta de asamblea'
);

-- ------------------------------------------------ parámetros de operación --
INSERT INTO parametros (clave, valor, descripcion) VALUES
  ('mora_tipo',                 'FIJO', 'FIJO (centavos) o PORCENTAJE (sobre el saldo)'),
  ('mora_valor',                '500',  'Q5.00 de recargo por periodo vencido'),
  ('umbral_consumo_excesivo',   '200',  'Porcentaje sobre el promedio para marcar posible fuga'),
  ('periodos_cero_alerta',      '3',    'Periodos consecutivos en cero antes de alertar'),
  ('minutos_expiracion_sesion', '30',   'Cierre de sesión por inactividad'),
  ('junta_nombre',              'Comité de Agua Potable, Parcelamiento Santa Fé', 'Título del recibo'),
  ('junta_direccion',           'Retalhuleu',                                    'Referencia geográfica (opcional)'),
  ('junta_telefono',            '',                                              'Encabezado del recibo');

COMMIT;
