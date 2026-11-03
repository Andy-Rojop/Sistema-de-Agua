-- ===========================================================================
-- BLINDAJE DE LAS TABLAS EN SUPABASE
--
-- Ejecutar DESPUÉS de 01-esquema.sql y 02-datos-iniciales.sql,
-- únicamente si la base de datos está alojada en Supabase.
--
-- POR QUÉ ESTE ARCHIVO EXISTE
-- Supabase publica automáticamente todas las tablas del esquema `public` a
-- través de una API REST propia (PostgREST). Cualquiera que consiga la clave
-- pública del proyecto (`anon key`) —que viaja en el navegador y por lo tanto
-- es visible— podría leer el padrón, los recibos y los pagos SIN pasar por
-- nuestra API ni por el control de roles del sistema.
--
-- La solución es activar Row Level Security en todas las tablas y NO crear
-- ninguna política. El resultado:
--
--   * Las conexiones con `anon key` o `authenticated`: acceso denegado.
--   * Nuestro backend, que se conecta con el usuario `postgres` mediante el
--     controlador `pg`, sigue funcionando con normalidad, porque ese rol
--     omite las restricciones de RLS.
--
-- Es decir: la única puerta de entrada a los datos queda siendo nuestra API,
-- que sí verifica el rol del usuario en cada solicitud (RNF-SEG-03).
-- ===========================================================================

BEGIN;

ALTER TABLE usuarios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens_recuperacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens_invitacion   ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE conexiones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE medidores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarifas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecturas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE recibos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_ajuste  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacora      ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametros    ENABLE ROW LEVEL SECURITY;

-- Se revocan además los permisos de los roles públicos de Supabase, para que
-- ni siquiera puedan consultar la estructura de las tablas.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Y para las tablas que se creen en el futuro.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- COMPROBACIÓN
-- Ejecutar esta consulta después: las doce tablas deben aparecer con
-- rls_activo = true.
-- ---------------------------------------------------------------------------
SELECT tablename AS tabla, rowsecurity AS rls_activo
  FROM pg_tables
 WHERE schemaname = 'public'
 ORDER BY tablename;
