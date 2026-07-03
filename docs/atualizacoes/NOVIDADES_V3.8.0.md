# Jhow Burguer 3.8.0

- Projeto reorganizado para reduzir arquivos soltos na raiz.
- Históricos de versões movidos para `docs/atualizacoes`.
- Guias movidos para `docs/guias`.
- Arquivos `.bat` movidos para `ferramentas-windows` e adaptados aos novos caminhos.
- Evolution API local movida para `ferramentas-locais/evolution-api`.
- Remoção de relatórios antigos, correções já incorporadas e arquivos Docker sem uso no deploy da Discloud.
- Configuração pronta para `jhowburgueratender.discloud.app`.
- Gateway separado para `jhowburguerpedidos.discloud.app`, sem duplicar o backend.
- Criação segura do administrador inicial por variáveis de ambiente.
- Credenciais de demonstração desativadas automaticamente na primeira inicialização de produção.
- Banco SQLite retirado do repositório; localmente ele é recriado automaticamente e em produção é usado PostgreSQL.
