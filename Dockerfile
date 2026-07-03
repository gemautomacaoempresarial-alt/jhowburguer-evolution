FROM docker.io/evoapicloud/evolution-api:v2.3.6

USER root
WORKDIR /evolution

# Substitui somente o script de migração da imagem oficial.
# Na Discloud, /evolution/prisma pode ficar sem permissão de escrita.
# O novo script copia schema/migrations para /tmp, que é gravável.
COPY deploy_database.sh /evolution/Docker/scripts/deploy_database.sh
RUN chmod 755 /evolution/Docker/scripts/deploy_database.sh

ENV DOCKER_ENV=true
ENV DATABASE_PROVIDER=postgresql

EXPOSE 8080
