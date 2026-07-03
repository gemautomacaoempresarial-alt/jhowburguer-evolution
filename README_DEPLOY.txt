JHOW BURGUER EVOLUTION API - DISCLOUD / DOCKER v2
==================================================

CORREÇÃO DESTA VERSÃO
---------------------
Corrige:
cp: can't create directory './prisma/migrations': Permission denied

A imagem original tenta apagar e copiar prisma/migrations quando inicia.
Nesta versão, as migrações PostgreSQL são copiadas durante o build,
e a inicialização executa diretamente o Prisma sem recriar a pasta.

ARQUIVOS NA RAIZ DO GITHUB
--------------------------
Dockerfile
discloud.config
.dockerignore
.gitignore
README_DEPLOY.txt

Apague os arquivos antigos do repositório da Evolution e envie estes
arquivos diretamente para a raiz. Depois faça Rebuild/Redeploy.

VARIÁVEIS ESSENCIAIS NA DISCLOUD
--------------------------------
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://jhowburguerevolution.discloud.app

CORS_ORIGIN=https://jhowburgueratender.discloud.app
CORS_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS
CORS_CREDENTIALS=true

AUTHENTICATION_API_KEY=UMA_NOVA_CHAVE_FORTE

DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://USUARIO:SENHA@HOST:5432/BANCO
DATABASE_CONNECTION_CLIENT_NAME=jhowburguer_evolution

DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_LABELS=true
DATABASE_SAVE_DATA_HISTORIC=true

CACHE_REDIS_ENABLED=false
CACHE_LOCAL_ENABLED=true

QRCODE_LIMIT=30
WEBSOCKET_ENABLED=true

RESULTADO ESPERADO
------------------
O log deve passar das migrações e mostrar o servidor HTTP ativo na porta 8080.

SEGURANÇA
---------
Troque a senha do PostgreSQL e a chave da API caso tenham sido exibidas
em mensagens, imagens ou logs compartilhados.
