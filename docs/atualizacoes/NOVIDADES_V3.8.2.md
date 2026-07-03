# Versão 3.8.2

- Corrige o erro PostgreSQL `25P02: current transaction is aborted`.
- O adaptador não consulta mais uma coluna `id` inexistente dentro de transações.
- INSERTs em tabelas com `id` usam `RETURNING id`; tabelas com `user_id` ou chave composta não executam consultas inválidas.
- Não é necessário apagar ou recriar o banco.
