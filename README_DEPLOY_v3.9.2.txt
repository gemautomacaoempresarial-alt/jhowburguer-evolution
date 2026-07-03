# Jhow Burguer v3.9.2 — fluxo humano, imagens e responsividade

Construída sobre a v3.9.1, preservando a URL exclusiva de pedidos.

## Principais alterações
- No modo WhatsApp, pedidos são encaminhados imediatamente para um atendente.
- No modo híbrido, escolher 1 encaminha ao atendente e desliga a IA naquela conversa, evitando repetir a pergunta.
- A opção “Ver o cardápio” foi removida do menu inicial.
- Produtos agora aceitam imagem por URL ou upload de JPG, PNG, WEBP ou GIF.
- A logo da Jhow Burguer enviada acompanha o projeto como padrão do site público.
- A logo pública pode ser trocada por upload nas configurações.
- Chat com rolagem estabilizada quando novas mensagens chegam.
- Melhorias responsivas no painel e no site público.
- Novo comando seguro para remover mensagens, históricos, pedidos de teste e contatos, preservando configurações, produtos, usuários e Evolution.

## Atualização pelo Codespaces
unzip -o Jhow-Burguer-v3.9.2-Fluxo-Humano-Imagens-Mobile.zip -d .
rm Jhow-Burguer-v3.9.2-Fluxo-Humano-Imagens-Mobile.zip
git add .
git commit -m "Atualiza fluxo de pedidos imagens chat e responsividade"
git push

## Limpar histórico de testes na Discloud
Execute no console da aplicação principal:

RESET_OPERATIONAL_DATA_CONFIRM=SIM npm run reset-history

Depois reinicie a aplicação `jhowburgueratender`.
