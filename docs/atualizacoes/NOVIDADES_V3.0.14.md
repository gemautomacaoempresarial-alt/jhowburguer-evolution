# G&M Automação v3.0.14

## Segurança

- Nova central **Segurança e backups** dentro de Configurações.
- Uma conta não pode permanecer conectada em dois dispositivos ao mesmo tempo.
- Lista de sessões e dispositivos, com encerramento individual ou de todas as outras sessões.
- Sessões validadas no servidor e encerradas em tempo real quando substituídas.
- Webhook da Evolution protegido por segredo, limite de chamadas e bloqueio de eventos repetidos.
- Credenciais sensíveis do WhatsApp passam a ser criptografadas no banco e não retornam ao navegador.
- Auditoria ganhou filtros por usuário, ação, área e período.

## Backups

- Backup SQLite automático diário.
- Retenção configurável entre 3 e 90 dias.
- Criação manual pela interface.
- Teste de integridade sem substituir o banco atual.

## Atendimento

- Alertas quando o cliente estiver aguardando resposta há 2, 5 ou 10 minutos.
- Os tempos podem ser alterados na central de segurança.
- Histórico do cliente no painel lateral e na página Clientes.
- Exibe pedidos recentes, produtos mais pedidos, endereço frequente, observações e botão **Repetir pedido**.

## Pedidos

- Cancelamento agora mostra itens, cliente, total e exige motivo e confirmação.
- Estoque é devolvido ao cancelar.
- Cancelamentos aparecem separados nos relatórios.
- Antes de enviar o pedido para revisão, o cliente pode usar palavras como **alterar**, **editar**, **mudar** e **remover**.
- Depois que o pedido já foi confirmado, a solicitação de alteração é encaminhada ao atendente e fica destacada no atendimento.
- Ao editar o pedido no painel, a solicitação pendente é marcada como resolvida.

## Mensagens

- Corrigido o falso status de falha nas mensagens da IA e nas mensagens automáticas de andamento do pedido.
- Erros indefinidos ou timeouts permanecem como enviados até o webhook confirmar; somente rejeições claras ficam como falha.
