-- CreateEnum
CREATE TYPE "estado_retiro" AS ENUM ('PENDIENTE_REVISION', 'PAGADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "retiro" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "metodo_pago_id" UUID NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "clave_solicitud" UUID NOT NULL,
    "estado" "estado_retiro" NOT NULL DEFAULT 'PENDIENTE_REVISION',
    "motivos_revision" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referencia_pago" TEXT,
    "resuelto_por_id" UUID,
    "comentario" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelto_en" TIMESTAMPTZ(3),

    CONSTRAINT "retiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retiro_estado_creado_en_idx" ON "retiro"("estado", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "retiro_usuario_id_clave_solicitud_key" ON "retiro"("usuario_id", "clave_solicitud");

-- AddForeignKey
ALTER TABLE "retiro" ADD CONSTRAINT "retiro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retiro" ADD CONSTRAINT "retiro_metodo_pago_id_fkey" FOREIGN KEY ("metodo_pago_id") REFERENCES "metodo_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retiro" ADD CONSTRAINT "retiro_resuelto_por_id_fkey" FOREIGN KEY ("resuelto_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defensa en profundidad: un retiro no cambia de usuario, monto ni método, no se borra y no vuelve atrás.
CREATE FUNCTION "spec2_retiro_congelado"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."usuario_id" <> OLD."usuario_id" OR NEW."monto" <> OLD."monto"
        OR NEW."metodo_pago_id" <> OLD."metodo_pago_id" THEN
        RAISE EXCEPTION 'El retiro % no puede cambiar de usuario, monto ni método', OLD."id"
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD."estado" <> 'PENDIENTE_REVISION' AND NEW."estado" <> OLD."estado" THEN
        RAISE EXCEPTION 'El retiro % ya está resuelto', OLD."id" USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "retiro_congelado" BEFORE UPDATE ON "retiro"
    FOR EACH ROW EXECUTE FUNCTION "spec2_retiro_congelado"();
CREATE TRIGGER "retiro_sin_borrado" BEFORE DELETE ON "retiro"
    FOR EACH ROW EXECUTE FUNCTION "spec2_solo_insercion"();
ALTER TABLE "retiro" ADD CONSTRAINT "retiro_monto_positivo" CHECK ("monto" > 0);
ALTER TABLE "retiro" ADD CONSTRAINT "retiro_sin_autoaprobacion" CHECK ("resuelto_por_id" IS NULL OR "resuelto_por_id" <> "usuario_id");