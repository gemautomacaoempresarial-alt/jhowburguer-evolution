# Jhow Burguer v3.9.4 — pedidos, notificações e módulos

Alterações principais:
- Pedido montado pela IA aparece antes do histórico; cancelados saem do destaque e ficam abaixo.
- Botão X visível para fechar “Pedidos desta conversa”.
- Cor do status fica somente na conversa da coluna lateral, sem pintar o cabeçalho e o painel direito.
- Controle de ativar/silenciar fica dentro do próprio sino de notificações.
- Encaminhamentos feitos pelo bot geram notificação mesmo quando a conversa já tinha atendente vinculado.
- Mesas e Fiscal somem do menu quando os módulos estiverem desativados.
- A IA informa claramente quando um produto não foi adicionado por não ser reconhecido.
- Fontes e botões da área de atendimento foram reajustados.

## Codespaces

```bash
unzip -o Jhow-Burguer-v3.9.4-Pedidos-Notificacoes-Modulos.zip -d .

rm Jhow-Burguer-v3.9.4-Pedidos-Notificacoes-Modulos.zip

git add .
git commit -m "Corrige pedidos notificacoes modulos e visual do atendimento"
git push
```

Aguarde o log mostrar:

```text
G&M Automação v3.9.4
```
