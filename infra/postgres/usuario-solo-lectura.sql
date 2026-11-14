-- Usuario de solo lectura para apps/reports (constitución, principio VI).
-- Variables de psql: dbname, owner (dueño de las tablas, el usuario de la API) y reportes_password.
--
-- Local: lo ejecuta infra/postgres/init/01-usuario-solo-lectura.sh al crear el contenedor.
-- Render / CI:
--   psql "$URL_ADMIN" -v dbname=apuestas -v owner=apuestas -v reportes_password='...' \
--        -f infra/postgres/usuario-solo-lectura.sql
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE reportes_lectura LOGIN PASSWORD %L', :'reportes_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reportes_lectura') \gexec

ALTER ROLE reportes_lectura SET default_transaction_read_only = on;

GRANT CONNECT ON DATABASE :"dbname" TO reportes_lectura;
GRANT USAGE ON SCHEMA public TO reportes_lectura;
REVOKE CREATE ON SCHEMA public FROM reportes_lectura;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO reportes_lectura;

-- Las tablas que la API cree en el futuro (migraciones de Prisma) también serán legibles.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT SELECT ON TABLES TO reportes_lectura;

-- default_transaction_read_only lo puede desactivar el propio rol, así que además se cierran las vías de
-- escritura que PostgreSQL concede a PUBLIC por defecto:
-- 1) tablas temporales (el dueño de la base conserva el permiso por ser su dueño);
REVOKE TEMPORARY ON DATABASE :"dbname" FROM PUBLIC;

-- 2) large objects. Revocar EXECUTE a PUBLIC exige ser dueño de las funciones (superusuario): funciona en
--    Docker y en CI. En Render no hay superusuario: queda como riesgo residual documentado en docs/despliegue.md.
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION lo_creat(integer), lo_create(oid), lo_from_bytea(oid, bytea) FROM PUBLIC;
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION lo_creat(integer), lo_create(oid), lo_from_bytea(oid, bytea) TO %I',
    current_user
  );
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Sin superusuario: no se pudo revocar la creación de large objects a PUBLIC';
END
$$;
