JHOW BURGUER EVOLUTION API - DISCLOUD / DOCKER v5
==================================================

CORREÇÃO
--------
Esta versão mantém o ENTRYPOINT oficial da Evolution API e apenas libera
permissão de escrita em /evolution/prisma, pasta utilizada no db:deploy.

ARQUIVOS NA RAIZ DO GITHUB
--------------------------
Dockerfile
discloud.config
.dockerignore
.gitignore
README_DEPLOY.txt

Não misture com package.json, src, prisma, vendor ou arquivos .tgz.

VARIÁVEIS CORRETAS DA EVOLUTION
-------------------------------
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

IMPORTANTE
----------
Não use o banco do painel:
postgresql://adminuser:...@jhowburguer-db:5432/jhowburguer-db

Use o banco exclusivo da Evolution:
postgresql://elite:...@g446:5432/jhowburguer-evolution-db

PASSOS
------
1. Apague os arquivos antigos do repositório da Evolution.
2. Envie estes cinco arquivos para a raiz.
3. Faça commit.
4. Corrija DATABASE_CONNECTION_URI na Discloud.
5. Faça Rebuild/Redeploy completo.

SEGURANÇA
---------
Troque a senha do PostgreSQL e a AUTHENTICATION_API_KEY, pois foram
expostas em mensagens e logs.
