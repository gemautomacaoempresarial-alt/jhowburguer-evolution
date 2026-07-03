JHOW BURGUER ATENDIMENTO v3.8.7
================================

PROBLEMA CORRIGIDO
------------------
Ao clicar em uma conversa ou no botão "+":

- nada acontecia; ou
- aparecia "Não foi possível carregar / Erro interno do servidor".

CAUSAS
------
1. O botão "+" aguardava contatos, filas e atendentes antes de abrir.
   Se qualquer uma dessas rotas falhasse, a janela não aparecia e o
   clique parecia não funcionar.

2. O histórico de endereço usava uma consulta aceita pelo SQLite, mas
   inválida no PostgreSQL.

3. Qualquer falha em histórico, pedidos, reações ou transferências
   derrubava toda a rota de abertura do chat.

CORREÇÕES
---------
- O botão "+" agora abre mesmo se contatos, filas ou atendentes falharem.
- É possível continuar digitando o número normalmente.
- A consulta de endereço foi adaptada ao PostgreSQL.
- A conversa carrega em modo seguro.
- Histórico, pedidos e estatísticas são tratados como opcionais.
- Se a consulta completa das mensagens falhar, o sistema usa uma
  consulta básica como fallback.
- O usuário recebe um erro visível e botão "Tentar novamente".
- Logs agora identificam exatamente qual parte da conversa falhou.
- Mantidas todas as correções e a autoconfiguração da Evolution das
  versões 3.8.5 e 3.8.6.

INSTALAÇÃO
----------
1. Atualize SOMENTE jhowburgueratender.
2. Envie este ZIP diretamente na Discloud.
3. Não altere jhowburguerevolution.
4. Não apague o PostgreSQL.
5. Aguarde aparecer G&M Automação v3.8.7.
6. Atualize o navegador com Ctrl + F5.

SEGURANÇA
---------
Este pacote contém a configuração privada da Evolution no .env.
Não publique no GitHub.
