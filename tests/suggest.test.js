import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const R = (id, iron, extra = {}) => ({ id, name: id, iron, ingredients: [], ...extra });
const run = async (over) => (await loadApp()).eval(`suggestGap(Object.assign(${JSON.stringify({ missing: 6, mealsLeft: 1, meal: 'Comida', recipes: [], pantry: [], vegetarian: false, exclude: [] })}, ${JSON.stringify(over)}, { foods: FOODS }))`);

test('suggestGap: nada que sugerir si el objetivo está cubierto', async () => {
  assert.deepEqual(await run({ missing: 0 }), []);
  assert.deepEqual(await run({ missing: 0.3 }), []);
  assert.deepEqual(await run({ missing: -4 }), []);
});

test('suggestGap: la receta con el hierro más cercano a lo que falta va primero', async () => {
  const out = await run({ missing: 6, recipes: [R('lent', 6.4), R('ensal', 1), R('higado', 15), R('sopa', 5)] });
  assert.equal(out[0].kind, 'recipe'); assert.equal(out[0].id, 'lent');
  assert.equal(out[1].id, 'sopa');
});

test('suggestGap: reparte lo que falta entre las comidas que quedan', async () => {
  const out = await run({ missing: 12, mealsLeft: 3, recipes: [R('a', 4), R('b', 12)] });
  assert.equal(out[0].id, 'a', 'faltan 12 mg en 3 comidas: ~4 mg por comida');
});

test('suggestGap: la despensa pesa a favor (receta y alimento)', async () => {
  const recipes = [R('lejos', 6, { ingredients: [{ name: 'trufa' }] }), R('casa', 4.5, { ingredients: [{ name: 'Lentejas' }, { name: 'cebolla' }] })];
  const out = await run({ missing: 6, recipes, pantry: [{ name: 'lentejas' }, { name: 'cebolla' }] });
  assert.equal(out[0].id, 'casa'); assert.match(out[0].why, /2 ingredientes de tu despensa/);
  const foods = (await run({ missing: 5, recipes: [], pantry: [{ name: 'garbanzos' }] })).filter((s) => s.kind === 'food');
  assert.ok(foods.some((f) => f.id === 'garbanzos' && /en casa/.test(f.why)), JSON.stringify(foods));
});

test('suggestGap: alimentos según la comida (desayuno ligero, comida contundente), sin café/té y sin carne si es vegetariana', async () => {
  const cats = async (over) => (await run(over)).filter((s) => s.kind === 'food').map((s) => (s.id));
  const app = await loadApp();
  const cat = (id) => app.eval(`foodById(${JSON.stringify(id)}).category`);
  for (const id of await cats({ meal: 'Desayuno', missing: 3 })) assert.ok(['Frutos secos y semillas', 'Frutas', 'Cereales y pan', 'Huevos y lácteos'].includes(cat(id)), id);
  for (const id of await cats({ meal: 'Cena', missing: 6 })) assert.ok(['Legumbres', 'Carnes', 'Pescado y marisco', 'Verduras', 'Cereales y pan'].includes(cat(id)), id);
  for (const meal of ['Desayuno', 'Comida', 'Merienda', 'Cena']) {
    const ids = await cats({ meal, missing: 8 });
    assert.ok(!ids.includes('cafe') && !ids.includes('te') && !ids.includes('cacao-polvo'));
  }
  for (const id of await cats({ meal: 'Comida', missing: 9, vegetarian: true })) assert.equal(app.eval(`foodById(${JSON.stringify(id)}).type`), 'nonheme', id);
});

test('suggestGap: excluye lo ya planificado/comido, ignora recetas sin hierro y devuelve como mucho 3', async () => {
  const out = await run({ missing: 6, recipes: [R('a', 6), R('b', 5.5), R('c', 5), R('sin', null), R('cero', 0)], exclude: ['a'] });
  assert.ok(out.length <= 3);
  const ids = out.filter((s) => s.kind === 'recipe').map((s) => s.id);
  assert.ok(!ids.includes('a') && !ids.includes('sin') && !ids.includes('cero'));
  assert.equal(ids[0], 'b');
});

test('suggestGap: sin recetas ni despensa sigue sugiriendo alimentos básicos', async () => {
  const out = await run({ missing: 5 });
  assert.ok(out.length >= 2 && out.every((s) => s.kind === 'food' && s.mg >= 0.8));
});

test('Inicio: muestra «Para llegar a tu objetivo»; «Planificar» abre el calendario y «Añadir» registra un alimento con deshacer', async () => {
  const data = { recipes: [{ id: 'r', name: 'Lentejas', iron: 6.4, categories: ['Comidas'], ingredients: [], instructions: [], servings: 1 }] };
  const app = await loadApp({ now: '2026-10-20T13:00:00', data });
  assert.match(app.text(), /Para llegar a tu objetivo · comida/);
  const click = (sel) => app.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
  assert.ok(click('.gap [data-click="openPlan"]'));
  assert.match(app.w.document.getElementById('modal-root').textContent, /Añadir al calendario/);
  app.eval(`closeModal()`);
  const before = app.eval(`state.consumed.length`);
  assert.ok(click('.gap [data-click="addSuggestedFood"]'));
  assert.equal(app.eval(`state.consumed.length`), before + 1);
  assert.equal(app.eval(`state.consumed.at(-1).meal`), 'Comida');
  assert.ok(app.eval(`state.consumed.at(-1).foodId`));
  app.w.document.querySelector('.toast button').click();
  assert.equal(app.eval(`state.consumed.length`), before);
  assert.deepEqual(app.errors, []);
});

test('Inicio: con el objetivo cubierto o sin comidas pendientes no hay sugerencias', async () => {
  const done = ['Desayuno', 'Comida', 'Merienda', 'Cena'].map((m, i) => ({ id: 'c' + i, date: '2026-10-20', meal: m, name: m, iron: 5 }));
  const app = await loadApp({ now: '2026-10-20T21:00:00', data: { consumed: done } });
  assert.doesNotMatch(app.text(), /Para llegar a tu objetivo/);
  const rich = await loadApp({ now: '2026-10-20T10:00:00', data: { consumed: [{ id: 'x', date: '2026-10-20', meal: 'Desayuno', name: 'Hígado', iron: 30 }] } });
  assert.doesNotMatch(rich.text(), /Para llegar a tu objetivo/);
});
