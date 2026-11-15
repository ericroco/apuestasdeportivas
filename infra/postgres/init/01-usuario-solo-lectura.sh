#!/bin/bash
# Se ejecuta una sola vez, cuando el volumen de PostgreSQL está vacío.
set -euo pipefail

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v dbname="$POSTGRES_DB" \
  -v owner="$POSTGRES_USER" \
  -v reportes_password="${REPORTES_PASSWORD:-reportes_local}" \
  -f /opt/sql/usuario-solo-lectura.sql
