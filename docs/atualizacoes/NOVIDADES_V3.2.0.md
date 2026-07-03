# G&M Automação v3.2.0

## Mesas e QR Codes

- Cadastro de mesas dentro do painel administrativo.
- QR Code exclusivo protegido por token para cada mesa.
- Confirmação do cliente antes de vincular o aparelho.
- Vínculo mantido até o cliente sair, a sessão expirar ou a equipe liberar a mesa.
- Vários aparelhos podem compartilhar a mesma comanda, conforme a configuração do administrador.
- Pedidos feitos pelo QR Code entram na conversa correta com as tags **Site** e **Mesa**.
- Comanda acumulada com pedidos, pessoas vinculadas e total consumido.
- Chamados de garçom e solicitação de conta com notificações únicas no painel.
- Fechamento da conta libera a mesa e encerra os vínculos ativos.
- QR Code pode ser visualizado, copiado, impresso ou regenerado.

## Módulos independentes

Em **Configurações → Site**, o administrador pode controlar separadamente:

- pedidos pelo site público;
- mesas com QR Code;
- vários aparelhos na mesma mesa;
- duração máxima do vínculo;
- mensagens de pedido pronto e entregue na mesa.

Desativar o site ou as mesas não interfere no atendimento e nos pedidos feitos normalmente pelo WhatsApp.

## Cores por status

As conversas podem mudar de cor conforme o pedido:

- **Novo / aguardando confirmação:** permanece branco;
- **Confirmado:** azul;
- **Em preparo:** laranja;
- **Pronto:** roxo;
- **Saiu para entrega:** azul-escuro;
- **Entregue / retirado:** verde;
- **Cancelado:** vermelho.

As cores podem ser ativadas, desativadas e personalizadas nas configurações. A lista de atendimentos, a conversa aberta e o painel lateral são atualizados em tempo real.

## Ajustes adicionais

- O cartão fixo do pedido ganhou espaçamento superior para não encostar nos botões da conversa.
- Pedidos de mesa não entram no fluxo de entrega ou retirada.
- O status da mesa usa **Pronto para servir** e **Entregue na mesa**.
- O módulo é bloqueado imediatamente quando desativado pelo administrador, inclusive para sessões já abertas.
- O banco existente é migrado sem apagar contatos, conversas, produtos ou pedidos.
