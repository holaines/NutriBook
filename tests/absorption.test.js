import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sampleRecipes } from './helpers/loadApp.js';

const abs = async (entries) => (await loadApp()).eval(`absorbedIron(${JSON.stringify(entries)})`);

test('absorbedIron: hierro vegetal (no hemo) 2-8-20 %', async () => {
  assert.deepEqual(await abs([{ mg: 10, type: 'nonheme' }]), { low: 0.2, mid: 0.8, high: 2 });
});
test('absorbedIron: con vitamina C sube; con café/lácteos baja; ambos se compensan', async () => {
  assert.deepEqual(await abs([{ mg: 10, type: 'nonheme', vitc: true }]), { low: 0.3, mid: 1.2, high: 2.5 });
  assert.deepEqual(await abs([{ mg: 10, type: 'nonheme', inhib: true }]), { low: 0.1, mid: 0.4, high: 1 });
  assert.deepEqual(await abs([{ mg: 10, type: 'nonheme', vitc: true, inhib: true }]), { low: 0.2, mid: 0.8, high: 2 });
});
test('absorbedIron: carne (40 % hemo) absorbe más que lentejas con el mismo hierro', async () => {
  const meat = await abs([{ mg: 10, type: 'heme' }]), lentils = await abs([{ mg: 10, type: 'nonheme' }]);
  assert.deepEqual(meat, { low: 0.7, mid: 1.5, high: 2.6 });
  assert.ok(meat.mid > lentils.mid);
});
test('absorbedIron: suma varias entradas; ignora vacías y negativas; lista vacía = 0', async () => {
  assert.deepEqual(await abs([]), { low: 0, mid: 0, high: 0 });
  assert.deepEqual(await abs([{ mg: 0, type: 'heme' }, { mg: -3, type: 'heme' }, { mg: null }]), { low: 0, mid: 0, high: 0 });
  const two = await abs([{ mg: 10, type: 'nonheme' }, { mg: 10, type: 'nonheme' }]);
  assert.deepEqual(two, { low: 0.4, mid: 1.6, high: 4 });
});
test('absorbedIron: la absorción nunca supera el hierro ingerido y low ≤ mid ≤ high', async () => {
  for (const type of ['heme', 'mixed', 'nonheme']) for (const flags of [{}, { vitc: true }, { inhib: true }]) {
    const r = await abs([{ mg: 7, type, ...flags }]);
    assert.ok(r.low <= r.mid && r.mid <= r.high && r.high <= 7, JSON.stringify([type, flags, r]));
  }
});

test('detección de vitamina C e inhibidores en texto (con y sin acentos, sin falsos positivos)', async () => {
  const app = await loadApp();
  const t = (s) => app.eval(`[hasVitC(${JSON.stringify(s)}), hasInhibitor(${JSON.stringify(s)})]`);
  assert.deepEqual(t('Ensalada de pimiento rojo y limón'), [true, false]);
  assert.deepEqual(t('Café con leche'), [false, true]);
  assert.deepEqual(t('Té verde'), [false, true]);
  assert.deepEqual(t('Tomate y atún'), [false, false], '«te» dentro de «tomate» no cuenta');
  assert.deepEqual(t('Brócoli con yogur'), [true, true]);
  assert.deepEqual(t('Zumo de naranja'), [true, false]);
});

test('recipeIronType: manual manda; si no, se deduce de los ingredientes', async () => {
  const app = await loadApp();
  const ty = (r) => app.eval(`recipeIronType(${JSON.stringify(r)})`);
  assert.equal(ty({ ingredients: [{ name: 'lentejas' }, { name: 'cebolla' }] }), 'nonheme');
  assert.equal(ty({ ingredients: [{ name: 'Ternera' }, { name: 'arroz' }] }), 'mixed');
  assert.equal(ty({ ironType: 'heme', ingredients: [{ name: 'lentejas' }] }), 'heme');
  assert.equal(ty({ ironType: 'raro', ingredients: [{ name: 'merluza' }] }), 'mixed');
});

test('dayAbsorbed: usa el tipo de la receta y aplica vitamina C por comida', async () => {
  const data = {
    recipes: [{ ...sampleRecipes[0], id: 'a', name: 'Lentejas', iron: 10, ingredients: [{ name: 'lentejas' }, { name: 'pimiento rojo' }] },
      { ...sampleRecipes[0], id: 'b', name: 'Lentejas 2', iron: 10, ingredients: [{ name: 'lentejas' }] }],
    consumed: [{ id: '1', date: '2026-10-12', meal: 'Comida', name: 'Lentejas', iron: 10, recipeId: 'a' },
      { id: '2', date: '2026-10-13', meal: 'Comida', name: 'Lentejas 2', iron: 10, recipeId: 'b' }],
  };
  const app = await loadApp({ data });
  assert.equal(app.eval(`dayAbsorbed('2026-10-12').mid`), 1.2);
  assert.equal(app.eval(`dayAbsorbed('2026-10-13').mid`), 0.8);
  assert.equal(app.eval(`dayAbsorbed('2026-10-14').high`), 0);
});

test('dayAbsorbed: un café en la misma comida frena la absorción; en otra comida no', async () => {
  const mk = (cafeMeal) => ({ consumed: [{ id: '1', date: '2026-10-12', meal: 'Comida', name: 'Garbanzos', iron: 10, ironType: 'nonheme' }, { id: '2', date: '2026-10-12', meal: cafeMeal, name: 'Café con leche', iron: 0.1, ironType: 'nonheme' }] });
  assert.ok((await loadApp({ data: mk('Comida') })).eval(`dayAbsorbed('2026-10-12').mid`) < 0.5);
  assert.ok((await loadApp({ data: mk('Merienda') })).eval(`dayAbsorbed('2026-10-12').mid`) >= 0.8);
});

test('UI: la línea de absorción aparece en Inicio y en Mi hierro cuando hay hierro comido; formularios guardan ironType', async () => {
  const app = await loadApp({ data: { consumed: [{ id: '1', date: '2026-10-12', meal: 'Comida', name: 'Filete', iron: 3, ironType: 'heme' }] } });
  assert.match(app.text(), /absorbidos/);
  await app.go('Equilibrio');
  assert.match(app.text(), /absorbidos/);
  assert.match(app.text(), /se absorberían/);
  app.eval(`openFoodForm('2026-10-12')`);
  app.eval(`const f = document.querySelector('#modal-root form'); f.querySelector('[name=name]').value = 'Sardinas'; f.querySelector('[name=iron]').value = '2'; f.querySelector('[name=ironType]').value = 'heme'`);
  app.eval(`document.querySelector('#modal-root form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  assert.equal(app.eval(`state.consumed.find((x) => x.name === 'Sardinas').ironType`), 'heme');
  app.eval(`openForm()`);
  app.eval(`const f = document.querySelector('#modal-root form'); f.querySelector('[name=name]').value = 'Estofado'; f.querySelector('[name=ironType]').value = 'mixed'`);
  app.eval(`document.querySelector('#modal-root form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  assert.equal(app.eval(`state.recipes.find((r) => r.name === 'Estofado').ironType`), 'mixed');
  assert.deepEqual(app.errors, []);
});
