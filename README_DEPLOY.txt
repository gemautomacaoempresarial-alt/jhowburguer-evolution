JHOW BURGUER EVOLUTION API - DISCLOUD / DOCKER v4
==================================================

CORREÇÕES
---------
- Fixa DATABASE_PROVIDER=postgresql diretamente na imagem.
- Ignora o entrypoint original da Evolution.
- Não usa runWithProvider.js.
- Não tenta recriar prisma/migrations durante a inicialização.
- Executa diretamente o schema PostgreSQL.

ARQUIVOS NA RAIZ DO GITHUB
--------------------------
Dockerfile
discloud.config
.dockerignore
.gitignore
README_DEPLOY.txt

PASSOS
------
1. Apague os cinco arquivos da versão Docker anterior.
2. Envie estes cinco arquivos diretamente para a raiz do repositório.
3. Faça commit.
4. Na Discloud, faça Rebuild/Redeploy completo pelo GitHub.

VARIÁVEIS
---------
Você pode remover:
DATABASE_URL
DATABASE_PROVIDER

O Dockerfile já fixa DATABASE_PROVIDER=postgresql.

Mantenha:
DATABASE_ENABLED=true
DATABASE_CONNECTION_URI=postgresql://USUARIO:SENHA@HOST:5432/BANCO
DATABASE_CONNECTION_CLIENT_NAME=jhowburguer_evolution

AUTHENTICATION_API_KEY=UMA_NOVA_CHAVE
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://jhowburguerevolution.discloud.app

CORS_ORIGIN=https://jhowburgueratender.discloud.app
CORS_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS
CORS_CREDENTIALS=true

CACHE_LOCAL_ENABLED=true
CACHE_REDIS_ENABLED=false
QRCODE_LIMIT=30
WEBSOCKET_ENABLED=true

LOG ESPERADO
------------
[JHOW CUSTOM V4] PostgreSQL fixado e inicialização personalizada

Depois:
Prisma schema loaded from prisma/postgresql-schema.prisma
Migration succeeded ou No pending migrations
HTTP - ON: 8080

SEGURANÇA
---------
Troque a senha do PostgreSQL e a AUTHENTICATION_API_KEY que apareceram
em mensagens ou logs antes de liberar a aplicação.
