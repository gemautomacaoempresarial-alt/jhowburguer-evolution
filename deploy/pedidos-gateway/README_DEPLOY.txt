JHOW BURGUER - URL EXCLUSIVA DE PEDIDOS v1
==========================================

APLICAÇÃO
---------
ID: jhowburguerpedidos
URL: https://jhowburguerpedidos.discloud.app

FUNÇÃO
------
Este aplicativo é somente o domínio público para:
- cardápio normal;
- link identificado enviado pelo WhatsApp;
- QR Code das mesas;
- acompanhamento do pedido;
- API pública usada pelo cardápio.

Ele NÃO substitui e NÃO deve ser enviado por cima de:
- jhowburgueratender;
- jhowburguerevolution.

DEPLOY
------
Crie uma NOVA aplicação na Discloud e envie este ZIP diretamente.
Não precisa executar npm install e não há credenciais secretas neste pacote.

VARIÁVEL JÁ CONFIGURADA
-----------------------
TARGET_ORIGIN=https://jhowburgueratender.discloud.app

LOG ESPERADO
------------
[PEDIDOS] Jhow Burguer Pedidos em http://0.0.0.0:8080
[PEDIDOS] Encaminhando cardápio e pedidos para https://jhowburgueratender.discloud.app

TESTES APÓS O DEPLOY
--------------------
1. Abra https://jhowburguerpedidos.discloud.app/health
2. Deve aparecer "ok": true.
3. Abra https://jhowburguerpedidos.discloud.app
4. Deve abrir o cardápio, e não o painel administrativo.

CONFIGURAÇÃO NO ATENDIMENTO
---------------------------
No jhowburgueratender, use:
PUBLIC_SITE_URL=https://jhowburguerpedidos.discloud.app

No painel, em Configurações > Site de pedidos, deixe a URL pública como:
https://jhowburguerpedidos.discloud.app

A Evolution continua separada em:
https://jhowburguerevolution.discloud.app
