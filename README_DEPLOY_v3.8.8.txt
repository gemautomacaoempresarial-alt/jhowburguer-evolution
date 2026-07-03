JHOW BURGUER ATENDIMENTO v3.8.8
================================

PROBLEMA CORRIGIDO
------------------
A Evolution recebia a mensagem do cliente, mas não conseguia entregar
o webhook ao painel:

getaddrinfo ENOTFOUND jhowburgueratender.discloud.app

Além disso, o painel iniciava sem EVOLUTION_API_KEY e não conseguia
mandar respostas automáticas.

CORREÇÃO
--------
A comunicação agora usa a VLAN privada da Discloud:

Painel -> Evolution:
http://jhowburguer-evolution:8080

Evolution -> Painel:
http://jhowburguer-atender:8080

O endereço público continua sendo:
https://jhowburgueratender.discloud.app

VARIÁVEIS NA DISCLOUD
---------------------
Na aplicação jhowburgueratender, configure:

EVOLUTION_BASE_URL=http://jhowburguer-evolution:8080
EVOLUTION_API_KEY=COLE_A_MESMA_CHAVE_DA_EVOLUTION
EVOLUTION_INSTANCE=jhowburguer
EVOLUTION_WEBHOOK_BASE_URL=http://jhowburguer-atender:8080
APP_PUBLIC_URL=https://jhowburgueratender.discloud.app
APP_ORIGIN=https://jhowburgueratender.discloud.app

Não coloque a chave no GitHub.

LOG ESPERADO
------------
G&M Automação v3.8.8
[WhatsApp] Configuração da Evolution restaurada:
[WhatsApp] Webhook privado preparado:
[WhatsApp] Webhook da Evolution confirmado pela VLAN

INSTALAÇÃO NO CODESPACES
------------------------
1. Envie o ZIP para a raiz /workspaces/jhowburguer.
2. Execute:
   unzip -o Jhow-Burguer-v3.8.8-VLAN-Webhook-Resposta-Automatica.zip -d .
3. Apague o ZIP.
4. Execute:
   git add .
   git commit -m "Corrige webhook e resposta automatica pela VLAN"
   git push
5. Na Discloud, adicione as variáveis acima ao deploy GitHub.
6. Faça redeploy completo somente do jhowburgueratender.
