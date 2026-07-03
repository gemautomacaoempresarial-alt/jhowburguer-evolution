# G&M Automação v3.0.15

## Indicador de digitação do bot no WhatsApp

- As respostas automáticas da IA agora exibem **digitando...** no WhatsApp antes de serem enviadas.
- O tempo varia conforme o tamanho da resposta, entre aproximadamente 1,8 e 5,5 segundos.
- O indicador é aplicado somente às respostas do bot/IA; mensagens manuais dos atendentes continuam imediatas.
- Após o tempo de digitação, a mensagem é enviada normalmente e o indicador desaparece.
- A implementação usa o campo `delay` da Evolution API, que representa o tempo de presença antes do envio.
