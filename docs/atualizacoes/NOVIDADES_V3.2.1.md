# G&M Automação v3.2.1 — correção de mesas e painel operacional

## Fluxo de pedidos de mesa

- Pedidos vinculados a mesa não podem mais ser convertidos em entrega ao serem editados.
- Na cozinha, o botão da etapa **Prontos** muda para **Entregue na mesa**.
- Em preparo, o botão mostra **Pronto para servir**.
- O modal de status não oferece “Saiu para entrega” ou “Retirado” para pedidos de mesa.
- A tela de Entregas exibe somente pedidos cuja modalidade é realmente entrega.
- Registros antigos vinculados a mesa são corrigidos automaticamente ao iniciar o sistema.

## Atendimento e WhatsApp

- Corrigido o texto que poderia virar `Mes*a` ao colocar o número do pedido em negrito.
- As tags Humano, Site, Mesa e status ficaram compactas e separadas do nome do cliente.
- O botão de ativar/desativar IA recebeu estados visuais mais claros.

## Mesas para atendentes

- Adicionado o item **Mesas** no menu principal.
- Atendentes podem visualizar mesas livres e ocupadas, comanda, consumo, pedidos e chamados.
- A tela mostra os clientes vinculados e permite abrir diretamente o atendimento correspondente.
- Atendentes podem resolver chamados e fechar/liberar uma mesa.
- Criação, edição, bloqueio e QR Code continuam restritos à administração.

## Notificações e interface

- A primeira confirmação de um QR Code que abre uma nova comanda gera notificação com som.
- Chamados de garçom e solicitação de conta são direcionados à equipe de atendimento.
- Corrigida a central de notificações para não comprimir ou sobrepor itens.
- Corrigidos os checkboxes gigantes das modalidades do site.
- Corrigidos switches que herdavam tamanho de campos de texto.

## Segurança dos dados

O banco atual foi preservado. Há uma cópia em:

`backups/antes-v3.2.1-correcao-mesas.sqlite`
