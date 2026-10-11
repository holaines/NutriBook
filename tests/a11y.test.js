import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './helpers/loadApp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

const tokensOf = (block) => Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)].map((m) => [m[1], m[2]]));
const light = tokensOf(css.match(/:root \{([\s\S]*?)\n\}/)[1]);
const dark = { ...light, ...tokensOf(css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1]) };
const lum = (hex) => {
  let h = hex.slice(1); if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [texto, fondo, mínimo]: 4,5 texto normal AA
const PAIRS = [
  ['ink', 'cream'], ['ink', 'surface'], ['ink', 'tint'], ['ink', 'sidebar'], ['muted', 'cream'], ['muted', 'surface'], ['muted', 'sidebar'],
  ['rose', 'cream'], ['rose', 'surface'], ['rose', 'sidebar'], ['rose', 'tint'], ['#fff', 'accent'], ['eyebrow', 'cream'], ['eyebrow', 'surface'],
  ['good', 'good-bg'], ['mid', 'mid-bg'], ['low', 'low-bg'], ['good', 'surface'], ['mid', 'surface'], ['low', 'surface'],
  ['tag-ink', 'tint'], ['label-ink', 'surface'], ['warm-ink', 'warm-bg'], ['info-ink', 'info-bg'], ['ink', 'good-bg'], ['ink', 'mid-bg'], ['ink', 'low-bg'],
];
for (const [name, tokens] of [['claro', light], ['oscuro', dark]]) {
  test(`contraste AA (≥ 4,5) de los pares texto/fondo — tema ${name}`, () => {
    const fails = [];
    for (const [fg, bg] of PAIRS) {
      const f = fg.startsWith('#') ? fg : tokens[fg], b = tokens[bg];
      assert.ok(f && b, `falta el token ${fg}/${bg}`);
      const r = ratio(f, b);
      if (r < 4.5) fails.push(`${fg} (${f}) sobre ${bg} (${b}) = ${r.toFixed(2)}`);
    }
    assert.deepEqual(fails, []);
  });
}

test('tema oscuro: define todos los tokens del claro (nada se queda con un color de día)', () => {
  const darkOwn = tokensOf(css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1]);
  const mustChange = ['cream', 'ink', 'muted', 'line', 'tint', 'surface', 'surface-soft', 'sidebar', 'track', 'card-line', 'bd', 'good', 'good-bg', 'mid', 'mid-bg', 'low', 'low-bg', 'warm-bg', 'info-bg'];
  for (const t of mustChange) assert.ok(darkOwn[t] && darkOwn[t] !== light[t], `token ${t} sin versión oscura`);
  const media = css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}\n\}/)[1];
  assert.deepEqual(tokensOf(media), darkOwn, 'el modo automático y el manual comparten paleta');
});

test('CSS: no quedan fondos blancos fijos que rompan el tema oscuro', () => {
  const body = css.slice(css.indexOf('/* ───────── Base')).replace(/@media print \{[\s\S]*?\n\}\n/g, '');   // el papel siempre es blanco
  assert.doesNotMatch(body, /background:\s*#fff\b/);
  assert.doesNotMatch(body, /background:\s*#f[0-9a-f]{5}\b/i, 'fondos pastel fijos');
});

test('CSS: foco visible, objetivos táctiles de 44 px y respeto a «reducir movimiento»', () => {
  assert.match(css, /:focus-visible \{[^}]*outline/);
  assert.match(css, /@media \(pointer: coarse\)[\s\S]*min-height: 44px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration/);
});

test('modal: role=dialog, aria-labelledby con el título, el resto de la app oculto y foco devuelto al cerrar', async () => {
  const app = await loadApp();
  const opener = app.w.document.querySelector('.fab');
  opener.focus();
  app.eval(`openQuickAdd()`);
  const dlg = app.w.document.querySelector('.modal');
  assert.equal(dlg.getAttribute('role'), 'dialog'); assert.equal(dlg.getAttribute('aria-modal'), 'true');
  const title = app.w.document.getElementById(dlg.getAttribute('aria-labelledby'));
  assert.match(title.textContent, /Registrar rápido/);
  assert.equal(app.w.document.querySelector('.app').getAttribute('aria-hidden'), 'true');
  app.eval(`closeModal()`);
  assert.equal(app.w.document.querySelector('.app').hasAttribute('aria-hidden'), false);
  assert.equal(app.w.document.activeElement, opener, 'el foco vuelve al botón que abrió la ventana');
});

test('modal: Tab no sale de la ventana y Esc la cierra', async () => {
  const app = await loadApp();
  app.eval(`openFoodForm('2026-10-12')`);
  const tab = (shift = false) => app.eval(`(() => { const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: ${shift}, bubbles: true, cancelable: true }); document.activeElement.dispatchEvent(e); return e.defaultPrevented; })()`);
  const inside = () => app.eval(`document.querySelector('#modal-root .modal').contains(document.activeElement)`);
  const last = app.eval(`(() => { const x = [...document.querySelectorAll('#modal-root .modal button')]; x[x.length - 1].focus(); return true; })()`);
  assert.ok(last);
  assert.equal(tab(), true, 'Tab en el último elemento vuelve al primero');
  assert.ok(inside());
  app.eval(`document.querySelector('#modal-root .modal').querySelector('input,select,textarea,button').focus()`);
  assert.equal(tab(true), true, 'Mayús+Tab en el primero salta al último');
  app.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  assert.equal(app.eval(`modal`), null);
});

test('tema: la preferencia se guarda y se aplica (auto/claro/oscuro) sin tocar los datos', async () => {
  const app = await loadApp();
  await app.go('Perfil');
  const root = app.w.document.documentElement;
  app.eval(`setTheme('dark')`);
  assert.equal(root.getAttribute('data-theme'), 'dark'); assert.equal(app.w.localStorage.getItem('nutribook-theme'), 'dark');
  assert.match(app.html(), /aria-checked="true"[^>]*>Oscuro|class="on"[^>]*>Oscuro/);
  app.eval(`setTheme('light')`); assert.equal(root.getAttribute('data-theme'), 'light');
  app.eval(`setTheme('auto')`); assert.equal(root.hasAttribute('data-theme'), false); assert.equal(app.w.localStorage.getItem('nutribook-theme'), null);
  assert.equal(app.eval(`JSON.stringify(state)`).includes('theme'), false, 'no se sincroniza con la nube');
});

test('anillo de hierro: sin hierro no dibuja el punto redondeado; con hierro sí', async () => {
  const app = await loadApp();
  assert.equal(app.w.document.querySelectorAll('.ring-eaten').length, 0);
  const app2 = await loadApp({ data: { consumed: [{ id: 'a', date: '2026-10-12', meal: 'Comida', name: 'x', iron: 5 }] } });
  assert.equal(app2.w.document.querySelectorAll('.ring-eaten').length, 1);
});

test('indicadores: los niveles llevan un símbolo además del color', () => {
  for (const lvl of ['good', 'mid', 'low']) assert.match(css, new RegExp(`\\.fe\\.${lvl}::before`));
});
