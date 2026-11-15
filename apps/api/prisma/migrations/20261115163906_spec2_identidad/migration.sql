-- CreateEnum
CREATE TYPE "rol" AS ENUM ('APOSTADOR', 'OPERADOR', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "estado_usuario" AS ENUM ('PENDIENTE_VERIFICACION', 'ACTIVO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "proposito_enlace" AS ENUM ('VERIFICACION_CORREO', 'RECUPERACION_CONTRASENA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "fecha_nacimiento" DATE NOT NULL,
    "roles" "rol"[] DEFAULT ARRAY['APOSTADOR']::"rol"[],
    "estado" "estado_usuario" NOT NULL DEFAULT 'PENDIENTE_VERIFICACION',
    "correo_verificado_en" TIMESTAMPTZ(3),
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credencial" (
    "usuario_id" UUID NOT NULL,
    "hash_contrasena" TEXT NOT NULL,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credencial_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "segundo_factor" (
    "usuario_id" UUID NOT NULL,
    "secreto_cifrado" TEXT NOT NULL,
    "activado_en" TIMESTAMPTZ(3),
    "ultimo_paso_usado" BIGINT,

    CONSTRAINT "segundo_factor_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "codigo_recuperacion" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "hash_codigo" TEXT NOT NULL,
    "usado_en" TIMESTAMPTZ(3),

    CONSTRAINT "codigo_recuperacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "familia_id" UUID NOT NULL,
    "hash_token" TEXT NOT NULL,
    "usada_en" TIMESTAMPTZ(3),
    "revocada_en" TIMESTAMPTZ(3),
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "ip" TEXT,
    "dispositivo" TEXT,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enlace_correo" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "proposito" "proposito_enlace" NOT NULL,
    "hash_token" TEXT NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "usado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enlace_correo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "codigo_recuperacion_usuario_id_idx" ON "codigo_recuperacion"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_hash_token_key" ON "sesion"("hash_token");

-- CreateIndex
CREATE INDEX "sesion_usuario_id_idx" ON "sesion"("usuario_id");

-- CreateIndex
CREATE INDEX "sesion_familia_id_idx" ON "sesion"("familia_id");

-- CreateIndex
CREATE UNIQUE INDEX "enlace_correo_hash_token_key" ON "enlace_correo"("hash_token");

-- CreateIndex
CREATE INDEX "enlace_correo_usuario_id_proposito_creado_en_idx" ON "enlace_correo"("usuario_id", "proposito", "creado_en");

-- AddForeignKey
ALTER TABLE "credencial" ADD CONSTRAINT "credencial_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segundo_factor" ADD CONSTRAINT "segundo_factor_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_recuperacion" ADD CONSTRAINT "codigo_recuperacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enlace_correo" ADD CONSTRAINT "enlace_correo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no expresa (data-model.md). Prisma no compara los CHECK al detectar deriva.
ALTER TABLE "usuario"
    ADD CONSTRAINT "usuario_email_normalizado" CHECK ("email" = lower(btrim("email")) AND "email" <> ''),
    ADD CONSTRAINT "usuario_roles_no_vacios" CHECK ("roles" IS NOT NULL AND cardinality("roles") > 0),
    ADD CONSTRAINT "usuario_intentos_no_negativos" CHECK ("intentos_fallidos" >= 0);
