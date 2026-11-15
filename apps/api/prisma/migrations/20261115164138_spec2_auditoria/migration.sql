-- CreateTable
CREATE TABLE "evento_auditoria" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "datos" JSONB,
    "ip" TEXT,
    "dispositivo" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_auditoria_creado_en_idx" ON "evento_auditoria"("creado_en");

-- CreateIndex
CREATE INDEX "evento_auditoria_actor_id_creado_en_idx" ON "evento_auditoria"("actor_id", "creado_en");

-- CreateIndex
CREATE INDEX "evento_auditoria_accion_creado_en_idx" ON "evento_auditoria"("accion", "creado_en");

-- CreateIndex
CREATE INDEX "evento_auditoria_entidad_entidad_id_idx" ON "evento_auditoria"("entidad", "entidad_id");

-- Formato de la acción: entidad.verbo_en_pasado (contrato 3), p. ej. usuario.rol_cambiado.
ALTER TABLE "evento_auditoria"
    ADD CONSTRAINT "evento_auditoria_accion_formato" CHECK ("accion" ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$');

-- Solo inserción (FR-030, principio II): ni la propia aplicación puede modificar, borrar ni vaciar la tabla.
-- La función es genérica y la reutilizan las tablas del libro contable del Spec 2.
CREATE FUNCTION "spec2_solo_insercion"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'La tabla % es de solo inserción: % no está permitido', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "evento_auditoria_solo_insercion"
    BEFORE UPDATE OR DELETE ON "evento_auditoria"
    FOR EACH ROW EXECUTE FUNCTION "spec2_solo_insercion"();

CREATE TRIGGER "evento_auditoria_sin_truncate"
    BEFORE TRUNCATE ON "evento_auditoria"
    FOR EACH STATEMENT EXECUTE FUNCTION "spec2_solo_insercion"();