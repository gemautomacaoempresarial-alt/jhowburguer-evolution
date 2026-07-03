# Versão 3.8.5

- Corrige o erro PostgreSQL `COALESCE types bigint and text cannot be matched` ao abrir uma conversa.
- Garante que uma falha na estatística de produtos frequentes não bloqueie o chat.
- Corrige a limpeza dos alertas antigos sem comparar coluna `TEXT` com `TIMESTAMPTZ`.
- Usa `remoteJidAlt` quando a Evolution entrega contatos no formato `@lid`, preservando o telefone real para respostas.
- Confirma e reaplica automaticamente o webhook da Evolution API na inicialização e a cada dez minutos.
- Adiciona diagnóstico de falhas reais no envio de mensagens sem exibir a credencial da API.
