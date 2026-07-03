# G&M Automação 3.6.0

## Perfil mais bonito e confiável

- O clique na foto do usuário ganhou uma área maior e tratamento por ponteiro/teclado para não falhar aleatoriamente.
- O menu do perfil agora mostra foto, nome, e-mail, função, setor e disponibilidade.
- As ações de perfil, disponibilidade, aparência e saída foram reorganizadas em um painel visual mais claro.
- A edição do perfil ganhou prévia da foto, remoção da imagem, identificação da conta e melhor organização das preferências.
- Imagens de perfil inválidas voltam automaticamente para as iniciais, sem deixar o avatar quebrado.

## Histórico das mesas

- Cada mesa possui um botão simples de histórico no cabeçalho.
- O histórico permanece disponível depois de fechar e liberar a mesa.
- Cada comanda mostra período, duração, pessoas vinculadas, pedidos, responsável por cada pedido, itens, valores, observações, pagamentos e responsável pelo fechamento.
- A tela resume o total de comandas, o total vendido, o total pago e a última utilização da mesa.
- O histórico também está disponível no menu de contexto ao clicar com o botão direito na mesa.

## Preparação para uso online

- Dockerfile e Docker Compose de produção com volumes persistentes para banco e backups.
- Banco SQLite configurável por `DB_PATH` e pasta de backups configurável por `BACKUP_DIR`.
- Verificação de saúde com teste real do banco em `/api/health`.
- Validação obrigatória das chaves de segurança em produção.
- Restrição opcional de origem para o Socket.IO por `APP_ORIGIN`.
- Cabeçalhos de segurança, suporte a proxy HTTPS e encerramento seguro do banco.
- O formulário de login não exibe mais credenciais de teste publicamente.
- Guia completo em `DEPLOY_PRODUCAO.md`.
