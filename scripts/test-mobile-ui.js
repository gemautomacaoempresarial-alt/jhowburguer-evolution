const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const panelHtml = read('public/index.html');
const panelCss = read('public/styles.css');
const panelJs = read('public/app.js');
const storeHtml = read('public/pedido/index.html');
const storeCss = read('public/pedido/styles.css');
const storeJs = read('public/pedido/app.js');

for (const [name, text, required] of [
  ['painel HTML', panelHtml, ['mobile-bottom-nav', 'mobile-nav-backdrop', 'manifest.webmanifest', 'viewport-fit=cover']],
  ['painel CSS', panelCss, ['v3.11.0 — experiência mobile-first', 'body.mobile-chat-active', '.data-table[data-mobile-ready="true"]', 'env(safe-area-inset-bottom']],
  ['painel JS', panelJs, ['renderMobileBottomNav', 'enhanceResponsiveTables', 'updateAppViewportMetrics', "navigator.serviceWorker.register('/sw.js')"]],
  ['site HTML', storeHtml, ['/pedido/manifest.webmanifest', 'viewport-fit=cover', 'mobile-cart-button']],
  ['site CSS', storeCss, ['v3.11.0 — site público mobile-first', '--gm-store-height', '.cart-panel.open', '.checkout-modal']],
  ['site JS', storeJs, ['--gm-store-height', "navigator.serviceWorker.register('/sw.js')", 'updateMobileViewportInset']],
]) {
  for (const token of required) assert.ok(text.includes(token), `${name}: faltou ${token}`);
}

function duplicateIds(html) {
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}
assert.deepEqual(duplicateIds(panelHtml), [], 'O painel possui IDs duplicados.');
assert.deepEqual(duplicateIds(storeHtml), [], 'O site possui IDs duplicados.');
assert.ok(fs.existsSync(path.join(root, 'public/manifest.webmanifest')));
assert.ok(fs.existsSync(path.join(root, 'public/pedido/manifest.webmanifest')));
assert.ok(fs.existsSync(path.join(root, 'public/sw.js')));
assert.ok(fs.existsSync(path.join(root, 'public/assets/gm-logo-512.png')));

console.log('Estrutura mobile, navegação, chat, tabelas, PWA e site público validados.');
