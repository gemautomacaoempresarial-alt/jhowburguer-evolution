# Novidades da versão 3.5.0

## Um número de WhatsApp representa um único contato

O sistema agora usa o telefone normalizado como identidade central do cliente. As entradas pelo botão **+**, mensagens recebidas pelo bot, site de pedidos e mesas com QR Code consultam o mesmo cadastro antes de criar qualquer registro.

- formatos com DDI, somente DDD e variações brasileiras com ou sem o nono dígito são associados por aliases seguros;
- o nome informado no site fica salvo no pedido, mas não substitui o nome real já cadastrado no contato;
- contatos duplicados de versões antigas são consolidados ao iniciar o sistema;
- o banco impede mais de um atendimento ativo para o mesmo contato;
- uma proteção contra concorrência reaproveita o atendimento existente quando duas origens chegam ao mesmo tempo.

## Contato e atendimento são coisas diferentes

O contato é permanente. O atendimento é apenas uma sessão de trabalho da equipe.

- finalizar um atendimento não apaga nem divide o histórico do contato;
- ao abrir pelo botão **+**, o sistema reutiliza o atendimento ativo ou inicia uma nova sessão para o mesmo contato;
- abrir manualmente assume o atendimento humano, desliga a resposta automática naquele atendimento e mantém todas as mensagens anteriores;
- respostas posteriores do bot, pedidos do site e pedidos de mesa continuam ligados ao mesmo contato.

## Histórico completo como no WhatsApp

Ao abrir uma conversa, aparecem as mensagens de todas as sessões daquele contato em ordem cronológica.

- divisores por **Hoje**, **Ontem** ou data completa;
- identificação visual da mudança de sessão e protocolo;
- mensagens antigas, novas, pedidos e notas permanecem no mesmo histórico;
- a página **Contatos do WhatsApp** mostra as sessões anteriores e possui o botão **Abrir conversa completa**.

## Modos configuráveis para realizar pedidos

Em **Configurações → Site**, o administrador pode escolher:

1. **Tradicional pelo WhatsApp** — o bot coleta itens, entrega/retirada e pagamento pela conversa;
2. **Pedido pelo site** — o bot envia um link identificado para o cardápio;
3. **Híbrido** — o cliente escolhe entre continuar no WhatsApp ou abrir o site.

Também são configuráveis:

- mensagem do modo site;
- mensagem do modo híbrido;
- validade do link;
- frases personalizadas que iniciam um pedido;
- prévia ao vivo da mensagem;
- fallback automático para o WhatsApp quando o site estiver desligado.

Quando o cliente já envia produtos na mensagem, o carrinho do link pode abrir preenchido. Foi corrigido um erro em que a interpretação dos itens não chegava ao checkout.

## Mesas e comandas

- o clique com o botão direito sobre uma mesa abre ações rápidas;
- pedidos posteriores do mesmo aparelho permanecem no contato já vinculado à comanda;
- um nome diferente digitado no site identifica aquele pedido, sem criar outro contato;
- opções incluem clientes, comanda, pagamentos, atendimentos, QR Code, edição e liberação conforme a permissão do usuário.

## Proteções adicionais

- produtos sem controle de estoque também podem ser pré-selecionados no link do site;
- teste de regressão incluído em `npm run test:contacts`;
- banco do pacote permanece sem clientes, conversas, pedidos ou comandas operacionais.
