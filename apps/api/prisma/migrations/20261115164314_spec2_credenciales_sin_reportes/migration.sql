-- FR-064 (research §14): reportes_lectura no puede leer las credenciales de los usuarios. Los privilegios por
-- defecto del Spec 1 le dan SELECT a toda tabla nueva, así que se le quita explícitamente en estas.
-- Si el rol todavía no existe (Render lo crea a mano), no falla: infra/postgres/usuario-solo-lectura.sql
-- repite el REVOKE al crearlo o al volver a ejecutarse.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reportes_lectura') THEN
        REVOKE ALL ON TABLE "credencial", "segundo_factor", "codigo_recuperacion", "sesion", "enlace_correo"
            FROM reportes_lectura;
    END IF;
END
$$;