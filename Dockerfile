FROM docker.io/evoapicloud/evolution-api:v2.3.6

USER root
WORKDIR /evolution

# A Evolution tenta recriar prisma/migrations durante a inicialização.
# Na Discloud, essa pasta pode ficar somente leitura para o usuário de execução.
# Como este projeto usa exclusivamente PostgreSQL, deixamos as migrações
# PostgreSQL preparadas ainda durante a construção da imagem.
RUN rm -rf /evolution/prisma/migrations \
    && cp -r /evolution/prisma/postgresql-migrations /evolution/prisma/migrations \
    && chmod -R a+rX /evolution/prisma

EXPOSE 8080

# Executa diretamente as migrações já preparadas, sem rm/cp em tempo de execução.
ENTRYPOINT ["/bin/bash", "-c", "npx prisma migrate deploy --schema /evolution/prisma/postgresql-schema.prisma && exec npm run start:prod"]
