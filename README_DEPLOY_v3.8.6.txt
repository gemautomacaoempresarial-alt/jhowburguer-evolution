JHOW BURGUER ATENDIMENTO v3.8.6
================================

CORREÇÃO DESTA VERSÃO
---------------------
O painel iniciou sem conseguir ler a configuração da Evolution:

Preencha a URL, a chave da Evolution API e o nome da instância.

A v3.8.6 restaura automaticamente no PostgreSQL do painel:

- URL da Evolution API
- API key
- instância jhowburguer
- URL pública do painel
- segredo e URL do webhook
- modo WhatsApp = evolution

Também mantém as correções da v3.8.5:

- abertura do chat no PostgreSQL
- CAST do product_id no COALESCE
- comparação segura de datas
- recebimento de remoteJidAlt para contatos @lid
- envio e diagnóstico da Evolution

COMO INSTALAR
-------------
1. Atualize SOMENTE jhowburgueratender.
2. Envie este ZIP diretamente na Discloud.
3. Não atualize jhowburguerevolution.
4. Não apague o PostgreSQL.
5. Aguarde o deploy completo.
6. Atualize o navegador com Ctrl + F5.

LOG ESPERADO
------------
G&M Automação v3.8.6
[WhatsApp] Configuração da Evolution restaurada:
[WhatsApp] Webhook da Evolution confirmado

SEGURANÇA
---------
Este pacote contém a chave da Evolution no arquivo .env.
Não envie para GitHub público.
Depois da estabilização, troque a chave da API.
