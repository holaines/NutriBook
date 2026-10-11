import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/rak_menus.json'), 'utf8'));
export const APP_FILES = () => {
  const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  return [...idx.matchAll(/<script src="\.\/([^"]+)"/g)].map((m) => m[1]);
};
export const NOW = '2026-10-12T10:00:00'; // lunes; las fixtures RAK cubren 12-14 oct

/** Carga la app en jsdom con Supabase/Cloud falsos y reloj fijo. */
export async function loadApp({ data, user = true, now = NOW, db = null, onboarding = false } = {}) {
  // por defecto la bienvenida no estorba; los tests que la prueban pasan onboarding: true
  if (!onboarding) data = { ...(data || {}), profile: { onboarded: true, ...((data || {}).profile || {}) } };
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
  inject(`(() => { const R = Date; let fixed = new R(${JSON.stringify(now)}).getTime(); window.__setNow = (iso) => { fixed = new R(iso).getTime(); };
    class D extends R { constructor(...a) { a.length ? super(...a) : super(fixed); } static now() { return fixed; } }
    window.Date = D; })();`);
  if (data) w.localStorage.setItem('nutribook-local-v1', JSON.stringify(data));

  const saved = [];
  const rakQuery = () => ({ select: () => ({ in: async (_c, dates) => ({ data: fixture.filter((r) => dates.includes(r.menu_date)) }) }) });
  if (db) {
    // nube real (cloud-sync.js) contra una base falsa compartida entre «dispositivos»: db = { payload: null }
    w.NUTRIBOOK_SUPABASE = { url: 'https://x.test', key: 'k' };
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.c' }, access_token: 't' } } }), onAuthStateChange: () => {}, signOut: async () => ({}) },
      from: (t) => t !== 'nutribook_data' ? rakQuery() : {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.payload ? { payload: JSON.parse(JSON.stringify(db.payload)) } : null, error: null }) }) }),
        upsert: async (row) => { db.payload = JSON.parse(JSON.stringify(row.payload)); db.writes = (db.writes || 0) + 1; return { error: null }; },
      },
    };
    w.supabase = { createClient: () => client };
  } else {
    w.NUTRIBOOK_SUPABASE = { url: 'https://x.test', key: 'anon-key' };
    w.NutriCloud = {
      getClient: () => ({ from: rakQuery, auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } }),
      getUser: () => (user ? { id: 'u1' } : null), getUserMeta: () => ({}), panel: () => '', syncBadge: () => '',
      scheduleSave: (s) => saved.push(s), start: (o) => o.onReady(),
    };
  }
  // mismos scripts y mismo orden que index.html (salvo config, CDN y cloud-sync, que se simulan)
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const local = [...indexHtml.matchAll(/<script src="\.\/([^"]+)"/g)].map((m) => m[1]).filter((f) => f !== 'supabase-config.js' && (db || f !== 'cloud-sync.js'));
  for (const f of local) inject(fs.readFileSync(path.join(root, f), 'utf8'));
  await sleep(db ? 300 : 50);

  const app = {
    w, errors, fetchCalls, saved,
    // los objetos de jsdom son de otro realm: se clonan por JSON para poder compararlos
    eval: (c) => { const v = w.eval(c); return v && typeof v === 'object' && typeof v.then !== 'function' ? JSON.parse(JSON.stringify(v)) : v; },
    html: () => w.document.getElementById('view')?.innerHTML ?? '',
    text: () => (w.document.getElementById('view')?.textContent ?? '').replace(/\s+/g, ' '),
    async go(p, opts = '') { w.eval(`navigate(${JSON.stringify(p)}${opts ? ',' + opts : ''})`); await sleep(30); },
    async settle(ms = 300) { await sleep(ms); },
    setNow: (iso) => w.__setNow(iso),
  };
  return app;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const sampleRecipes = [
  { id: 'r1', name: 'Lentejas', emoji: '🍲', categories: ['Comidas'], ingredients: [{ name: 'lentejas', quantity: 200, unit: 'g' }, { name: 'cebolla', quantity: 1, unit: 'ud' }], instructions: ['Cocer'], servings: 2, time: 30, iron: 6.4, favorite: true },
  { id: 'r2', name: 'Ensalada', emoji: '🥗', categories: ['Cenas'], ingredients: [{ name: 'lechuga', quantity: 1, unit: 'ud' }], instructions: ['Mezclar'], servings: 1, time: 5, iron: null },
];
