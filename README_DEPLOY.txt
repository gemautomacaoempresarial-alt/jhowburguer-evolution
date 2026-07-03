JHOW BURGUER EVOLUTION API - DISCLOUD / DOCKER v6
==================================================

CORREÇÃO
--------
A imagem oficial tenta recriar /evolution/prisma/migrations durante o início.
Na Discloud essa pasta está sem permissão de escrita.

A v6 substitui o script oficial e executa as migrações em:
/tmp/evolution-prisma

ARQUIVOS NA RAIZ DO GITHUB
--------------------------
Dockerfile
deploy_database.sh
discloud.config
.dockerignore
.gitignore
README_DEPLOY.txt

Não use package.json, src, prisma, vendor ou arquivos .tgz nesse repositório.

VARIÁVEIS CORRETAS DA APLICAÇÃO jhowburguerevolution
-----------------------------------------------------
DOCKER_ENV=true
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://jhowburguerevolution.discloud.app

AUTHENTICATION_API_KEY=UMA_NOVA_CHAVE

DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://elite:NOVA_SENHA@g446:5432/jhowburguer-evolution-db
DATABASE_CONNECTION_CLIENT_NAME=jhowburguer_evolution

CACHE_LOCAL_ENABLED=true
CACHE_REDIS_ENABLED=false

CORS_ORIGIN=https://jhowburgueratender.discloud.app
CORS_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS
CORS_CREDENTIALS=true

QRCODE_LIMIT=30
WEBSOCKET_ENABLED=true

APAGUE DA EVOLUTION
-------------------
DATABASE_URL

NÃO USE NA EVOLUTION
--------------------
postgresql://adminuser:...@jhowburguer-db:5432/jhowburguer-db

Esse endereço pertence ao painel G&M.

LOG ESPERADO
------------
[JHOW V6] Preparando migrações PostgreSQL em /tmp
[JHOW V6] Executando Prisma migrate deploy
[JHOW V6] Migrações concluídas

Se não aparecer [JHOW V6], a Discloud está usando outro repositório,
outra branch ou um build antigo.

SEGURANÇA
---------
Troque as senhas e chaves que apareceram em mensagens e logs.
