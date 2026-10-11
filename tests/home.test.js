import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sampleRecipes } from './helpers/loadApp.js';

const D = '2026-10-12';
const hero = (app) => (app.w.document.querySelector('.hero')?.textContent ?? '').replace(/\s+/g, ' ');
const click = (app, sel) => app.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; })()`);

test('nextMealSlot: sigue la hora y salta lo ya registrado', async () => {
  const at = async (iso, data) => (await loadApp({ now: iso, data })).eval(`nextMealSlot('${D}')`);
  assert.equal(await at('2026-10-12T08:00:00'), 'Desayuno');
  assert.equal(await at('2026-10-12T13:00:00'), 'Comida');
  assert.equal(await at('2026-10-12T17:00:00'), 'Merienda');
  assert.equal(await at('2026-10-12T21:00:00'), 'Cena');
  assert.equal(await at('2026-10-12T13:00:00', { consumed: [{ id: 'a', date: D, meal: 'Comida', name: 'x', iron: 1 }] }), 'Merienda');
  assert.equal(await at('2026-10-12T21:00:00', { consumed: [{ id: 'a', date: D, meal: 'Cena', name: 'x', iron: 1 }] }), null);
  assert.equal(await at('2026-10-12T13:00:00', { consumed: [{ id: 'a', date: D, meal: 'Suplemento', name: 'Fe', iron: 14, supplement: true }] }), 'Comida', 'un suplemento no cuenta como comida');
});

test('Inicio: sin plan sugiere planificar la receta más rica en hierro y registrar rápido', async () => {
  const app = await loadApp({ now: '2026-10-20T13:00:00', data: { recipes: sampleRecipes } });   // sin menú RAK ese día
  assert.match(hero(app), /Ahora toca · Comida/);
  assert.match(hero(app), /Aún sin planificar/);
  assert.match(hero(app), /Planificar Lentejas \(6,4 mg\)/);
  assert.match(hero(app), /Registrar lo que comas/);
});

test('Inicio: con receta planificada, «Comido» la registra y el héroe pasa a la siguiente comida', async () => {
  const app = await loadApp({ now: '2026-10-12T13:00:00', data: { recipes: sampleRecipes, plan: { [D + '|Comida']: 'r1' } } });
  assert.match(hero(app), /Lentejas/); assert.match(hero(app), /6,4 mg de hierro/);
  assert.ok(click(app, '.hero [data-click="toggleEaten"]'));
  assert.equal(app.eval(`dayIron('${D}').eaten`), 6.4);
  assert.match(hero(app), /Ahora toca · Merienda/);
});

test('Inicio: con menú RAK propone el mejor combo y «Lo he comido» lo registra', async () => {
  const app = await loadApp({ now: '2026-10-12T13:00:00' });
  await app.eval(`RAK.loadWeek(weekDates('${D}'))`);
  app.eval(`renderMain()`);
  assert.match(hero(app), /RAK: Rosbeef/);
  assert.ok(click(app, '.hero [data-click="eatRAK"]'));
  assert.equal(app.eval(`RAK.getConsumed('${D}').length`), 1);
  assert.match(hero(app), /Merienda/);
});

test('Inicio: con todo registrado felicita; el botón principal abre el registro rápido', async () => {
  const consumed = ['Desayuno', 'Comida', 'Merienda', 'Cena'].map((m, i) => ({ id: 'c' + i, date: D, meal: m, name: m, iron: 4 }));
  const app = await loadApp({ now: '2026-10-12T21:00:00', data: { consumed } });
  assert.match(hero(app), /todas las comidas de hoy/);
  assert.match(hero(app), /Objetivo de hierro cubierto/);
  assert.ok(click(app, '.top [data-click="openQuickAdd"]'));
  assert.ok(app.eval(`qa`));
});

test('Inicio: sin sesión/sin datos no rompe y mantiene el aviso de sincronización', async () => {
  const app = await loadApp({ user: false });
  assert.match(app.text(), /Ahora toca|Has registrado/);
  assert.match(app.text(), /solo en este navegador/);
  assert.deepEqual(app.errors, []);
});

test('Inicio: «Hoy en tu menú» refleja lo registrado a mano en esa comida', async () => {
  const app = await loadApp({ now: '2026-10-20T13:00:00', data: { consumed: [{ id: 'a', date: '2026-10-20', meal: 'Desayuno', name: 'Avena con kiwi', iron: 2.1 }, { id: 'b', date: '2026-10-20', meal: 'Desayuno', name: 'Café', iron: 0 }] } });
  const row = [...app.w.document.querySelectorAll('.meal-row')].find((r) => /Desayuno/i.test(r.textContent));
  assert.match(row.textContent, /Avena con kiwi, Café/);
  assert.match(row.textContent, /2,1 mg Fe/); assert.match(row.textContent, /✓ Registrado/);
  assert.match(row.className, /is-eaten/);
  assert.doesNotMatch(row.textContent, /Planificar/);
});
