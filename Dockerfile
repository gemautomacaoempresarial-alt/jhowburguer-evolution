FROM docker.io/evoapicloud/evolution-api:v2.3.6

USER root
WORKDIR /evolution

# Prepara as migrações PostgreSQL durante o build, quando há permissão de escrita.
RUN rm -rf /evolution/prisma/migrations \
    && cp -r /evolution/prisma/postgresql-migrations /evolution/prisma/migrations \
    && chmod -R a+rX /evolution/prisma

# Substitui o script original que tenta apagar/copiar migrations em tempo de execução.
# O ENTRYPOINT original da Evolution continuará sendo usado, mas chamará este script corrigido.
RUN cat > /evolution/Docker/scripts/deploy_database.sh <<'EOF'
#!/bin/bash
set -e

echo "[JHOW CUSTOM] Executando migrações PostgreSQL já preparadas"
echo "[JHOW CUSTOM] Banco configurado: ${DATABASE_CONNECTION_URI%%@*}@***"

npx prisma migrate deploy --schema /evolution/prisma/postgresql-schema.prisma

echo "[JHOW CUSTOM] Migrações concluídas"
EOF

RUN chmod +x /evolution/Docker/scripts/deploy_database.sh

EXPOSE 8080
