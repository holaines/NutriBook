import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sampleRecipes } from './helpers/loadApp.js';

test('parseIngredients: casos habituales', async () => {
  const app = await loadApp();
  const p = (t) => app.eval(`parseIngredients(${JSON.stringify(t)})`);
  assert.deepEqual(p('1 lechuga'), [{ name: 'lechuga', quantity: 1, unit: 'ud' }]);
  assert.deepEqual(p('0,5 kg tomate'), [{ name: 'tomate', quantity: 0.5, unit: 'kg' }]);
  assert.deepEqual(p('200 g de lentejas'), [{ name: 'lentejas', quantity: 200, unit: 'g' }]);
  assert.deepEqual(p('1/2 cebolla'), [{ name: 'cebolla', quantity: 0.5, unit: 'ud' }]);
  assert.deepEqual(p('½ l leche'), [{ name: 'leche', quantity: 0.5, unit: 'l' }]);
  assert.deepEqual(p('sal'), [{ name: 'sal', quantity: null, unit: '' }]);
});

test('shoppingItems: suma, convierte kg/g y resta la despensa', async () => {
  const data = {
    recipes: [
      { ...sampleRecipes[0], ingredients: [{ name: 'tomate', quantity: 0.5, unit: 'kg' }, { name: "d'ail", quantity: 1, unit: 'ud' }] },
      { ...sampleRecipes[1], ingredients: [{ name: 'tomate', quantity: 300, unit: 'g' }] },
    ],
    plan: { '2026-10-12|Comida': 'r1', '2026-10-13|Cena': 'r2' },
    pantry: [{ id: 'p', name: 'Tomate', quantity: 100, unit: 'g' }],
  };
  const app = await loadApp({ data });
  const items = app.eval(`shoppingItems()`);
  const tomate = items.find((i) => i.name === 'tomate');
  assert.equal(tomate.quantity, 800); assert.equal(tomate.unit, 'g');
  assert.equal(tomate.have, 100); assert.equal(tomate.left, 700);
  assert.ok(items.find((i) => i.name === "d'ail"));
});

test('compra: un ingrediente con apóstrofo no rompe la casilla', async () => {
  const data = { recipes: [{ ...sampleRecipes[0], ingredients: [{ name: "l'ail", quantity: 1, unit: 'ud' }] }], plan: { '2026-10-12|Comida': 'r1' } };
  const app = await loadApp({ data });
  await app.go('Compra');
  assert.match(app.text(), /l'ail/);
  assert.match(app.html(), /onchange="toggleCheck\(0,this\.checked\)"/);
  assert.deepEqual(app.errors, []);
});
