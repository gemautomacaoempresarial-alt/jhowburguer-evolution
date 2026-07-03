# G&M Automação v3.1.1

## Link de pedido identificado pelo WhatsApp

- Quando o cliente informa produtos pelo WhatsApp, o bot envia um link de finalização com o carrinho já preenchido.
- O link é individual, temporário e vinculado ao contato e à conversa de origem.
- Ao abrir o link, nome e número são preenchidos automaticamente.
- O telefone identificado pelo link não pode ser trocado no navegador; o servidor também valida o vínculo.
- O pedido finalizado pelo site aparece na mesma conversa do cliente no painel.
- O checkout não solicita mais e-mail.

## Correção de contatos duplicados

- Mensagens devolvidas pela Evolution com `fromMe` agora são ignoradas mesmo quando o campo chega como texto ou em estruturas alternativas.
- O nome já salvo para um cliente não é substituído pelo nome do dono do WhatsApp nem por nomes genéricos do webhook.

## Retirada separada de entrega

- Pedidos para retirada seguem: Confirmado → Em preparo → Pronto para retirada → Retirado.
- Retiradas não podem mais receber os status “Saiu para entrega” ou “Entregue”.
- A cozinha mostra “Marcar pronto para retirada” e depois “Marcar como retirado”.
- Mensagens de WhatsApp e acompanhamento do site usam textos próprios para retirada.
- A consulta de pedidos pelo próprio WhatsApp mostra **Pronto para retirada** e **Retirado** corretamente.
- Pedidos antigos de retirada que estavam com status de entrega são corrigidos ao iniciar esta versão.

## Observação sobre o endereço do site

Para o link abrir no celular fora da rede local, configure `PUBLIC_SITE_URL` no arquivo `.env` ou o campo de URL pública do site nas configurações. Sem uma URL pública, o sistema usa o endereço de rede local do computador para testes na mesma rede Wi-Fi.
