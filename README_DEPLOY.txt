JHOW BURGUER EVOLUTION API - DISCLOUD / DOCKER
================================================

ESTRUTURA DO REPOSITÓRIO
------------------------
Deixe estes arquivos diretamente na raiz do repositório GitHub:

Dockerfile
discloud.config
.dockerignore
.gitignore
README_DEPLOY.txt

Não precisa de package.json, src, prisma, vendor ou arquivo .tgz.
O Dockerfile baixa a imagem oficial da Evolution API já compilada.

PUBLICAÇÃO
----------
1. Apague os arquivos antigos do repositório jhowburguer-evolution.
2. Envie os cinco arquivos deste pacote diretamente para a raiz.
3. Faça commit.
4. Na Discloud, selecione o repositório e faça Rebuild/Redeploy.
5. Confirme que o subdomínio reservado é:
   jhowburguerevolution.discloud.app

VARIÁVEIS DE AMBIENTE NA DISCLOUD
---------------------------------
Cadastre cada variável separadamente na aplicação jhowburguerevolution.

Servidor:
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://jhowburguerevolution.discloud.app

CORS:
CORS_ORIGIN=https://jhowburgueratender.discloud.app
CORS_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS
CORS_CREDENTIALS=true

Autenticação:
AUTHENTICATION_API_KEY=GERE_UMA_NOVA_CHAVE_FORTE

Banco PostgreSQL exclusivo da Evolution:
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://USUARIO:SENHA@HOST_PRIVADO:5432/NOME_DO_BANCO
DATABASE_CONNECTION_CLIENT_NAME=jhowburguer_evolution

Persistência:
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_LABELS=true
DATABASE_SAVE_DATA_HISTORIC=true

Cache sem Redis, para o primeiro teste:
CACHE_REDIS_ENABLED=false
CACHE_LOCAL_ENABLED=true

QR e WebSocket:
QRCODE_LIMIT=30
WEBSOCKET_ENABLED=true

Observações:
- Não coloque as variáveis dentro do GitHub.
- Use um PostgreSQL separado do banco do painel G&M.
- O PostgreSQL da Evolution e a aplicação precisam estar na VLAN.
- Se a senha do PostgreSQL tiver @, :, /, # ou %, ela deve ser codificada na URL.
- Troque todas as chaves que já tenham sido expostas em mensagens ou imagens.

TESTES
------
Depois que a aplicação estiver online, abra:

https://jhowburguerevolution.discloud.app

Para consultar as instâncias:

curl --request GET ^
  --url https://jhowburguerevolution.discloud.app/instance/fetchInstances ^
  --header "apikey: SUA_NOVA_CHAVE"

Para criar a instância:

curl --request POST ^
  --url https://jhowburguerevolution.discloud.app/instance/create ^
  --header "Content-Type: application/json" ^
  --header "apikey: SUA_NOVA_CHAVE" ^
  --data "{\"instanceName\":\"jhowburguer\",\"qrcode\":true,\"integration\":\"WHATSAPP-BAILEYS\"}"

Para buscar o QR:

curl --request GET ^
  --url https://jhowburguerevolution.discloud.app/instance/connect/jhowburguer ^
  --header "apikey: SUA_NOVA_CHAVE"

CONFIGURAÇÃO NO PAINEL G&M
--------------------------
URL da Evolution:
https://jhowburguerevolution.discloud.app

API Key:
a mesma AUTHENTICATION_API_KEY

Nome da instância:
jhowburguer
