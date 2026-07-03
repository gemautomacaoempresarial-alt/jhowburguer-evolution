# Publicar a Jhow Burguer na Discloud

## Estrutura usada

Serão três serviços:

1. PostgreSQL da Discloud — guarda os dados permanentemente.
2. `jhowburgueratender.discloud.app` — painel, API, WhatsApp, mesas, cozinha e administração.
3. `jhowburguerpedidos.discloud.app` — cardápio público e pedidos, encaminhando somente as rotas públicas ao backend.

Não publique duas cópias completas do sistema. Isso poderia duplicar rotinas de WhatsApp, alertas e processamentos.

## 1. Requisitos

- Plano Discloud com suporte a sites e APIs.
- Dois subdomínios disponíveis.
- Conta do GitHub conectada à Discloud.
- Um template PostgreSQL criado na Discloud.

Reserve estes subdomínios no painel:

- `jhowburgueratender`
- `jhowburguerpedidos`

No `discloud.config`, o campo `ID` recebe somente o nome, sem `.discloud.app`.

## 2. Criar o PostgreSQL

1. Abra a área **Templates** da Discloud.
2. Escolha **PostgreSQL**.
3. Crie o banco e guarde os valores de usuário, senha, nome do banco e porta.
4. Ative a rede privada/VLAN para o banco.
5. Defina o hostname privado como `jhowburguer-db`, quando o template permitir.

Caso a Discloud gere outro hostname privado, use exatamente o hostname exibido por ela no `PGHOST`.

## 3. Publicar o painel e backend

Este repositório principal já contém, na raiz, o arquivo:

```ini
ID=jhowburgueratender
TYPE=site
MAIN=src/server.js
RAM=768
VLAN=true
HOSTNAME=jhowburguer-atender
```

Na Discloud:

1. Abra **Integração GitHub**.
2. Autorize o repositório deste projeto.
3. Clique em **Upload** e escolha GitHub.
4. Selecione o repositório e a branch principal.
5. Cadastre as variáveis abaixo na seção de variáveis de ambiente.

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
TRUST_PROXY=1

DB_CLIENT=postgres
PGHOST=jhowburguer-db
PGPORT=5432
PGUSER=USUARIO_FORNECIDO_PELA_DISCLOUD
PGPASSWORD=SENHA_FORNECIDA_PELA_DISCLOUD
PGDATABASE=NOME_DO_BANCO_FORNECIDO_PELA_DISCLOUD
PGSSL=false
PGSSL_REJECT_UNAUTHORIZED=false

APP_ORIGIN=https://jhowburgueratender.discloud.app
PUBLIC_SITE_URL=https://jhowburguerpedidos.discloud.app

JWT_SECRET=CHAVE_ALEATORIA_1_COM_PELO_MENOS_32_CARACTERES
APP_ENCRYPTION_KEY=CHAVE_ALEATORIA_2_COM_PELO_MENOS_32_CARACTERES

INITIAL_ADMIN_NAME=Administrador Jhow Burguer
INITIAL_ADMIN_EMAIL=SEU_EMAIL_DE_LOGIN
INITIAL_ADMIN_PASSWORD=SUA_SENHA_FORTE_COM_PELO_MENOS_12_CARACTERES
INITIAL_COMPANY_NAME=Jhow Burguer

BACKUP_DIR=./backups
```

Use `npm run generate-secrets` no computador para gerar as duas chaves. Não use a mesma chave nos dois campos.

As variáveis `INITIAL_ADMIN_*` são aplicadas somente na primeira inicialização de produção. Depois, alterações de senha devem ser feitas no próprio painel.

### Teste do backend

Abra:

```text
https://jhowburgueratender.discloud.app/api/health
```

O resultado deve conter `"ok": true` e `"database_engine": "postgres"`.

## 4. Publicar o domínio de pedidos

A pasta `deploy/pedidos-gateway` é uma segunda aplicação pequena. Ela não conecta diretamente ao banco e não executa WhatsApp.

### Recomendado para GitHub

Crie um segundo repositório, por exemplo `jhowburguer-pedidos`, e envie somente o conteúdo da pasta `deploy/pedidos-gateway` para a raiz dele:

```text
discloud.config
package.json
server.js
.env.example
.gitignore
.discloudignore
```

O `discloud.config` dessa aplicação já contém:

```ini
ID=jhowburguerpedidos
TYPE=site
MAIN=server.js
RAM=512
VLAN=true
HOSTNAME=jhowburguer-pedidos
```

Na Discloud, publique esse segundo repositório e adicione:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
TARGET_ORIGIN=http://jhowburguer-atender:8080
```

O endereço `TARGET_ORIGIN` usa a VLAN da Discloud para conversar com o backend sem depender da internet pública.

### Teste do domínio de pedidos

Abra:

```text
https://jhowburguerpedidos.discloud.app/health
```

Deve retornar `"ok": true`. Depois abra:

```text
https://jhowburguerpedidos.discloud.app
```

O cardápio deve aparecer.

## 5. Segurança do GitHub

Nunca envie um arquivo `.env` com senhas para o GitHub. O projeto já ignora esse arquivo. Na integração GitHub, cadastre os segredos diretamente nas variáveis de ambiente da Discloud.

A conta usada para entrar na Discloud e a conta proprietária do repositório precisam ter acesso compatível. Caso o repositório não apareça, revise a autorização da integração GitHub.

## 6. Ordem correta de publicação

1. PostgreSQL.
2. Aplicação `jhowburgueratender`.
3. Verificação de `/api/health`.
4. Aplicação `jhowburguerpedidos`.
5. Verificação de `/health` e do cardápio.

## 7. Problemas comuns

### `database unavailable`

Confira `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, VLAN e se o PostgreSQL está ligado.

### `Configuração de produção incompleta`

Preencha as duas chaves de segurança e as variáveis do administrador inicial.

### `502` no site de pedidos

O gateway não conseguiu alcançar o backend. Confirme que as duas aplicações estão com `VLAN=true`, que o backend usa `HOSTNAME=jhowburguer-atender` e que ele está online.

### `Repository not found`

Reconecte o GitHub na Discloud e permita acesso ao repositório correto. A conta conectada precisa ter permissão sobre o repositório.

## Documentação oficial consultada

- https://docs.discloud.com/how-to-host/websites-and-apis
- https://docs.discloud.com/faq/general-questions/how-to-create-a-subdomain
- https://docs.discloud.com/api-and-integrations/github-integration
- https://docs.discloud.com/api-and-integrations/databases
- https://docs.discloud.com/configurations/discloud.config/vlan
