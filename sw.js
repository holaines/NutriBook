'use strict';
/* NutriBook — service worker: la app abre sin conexión.
   Estrategia «red primero»: con red siempre se sirve la versión más nueva (y se guarda); sin red, la copia guardada.
   Las llamadas a Supabase y a otros orígenes no se tocan. */
const CACHE = 'nutribook-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/theme.js',
  'src/errors.js',
  'src/merge.js',
  'src/html.js',
  'src/events.js',
  'cloud-sync.js',
  'rak.js',
  'src/core.js',
  'src/foods.js',
  'src/stats.js',
  'src/recipe-iron.js',
  'src/absorption.js',
  'src/suggest.js',
  'src/planner.js',
  'src/ui.js',
  'src/pages/home.js',
  'src/pages/recipes.js',
  'src/pages/calendar.js',
  'src/pages/pantry.js',
  'src/pages/shopping.js',
  'src/pages/iron.js',
  'src/pages/profile.js',
  'src/pages/onboarding.js',
  'src/pages/supplements.js',
  'src/pages/labs.js',
  'src/pages/quickadd.js',
  'src/pages/report.js',
  'src/rak-ui.js',
  'src/boot.js',
  'supabase-config.js'
];
const CDN = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all([...SHELL.map((u) => c.add(u).catch(() => {})), ...CDN.map((u) => c.add(new Request(u, { mode: 'no-cors' })).catch(() => {}))])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin, isCdn = CDN.includes(req.url);
  if (!sameOrigin && !isCdn) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
      if (hit) return hit;
      throw err;
    }
  })());
});
