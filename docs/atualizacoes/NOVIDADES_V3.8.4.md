# Versão 3.8.4

- Corrige a comparação de datas em `conversation_wait_alerts` no PostgreSQL.
- Evita o erro `operator does not exist: text < timestamp with time zone`.
- Bloqueia a configuração local da Evolution API quando o painel está em produção.
- Mostra uma mensagem clara quando a URL da Evolution aponta para `localhost` na Discloud.
- Registra no log o endereço e o motivo real quando a geração do QR Code falha.
- Atualiza a tela do WhatsApp para explicar que a Evolution API precisa ser hospedada separadamente.
