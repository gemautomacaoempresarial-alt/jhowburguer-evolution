# Versão 3.8.1

## Correção PostgreSQL

- Corrigido o encerramento da aplicação ao inserir em tabelas cuja chave primária não se chama `id`.
- O adaptador agora só consulta uma sequência automática quando ela realmente existe.
- Corrige especificamente a inicialização em `user_preferences`, que usa `user_id` como chave primária.
- Nenhuma alteração de estrutura ou perda de dados é necessária.
