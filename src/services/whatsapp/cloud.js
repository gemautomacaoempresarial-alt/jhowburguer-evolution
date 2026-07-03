/**
 * Estrutura inicial para a API oficial da Meta.
 * Mantida separada para permitir migração sem refazer o painel.
 */
class CloudWhatsAppProvider {
  constructor(config = {}) {
    this.phoneNumberId = config.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = config.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
    this.apiVersion = config.apiVersion || process.env.WHATSAPP_API_VERSION;
  }

  async sendText({ phone, text }) {
    if (!this.phoneNumberId || !this.accessToken || !this.apiVersion) throw new Error('Cloud API ainda não foi configurada.');
    const response = await fetch(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || 'Erro ao enviar mensagem pela Cloud API.');
    return data;
  }
  async deleteMessageForEveryone() {
    throw new Error('A exclusão para todos ainda não está disponível nesta conexão da Cloud API.');
  }

}

module.exports = CloudWhatsAppProvider;
