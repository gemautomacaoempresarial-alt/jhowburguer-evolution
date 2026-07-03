const http = require('node:http');
const assert = require('node:assert/strict');
const EvolutionWhatsAppProvider = require('../src/services/whatsapp/evolution');

async function main() {
  let received = null;
  let savedWebhook = null;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/webhook/set/atenderbem') {
        received = {
          headers: req.headers,
          body: JSON.parse(body || '{}'),
        };
        if (!received.body.webhook) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 400,
            error: 'Bad Request',
            response: { message: [['instance requires property "webhook"']] },
          }));
          return;
        }
        savedWebhook = received.body.webhook;
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ webhook: { instanceName: 'atenderbem', webhook: savedWebhook } }));
        return;
      }
      if (req.method === 'GET' && req.url === '/webhook/find/atenderbem') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(savedWebhook || { enabled: false, url: '', events: [] }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const provider = new EvolutionWhatsAppProvider({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: 'test-key',
      instanceName: 'atenderbem',
    });

    const url = 'http://host.docker.internal:3000/api/webhooks/evolution/test-secret';
    const result = await provider.setWebhook(url);

    assert.ok(received, 'A rota de webhook não foi chamada.');
    assert.equal(received.headers.apikey, 'test-key');
    assert.deepEqual(Object.keys(received.body), ['webhook']);
    assert.equal(received.body.webhook.enabled, true);
    assert.equal(received.body.webhook.url, url);
    assert.equal(received.body.webhook.webhookByEvents, false);
    assert.equal(received.body.webhook.webhookBase64, true);
    assert.ok(received.body.webhook.events.includes('MESSAGES_UPSERT'));
    assert.ok(received.body.webhook.events.includes('CONNECTION_UPDATE'));
    assert.equal(result.verifiedUrl, url);

    console.log('OK: payload e confirmação do webhook compatíveis com Evolution API v2.3.7.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
