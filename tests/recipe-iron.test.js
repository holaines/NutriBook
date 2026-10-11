import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const submit = (app) => app.eval(`document.querySelector('#modal-root form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
const fill = (app, vals) => app.eval(`const f = document.querySelector('#modal-root form'); for (const [k, v] of Object.entries(${JSON.stringify(vals)})) f.querySelector('[name=' + k + ']').value = v;`);
const ironCalls = (app) => app.fetchCalls.filter((c) => /iron-estimate/.test(c.u)).length;

test('matchFood: ingredientes habituales -> alimento esperado', async () => {
  const app = await loadApp();
  const cases = { 'lentejas coral': 'lentejas-secas', 'lentejas cocidas': 'lentejas', 'espinacas frescas': 'espinacas-crudas', 'espinacas cocidas': 'espinacas-cocidas', 'huevos': 'huevo', 'ajo': 'ajo',
    'pimiento rojo': 'pimiento-rojo', 'pimiento': 'pimiento-verde', 'tomate triturado': 'tomate', 'atún en lata': 'atun-lata', 'pechuga de pollo': 'pollo-pechuga', 'pollo': 'pollo-pechuga', 'ternera picada': 'ternera-picada',
    'salmón': 'salmon', 'merluza': 'merluza', 'arroz': 'arroz-blanco', 'arroz integral': 'arroz-integral', 'espaguetis': 'pasta', 'avena': 'avena', 'copos de avena': 'avena', 'sésamo': 'sesamo', 'kale': 'kale',
    'pan integral': 'pan-integral', 'pan rallado': 'pan-blanco', 'harina de trigo': 'harina-trigo', 'harina de garbanzo': 'harina-garbanzo', 'zumo de naranja': 'zumo-naranja', 'garbanzos': 'garbanzos-secos',
    'garbanzos cocidos': 'garbanzos', 'alubias blancas': 'alubias-blancas', 'tofu firme': 'tofu', 'hígado de pollo': 'higado-pollo', 'cacao en polvo': 'cacao-polvo' };
  for (const [name, id] of Object.entries(cases)) assert.equal(app.eval(`(matchFood(${JSON.stringify(name)}) || {}).id || null`), id, name);
});

test('matchFood: lo que no está en la base (o es insignificante) no se inventa', async () => {
  const app = await loadApp();
  for (const n of ['aceite de oliva', 'sal', 'agua', 'cardamomo molido', 'salsa de soja especial', 'xyz']) assert.equal(app.eval(`matchFood(${JSON.stringify(n)})`), null, n);
});

test('ingredientGrams: unidades de peso, volumen, cucharas y piezas', async () => {
  const app = await loadApp();
  const g = (q, u, id) => app.eval(`ingredientGrams({ quantity: ${q}, unit: ${JSON.stringify(u)} }, foodById(${JSON.stringify(id)}))`);
  assert.equal(g(200, 'g', 'lentejas'), 200); assert.equal(g(0.5, 'kg', 'lentejas'), 500); assert.equal(g(250, 'ml', 'leche'), 250); assert.equal(g(1, 'l', 'leche'), 1000);
  assert.equal(g(2, 'cucharadas', 'sesamo'), 30); assert.equal(g(3, 'dientes', 'ajo'), 15); assert.equal(g(2, 'ud', 'huevo'), 120);
  assert.equal(app.eval(`ingredientGrams({ quantity: null, unit: '' }, foodById('ajo'))`), null);
  assert.equal(app.eval(`ingredientGrams({ quantity: 0, unit: 'g' }, foodById('ajo'))`), null);
});

test('computeRecipeIron: suma por ingrediente, por ración y desglose', async () => {
  const app = await loadApp();
  const r = { servings: 2, ingredients: [{ name: 'lentejas', quantity: 200, unit: 'g' }, { name: 'cebolla', quantity: 1, unit: 'ud' }, { name: 'ajo', quantity: 2, unit: 'dientes' }, { name: 'aceite de oliva', quantity: 2, unit: 'cucharadas' }, { name: 'sal', quantity: null, unit: '' }] };
  const res = app.eval(`computeRecipeIron(${JSON.stringify(r)})`);
  assert.equal(res.rows.length, 3); assert.equal(res.unmatched.length, 0, 'aceite y sal no cuentan como «sin dato»');
  assert.ok(Math.abs(res.total - 15.33) < 0.02, `total ${res.total}`);
  assert.ok(Math.abs(res.perServing - 7.67) < 0.02);
  assert.equal(res.coverage, 1);
  assert.deepEqual(res.rows[0], { name: 'lentejas', food: 'Lentejas secas (en crudo)', grams: 200, mg: 15 });
});

test('computeRecipeIron: ingredientes desconocidos o sin cantidad bajan la cobertura', async () => {
  const app = await loadApp();
  const r = { servings: 1, ingredients: [{ name: 'lentejas', quantity: 100, unit: 'g' }, { name: 'cardamomo', quantity: 1, unit: 'cucharadita' }, { name: 'espinacas', quantity: null, unit: '' }, { name: 'tofu', quantity: 100, unit: 'g' }] };
  const res = app.eval(`computeRecipeIron(${JSON.stringify(r)})`);
  assert.equal(res.rows.length, 2); assert.deepEqual(res.unmatched.map((u) => u.reason), ['no está en la base de alimentos', 'falta la cantidad']);
  assert.equal(res.coverage, 0.5);
  assert.deepEqual(app.eval(`computeRecipeIron({ ingredients: [] })`), { total: 0, perServing: 0, rows: [], unmatched: [], coverage: 0 });
});

test('guardar receta sin hierro: se calcula con los ingredientes y NO se llama a la IA', async () => {
  const app = await loadApp();
  app.eval(`openForm()`);
  fill(app, { name: 'Lentejas', ingredients: '200 g de lentejas\n1 cebolla', instructions: 'Cocer', servings: '2', iron: '' });
  submit(app);
  await app.settle(200);
  const r = app.eval(`state.recipes[0]`);
  assert.equal(r.ironSource, 'calc'); assert.ok(r.iron > 7 && r.iron < 8);
  assert.equal(ironCalls(app), 0);
  assert.match(r.nutrition.notes, /Suma del hierro/);
});

test('guardar receta con pocos ingredientes reconocidos: con sesión pide la IA; sin sesión guarda el cálculo parcial', async () => {
  const fields = { name: 'Rara', ingredients: '100 g de lentejas\n1 cucharadita de cardamomo\n2 hojas de curry\n1 rama de pandan', instructions: 'x', servings: '1', iron: '' };
  const withSession = await loadApp();
  withSession.eval(`openForm()`); fill(withSession, fields); submit(withSession); await withSession.settle(200);
  assert.equal(ironCalls(withSession), 1);
  const without = await loadApp({ user: false });
  without.eval(`openForm()`); fill(without, fields); submit(without); await without.settle(200);
  assert.equal(without.eval(`state.recipes[0].ironSource`), 'calc-partial');
  assert.match(without.eval(`state.recipes[0].nutrition.notes`), /Solo se reconocieron 1 de 4/);
  assert.equal(ironCalls(without), 0);
});

test('un valor puesto a mano nunca se sobrescribe al editar los ingredientes', async () => {
  const data = { recipes: [{ id: 'r', name: 'Mía', iron: 9.9, ironSource: 'manual', servings: 1, ingredients: [{ name: 'lentejas', quantity: 100, unit: 'g' }], instructions: ['x'], categories: ['Comidas'] }] };
  const app = await loadApp({ data });
  app.eval(`openForm('r')`); fill(app, { ingredients: '500 g de espinacas' }); submit(app); await app.settle(200);
  assert.equal(app.eval(`state.recipes[0].iron`), 9.9); assert.equal(app.eval(`state.recipes[0].ironSource`), 'manual'); assert.equal(ironCalls(app), 0);
});

test('un valor calculado se recalcula si cambian los ingredientes', async () => {
  const app = await loadApp();
  app.eval(`openForm()`); fill(app, { name: 'X', ingredients: '100 g de lentejas', instructions: 'x', servings: '1', iron: '' }); submit(app);
  const first = app.eval(`state.recipes[0].iron`);
  const id = app.eval(`state.recipes[0].id`);
  app.eval(`openForm(${JSON.stringify(id)})`); fill(app, { ingredients: '300 g de lentejas', iron: String(first) }); submit(app);
  assert.equal(app.eval(`state.recipes[0].ironSource`), 'calc');
  assert.ok(app.eval(`state.recipes[0].iron`) > first * 2.5);
});

test('botón «Calcular con ingredientes»: reemplaza, enseña el desglose y se puede deshacer', async () => {
  const data = { recipes: [{ id: 'r', name: 'Estofado', iron: 1, ironSource: 'manual', servings: 2, ingredients: [{ name: 'lentejas', quantity: 200, unit: 'g' }, { name: 'raro', quantity: 1, unit: 'ud' }], instructions: ['x'], categories: ['Comidas'] }] };
  const app = await loadApp({ data });
  app.eval(`viewRecipe('r')`);
  const modalText = () => app.w.document.getElementById('modal-root').textContent.replace(/\s+/g, ' ');
  assert.match(modalText(), /Ver cómo se calcula el hierro/); assert.match(modalText(), /raro · no está en la base/);
  app.eval(`document.querySelector('[data-click="calcIron"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  assert.equal(app.eval(`state.recipes[0].ironSource`), 'calc-partial'); assert.equal(app.eval(`state.recipes[0].iron`), 7.5);
  assert.match(modalText(), /🧮 parcial/);
  app.w.document.querySelector('.toast button').click();
  assert.equal(app.eval(`state.recipes[0].iron`), 1); assert.equal(app.eval(`state.recipes[0].ironSource`), 'manual');
  assert.deepEqual(app.errors, []);
});

test('botón calcular sin ingredientes reconocibles avisa y no cambia nada', async () => {
  const data = { recipes: [{ id: 'r', name: 'Rara', iron: 3, ironSource: 'manual', servings: 1, ingredients: [{ name: 'pandan', quantity: 1, unit: 'ud' }], instructions: ['x'], categories: ['Comidas'] }] };
  const app = await loadApp({ data });
  app.eval(`calcIron('r')`);
  assert.equal(app.eval(`state.recipes[0].iron`), 3);
  assert.match(app.w.document.querySelector('.toast').textContent, /No reconozco ningún ingrediente/);
});
