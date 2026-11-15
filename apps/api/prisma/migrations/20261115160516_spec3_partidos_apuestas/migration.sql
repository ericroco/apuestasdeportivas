-- CreateEnum
CREATE TYPE "estado_partido" AS ENUM ('PROGRAMADO', 'EN_VIVO', 'FINALIZADO', 'SUSPENDIDO', 'APLAZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "origen_dato" AS ENUM ('OPERADOR', 'PROVEEDOR', 'SIMULACION');

-- CreateEnum
CREATE TYPE "tipo_mercado" AS ENUM ('RESULTADO_FINAL', 'DOBLE_OPORTUNIDAD', 'MAS_MENOS_GOLES', 'AMBOS_MARCAN');

-- CreateEnum
CREATE TYPE "estado_mercado" AS ENUM ('ABIERTO', 'SUSPENDIDO', 'CERRADO');

-- CreateEnum
CREATE TYPE "codigo_seleccion" AS ENUM ('LOCAL', 'EMPATE', 'VISITANTE', 'LOCAL_EMPATE', 'EMPATE_VISITANTE', 'LOCAL_VISITANTE', 'MAS', 'MENOS', 'SI', 'NO');

-- CreateEnum
CREATE TYPE "resultado_seleccion" AS ENUM ('PENDIENTE', 'GANADORA', 'PERDEDORA', 'ANULADA');

-- CreateEnum
CREATE TYPE "tipo_apuesta" AS ENUM ('SIMPLE', 'COMBINADA');

-- CreateEnum
CREATE TYPE "estado_apuesta" AS ENUM ('PENDIENTE', 'GANADA', 'PERDIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "tipo_saldo_apuesta" AS ENUM ('REAL', 'BONO');

-- CreateEnum
CREATE TYPE "estado_solicitud_vivo" AS ENUM ('EN_ESPERA', 'ACEPTADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "tipo_liquidacion" AS ENUM ('LIQUIDACION', 'ANULACION', 'RELIQUIDACION');

-- CreateTable
CREATE TABLE "competicion" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "pais" TEXT,
    "id_proveedor" INTEGER,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partido" (
    "id" UUID NOT NULL,
    "competicion_id" UUID NOT NULL,
    "nombre_local" TEXT NOT NULL,
    "nombre_visitante" TEXT NOT NULL,
    "inicio_en" TIMESTAMPTZ(3) NOT NULL,
    "inicio_original_en" TIMESTAMPTZ(3) NOT NULL,
    "estado" "estado_partido" NOT NULL DEFAULT 'PROGRAMADO',
    "goles_local" INTEGER,
    "goles_visitante" INTEGER,
    "minuto" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "version_resultado" INTEGER NOT NULL DEFAULT 0,
    "suspendido_en" TIMESTAMPTZ(3),
    "goles_local_suspension" INTEGER,
    "goles_visitante_suspension" INTEGER,
    "origen" "origen_dato" NOT NULL,
    "id_proveedor" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mercado" (
    "id" UUID NOT NULL,
    "partido_id" UUID NOT NULL,
    "tipo" "tipo_mercado" NOT NULL,
    "linea" DECIMAL(4,1),
    "estado" "estado_mercado" NOT NULL DEFAULT 'ABIERTO',
    "admite_vivo" BOOLEAN NOT NULL DEFAULT false,
    "gestionado_por_operador" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "mercado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seleccion" (
    "id" UUID NOT NULL,
    "mercado_id" UUID NOT NULL,
    "codigo" "codigo_seleccion" NOT NULL,
    "cuota" DECIMAL(8,2) NOT NULL,
    "resultado" "resultado_seleccion" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "seleccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_cuota" (
    "id" UUID NOT NULL,
    "seleccion_id" UUID NOT NULL,
    "cuota_anterior" DECIMAL(8,2),
    "cuota_nueva" DECIMAL(8,2) NOT NULL,
    "actor_id" TEXT,
    "origen" "origen_dato" NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_cuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apuesta" (
    "id" UUID NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "clave_solicitud" UUID NOT NULL,
    "tipo" "tipo_apuesta" NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "tipo_saldo" "tipo_saldo_apuesta" NOT NULL,
    "cuota_total" DECIMAL(12,2) NOT NULL,
    "ganancia_potencial" DECIMAL(14,2) NOT NULL,
    "estado" "estado_apuesta" NOT NULL DEFAULT 'PENDIENTE',
    "premio_pagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cupon_id" TEXT,
    "en_vivo" BOOLEAN NOT NULL,
    "aceptada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liquidada_en" TIMESTAMPTZ(3),

    CONSTRAINT "apuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seleccion_apostada" (
    "id" UUID NOT NULL,
    "apuesta_id" UUID NOT NULL,
    "seleccion_id" UUID NOT NULL,
    "partido_id" UUID NOT NULL,
    "cuota_congelada" DECIMAL(8,2) NOT NULL,
    "resultado" "resultado_seleccion" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "seleccion_apostada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_apuesta_vivo" (
    "id" UUID NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "clave_solicitud" UUID NOT NULL,
    "datos" JSONB NOT NULL,
    "version_partido" INTEGER NOT NULL,
    "estado" "estado_solicitud_vivo" NOT NULL DEFAULT 'EN_ESPERA',
    "motivo_rechazo" TEXT,
    "apuesta_id" UUID,
    "ejecutar_en" TIMESTAMPTZ(3) NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_apuesta_vivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidacion" (
    "id" UUID NOT NULL,
    "apuesta_id" UUID NOT NULL,
    "tipo" "tipo_liquidacion" NOT NULL,
    "estado_resultante" "estado_apuesta" NOT NULL,
    "monto_movido" DECIMAL(14,2) NOT NULL,
    "version_resultado" INTEGER NOT NULL,
    "clave_idempotencia" TEXT NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_proveedor" (
    "fecha" DATE NOT NULL,
    "consultas" INTEGER NOT NULL DEFAULT 0,
    "limite" INTEGER NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "consumo_proveedor_pkey" PRIMARY KEY ("fecha")
);

-- CreateIndex
CREATE UNIQUE INDEX "competicion_id_proveedor_key" ON "competicion"("id_proveedor");

-- CreateIndex
CREATE UNIQUE INDEX "partido_id_proveedor_key" ON "partido"("id_proveedor");

-- CreateIndex
CREATE INDEX "partido_estado_inicio_en_idx" ON "partido"("estado", "inicio_en");

-- CreateIndex
CREATE INDEX "partido_competicion_id_idx" ON "partido"("competicion_id");

-- CreateIndex
CREATE UNIQUE INDEX "mercado_partido_id_tipo_linea_key" ON "mercado"("partido_id", "tipo", "linea");

-- CreateIndex
CREATE UNIQUE INDEX "seleccion_mercado_id_codigo_key" ON "seleccion"("mercado_id", "codigo");

-- CreateIndex
CREATE INDEX "historial_cuota_seleccion_id_creado_en_idx" ON "historial_cuota"("seleccion_id", "creado_en");

-- CreateIndex
CREATE INDEX "apuesta_usuario_id_aceptada_en_idx" ON "apuesta"("usuario_id", "aceptada_en");

-- CreateIndex
CREATE UNIQUE INDEX "apuesta_usuario_id_clave_solicitud_key" ON "apuesta"("usuario_id", "clave_solicitud");

-- CreateIndex
CREATE INDEX "seleccion_apostada_seleccion_id_idx" ON "seleccion_apostada"("seleccion_id");

-- CreateIndex
CREATE INDEX "seleccion_apostada_partido_id_idx" ON "seleccion_apostada"("partido_id");

-- CreateIndex
CREATE UNIQUE INDEX "seleccion_apostada_apuesta_id_partido_id_key" ON "seleccion_apostada"("apuesta_id", "partido_id");

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_apuesta_vivo_usuario_id_clave_solicitud_key" ON "solicitud_apuesta_vivo"("usuario_id", "clave_solicitud");

-- CreateIndex
CREATE UNIQUE INDEX "liquidacion_clave_idempotencia_key" ON "liquidacion"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "liquidacion_apuesta_id_idx" ON "liquidacion"("apuesta_id");

-- AddForeignKey
ALTER TABLE "partido" ADD CONSTRAINT "partido_competicion_id_fkey" FOREIGN KEY ("competicion_id") REFERENCES "competicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mercado" ADD CONSTRAINT "mercado_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seleccion" ADD CONSTRAINT "seleccion_mercado_id_fkey" FOREIGN KEY ("mercado_id") REFERENCES "mercado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_cuota" ADD CONSTRAINT "historial_cuota_seleccion_id_fkey" FOREIGN KEY ("seleccion_id") REFERENCES "seleccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seleccion_apostada" ADD CONSTRAINT "seleccion_apostada_apuesta_id_fkey" FOREIGN KEY ("apuesta_id") REFERENCES "apuesta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seleccion_apostada" ADD CONSTRAINT "seleccion_apostada_seleccion_id_fkey" FOREIGN KEY ("seleccion_id") REFERENCES "seleccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seleccion_apostada" ADD CONSTRAINT "seleccion_apostada_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "partido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_apuesta_vivo" ADD CONSTRAINT "solicitud_apuesta_vivo_apuesta_id_fkey" FOREIGN KEY ("apuesta_id") REFERENCES "apuesta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion" ADD CONSTRAINT "liquidacion_apuesta_id_fkey" FOREIGN KEY ("apuesta_id") REFERENCES "apuesta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================================================
-- Spec 3: defensa en profundidad (research.md §11). Ni un error de código ni una consulta manual pueden
-- borrar o alterar una apuesta aceptada, su selección congelada, una liquidación o el historial de cuotas.
-- TRUNCATE no dispara estos disparadores de fila: la limpieza de las pruebas sigue funcionando.
-- =====================================================================================================

CREATE FUNCTION spec3_rechazar_modificacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es inmutable: % no está permitido', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- Apuesta: sin DELETE; UPDATE solo de estado, cuota total (anulación a 1.00), ganancia potencial,
-- premio pagado y fecha de liquidación.
CREATE FUNCTION spec3_proteger_apuesta() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.clave_solicitud IS DISTINCT FROM OLD.clave_solicitud
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.monto IS DISTINCT FROM OLD.monto
     OR NEW.tipo_saldo IS DISTINCT FROM OLD.tipo_saldo
     OR NEW.cupon_id IS DISTINCT FROM OLD.cupon_id
     OR NEW.en_vivo IS DISTINCT FROM OLD.en_vivo
     OR NEW.aceptada_en IS DISTINCT FROM OLD.aceptada_en THEN
    RAISE EXCEPTION 'Apuesta %: solo se pueden cambiar estado, cuota total, ganancia potencial, premio y fecha de liquidación', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- Selección apostada: la cuota congelada y sus referencias no cambian; solo su resultado.
CREATE FUNCTION spec3_proteger_seleccion_apostada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.apuesta_id IS DISTINCT FROM OLD.apuesta_id
     OR NEW.seleccion_id IS DISTINCT FROM OLD.seleccion_id
     OR NEW.partido_id IS DISTINCT FROM OLD.partido_id
     OR NEW.cuota_congelada IS DISTINCT FROM OLD.cuota_congelada THEN
    RAISE EXCEPTION 'Selección apostada %: solo se puede cambiar su resultado', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER apuesta_sin_borrado BEFORE DELETE ON "apuesta"
  FOR EACH ROW EXECUTE FUNCTION spec3_rechazar_modificacion();
CREATE TRIGGER apuesta_columnas_congeladas BEFORE UPDATE ON "apuesta"
  FOR EACH ROW EXECUTE FUNCTION spec3_proteger_apuesta();

CREATE TRIGGER seleccion_apostada_sin_borrado BEFORE DELETE ON "seleccion_apostada"
  FOR EACH ROW EXECUTE FUNCTION spec3_rechazar_modificacion();
CREATE TRIGGER seleccion_apostada_columnas_congeladas BEFORE UPDATE ON "seleccion_apostada"
  FOR EACH ROW EXECUTE FUNCTION spec3_proteger_seleccion_apostada();

-- Append-only.
CREATE TRIGGER liquidacion_solo_insercion BEFORE UPDATE OR DELETE ON "liquidacion"
  FOR EACH ROW EXECUTE FUNCTION spec3_rechazar_modificacion();
CREATE TRIGGER historial_cuota_solo_insercion BEFORE UPDATE OR DELETE ON "historial_cuota"
  FOR EACH ROW EXECUTE FUNCTION spec3_rechazar_modificacion();

-- Reglas de dominio que la base de datos también hace cumplir.
ALTER TABLE "partido"
  ADD CONSTRAINT partido_equipos_distintos CHECK (nombre_local <> nombre_visitante),
  ADD CONSTRAINT partido_goles_no_negativos CHECK (
    COALESCE(goles_local, 0) >= 0 AND COALESCE(goles_visitante, 0) >= 0
    AND COALESCE(goles_local_suspension, 0) >= 0 AND COALESCE(goles_visitante_suspension, 0) >= 0);
ALTER TABLE "mercado"
  ADD CONSTRAINT mercado_linea_valida CHECK (
    (tipo = 'MAS_MENOS_GOLES' AND linea IS NOT NULL AND linea > 0 AND linea - floor(linea) = 0.5)
    OR (tipo <> 'MAS_MENOS_GOLES' AND linea IS NULL));
ALTER TABLE "seleccion" ADD CONSTRAINT seleccion_cuota_mayor_a_uno CHECK (cuota > 1.00);
ALTER TABLE "historial_cuota" ADD CONSTRAINT historial_cuota_mayor_a_uno CHECK (cuota_nueva > 1.00);
ALTER TABLE "seleccion_apostada"
  ADD CONSTRAINT seleccion_apostada_cuota_valida CHECK (cuota_congelada >= 1.00);
ALTER TABLE "apuesta"
  ADD CONSTRAINT apuesta_monto_positivo CHECK (monto > 0),
  ADD CONSTRAINT apuesta_cuota_total_valida CHECK (cuota_total >= 1.00),
  ADD CONSTRAINT apuesta_ganancia_no_negativa CHECK (ganancia_potencial >= 0);
ALTER TABLE "consumo_proveedor"
  ADD CONSTRAINT consumo_proveedor_valores_no_negativos CHECK (consultas >= 0 AND limite >= 0);
