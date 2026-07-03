# Jhow Burguer v3.9.0

Atualização construída sobre a v3.8.9, preservando o restante do projeto.

## Alterações

- Configurações reorganizadas em blocos clicáveis, iguais ao padrão usado em Gestão.
- A seção aberta permanece selecionada depois de ações como diagnosticar, corrigir webhook, conectar e verificar status.
- Opção de pedidos pelo site destacada nas configurações:
  - tradicional pelo WhatsApp;
  - sempre enviar o link do site;
  - perguntar WhatsApp ou site.
- Link identificado do WhatsApp reforçado:
  - URL por caminho `/pedido/checkout/TOKEN`;
  - telefone canônico retornado pelo backend;
  - número reaplicado e bloqueado no checkout quando o cliente abrir o formulário.
- Grafia padronizada para `X-Burguer`.
- Scroll do chat preservado durante atualizações em tempo real, sem apagar o texto que a atendente está digitando.
- Ler o QR Code da mesa não ocupa mais a mesa. Ela só fica ocupada quando o primeiro pedido válido é enviado.
- Liberar a mesa:
  - envia mensagem configurável de agradecimento;
  - finaliza os atendimentos vinculados;
  - remove todos os clientes da mesa.
- Finalizar um atendimento de mesa remove apenas aquela pessoa; se não restar ninguém, a mesa é liberada automaticamente.
- Gateway de pedidos usa a URL pública do painel como padrão para evitar falhas de DNS da VLAN.

## Instalação no Codespaces

```bash
unzip -o Jhow-Burguer-v3.9.0-Configuracoes-Mesas-Chat-e-Link.zip -d .
rm Jhow-Burguer-v3.9.0-Configuracoes-Mesas-Chat-e-Link.zip
git add .
git commit -m "Atualiza configuracoes mesas chat e link do site"
git push
```

Aguarde o log mostrar:

```text
G&M Automação v3.9.0
```
