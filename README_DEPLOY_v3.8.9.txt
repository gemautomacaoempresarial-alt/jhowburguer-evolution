JHOW BURGUER v3.8.9 — CORREÇÃO DO DEPLOY NPM
================================================

A versão anterior continha URLs de um registro de pacotes inacessível fora
do ambiente de desenvolvimento. A Discloud não conseguia executar npm install.

Nesta versão:
- todos os pacotes usam https://registry.npmjs.org/;
- existe um .npmrc com novas tentativas e tempo de espera maior;
- foram adicionados logs detalhados do webhook e da resposta automática;
- nenhum arquivo .env ou segredo está incluído.

NO CODESPACES
-------------
unzip -o Jhow-Burguer-v3.8.9-Correcao-Deploy-NPM-e-Logs-WhatsApp.zip -d .
rm Jhow-Burguer-v3.8.9-Correcao-Deploy-NPM-e-Logs-WhatsApp.zip
git add .
git commit -m "Corrige deploy npm e adiciona logs do WhatsApp"
git push

AGUARDE A DISCLOUD MOSTRAR
--------------------------
O deploy foi concluído com sucesso

LOG ESPERADO
------------
G&M Automação v3.8.9

Quando o cliente mandar mensagem:
[WhatsApp webhook] Evento de mensagem recebido
[WhatsApp webhook] Mensagem válida recebida
[WhatsApp bot] Preparando resposta automática
[WhatsApp bot] Resposta automática enviada
