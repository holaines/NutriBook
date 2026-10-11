import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadApp, sleep } from './helpers/loadApp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const index = read('index.html');

test('manifest: campos obligatorios para poder instalarse', () => {
  for (const k of ['name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color', 'icons']) assert.ok(manifest[k], k);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192') && manifest.icons.some((i) => i.sizes === '512x512'));
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
});

test('iconos: existen y son PNG con el tamaño declarado', () => {
  for (const ic of [...manifest.icons, { src: 'icons/apple-touch-icon.png', sizes: '180x180' }]) {
    const buf = fs.readFileSync(path.join(root, ic.src));
    assert.equal(buf.subarray(1, 4).toString(), 'PNG', ic.src);
    const [w, h] = ic.sizes.split('x').map(Number);
    assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], [w, h], ic.src);
  }
});

test('index.html enlaza el manifiesto, el icono de Apple y usa el mismo color de tema', () => {
  assert.match(index, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(index, /<link rel="apple-touch-icon"/);
  assert.equal(index.match(/name="theme-color" content="([^"]+)"/)[1].toLowerCase(), manifest.theme_color.toLowerCase());
});

const shellOf = () => [...read('sw.js').match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
test('sw.js: la lista de archivos coincide con lo que carga index.html (sin faltas ni sobrantes)', () => {
  const shell = shellOf().filter((f) => f !== './');
  for (const f of shell) assert.ok(fs.existsSync(path.join(root, f)), 'no existe ' + f);
  const scripts = [...index.matchAll(/<script src="\.\/([^"]+)"/g)].map((m) => m[1]);
  for (const s of scripts) assert.ok(shell.includes(s), `falta en el service worker: ${s}`);
  for (const f of ['index.html', 'styles.css', 'manifest.webmanifest']) assert.ok(shell.includes(f), f);
});

/** Ejecuta sw.js en un contexto aislado con caches/fetch falsos. */
function makeSW({ online = true, cached = {} } = {}) {
  const store = new Map(Object.entries(cached)), handlers = {}, deleted = [];
  const cache = { add: async (r) => { store.set(typeof r === 'string' ? r : r.url, 'precached'); }, put: async (r, res) => { store.set(r.url, res); },
    match: async (r) => { const u = typeof r === 'string' ? r : r.url; return [...store.entries()].find(([k]) => k === u || k.endsWith('/' + u) || k.split('?')[0] === u.split('?')[0])?.[1]; } };
  const ctx = { self: { location: { origin: 'https://app.test' }, addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => ['old', 'nutribook-v1'], delete: async (k) => { deleted.push(k); } },
    fetch: async (r) => { if (!online) throw new Error('offline'); return { ok: true, type: 'basic', clone() { return this; }, body: 'red:' + r.url }; },
    Request: class { constructor(u, o) { this.url = u; Object.assign(this, o); } }, URL, Promise, Map };
  vm.runInNewContext(read('sw.js'), ctx);
  const fire = (type, req) => new Promise((resolve) => { let p = null; handlers[type]({ request: req, respondWith: (x) => { p = x; }, waitUntil: (x) => { p = x; } }); resolve(p); });
  return { handlers, store, deleted, fire };
}
const req = (url, extra = {}) => ({ url: 'https://app.test/' + url, method: 'GET', mode: 'cors', ...extra });

test('sw: instala guardando la app y limpia cachés antiguas al activarse', async () => {
  const sw = makeSW();
  await (await sw.fire('install'));
  assert.ok([...sw.store.keys()].some((k) => k.endsWith('index.html')) && [...sw.store.keys()].some((k) => k.endsWith('styles.css')));
  await (await sw.fire('activate'));
  assert.deepEqual(sw.deleted, ['old']);
});

test('sw: con red sirve y guarda lo más nuevo; sin red sirve la copia guardada', async () => {
  const online = makeSW();
  const res = await (await online.fire('fetch', req('src/core.js')));
  assert.equal(res.body, 'red:https://app.test/src/core.js');
  assert.ok(online.store.has('https://app.test/src/core.js'), 'guardado para después');
  const offline = makeSW({ online: false, cached: { 'https://app.test/src/core.js': { body: 'copia' } } });
  assert.equal((await (await offline.fire('fetch', req('src/core.js')))).body, 'copia');
});

test('sw: sin red, una navegación cae en index.html; algo no guardado falla con claridad', async () => {
  const sw = makeSW({ online: false, cached: { 'https://app.test/index.html': { body: 'shell' } } });
  assert.equal((await (await sw.fire('fetch', req('#Recetas', { mode: 'navigate' })))).body, 'shell');
  await assert.rejects(async () => await (await sw.fire('fetch', req('otra.js'))));
});

test('sw: ignora POST y otros orígenes (Supabase)', async () => {
  const sw = makeSW();
  assert.equal(await sw.fire('fetch', req('x', { method: 'POST' })), null);
  assert.equal(await sw.fire('fetch', { url: 'https://abc.supabase.co/rest/v1/rak_menus', method: 'GET', mode: 'cors' }), null);
});

test('cola sin conexión: los cambios hechos sin red se suben solos al volver («online»), sin duplicarse', async () => {
  const db = { payload: null };
  const A = await loadApp({ db });
  db.offline = true;
  A.setNow('2026-10-12T10:30:00Z');
  A.eval(`state.recipes.push({ id: 'sin-red', name: 'Hecha sin red' }); save();`);
  await sleep(1100);
  assert.equal((db.payload?.recipes || []).some((r) => r.id === 'sin-red'), false, 'aún no llegó a la nube');
  assert.match(A.eval(`document.getElementById('sync-slot')?.textContent || ''`) + A.w.document.body.textContent, /Error sync|Sin conexión/);
  A.eval(`state.recipes.push({ id: 'sin-red-2', name: 'Otra sin red' }); save();`);
  db.offline = false;
  const writesBefore = db.writes || 0;
  A.w.dispatchEvent(new A.w.Event('online'));
  await sleep(500);
  assert.deepEqual(db.payload.recipes.map((r) => r.id).sort(), ['sin-red', 'sin-red-2']);
  assert.ok((db.writes || 0) - writesBefore <= 2, 'no se repiten escrituras innecesarias');
});

test('instalar: el aviso del navegador activa la tarjeta de Perfil y el botón lanza la instalación', async () => {
  const app = await loadApp();
  await app.go('Perfil');
  assert.doesNotMatch(app.text(), /Instalar NutriBook/);
  app.eval(`window.__prompted = false; const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e);`);
  assert.match(app.text(), /Instalar NutriBook/);
  app.eval(`document.querySelector('[data-click="installApp"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  assert.equal(app.eval(`window.__prompted`), true);
});
