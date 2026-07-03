# G&M Automação 3.7.0

## PostgreSQL e Discloud

- Adicionado suporte ao PostgreSQL para produção.
- Mantido o SQLite para testes e uso local.
- Criada camada compatível com as consultas existentes, sem reescrever ou remover as regras do sistema.
- Adicionado suporte a `DATABASE_URL` e às variáveis PostgreSQL separadas.
- Conexão serializada para manter o comportamento transacional que o sistema já possuía no SQLite.
- Reconexão automática quando a conexão cair fora de uma transação.
- Datas, agregações JSON, relatórios, buscas sem diferença entre maiúsculas e minúsculas e inserções com conflito foram adaptados para PostgreSQL.

## Migração

- Novo comando `npm run migrate:sqlite-to-postgres`.
- Copia tabelas e colunas compatíveis do banco SQLite atual.
- Preserva IDs, usuários, senhas criptografadas, produtos, configurações, contatos, mensagens, pedidos, mesas, comandas e históricos.
- Reajusta as sequências do PostgreSQL depois da cópia.
- Exige confirmação explícita para impedir a exclusão acidental do banco de destino.

## Publicação

- Criado `discloud.config`.
- Criado `.discloudignore`.
- Criado `.env.discloud.example`.
- Criado `DEPLOY_DISCLOUD.md`.
- Porta padrão de produção alterada para `8080`.
- Endpoint `/api/health` agora informa `database_engine`.

## Backups

- SQLite continua gerando cópias `.sqlite`.
- PostgreSQL gera exportações `.postgres.json` com todas as tabelas.
- O teste de integridade do painel reconhece os dois formatos.

## Segurança

- O reset completo do PostgreSQL exige `RESET_DATABASE_CONFIRM=SIM`.
- O migrador exige `MIGRATE_CONFIRM=SIM`.
- Credenciais continuam fora do código e são lidas do `.env`.
- O banco pode ser conectado pela rede privada da Discloud.
