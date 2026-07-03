# AtenderBem 3.0.3 — atendimento, presença, áudio e interface

## Atendimento e bot

- novas conversas ficam ocultas até o cliente escolher uma opção numérica do menu;
- depois da escolha, o bot pede as informações da opção e informa o encaminhamento para um atendente;
- a IA continua respondendo perguntas de cardápio, endereço, horário e andamento de pedidos mesmo após o encaminhamento;
- mensagens automáticas de desfecho, confirmação e status de pedido não levam o nome de quem clicou;
- referências a pedidos são destacadas em negrito;
- formatação do WhatsApp (`**negrito**`, `*negrito*`, `_itálico_`, `~riscado~`) é exibida no chat.

## Distribuição e presença

- somente usuários com função Atendente recebem distribuição automática;
- atendentes realmente conectados e online aparecem primeiro nas transferências;
- pausados, ocupados e offline aparecem com indicador próprio e perfil esmaecido;
- ao ficar offline, pausar, desativar recebimento ou sair de todas as filas, as conversas são redistribuídas;
- sem atendente disponível, a conversa aguarda e é atribuída quando um atendente elegível entrar;
- presença usa a conexão real do painel, incluindo Cozinha e múltiplas abas.

## Mensagens e mídia

- status de envio usa relógio, um tique, dois tiques e dois tiques azuis;
- reações foram corrigidas;
- gravação de áudio permite parar, ouvir, cancelar e enviar;
- envio de áudio possui rotas alternativas de compatibilidade com a Evolution API;
- mídias recebidas tentam usar o base64 do webhook e, quando necessário, buscar o arquivo na Evolution API.

## Notificações e interface

- notificações em tempo real, internas, de transferência, atribuição, mensagens e pedidos;
- efeitos sonoros distintos para mensagem, mensagem interna, atribuição e pedido;
- menu do atendimento substituído por botão simples de três pontos;
- ordem principal: Atendimentos, Pedidos, Cozinha, Entregas e Filas;
- CRM removido do menu;
- prioridade, busca de mensagens predefinidas, busca de clientes, transferência e reações corrigidas;
- chat e botões do compositor alinhados;
- aro do avatar do perfil centralizado;
- modo escuro revisado;
- transferência sem barra de rolagem horizontal.
