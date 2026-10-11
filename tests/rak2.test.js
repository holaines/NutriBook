import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const D = '2026-10-12';
const modalText = (app) => app.w.document.getElementById('modal-root').textContent.replace(/\s+/g, ' ');
const click = (app, sel) => app.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; })()`);

test('shouldAnnounceRak: solo semanas futuras con menú, una vez, y nunca en la primera ejecución', async () => {
  const app = await loadApp();
  const f = (seen, w, c) => app.eval(`shouldAnnounceRak(${JSON.stringify(seen)}, '${w}', ${c}, '2026-10-12')`);
  assert.equal(f(null, '2026-10-19', 50), false, 'primera vez: solo se anota');
  assert.equal(f({}, '2026-10-19', 50), true);
  assert.equal(f({ '2026-10-19': true }, '2026-10-19', 50), false, 'ya avisado');
  assert.equal(f({}, '2026-10-19', 0), false, 'sin platos');
  assert.equal(f({}, '2026-10-12', 50), false, 'la semana actual no es noticia');
  assert.equal(f({}, '2026-10-05', 50), false);
});

test('aviso del menú de la semana siguiente: primera vez silencioso; después, un aviso con enlace', async () => {
  const first = await loadApp({ now: '2026-10-12T10:00:00' });
  first.w.localStorage.removeItem('nutribook-rak-seen');   // el arranque ya anotó la semana actual: se simula una instalación nueva
  first.eval(`announceRak('2026-10-19', 40)`);
  assert.equal(first.w.document.querySelector('.toast'), null);
  assert.deepEqual(JSON.parse(first.w.localStorage.getItem('nutribook-rak-seen')), { '2026-10-19': true });
  const next = await loadApp({ now: '2026-10-12T10:00:00' });
  next.w.localStorage.setItem('nutribook-rak-seen', JSON.stringify({ '2026-10-12': true }));
  next.eval(`announceRak('2026-10-19', 40)`);
  assert.match(next.w.document.querySelector('.toast').textContent, /Ya está el menú del RAK de la semana que viene/);
  next.w.document.querySelector('.toast button').click();
  assert.equal(next.eval(`weekOffset`), 1); assert.equal(next.eval(`page`), 'Calendario');
  next.w.document.querySelectorAll('.toast').forEach((t) => t.remove());
  next.eval(`announceRak('2026-10-19', 40)`);
  assert.equal(next.w.document.querySelector('.toast'), null, 'no se repite');
});

test('favoritos: la estrella marca/desmarca un plato, se conserva y marca la opción', async () => {
  const app = await loadApp();
  await app.eval(`RAK.loadWeek(weekDates('${D}'))`);
  app.eval(`showRAKModal('${D}', 'dejeuner')`);
  const dishId = app.eval(`RAK.getCombos('${D}', 'dejeuner')[0].plat.dish_id`);
  assert.ok(click(app, `.fav-dish[data-args*='[${dishId},']`));
  assert.deepEqual(app.eval(`state.rakFavs.map((f) => f.id)`), [String(dishId)]);
  assert.match(modalText(app), /Opción 1 ★/);
  assert.equal(app.w.document.querySelector(`.fav-dish[data-args*='[${dishId},']`).getAttribute('aria-pressed'), 'true');
  assert.ok(click(app, `.fav-dish[data-args*='[${dishId},']`));
  assert.deepEqual(app.eval(`state.rakFavs`), []);
  assert.doesNotMatch(modalText(app), /Opción 1 ★/);
});

test('historial: cuántas veces has comido un plato y distintivo de estimación por IA', async () => {
  const app = await loadApp();
  await app.eval(`RAK.loadWeek(weekDates('${D}'))`);
  const combo = app.eval(`RAK.getBestGlutenFreeCombo('${D}', 'dejeuner')`);
  assert.doesNotMatch((app.eval(`showRAKModal('${D}', 'dejeuner')`), modalText(app)), /Lo has comido/);
  app.eval(`RAK.confirmMeal('2026-10-05', 'dejeuner', ${JSON.stringify(combo.dishes)}); RAK.confirmMeal('2026-10-06', 'diner', ${JSON.stringify(combo.dishes)});`);
  app.eval(`showRAKModal('${D}', 'dejeuner')`);
  assert.match(modalText(app), /Lo has comido 2 veces/);
  assert.match(modalText(app), /🤖 IA/);
  app.eval(`RAK.unconfirmMeal('2026-10-06', 'diner')`);
  app.eval(`showRAKModal('${D}', 'dejeuner')`);
  assert.match(modalText(app), /Lo has comido 1 vez\b/);
});

test('migración 7 y sincronización de favoritos', async () => {
  const app = await loadApp({ data: { schemaVersion: 6 } });
  assert.deepEqual(app.eval(`state.rakFavs`), []);
  const out = app.eval(`NBMerge.mergeStates({ rakFavs: [{ id: '1', name: 'A', updatedAt: '2026-10-12T10:00:02.000Z' }] }, { rakFavs: [{ id: '2', name: 'B', updatedAt: '2026-10-12T10:00:01.000Z' }] })`);
  assert.deepEqual(out.rakFavs.map((x) => x.id), ['1', '2']);
});
