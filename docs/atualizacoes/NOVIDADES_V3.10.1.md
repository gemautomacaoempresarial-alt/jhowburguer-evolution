# G&M Automação v3.10.1

## Horários separados e em tempo real

- Marmitex/almoço: 09:00 às 14:00.
- Pedidos normais: grade semanal configurada, incluindo períodos que atravessam a meia-noite, como 19:30 às 00:00.
- Às 00:00 o expediente noturno encerra exatamente, sem aviso antecipado.
- O aviso para prolongar permanece disponível por duas horas. Sem prolongamento, desaparece às 02:00 e a loja continua fechada.
- Um prolongamento vale somente para o expediente encerrado e não altera a grade semanal.

## WhatsApp e IA

- Horário e modo de pedido são relidos a cada mensagem.
- Se a configuração mudar durante um pedido, a próxima mensagem já segue a nova regra.
- Pedidos em andamento ficam pausados quando o período correspondente encerra.
- Gemini e IA interna recebem o estado atual da loja e não convidam o cliente a pedir fora do horário.
- Durante o almoço, apenas marmitex pode ser montada; produtos normais ficam indisponíveis.

## Site público

- O estado da loja é atualizado periodicamente e antes de adicionar itens, abrir o checkout e enviar o pedido.
- O servidor faz uma segunda validação, impedindo que uma tela antiga conclua um pedido fora do horário.
- Produtos de almoço e produtos normais são validados de acordo com o período atual.
- Mudanças feitas no painel passam a valer sem precisar que o cliente reabra o site.

## Configurações e interface

- A página conserva a posição ao editar e salvar os horários.
- Ações de WhatsApp e listas continuam no bloco aberto, sem voltar ao topo.
- Selecionar texto ou arrastar o mouse por engano não bloqueia os próximos cliques em botões e campos.
