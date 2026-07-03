# Jhow Burguer v3.9.5 — revisor Gemini e troco

## Antes do deploy

A chave Gemini nunca deve ser enviada ao GitHub ou gravada no ZIP.
Na aplicação `jhowburgueratender`, cadastre estas variáveis:

GEMINI_API_KEY=SUA_NOVA_CHAVE
GEMINI_PROJECT_ID=gen-lang-client-0592189245
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_TIMEOUT_MS=8000

Quando o Gemini estiver sem cota, indisponível, com chave inválida ou ultrapassar o tempo limite, o sistema usa automaticamente a IA normal já existente.

## Codespaces

unzip -o Jhow-Burguer-v3.9.5-Gemini-Revisor-e-Troco.zip -d .

rm Jhow-Burguer-v3.9.5-Gemini-Revisor-e-Troco.zip

git add .
git commit -m "Adiciona revisor Gemini validacao de produtos e troco"
git push

Aguarde o log mostrar:

G&M Automação v3.9.5
