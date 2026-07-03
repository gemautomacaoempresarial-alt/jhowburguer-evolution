# G&M Automação v3.3.1

## Encerramento do atendimento

- Adicionada a opção **Enviar mensagem de finalização** na janela de encerramento.
- A opção vem marcada por padrão e pode ser desativada antes de concluir.
- Corrigido o envio duplicado da mensagem de finalização.
- O servidor agora fecha o atendimento de forma atômica: duplo clique, repetição de rede ou duas telas não disparam a mensagem novamente.
- O botão de finalizar fica bloqueado enquanto a operação está em andamento.

## Banco de dados

- O banco entregue neste pacote foi limpo de clientes, conversas, mensagens, pedidos, notificações, comandas abertas, sessões e registros operacionais.
- Usuários, configurações, cardápio, filas, motivos, respostas rápidas e demais cadastros administrativos foram preservados.
- Backups antigos com dados operacionais foram removidos do pacote.
