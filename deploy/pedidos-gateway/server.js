'use strict';

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 8080);
const HOST = String(process.env.HOST || '0.0.0.0');
const target = new URL(process.env.TARGET_ORIGIN || 'https://jhowburgueratender.discloud.app');
const transport = target.protocol === 'https:' ? https : http;
const hopByHopHeaders = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

if (!['http:', 'https:'].includes(target.protocol)) {
  throw new Error('TARGET_ORIGIN deve começar com http:// ou https://.');
}

function targetPathFor(requestUrl) {
  const url = new URL(requestUrl || '/', 'http://gateway.local');
  if (url.pathname === '/') return `/pedido${url.search}`;
  if (url.pathname === '/health' || url.pathname === '/api/health') return null;
  if (url.pathname === '/favicon.ico') return `/assets/favicon.png${url.search}`;
  if (
    url.pathname === '/pedido' ||
    url.pathname.startsWith('/pedido/') ||
    url.pathname === '/api/public' ||
    url.pathname.startsWith('/api/public/') ||
    url.pathname === '/assets' ||
    url.pathname.startsWith('/assets/')
  ) {
    return `${url.pathname}${url.search}`;
  }
  return false;
}

const server = http.createServer((req, res) => {
  const proxiedPath = targetPathFor(req.url);

  if (proxiedPath === null) {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    return res.end(JSON.stringify({ ok: true, service: 'Jhow Burguer Pedidos', target: target.origin }));
  }

  if (proxiedPath === false) {
    res.writeHead(404, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    return res.end('Página não encontrada.');
  }

  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const normalized = name.toLowerCase();
    if (!hopByHopHeaders.has(normalized) && normalized !== 'host') headers[name] = value;
  }

  headers.host = target.host;
  headers['x-forwarded-host'] = req.headers.host || 'jhowburguerpedidos.discloud.app';
  headers['x-forwarded-proto'] = 'https';
  headers['x-forwarded-for'] = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '');

  const proxyRequest = transport.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: proxiedPath,
    headers,
  }, (proxyResponse) => {
    const responseHeaders = {};
    for (const [name, value] of Object.entries(proxyResponse.headers)) {
      if (!hopByHopHeaders.has(name.toLowerCase()) && value !== undefined) responseHeaders[name] = value;
    }
    responseHeaders['x-content-type-options'] = 'nosniff';
    responseHeaders['referrer-policy'] = 'strict-origin-when-cross-origin';
    res.writeHead(proxyResponse.statusCode || 502, responseHeaders);
    proxyResponse.pipe(res);
  });

  proxyRequest.setTimeout(30_000, () => proxyRequest.destroy(new Error('Tempo limite ao acessar o sistema principal.')));
  proxyRequest.on('error', (error) => {
    console.error(`[PEDIDOS] Falha ao acessar ${target.origin}: ${error.message}`);
    if (res.headersSent) return res.destroy(error);
    res.writeHead(502, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end('O cardápio está temporariamente indisponível.');
  });

  req.pipe(proxyRequest);
});

server.listen(PORT, HOST, () => {
  console.log(`[PEDIDOS] Jhow Burguer Pedidos em http://${HOST}:${PORT}`);
  console.log(`[PEDIDOS] Encaminhando cardápio e pedidos para ${target.origin}`);
});
