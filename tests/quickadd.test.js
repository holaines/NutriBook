import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sampleRecipes } from './helpers/loadApp.js';

const click = (app, sel) => app.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; })()`);
const type = (app, text) => app.eval(`(() => { const i = document.getElementById('qa-search'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const D = '2026-10-12';

test('el botón flotante abre el registro rápido y el atajo «n» también', async () => {
  const app = await loadApp();
  assert.ok(click(app, '.fab'));
  assert.ok(app.eval(`qa`) && app.w.document.getElementById('qa-search'));
  app.eval(`closeModal()`);
  app.eval(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }))`);
  assert.ok(app.eval(`qa`), 'atajo n');
  app.eval(`closeModal(); qa = null;`);
  app.eval(`const i = document.createElement('input'); document.body.appendChild(i); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }))`);
  assert.equal(app.eval(`qa`), null, 'escribiendo en un campo no se dispara');
});

test('buscar y añadir ½, 1 y 2 raciones calcula los mg y los suma a hoy', async () => {
  const app = await loadApp();
  app.eval(`openQuickAdd('${D}', 'Comida')`);
  type(app, 'lentejas cocidas');
  assert.match(app.w.document.getElementById('qa-results').textContent, /Lentejas cocidas/);
  assert.ok(click(app, '[data-click="qaAdd"][data-args=\'["lentejas",1]\']'));
  assert.ok(click(app, '[data-click="qaAdd"][data-args=\'["lentejas",0.5]\']'));
  assert.ok(click(app, '[data-click="qaAdd"][data-args=\'["lentejas",2]\']'));
  const rows = app.eval(`state.consumed.filter((x) => x.foodId === 'lentejas')`);
  assert.deepEqual(rows.map((r) => r.iron), [6.6, 3.3, 13.2]);
  assert.equal(rows[0].date, D); assert.equal(rows[0].meal, 'Comida'); assert.equal(rows[0].ironType, 'nonheme');
  assert.equal(app.eval(`dayIron('${D}').eaten`), 23.1);
  assert.equal(app.w.document.querySelectorAll('.qa-flash').length, 3);
});

test('cambiar de comida en la hoja se aplica a lo siguiente que se añade', async () => {
  const app = await loadApp();
  app.eval(`openQuickAdd('${D}', 'Comida')`);
  click(app, '[data-click="qaMeal"][data-args=\'["Cena"]\']');
  app.eval(`qaAdd('espinacas-cocidas', 1)`);
  assert.equal(app.eval(`state.consumed[0].meal`), 'Cena');
});

test('deshacer quita solo esa entrada', async () => {
  const app = await loadApp();
  app.eval(`openQuickAdd('${D}')`);
  app.eval(`qaAdd('garbanzos', 1); qaAdd('tofu', 1);`);
  const id = app.eval(`state.consumed[0].id`);
  app.eval(`qaUndo(${JSON.stringify(id)})`);
  assert.deepEqual(app.eval(`state.consumed.map((x) => x.foodId)`), ['tofu']);
  assert.equal(app.w.document.querySelectorAll('.qa-flash').length, 1);
});

test('repetir lo último y recetas favoritas en un toque', async () => {
  const data = { recipes: sampleRecipes, consumed: [{ id: 'old', date: '2026-10-10', meal: 'Cena', name: 'Pizza casera', iron: 3 }, { id: 'sup', date: '2026-10-10', meal: 'Suplemento', name: 'Fe', iron: 14, supplement: true }] };
  const app = await loadApp({ data });
  app.eval(`openQuickAdd('${D}', 'Comida')`);
  const text = app.w.document.getElementById('qa-results').textContent;
  assert.match(text, /Pizza casera/); assert.match(text, /Lentejas · 6,4 mg/);
  assert.doesNotMatch(text, /Fe · 14/, 'los suplementos no se ofrecen para repetir');
  click(app, '[data-click="qaRepeat"]');
  click(app, '[data-click="qaRecipe"]');
  const added = app.eval(`state.consumed.filter((x) => x.date === '${D}')`);
  assert.deepEqual(added.map((x) => [x.name, x.iron]), [['Pizza casera', 3], ['Lentejas', 6.4]]);
  assert.equal(added[0].meal, 'Comida', 'usa la comida elegida, no la original');
  assert.ok(added[1].recipeId);
});

test('búsqueda sin resultados ofrece escribir a mano; vaciar la búsqueda vuelve a las sugerencias', async () => {
  const app = await loadApp();
  app.eval(`openQuickAdd('${D}')`);
  type(app, 'zzzzzz');
  assert.match(app.w.document.getElementById('qa-results').textContent, /No encuentro/);
  click(app, '#qa-results [data-click="qaManual"]');
  assert.match(app.w.document.getElementById('modal-root').textContent, /Registrar una comida/);
  app.eval(`openQuickAdd('${D}')`); type(app, 'espinacas'); type(app, '');
  assert.match(app.w.document.getElementById('qa-results').textContent, /Escribe arriba para buscar/);
});

test('absorción: una entrada de la base usa sus etiquetas (frambuesas = vitamina C)', async () => {
  const data = { consumed: [{ id: '1', date: D, meal: 'Comida', name: 'Lentejas cocidas', iron: 10, ironType: 'nonheme', foodId: 'lentejas' }, { id: '2', date: D, meal: 'Comida', name: 'Frambuesas', iron: 0.7, foodId: 'frambuesas' }] };
  const app = await loadApp({ data });
  assert.ok(app.eval(`dayAbsorbed('${D}').mid`) > 0.9, 'la vitamina C de las frambuesas mejora la absorción');
  const data2 = { consumed: [{ id: '1', date: D, meal: 'Comida', name: 'Lentejas cocidas', iron: 10, ironType: 'nonheme', foodId: 'lentejas' }, { id: '2', date: D, meal: 'Comida', name: 'Té', iron: 0, foodId: 'te' }] };
  assert.ok((await loadApp({ data: data2 })).eval(`dayAbsorbed('${D}').mid`) < 0.5, 'el té la frena');
});

test('el botón flotante se oculta con una ventana abierta (CSS) y no hay errores', async () => {
  const app = await loadApp();
  app.eval(`openQuickAdd()`);
  assert.ok(app.w.document.body.classList.contains('modal-open'));
  assert.deepEqual(app.errors, []);
});
