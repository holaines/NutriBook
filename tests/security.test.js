import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp, APP_FILES } from './helpers/loadApp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const index = read('index.html');

test('CSP: existe, sin unsafe-eval y sin scripts en línea', () => {
  const csp = index.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
  assert.ok(csp, 'falta la meta CSP');
  const scriptSrc = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('script-src')) ?? '';
  assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(index, /<script>(?!\s*<\/script>)/, 'ningún <script> con código en línea');
});

test('CSP: los scripts externos solo vienen de self o jsdelivr', () => {
  for (const m of index.matchAll(/<script[^>]+src="([^"]+)"/g)) assert.match(m[1], /^\.\/|^https:\/\/cdn\.jsdelivr\.net\//, m[1]);
});

test('CSP: ningún manejador en línea (onclick=…) en el código ni en cloud-sync', () => {
  const files = [...APP_FILES().filter((f) => !f.startsWith('http') && f !== 'supabase-config.js'), 'cloud-sync.js'];
  for (const f of files) {
    const code = read(f).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !f.endsWith('events.js')).join('\n');
    assert.doesNotMatch(code, /\bon(click|change|input|submit|keydown|load|error)=/, f);
  }
});

test('la clave de Gemini no aparece en ningún archivo servido al navegador', () => {
  for (const f of [...APP_FILES().filter((x) => !x.startsWith('http')), 'cloud-sync.js', 'index.html']) {
    assert.doesNotMatch(read(f), /AIza[0-9A-Za-z_-]{20,}/, f);
  }
});

test('el panel de la nube usa acciones delegadas y «Sincronizar ahora» funciona', async () => {
  const db = { payload: null };
  const app = await loadApp({ db });
  await app.go('Perfil');
  assert.match(app.html(), /data-click="cloudSyncNow"/);
  const before = db.writes || 0;
  app.eval(`document.querySelector('[data-click="cloudSyncNow"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await app.settle(300);
  assert.ok((db.writes || 0) > before, 'se escribió en la nube');
  assert.deepEqual(app.errors, []);
});
