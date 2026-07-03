# Novidades — AtenderBem 2.2.0

## Rolagem

A área principal agora possui altura controlada e rolagem própria. Isso corrige Visão geral, Cozinha, Pedidos, Configurações, Histórico, Clientes e telas extensas. No atendimento, lista de clientes, mensagens e painel lateral continuam rolando separadamente.

## Recibos das mensagens

Mensagens da IA e dos atendentes agora exibem o estado de envio ao lado do horário:

- `✓` enviada;
- `✓✓` entregue;
- `✓✓` azul lida;
- `!` falhou.

O estado é atualizado pelo webhook `MESSAGES_UPDATE` da Evolution API e fica armazenado no SQLite.

## Pedido guiado pela IA

1. A IA identifica produtos e quantidades.
2. Pergunta se será retirada ou entrega.
3. Em entrega, informa a taxa configurada e pede rua, número, bairro e referência.
4. Em retirada, informa o endereço cadastrado da loja.
5. Pergunta Pix, dinheiro ou cartão.
6. Apresenta itens, modalidade, endereço, taxa, pagamento e total.
7. Só cria o pedido após o cliente responder **SIM**.
8. Envia todos os dados à tela da cozinha em tempo real.

A etapa atual fica registrada na tabela `ai_order_sessions`, evitando que o fluxo se perca entre mensagens.

## Configurações administrativas

Em **Configurações**, o administrador pode alterar:

- taxa fixa de entrega;
- endereço de retirada na loja.

Esses valores também são usados no formulário de pedido criado manualmente por um atendente.
