# G&M Automação v3.4.0

## Correções do site e da visão geral

- Ícone de observação do carrinho substituído por um ícone vetorial alinhado.
- Carrinho flutuante reposicionado acima das barras do navegador em Android e iPhone.
- Compatibilidade ampliada para celulares em modo paisagem e telas maiores com toque.
- Confirmação de vínculo com a mesa centralizada no celular.
- Contagem de atendimentos aguardando agora ignora registros ocultos, encerrados e vazios.
- Visão Geral passou a mostrar quantas mesas estão ocupadas no momento.

## Preparação fiscal

Foi criado um módulo administrativo **Fiscal**, desativado por padrão e sem emissão real.

Ele permite:

- cadastrar dados básicos do emitente;
- registrar a orientação do contador;
- definir o tipo de documento sugerido por modalidade, sem assumir a regra tributária;
- cadastrar NCM, CEST, CFOP, CST/CSOSN, origem, unidade e observações fiscais nos produtos;
- acompanhar produtos com cadastro fiscal pendente;
- exportar o cadastro fiscal dos produtos em CSV para conferência do contador;
- gerar uma prévia interna por pedido;
- identificar automaticamente campos ausentes;
- impedir que a prévia seja confundida com nota real.

As prévias não possuem valor fiscal, chave de acesso ou transmissão à SEFAZ. A integração com uma API fiscal real continua dependente de empresa responsável, contador, certificado, credenciamento e credenciais de homologação.
