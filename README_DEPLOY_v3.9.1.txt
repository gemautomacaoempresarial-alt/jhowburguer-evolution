# Jhow Burguer v3.9.1 — URL exclusiva de pedidos

Construída sobre a v3.9.0, preservando todas as alterações anteriores.

## Correção desta versão

- O QR Code das mesas agora usa automaticamente `PUBLIC_SITE_URL` quando essa variável estiver configurada.
- Links enviados pelo WhatsApp, QR das mesas e acompanhamento passam a usar o mesmo domínio público.
- A pasta `deploy/pedidos-gateway` foi atualizada e também foi gerado um ZIP separado de upload direto.
- A Evolution API não foi alterada.

## Variável da aplicação principal

```env
PUBLIC_SITE_URL=https://jhowburguerpedidos.discloud.app
```

## Aplicações finais

- `jhowburgueratender`: painel, backend, cozinha, mesas e atendimento.
- `jhowburguerpedidos`: cardápio público, links do WhatsApp e QR das mesas.
- `jhowburguerevolution`: conexão com o WhatsApp.

## Log esperado da aplicação principal

```text
G&M Automação v3.9.1
```
