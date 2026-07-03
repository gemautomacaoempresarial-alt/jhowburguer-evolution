# Jhow Burguer v3.9.6 — Gemini conversacional e mensagem inicial

## Alterações

- Primeira mensagem do pedido pelo WhatsApp:

🍔 *FAZER PEDIDO*

Envie o nome do produto e a quantidade.

*Exemplo:*
1 X-Burguer
2 Coca-Cola

Digite *CARDÁPIO* para ver o cardápio.
Ao finalizar seu pedido digite *FINALIZAR*

- O Gemini responde perguntas naturais no meio do pedido sem perder os itens ou mudar a etapa.
- O Gemini consulta cardápio, preços, estoque, configurações e base de conhecimento.
- Caso a API falhe ou fique sem cota, o sistema usa as respostas normais.

## Variáveis

GEMINI_API_KEY=SUA_NOVA_CHAVE_PRIVADA
GEMINI_PROJECT_ID=gen-lang-client-0592189245
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_CHAT_MODEL=gemini-2.5-flash-lite
GEMINI_TIMEOUT_MS=8000

## Codespaces

unzip -o Jhow-Burguer-v3.9.6-Gemini-Conversacional.zip -d .

rm Jhow-Burguer-v3.9.6-Gemini-Conversacional.zip

git add .
git commit -m "Adiciona Gemini conversacional e atualiza mensagem do pedido"
git push

Aguarde o log mostrar:

G&M Automação v3.9.6
