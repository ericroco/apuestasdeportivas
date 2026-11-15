-- CreateEnum
CREATE TYPE "tipo_cupon" AS ENUM ('BONO_DEPOSITO', 'APUESTA_GRATIS', 'AUMENTO_CUOTA');

-- CreateEnum
CREATE TYPE "estado_cupon" AS ENUM ('ACTIVO', 'PAUSADO');

-- CreateEnum
CREATE TYPE "origen_canje" AS ENUM ('APUESTA', 'DEPOSITO');

-- CreateEnum
CREATE TYPE "estado_canje" AS ENUM ('ACEPTADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "estado_bono" AS ENUM ('ACTIVO', 'CUMPLIDO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "tipo_actividad" AS ENUM ('REGISTRO', 'DEPOSITO', 'APUESTA_ACEPTADA', 'APUESTA_LIQUIDADA', 'RETIRO');

-- CreateEnum
CREATE TYPE "regla_fraude" AS ENUM ('CUENTAS_DISPOSITIVO', 'CUENTAS_IP', 'METODO_PAGO_COMPARTIDO', 'CUPON_CUENTA_MULTIPLE', 'APUESTA_MONTO_ANOMALO', 'RAFAGA_APUESTAS', 'RETIRO_TRAS_DEPOSITO');

-- CreateEnum
CREATE TYPE "severidad_alerta" AS ENUM ('MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "estado_alerta" AS ENUM ('ABIERTA', 'CONFIRMADA', 'DESCARTADA');

-- CreateTable
CREATE TABLE "cupon" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(20) NOT NULL,
    "tipo" "tipo_cupon" NOT NULL,
    "porcentaje" DECIMAL(5,2),
    "monto_fijo" DECIMAL(14,2),
    "tope_bono" DECIMAL(14,2),
    "deposito_minimo" DECIMAL(14,2),
    "apuesta_maxima" DECIMAL(14,2),
    "inicia_en" TIMESTAMPTZ(3) NOT NULL,
    "termina_en" TIMESTAMPTZ(3) NOT NULL,
    "cupo_total" INTEGER NOT NULL,
    "limite_por_usuario" INTEGER NOT NULL DEFAULT 1,
    "canjes" INTEGER NOT NULL DEFAULT 0,
    "estado" "estado_cupon" NOT NULL DEFAULT 'ACTIVO',
    "creado_por" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canje_cupon" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cupon_id" UUID,
    "codigo" VARCHAR(40) NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "origen" "origen_canje" NOT NULL,
    "referencia_id" TEXT,
    "estado" "estado_canje" NOT NULL,
    "motivo" TEXT,
    "numero" INTEGER,
    "metodo_pago_huella" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canje_cupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bono" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" TEXT NOT NULL,
    "cupon_id" UUID NOT NULL,
    "canje_id" UUID NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "requisito" DECIMAL(14,2) NOT NULL,
    "avance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" "estado_bono" NOT NULL DEFAULT 'ACTIVO',
    "otorgado_en" TIMESTAMPTZ(3) NOT NULL,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "cumplido_en" TIMESTAMPTZ(3),
    "monto_convertido" DECIMAL(14,2),

    CONSTRAINT "bono_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividad_usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" TEXT NOT NULL,
    "tipo" "tipo_actividad" NOT NULL,
    "referencia_id" TEXT NOT NULL,
    "monto" DECIMAL(14,2),
    "cuota" DECIMAL(12,2),
    "tipo_saldo" TEXT,
    "resultado" TEXT,
    "ip" TEXT,
    "dispositivo" TEXT,
    "metodo_pago_huella" TEXT,
    "ocurrido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actividad_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerta_fraude" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "regla" "regla_fraude" NOT NULL,
    "severidad" "severidad_alerta" NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "evidencia" JSONB NOT NULL,
    "clave_deduplicacion" TEXT NOT NULL,
    "estado" "estado_alerta" NOT NULL DEFAULT 'ABIERTA',
    "nota" TEXT,
    "resuelta_por" TEXT,
    "resuelta_en" TIMESTAMPTZ(3),
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerta_fraude_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cupon_codigo_key" ON "cupon"("codigo");

-- CreateIndex
CREATE INDEX "cupon_creado_en_idx" ON "cupon"("creado_en");

-- CreateIndex
CREATE INDEX "canje_cupon_usuario_id_creado_en_idx" ON "canje_cupon"("usuario_id", "creado_en");

-- CreateIndex
CREATE INDEX "canje_cupon_cupon_id_estado_idx" ON "canje_cupon"("cupon_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "canje_cupon_origen_referencia_id_key" ON "canje_cupon"("origen", "referencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "canje_cupon_cupon_id_usuario_id_numero_key" ON "canje_cupon"("cupon_id", "usuario_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "bono_canje_id_key" ON "bono"("canje_id");

-- CreateIndex
CREATE INDEX "bono_usuario_id_estado_idx" ON "bono"("usuario_id", "estado");

-- CreateIndex
CREATE INDEX "bono_cupon_id_idx" ON "bono"("cupon_id");

-- CreateIndex
CREATE INDEX "actividad_usuario_usuario_id_tipo_ocurrido_en_idx" ON "actividad_usuario"("usuario_id", "tipo", "ocurrido_en");

-- CreateIndex
CREATE INDEX "actividad_usuario_dispositivo_idx" ON "actividad_usuario"("dispositivo");

-- CreateIndex
CREATE INDEX "actividad_usuario_ip_ocurrido_en_idx" ON "actividad_usuario"("ip", "ocurrido_en");

-- CreateIndex
CREATE INDEX "actividad_usuario_metodo_pago_huella_idx" ON "actividad_usuario"("metodo_pago_huella");

-- CreateIndex
CREATE UNIQUE INDEX "actividad_usuario_tipo_referencia_id_key" ON "actividad_usuario"("tipo", "referencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "alerta_fraude_clave_deduplicacion_key" ON "alerta_fraude"("clave_deduplicacion");

-- CreateIndex
CREATE INDEX "alerta_fraude_estado_creada_en_idx" ON "alerta_fraude"("estado", "creada_en");

-- CreateIndex
CREATE INDEX "alerta_fraude_usuario_id_estado_idx" ON "alerta_fraude"("usuario_id", "estado");

-- AddForeignKey
ALTER TABLE "canje_cupon" ADD CONSTRAINT "canje_cupon_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "cupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bono" ADD CONSTRAINT "bono_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "cupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bono" ADD CONSTRAINT "bono_canje_id_fkey" FOREIGN KEY ("canje_id") REFERENCES "canje_cupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------------------
-- Agregado a mano (Prisma no declara CHECK ni índices parciales). Ver data-model.md del Spec 4.
-- ---------------------------------------------------------------------------------------------------------------

-- Cupón: los campos que no corresponden al tipo son nulos y los obligatorios del tipo no lo son, con sus rangos.
ALTER TABLE "cupon" ADD CONSTRAINT "cupon_campos_por_tipo_check" CHECK (
    (
        "tipo" = 'BONO_DEPOSITO'
        AND "porcentaje" IS NOT NULL AND "porcentaje" BETWEEN 1 AND 200
        AND "tope_bono" IS NOT NULL AND "tope_bono" > 0
        AND "deposito_minimo" IS NOT NULL AND "deposito_minimo" >= 0
        AND "monto_fijo" IS NULL AND "apuesta_maxima" IS NULL
    )
    OR (
        "tipo" = 'APUESTA_GRATIS'
        AND "monto_fijo" IS NOT NULL AND "monto_fijo" > 0
        AND "porcentaje" IS NULL AND "tope_bono" IS NULL AND "deposito_minimo" IS NULL AND "apuesta_maxima" IS NULL
    )
    OR (
        "tipo" = 'AUMENTO_CUOTA'
        AND "porcentaje" IS NOT NULL AND "porcentaje" BETWEEN 1 AND 100
        AND "apuesta_maxima" IS NOT NULL AND "apuesta_maxima" > 0
        AND "monto_fijo" IS NULL AND "tope_bono" IS NULL AND "deposito_minimo" IS NULL
    )
);

-- Cupón: red de seguridad del cupo (el canje bloquea la fila y cuenta dentro de la transacción).
ALTER TABLE "cupon" ADD CONSTRAINT "cupon_canjes_cupo_check" CHECK ("canjes" >= 0 AND "canjes" <= "cupo_total");
ALTER TABLE "cupon" ADD CONSTRAINT "cupon_cupo_limite_check" CHECK ("cupo_total" > 0 AND "limite_por_usuario" >= 1);
ALTER TABLE "cupon" ADD CONSTRAINT "cupon_vigencia_check" CHECK ("termina_en" > "inicia_en");
ALTER TABLE "cupon" ADD CONSTRAINT "cupon_codigo_formato_check" CHECK ("codigo" ~ '^[A-Z0-9]{4,20}$');

-- Canje: un aceptado lleva su número y no tiene motivo; un rechazado siempre tiene motivo.
ALTER TABLE "canje_cupon" ADD CONSTRAINT "canje_cupon_estado_check" CHECK (
    ("estado" = 'ACEPTADO' AND "cupon_id" IS NOT NULL AND "numero" IS NOT NULL AND "motivo" IS NULL)
    OR ("estado" = 'RECHAZADO' AND "motivo" IS NOT NULL AND "numero" IS NULL)
);

-- Bono: montos positivos y avance que no es negativo.
ALTER TABLE "bono" ADD CONSTRAINT "bono_montos_check" CHECK ("monto" > 0 AND "requisito" >= "monto" AND "avance" >= 0);

-- Bono: un solo bono ACTIVO por usuario (evita apilar bonos aunque dos canjes lleguen a la vez).
CREATE UNIQUE INDEX "bono_usuario_activo_key" ON "bono" ("usuario_id") WHERE "estado" = 'ACTIVO';
