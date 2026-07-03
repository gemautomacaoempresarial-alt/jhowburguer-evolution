JHOW BURGUER / G&M AUTOMAÇÃO v3.9.9

Atualização:
- Novo cardápio Jhow Burguer importado por categorias, com preços, tamanhos, sabores, aliases e descrições.
- Descrições exibidas no site e usadas pela IA quando o cliente pergunta ingredientes ou preparo.
- Cardápio do WhatsApp organizado por categorias e páginas, sem imagens.
- Configurações não voltam mais ao início ao diagnosticar, conectar ou corrigir o WhatsApp e ao editar listas.
- Aviso grande para toda a equipe quando o expediente termina.
- Prolongamento temporário do atendimento até o horário escolhido, válido somente naquele dia e sem alterar a grade semanal.
- O prolongamento também mantém o bot e o site de pedidos dentro do horário de funcionamento.

CODESPACES

unzip -o Jhow-Burguer-v3.9.9-Cardapio-Horario-e-Configuracoes.zip -d .
rm Jhow-Burguer-v3.9.9-Cardapio-Horario-e-Configuracoes.zip

git add .
git commit -m "Adiciona cardapio por categorias e prolongamento de horario"
git push

Aguarde o log mostrar:
G&M Automação v3.9.9
