FROM docker.io/evoapicloud/evolution-api:v2.3.6

USER root
WORKDIR /evolution

# A Discloud pode executar o contêiner com um usuário sem permissão
# para recriar /evolution/prisma/migrations. A Evolution precisa escrever
# nessa pasta durante o npm run db:deploy.
RUN chmod -R a+rwX /evolution/prisma

ENV DOCKER_ENV=true
ENV DATABASE_PROVIDER=postgresql

EXPOSE 8080
