-- CreateEnum
CREATE TYPE "tipo_cuenta" AS ENUM ('USUARIO_REAL', 'USUARIO_BONO', 'CASA', 'PASARELA', 'RETIROS_TRANSITO');

-- CreateEnum
CREATE TYPE "tipo_asiento" AS ENUM ('DEPOSITO', 'APUESTA', 'PREMIO', 'REEMBOLSO', 'BONO', 'CONVERSION_BONO', 'REVERSION_PREMIO', 'RETIRO_RESERVA', 'RETIRO_PAGO', 'RETIRO_DEVOLUCION');

-- CreateTable
CREATE TABLE "billetera" (
    "usuario_id" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billetera_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "cuenta_contable" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "tipo_cuenta" NOT NULL,
    "usuario_id" UUID,

    CONSTRAINT "cuenta_contable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asiento" (
    "id" UUID NOT NULL,
    "tipo" "tipo_asiento" NOT NULL,
    "clave_idempotencia" TEXT NOT NULL,
    "usuario_id" UUID,
    "origen_tipo" TEXT NOT NULL,
    "origen_id" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linea_asiento" (
    "id" UUID NOT NULL,
    "asiento_id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linea_asiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_contable_codigo_key" ON "cuenta_contable"("codigo");

-- CreateIndex
CREATE INDEX "cuenta_contable_usuario_id_idx" ON "cuenta_contable"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "asiento_clave_idempotencia_key" ON "asiento"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "asiento_usuario_id_creado_en_idx" ON "asiento"("usuario_id", "creado_en");

-- CreateIndex
CREATE INDEX "linea_asiento_cuenta_id_creado_en_idx" ON "linea_asiento"("cuenta_id", "creado_en");

-- CreateIndex
CREATE INDEX "linea_asiento_asiento_id_idx" ON "linea_asiento"("asiento_id");

-- AddForeignKey
ALTER TABLE "billetera" ADD CONSTRAINT "billetera_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_contable" ADD CONSTRAINT "cuenta_contable_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linea_asiento" ADD CONSTRAINT "linea_asiento_asiento_id_fkey" FOREIGN KEY ("asiento_id") REFERENCES "asiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linea_asiento" ADD CONSTRAINT "linea_asiento_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_contable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas del libro contable que Prisma no expresa (research §8, data-model.md).
ALTER TABLE "linea_asiento" ADD CONSTRAINT "linea_asiento_monto_no_cero" CHECK ("monto" <> 0);
ALTER TABLE "cuenta_contable" ADD CONSTRAINT "cuenta_contable_usuario_coherente" CHECK (
    ("tipo" IN ('USUARIO_REAL', 'USUARIO_BONO')) = ("usuario_id" IS NOT NULL)
);

-- Solo inserción (FR-036, principio II): ni la aplicación puede modificar, borrar ni vaciar el libro.
CREATE TRIGGER "asiento_solo_insercion" BEFORE UPDATE OR DELETE ON "asiento"
    FOR EACH ROW EXECUTE FUNCTION "spec2_solo_insercion"();
CREATE TRIGGER "asiento_sin_truncate" BEFORE TRUNCATE ON "asiento"
    FOR EACH STATEMENT EXECUTE FUNCTION "spec2_solo_insercion"();
CREATE TRIGGER "linea_asiento_solo_insercion" BEFORE UPDATE OR DELETE ON "linea_asiento"
    FOR EACH ROW EXECUTE FUNCTION "spec2_solo_insercion"();
CREATE TRIGGER "linea_asiento_sin_truncate" BEFORE TRUNCATE ON "linea_asiento"
    FOR EACH STATEMENT EXECUTE FUNCTION "spec2_solo_insercion"();
CREATE TRIGGER "cuenta_contable_solo_insercion" BEFORE UPDATE OR DELETE ON "cuenta_contable"
    FOR EACH ROW EXECUTE FUNCTION "spec2_solo_insercion"();

-- Doble entrada (SC-008): al confirmar la transacción, las líneas de cada asiento suman cero.
CREATE FUNCTION "spec2_asiento_cuadrado"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT COALESCE(SUM("monto"), 0) FROM "linea_asiento" WHERE "asiento_id" = NEW."asiento_id") <> 0 THEN
        RAISE EXCEPTION 'El asiento % no cuadra: sus líneas no suman cero', NEW."asiento_id"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "linea_asiento_cuadrado" AFTER INSERT ON "linea_asiento"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "spec2_asiento_cuadrado"();

-- Cuentas del sistema.
INSERT INTO "cuenta_contable" ("id", "codigo", "tipo") VALUES
    (gen_random_uuid(), 'casa', 'CASA'),
    (gen_random_uuid(), 'pasarela', 'PASARELA'),
    (gen_random_uuid(), 'retiros_transito', 'RETIROS_TRANSITO');