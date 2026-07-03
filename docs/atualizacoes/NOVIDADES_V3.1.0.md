# G&M Automação v3.1.0

## Primeira versão do site de pedidos

Foi adicionado um cardápio público integrado ao mesmo banco de dados, estoque, clientes, conversas e pedidos do painel.

### Fluxo do cliente

1. Acessa `/pedido` pelo celular ou computador.
2. Pesquisa produtos e escolhe as quantidades.
3. Seleciona entrega ou retirada.
4. Informa nome, WhatsApp, endereço e pagamento.
5. Autoriza as atualizações pelo WhatsApp.
6. Finaliza e recebe um link privado para acompanhar o pedido.

### Integração com o painel

- o pedido entra como `new`, aguardando confirmação humana;
- a equipe recebe alerta sonoro, notificação e atualização em tempo real;
- o pedido aparece na tela de Pedidos;
- somente depois de confirmado ele aparece na Cozinha;
- o estoque é reservado ao finalizar o site e devolvido se o pedido for cancelado;
- a conversa é criada ou reaproveitada e a IA fica desativada para evitar respostas duplicadas;
- um atendente online pode receber automaticamente a conversa.

### WhatsApp

- a Evolution API conectada envia automaticamente o comprovante do pedido;
- a mensagem usa o efeito de digitação antes do envio;
- o comprovante inclui itens, entrega/retirada, pagamento, total e link de acompanhamento;
- as mensagens de confirmado, preparando, pronto, saiu para entrega e entregue continuam usando o fluxo já existente;
- uma falha de WhatsApp não apaga nem cancela o pedido;
- o painel registra o erro e avisa o administrador.

### Endereços

```text
Cardápio: http://localhost:3000/pedido
Painel:   http://localhost:3000
```

Para que o link enviado pelo WhatsApp funcione fora da rede local, configure no `.env`:

```text
PUBLIC_SITE_URL=https://pedidos.suaempresa.com.br
```
