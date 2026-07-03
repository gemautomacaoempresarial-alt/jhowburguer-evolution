#!/bin/bash
set -e

PROVIDER="${DATABASE_PROVIDER:-postgresql}"

if [ "$PROVIDER" != "postgresql" ] && [ "$PROVIDER" != "psql_bouncer" ]; then
  echo "[JHOW V6] Provedor inválido: $PROVIDER"
  return 1 2>/dev/null || exit 1
fi

SOURCE_DIR="/evolution/prisma"
WORK_DIR="/tmp/evolution-prisma"

echo "[JHOW V6] Preparando migrações PostgreSQL em /tmp"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/migrations"

cp "$SOURCE_DIR/postgresql-schema.prisma" "$WORK_DIR/postgresql-schema.prisma"
cp -R "$SOURCE_DIR/postgresql-migrations/." "$WORK_DIR/migrations/"

echo "[JHOW V6] Executando Prisma migrate deploy"
npx prisma migrate deploy --schema "$WORK_DIR/postgresql-schema.prisma"

echo "[JHOW V6] Migrações concluídas"
