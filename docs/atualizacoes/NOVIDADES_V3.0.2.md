# AtenderBem 3.0.2 — correções funcionais e visuais

Esta revisão foi feita sobre a versão 3.0.1 sem remover os módulos existentes.

## Interface

- cartões de filas da Visão Geral corrigidos e padronizados;
- Supervisão reorganizada com cartões proporcionais;
- página própria de **Filas e presença**;
- removida a barra móvel solta do layout;
- status ativo destacado em verde claro e desativado em vermelho claro;
- motivos de finalização exibidos em cartões próprios do sistema;
- transferência de atendimento mantida em modal próprio e responsivo;
- tempo desde a abertura exibido na lista e no cabeçalho da conversa;
- Pedidos, Cozinha e Entregas corrigidos para sempre iniciarem com o filtro **Hoje / Ao vivo**.

## Filas e visibilidade

- administrador e supervisor visualizam todas as conversas e o responsável de cada uma;
- atendente visualiza somente as conversas atribuídas a ele;
- administrador escolhe se participa da distribuição automática;
- página de filas permite ficar online, ocupado, pausado ou offline;
- entrada e saída de todas as filas pelo painel;
- equipe conectada exibida em tempo real.

## Pedidos pela IA

- a IA coleta os itens, modalidade, endereço e pagamento;
- depois da confirmação do cliente, o pedido fica em **Aguardando conferência**;
- uma atendente precisa revisar e aprovar antes de o pedido ser enviado à cozinha;
- a configuração administrativa permite reativar o envio automático, mas vem desligada por padrão.

## Chat interno

- canal geral e conversas diretas entre atendentes;
- lista de todos os atendentes ativos;
- envio e leitura das mensagens internas corrigidos;
- notificação animada no topo com remetente, resumo, **Ver chat** e **Fechar**;
- textos longos são limitados com reticências.

## Primeira mensagem

- removidos contatos e conversas fictícias do banco entregue;
- mensagem inicial não informa que o cliente está falando com um sistema de automação;
- saudação configurável inspirada no fluxo informado pelo usuário;
- menu numérico continua configurável;
- perguntas diretas sobre cardápio, horário, endereço ou pedido recebem a resposta correspondente mesmo no primeiro contato.

## Banco e migração

- banco atualizado para a versão 3.0.2;
- bancos da versão 3.0.1 são migrados automaticamente;
- personalizações de mensagens feitas pelo usuário são preservadas;
- somente mensagens padrão antigas são atualizadas.

## Correção complementar — presença real e abertura de conversa

- os botões **Digitar número** e **Buscar contatos** agora usam os componentes e ícones do próprio painel;
- a busca de contatos recebeu lista rolável e seleção visual consistente;
- o status online agora depende de uma sessão realmente conectada ao painel, em vez de manter todos como online pelo valor salvo no banco;
- fechar a página, sair da conta ou perder a conexão altera o usuário para offline em tempo real;
- múltiplas abas do mesmo usuário são reconhecidas, evitando marcar offline enquanto outra aba ainda estiver aberta;
- o usuário da cozinha passa a aparecer na presença, supervisão, equipe e chat interno, ficando online somente enquanto a tela da cozinha estiver conectada;
- usuários desconectados não entram mais na distribuição automática de atendimentos.
