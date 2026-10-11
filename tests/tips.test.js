import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const D = '2026-10-12';
const eaten = (meal, name, iron, extra = {}) => ({ id: meal + name, date: D, meal, name, iron, ...extra });
const tips = async (data) => (await loadApp({ data })).eval(`absorptionTips('${D}')`);

test('consejo: hierro vegetal sin vitamina C sugiere añadirla', async () => {
  const t = await tips({ consumed: [eaten('Comida', 'Lentejas', 6.6, { ironType: 'nonheme' })] });
  assert.equal(t.length, 1); assert.equal(t[0].kind, 'tip');
  assert.match(t[0].text, /cítrico, pimiento o kiwi/);
  assert.match(t[0].text, /6,6 mg|6\.6 mg/);
});

test('consejo: con vitamina C en la misma comida, refuerzo positivo', async () => {
  const t = await tips({ consumed: [eaten('Comida', 'Lentejas', 6.6, { ironType: 'nonheme' }), eaten('Comida', 'Naranja', 0.1)] });
  assert.deepEqual(t.map((x) => x.kind), ['good']);
});

test('consejo: café o lácteos junto al hierro avisan y tienen prioridad', async () => {
  const t = await tips({ consumed: [eaten('Comida', 'Garbanzos', 4.4, { ironType: 'nonheme' }), eaten('Comida', 'Café con leche', 0.1), eaten('Cena', 'Lentejas', 5, { ironType: 'nonheme' })] });
  assert.equal(t[0].kind, 'warn');
  assert.match(t[0].text, /sepáralos 1-2 horas/);
  assert.equal(t[1].kind, 'tip', 'la cena sin vitamina C va después del aviso');
});

test('consejo: un café en otra comida no molesta; comidas con poco hierro no generan consejos', async () => {
  assert.deepEqual((await tips({ consumed: [eaten('Comida', 'Garbanzos', 4.4, { ironType: 'nonheme' }), eaten('Comida', 'Kiwi', 0.2), eaten('Merienda', 'Café', 0)] })).map((x) => x.kind), ['good']);
  assert.deepEqual(await tips({ consumed: [eaten('Desayuno', 'Tostada', 0.8)] }), []);
  assert.deepEqual(await tips({}), []);
});

test('consejo: comida planificada (receta) se evalúa con ingredientes; máximo 3 consejos', async () => {
  const recipes = [{ id: 'r', name: 'Lentejas', iron: 6, ingredients: [{ name: 'lentejas' }], instructions: [], servings: 1 }];
  const app = await loadApp({ data: { recipes, plan: { [D + '|Comida']: 'r', [D + '|Cena']: 'r', [D + '|Merienda']: 'r', [D + '|Desayuno']: 'r' } } });
  const t = app.eval(`absorptionTips('${D}')`);
  assert.equal(t.length, 3);
  assert.match(t[0].text, /llevará/);
  app.eval(`toggleEaten('${D}|Comida')`);
  assert.match(app.eval(`absorptionTips('${D}')`).map((x) => x.text).join(' '), /lleva hierro/);
});

test('UI: los consejos salen en Inicio y en Mi hierro', async () => {
  const app = await loadApp({ data: { consumed: [eaten('Comida', 'Lentejas', 6.6, { ironType: 'nonheme' })] } });
  assert.match(app.html(), /class="tips"/);
  await app.go('Equilibrio');
  assert.match(app.html(), /class="tips"/);
  await app.go('Equilibrio'); app.eval(`shiftWeek(1)`);
  assert.doesNotMatch(app.html(), /class="tips"/, 'la semana siguiente no muestra los consejos de hoy');
});
