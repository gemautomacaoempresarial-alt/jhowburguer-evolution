# AtenderBem v3.0.10

## Fluxo do menu e pedido pela IA

- A opção **1 — Fazer um pedido** inicia a coleta pela IA sem encaminhar a conversa ao atendente.
- A opção **2 — Ver o cardápio** mostra o cardápio e exibe novamente as opções do menu, sem encaminhar a conversa.
- Endereço, horário, promoções e consulta de pedido continuam sendo respondidos pelo bot sem transferência automática.
- A conversa só fica visível para um atendente quando o cliente escolhe falar com uma pessoa ou quando confirma o pedido para revisão humana.

## Pedido em várias mensagens

- O cliente pode enviar um item por mensagem ou vários itens de uma vez.
- Frases como **“quero adicionar mais”**, **“quero mais”**, **“faltou um item”** e **“também quero”** mantêm o pedido aberto para novos produtos.
- Respostas como **“finalizar”**, **“só isso”**, **“não quero mais”** e **“pronto”** encerram a inclusão de itens e seguem para retirada ou entrega.
- Durante endereço, pagamento ou confirmação, o cliente ainda pode voltar e acrescentar novos produtos.
- Produtos enviados apenas pelo nome também são reconhecidos enquanto a IA está aguardando itens.
- O cardápio pode ser solicitado durante a montagem sem perder o pedido já registrado.

## Formatação das mensagens

- Corrigida a assinatura do atendente no WhatsApp.
- Nomes com pontuação no final não quebram mais o negrito.
- Modelos antigos como `*Administrador.*:` são normalizados para o formato correto `*Administrador:*` antes do envio.
