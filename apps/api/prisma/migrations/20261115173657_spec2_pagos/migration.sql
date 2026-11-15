-- CreateEnum
CREATE TYPE "estado_intencion_pago" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'FALLIDA', 'CADUCADA', 'RECHAZADA_DISCREPANCIA');

-- CreateEnum
CREATE TYPE "tipo_metodo_pago" AS ENUM ('TARJETA', 'APP_PAYPHONE');

-- CreateTable
CREATE TABLE "intencion_pago" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "moneda" CHAR(3) NOT NULL DEFAULT 'USD',
    "codigo_cupon" TEXT,
    "estado" "estado_intencion_pago" NOT NULL DEFAULT 'PENDIENTE',
    "payphone_payment_id" TEXT,
    "payphone_transaccion_id" BIGINT,
    "metodo_pago_id" UUID,
    "motivo_fallo" TEXT,
    "ip" TEXT,
    "dispositivo" TEXT,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "resuelta_en" TIMESTAMPTZ(3),

    CONSTRAINT "intencion_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metodo_pago" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_metodo_pago" NOT NULL,
    "marca" TEXT,
    "ultimos_digitos" TEXT,
    "titular_nombre" TEXT,
    "titular_documento" TEXT,
    "telefono" TEXT,
    "huella" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metodo_pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intencion_pago_payphone_transaccion_id_key" ON "intencion_pago"("payphone_transaccion_id");

-- CreateIndex
CREATE INDEX "intencion_pago_usuario_id_creada_en_idx" ON "intencion_pago"("usuario_id", "creada_en");

-- CreateIndex
CREATE INDEX "intencion_pago_estado_expira_en_idx" ON "intencion_pago"("estado", "expira_en");

-- CreateIndex
CREATE UNIQUE INDEX "metodo_pago_usuario_id_huella_key" ON "metodo_pago"("usuario_id", "huella");

-- AddForeignKey
ALTER TABLE "intencion_pago" ADD CONSTRAINT "intencion_pago_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intencion_pago" ADD CONSTRAINT "intencion_pago_metodo_pago_id_fkey" FOREIGN KEY ("metodo_pago_id") REFERENCES "metodo_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metodo_pago" ADD CONSTRAINT "metodo_pago_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defensa en profundidad (data-model.md): una vez registrada, la intención no cambia de usuario, monto, moneda ni
-- cupón; solo avanzan su estado y los datos que devuelve Payphone.
CREATE FUNCTION "spec2_intencion_congelada"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."usuario_id" <> OLD."usuario_id" OR NEW."monto" <> OLD."monto" OR NEW."moneda" <> OLD."moneda"
        OR NEW."codigo_cupon" IS DISTINCT FROM OLD."codigo_cupon" THEN
        RAISE EXCEPTION 'La intención de pago % no puede cambiar de usuario, monto, moneda ni cupón', OLD."id"
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "intencion_pago_congelada" BEFORE UPDATE ON "intencion_pago"
    FOR EACH ROW EXECUTE FUNCTION "spec2_intencion_congelada"();
CREATE TRIGGER "intencion_pago_sin_borrado" BEFORE DELETE ON "intencion_pago"
    FOR EACH ROW EXECUTE FUNCTION "spec2_solo_insercion"();
ALTER TABLE "intencion_pago" ADD CONSTRAINT "intencion_pago_monto_positivo" CHECK ("monto" > 0);