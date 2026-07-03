# AtenderBem v3.0.8

## Contatos

- Corrigido o botão **Editar cliente** na lateral do atendimento.
- Edição também funciona na página de clientes.
- Nome, telefone, e-mail, etiquetas e observações podem ser atualizados.
- O sistema valida telefone duplicado antes de salvar.

## Pedido feito pelo cliente com a IA

- A IA voltou a montar o pedido diretamente pela conversa do WhatsApp.
- Melhorado o reconhecimento de nomes com ou sem espaço, abreviações, aliases, quantidades por número ou por extenso e pequenos erros de digitação.
- A IA consegue identificar mais de um item na mesma mensagem e continuar adicionando produtos antes da confirmação.
- Depois que o cliente confirma, ele recebe apenas o aviso de que o pedido foi enviado para conferência.
- O pedido aparece no painel lateral da conversa com itens, quantidades, valores, entrega ou retirada, endereço, pagamento, observações e total.
- **Confirmar:** envia a confirmação ao cliente e cria o pedido para a cozinha.
- **Cancelar:** descarta a proposta sem enviar mensagem ao cliente, desliga a IA naquela conversa e deixa o atendimento com o humano.

## Estoque e cardápio

- Nova página administrativa de **Estoque e cardápio**.
- Controle rápido por botões de aumentar, diminuir e salvar quantidade.
- Filtros de disponíveis, estoque baixo, sem estoque e inativos.
- Campo de aliases para cadastrar outras formas usadas pelos clientes, como “x burguer”, “xburger” ou “xis”.
- Produtos sem estoque são marcados como indisponíveis no cardápio e a IA informa que não há estoque para hoje.
- A IA não adiciona ao pedido um produto que esteja sem estoque.

## Transferência

- Atendentes não conseguem transferir uma conversa para si mesmos.
- A própria conta também é removida da lista de destinos.

## Visão Geral e Relatórios

- Filtros: Tempo real, Hoje, Ontem, Últimos 7 dias, Últimos 30 dias e Personalizado.
- O modo Tempo real atualiza automaticamente os indicadores.
- Exportações dos relatórios respeitam o período escolhido.
