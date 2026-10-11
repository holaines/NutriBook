import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/rak_menus.json'), 'utf8'));
export const NOW = '2026-10-12T10:00:00'; // lunes; las fixtures RAK cubren 12-14 oct

/** Carga la app en jsdom con Supabase/Cloud falsos y reloj fijo. */
export async function loadApp({ data, user = true, now = NOW } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'https://nutribook.test/', runScripts: 'dangerously', pretendToBeVisual: true,
  });
  const w = dom.window;
  const errors = [];
  w.addEventListener('error', (e) => errors.push(e.message));
  w.alert = (m) => errors.push('alert: ' + m);
  w.confirm = () => true;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const fetchCalls = [];
  w.fetch = async (u, o) => { fetchCalls.push({ u, o }); return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) }; };

  const inject = (code) => { const s = w.document.createElement('script'); s.textContent = code; w.document.body.appendChild(s); };
  // reloj fijo (antes que cualquier script de la app)
  inject(`(() => { const R = Date, fixed = new R(${JSON.stringify(now)}).getTime();
    class D extends R { constructor(...a) { a.length ? super(...a) : super(fixed); } static now() { return fixed; } }
    window.Date = D; })();`);
  if (data) w.localStorage.setItem('nutribook-local-v1', JSON.stringify(data));

  const saved = [];
  w.NutriCloud = {
    getClient: () => ({
      from: () => ({ select: () => ({ in: async (_c, dates) => ({ data: fixture.filter((r) => dates.includes(r.menu_date)) }) }) }),
      auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
    }),
    getUser: () => (user ? { id: 'u1' } : null), getUserMeta: () => ({}), panel: () => '', syncBadge: () => '',
    scheduleSave: (s) => saved.push(s), start: (o) => o.onReady(),
  };
  for (const f of ['rak.js', 'app.js']) inject(fs.readFileSync(path.join(root, f), 'utf8'));
  await sleep(50);

  const app = {
    w, errors, fetchCalls, saved,
    // los objetos de jsdom son de otro realm: se clonan por JSON para poder compararlos
    eval: (c) => { const v = w.eval(c); return v && typeof v === 'object' && typeof v.then !== 'function' ? JSON.parse(JSON.stringify(v)) : v; },
    html: () => w.document.getElementById('view')?.innerHTML ?? '',
    text: () => (w.document.getElementById('view')?.textContent ?? '').replace(/\s+/g, ' '),
    async go(p, opts = '') { w.eval(`navigate(${JSON.stringify(p)}${opts ? ',' + opts : ''})`); await sleep(30); },
    async settle(ms = 300) { await sleep(ms); },
  };
  return app;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const sampleRecipes = [
  { id: 'r1', name: 'Lentejas', emoji: '🍲', categories: ['Comidas'], ingredients: [{ name: 'lentejas', quantity: 200, unit: 'g' }, { name: 'cebolla', quantity: 1, unit: 'ud' }], instructions: ['Cocer'], servings: 2, time: 30, iron: 6.4, favorite: true },
  { id: 'r2', name: 'Ensalada', emoji: '🥗', categories: ['Cenas'], ingredients: [{ name: 'lechuga', quantity: 1, unit: 'ud' }], instructions: ['Mezclar'], servings: 1, time: 5, iron: null },
];
