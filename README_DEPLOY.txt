JHOW BURGUER EVOLUTION API - DISCLOUD / DOCKER v3
==================================================

Esta versão corrige definitivamente:
cp: can't create directory './prisma/migrations': Permission denied

COMO FUNCIONA
-------------
A imagem oficial da Evolution inicia executando:
Docker/scripts/deploy_database.sh

Esta versão substitui esse script dentro da imagem.
As migrações PostgreSQL são copiadas durante o build, quando há permissão,
e no início é executado apenas o Prisma migrate deploy.

ARQUIVOS NA RAIZ DO GITHUB
--------------------------
Dockerfile
discloud.config
.dockerignore
.gitignore
README_DEPLOY.txt

Não misture com package.json, src, prisma, vendor ou arquivos .tgz.

PASSOS
------
1. Apague os arquivos antigos do repositório jhowburguer-evolution.
2. Envie estes cinco arquivos diretamente para a raiz.
3. Confirme no GitHub que o Dockerfile contém:
   [JHOW CUSTOM] Executando migrações PostgreSQL já preparadas
4. Faça commit.
5. Na Discloud, faça Rebuild/Redeploy completo.

LOG CORRETO
-----------
O novo log precisa mostrar:
[JHOW CUSTOM] Executando migrações PostgreSQL já preparadas
[JHOW CUSTOM] Migrações concluídas

Se continuar aparecendo:
> evolution-api@2.3.6 db:deploy
cp: can't create directory

então a Discloud ainda está usando o Dockerfile antigo ou outro repositório/branch.

SEGURANÇA
---------
A senha do PostgreSQL apareceu em logs compartilhados.
Troque-a e atualize DATABASE_CONNECTION_URI antes do uso real.
