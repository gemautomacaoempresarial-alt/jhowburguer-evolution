# Guia da Evolution API local

## Configuração padrão

```text
URL: http://localhost:8080
Chave: atenderbem-local-test-key
Instância: atenderbem
URL pública do painel: http://host.docker.internal:3000
```

Execute primeiro `INICIAR_EVOLUTION.bat` e aguarde a API ficar pronta. Depois execute `INICIAR.bat`.

## Problemas comuns

### Invalid integration

A instância deve ser criada com a integração `WHATSAPP-BAILEYS`. O adaptador desta versão já envia esse valor.

### Unauthorized

A chave salva no painel precisa ser igual à variável `AUTHENTICATION_API_KEY` do container. Para aplicar a configuração local novamente, execute `CORRIGIR_CONEXAO_LOCAL.bat`.

### A API demorou demais para responder

A primeira inicialização pode demorar enquanto PostgreSQL, Redis e migrações são preparados. Aguarde o arquivo de inicialização confirmar que a API está pronta. Use `DIAGNOSTICO_EVOLUTION.bat` para consultar os containers e a porta 8080.

### Webhook aponta para localhost:3000

Dentro do container, `localhost` aponta para a própria Evolution API. O endereço correto do painel no Windows é:

```text
http://host.docker.internal:3000
```

A versão 2.3.7 da Evolution exige a propriedade raiz `webhook` ao configurar o endpoint. O AtenderBem já utiliza esse formato.

### O WhatsApp fica em Conectando

Remova sessões antigas em **WhatsApp → Aparelhos conectados**, reinicie apenas a Evolution com `REINICIAR_APENAS_EVOLUTION.bat` e gere um novo QR Code. Não clique várias vezes enquanto o código atual ainda estiver válido.

### O Docker não alcança a porta 3000

Execute `LIBERAR_PORTA_3000_FIREWALL.bat` como administrador e faça o diagnóstico novamente.

## Recuperação completa

`REINICIAR_EVOLUTION_DO_ZERO.bat` recria os volumes da Evolution API. Ele não apaga `data\atenderbem.sqlite`, mas remove a sessão do WhatsApp e exige a leitura de um novo QR Code.
