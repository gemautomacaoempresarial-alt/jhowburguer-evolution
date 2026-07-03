class MockWhatsAppProvider {
  async connect() {
    return { status: 'connected', provider: 'mock' };
  }

  async disconnect() {
    return { status: 'disconnected', provider: 'mock' };
  }

  async sendText({ phone, text }) {
    return { id: `mock-${Date.now()}`, phone, text, status: 'sent' };
  }

  async deleteMessageForEveryone({ phone, messageId }) {
    return { mock: true, phone, messageId, status: 'deleted' };
  }
}

module.exports = MockWhatsAppProvider;
