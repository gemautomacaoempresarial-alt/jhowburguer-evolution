# AtenderBem 3.0.1 — correção visual e de usabilidade

Esta revisão foi feita sobre a versão 3.0.0 e não remove os módulos existentes.

## Correções principais

- padronização de tamanhos, espaçamentos, cartões, tabelas e cabeçalhos em todas as páginas;
- menu superior reorganizado: Atendimentos, Pedidos, Cozinha e Entregas permanecem com nome; os demais usam ícone com tooltip estável;
- tooltips próprios do sistema, posicionados fora dos componentes para não sumirem ou serem cortados;
- buscas compactas e alinhadas;
- selects próprios do AtenderBem, sem a caixa genérica do navegador e sem ficarem presos dentro de modais;
- modais padronizados, responsivos e com rolagem interna;
- estados ativos em verde claro e desativados em vermelho claro;
- tela de transferência reorganizada e redimensionada;
- barra de mensagens reorganizada: recursos básicos do WhatsApp ficam embaixo e ferramentas do AtenderBem/IA ficam no cabeçalho;
- painel de ferramentas da IA não fica mais preso aberto;
- ferramentas da IA agora exibem resultado, preenchem o campo ou mostram aviso quando precisam de texto;
- mensagens predefinidas e templates reunidos em um único botão;
- chat interno redesenhado no formato de mensageiro, com canal da equipe e lista de atendentes;
- conversas internas diretas entre usuários;
- correções de sobreposição, alinhamento e responsividade.

## Preservação do banco

Para atualizar, copie somente `data/atenderbem.sqlite` da versão anterior com o sistema fechado. Não copie arquivos `-wal` ou `-shm`.
