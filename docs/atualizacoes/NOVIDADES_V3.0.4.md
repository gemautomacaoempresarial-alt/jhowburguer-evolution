# AtenderBem v3.0.4

## Correções desta atualização

- A barra superior do atendimento voltou ao formato anterior, com os botões individuais de IA, ferramentas, assumir, transferir e finalizar.
- O menu de três pontos permanece somente em cada mensagem, no canto da bolha, para responder, selecionar, encaminhar, fixar, reagir e reenviar quando necessário.
- Uma resposta HTTP bem-sucedida da Evolution agora confirma no mínimo o status **Enviada**, mesmo quando a API devolve `PENDING`.
- Quando o cliente responde, as mensagens anteriores passam para **Lida pelo cliente**, cobrindo casos em que o webhook de confirmação não chega.
- Ao iniciar esta versão, mensagens antigas presas em “Aguardando envio” são corrigidas quando já existe uma resposta posterior do cliente ou um ID confirmado pelo provedor.
