-- Billetera SQL de prueba del Spec 3 (research.md §12). Solo para las pruebas: vive en el esquema `pruebas`,
-- fuera de las migraciones, para que `prisma migrate dev` no detecte deriva en `public`.
-- Se reemplaza por la billetera real cuando el Spec 2 entre en develop.
-- Cada sentencia termina en `;` al final de la línea: app-prueba.ts las ejecuta una por una.
CREATE SCHEMA IF NOT EXISTS pruebas;

-- Una fila por usuario: es la que se bloquea con FOR UPDATE. El saldo NO se guarda aquí: se deriva del ledger.
CREATE TABLE IF NOT EXISTS pruebas.billetera (
  usuario_id text PRIMARY KEY,
  creada_en timestamptz NOT NULL DEFAULT now()
);

-- Ledger: positivo = entra dinero, negativo = sale. Nunca se actualiza; la clave de idempotencia es única.
CREATE TABLE IF NOT EXISTS pruebas.asiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id text NOT NULL REFERENCES pruebas.billetera (usuario_id),
  operacion text NOT NULL,
  tipo_saldo text NOT NULL CHECK (tipo_saldo IN ('REAL', 'BONO')),
  monto numeric(14, 2) NOT NULL,
  clave_idempotencia text NOT NULL UNIQUE,
  referencia text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asiento_usuario_idx ON pruebas.asiento (usuario_id, tipo_saldo);
