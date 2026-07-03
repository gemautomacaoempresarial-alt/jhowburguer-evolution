FROM docker.io/evoapicloud/evolution-api:v2.3.6

USER root
WORKDIR /evolution

# Esta instalação usa exclusivamente PostgreSQL.
# O provider fica fixado na imagem para evitar que a inicialização
# receba DATABASE_PROVIDER vazio na plataforma.
ENV DATABASE_ENABLED=true
ENV DATABASE_PROVIDER=postgresql

# Prepara as migrações PostgreSQL durante o build.
RUN rm -rf /evolution/prisma/migrations \
    && cp -r /evolution/prisma/postgresql-migrations /evolution/prisma/migrations \
    && chmod -R a+rX /evolution/prisma

EXPOSE 8080

# Ignora o entrypoint original, que recria a pasta migrations e usa
# runWithProvider.js. Executa diretamente o schema PostgreSQL.
ENTRYPOINT ["/bin/sh", "-c", "echo '[JHOW CUSTOM V4] PostgreSQL fixado e inicialização personalizada'; npx prisma migrate deploy --schema /evolution/prisma/postgresql-schema.prisma && npx prisma generate --schema /evolution/prisma/postgresql-schema.prisma && exec npm run start:prod"]
