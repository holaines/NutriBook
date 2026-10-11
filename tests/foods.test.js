import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const foods = async () => { const app = await loadApp(); return { app, list: app.eval(`FOODS`) }; };

test('foods: esquema válido en todas las entradas', async () => {
  const { app, list } = await foods();
  const cats = app.eval(`FOOD_CATEGORIES`);
  assert.ok(list.length >= 130, 'al menos 130 alimentos');
  for (const f of list) {
    assert.match(f.id, /^[a-z0-9-]+$/, f.id);
    assert.ok(f.name.length >= 3, f.id);
    assert.ok(Number.isFinite(f.iron) && f.iron >= 0 && f.iron <= 60, `${f.id} hierro ${f.iron}`);
    assert.ok(f.portionG > 0 && f.portionG <= 400, `${f.id} ración`);
    assert.ok(f.portionLabel, f.id);
    assert.ok(['heme', 'nonheme'].includes(f.type), f.id);
    assert.ok(cats.includes(f.category), `${f.id} categoría ${f.category}`);
    for (const t of f.tags) assert.ok(['vitc', 'calcio', 'polifenoles', 'fitatos'].includes(t), `${f.id} etiqueta ${t}`);
    assert.ok(app.eval(`foodPortionIron(foodById(${JSON.stringify(f.id)}))`) <= 30, `${f.id}: una ración no debería superar 30 mg`);
  }
});

test('foods: sin ids ni nombres duplicados; todas las categorías se usan', async () => {
  const { app, list } = await foods();
  assert.equal(new Set(list.map((f) => f.id)).size, list.length);
  assert.equal(new Set(list.map((f) => f.name.toLowerCase())).size, list.length);
  for (const c of app.eval(`FOOD_CATEGORIES`)) assert.ok(list.some((f) => f.category === c), c);
});

test('foods: valores de referencia coherentes con las tablas (órdenes de magnitud conocidos)', async () => {
  const { app } = await foods();
  const fe = (id) => app.eval(`foodById(${JSON.stringify(id)}).iron`);
  assert.ok(fe('lentejas') > 2.5 && fe('lentejas') < 4.5);
  assert.ok(fe('higado-pollo') > 5);
  assert.ok(fe('espirulina') > 20);
  assert.ok(fe('leche') < 0.1);
  assert.ok(fe('pollo-pechuga') < fe('ternera-magra'));
  assert.ok(fe('almejas') > fe('mejillones'));
  assert.equal(app.eval(`foodById('cafe').iron`), 0);
});

test('foods: etiquetas de absorción donde corresponde', async () => {
  const { app } = await foods();
  const tags = (id) => app.eval(`foodById(${JSON.stringify(id)}).tags`);
  for (const id of ['pimiento-rojo', 'kiwi', 'naranja', 'limon', 'brocoli', 'fresas']) assert.ok(tags(id).includes('vitc'), id);
  for (const id of ['cafe', 'te', 'cacao-polvo']) assert.ok(tags(id).includes('polifenoles'), id);
  for (const id of ['leche', 'yogur', 'queso-fresco']) assert.ok(tags(id).includes('calcio'), id);
  assert.ok(tags('lentejas').includes('fitatos'));
});

test('foodSearch: sin acentos, alias, varias palabras y límite', async () => {
  const { app } = await foods();
  const names = (q, n) => app.eval(`foodSearch(${JSON.stringify(q)}${n ? ',' + n : ''}).map((f) => f.id)`);
  assert.equal(names('lentejas')[0], 'lentejas', 'cocidas antes que secas');
  assert.ok(names('higado').includes('higado-ternera') && names('hígado').includes('higado-pollo'));
  assert.ok(names('ajonjoli').includes('sesamo'), 'alias con y sin acento');
  assert.ok(names('ESPINACAS').includes('espinacas-cocidas'));
  assert.deepEqual(names('lentejas cocidas'), ['lentejas']);
  assert.deepEqual(names(''), []);
  assert.deepEqual(names('zzzz'), []);
  assert.equal(names('a', 5).length, 5);
});

test('foodIron: gramos y raciones, con un decimal', async () => {
  const { app } = await foods();
  assert.equal(app.eval(`foodIron(foodById('lentejas'), 200)`), 6.6);
  assert.equal(app.eval(`foodPortionIron(foodById('lentejas'))`), 6.6);
  assert.equal(app.eval(`foodPortionIron(foodById('lentejas'), 0.5)`), 3.3);
  assert.equal(app.eval(`foodIron(foodById('cafe'), 150)`), 0);
});
