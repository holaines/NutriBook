import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const R = (id, iron, cats, extra = {}) => ({ id, name: id, iron, categories: cats, ...extra });
const recipes = [
  R('desa1', 1.5, ['Desayunos']), R('desa2', 2.5, ['Desayunos']),
  R('lent', 6.6, ['Comidas']), R('garb', 4.4, ['Comidas']), R('higado', 9, ['Comidas', 'Cenas']), R('arroz', 1, ['Comidas']),
  R('sopa', 3, ['Cenas']), R('tortilla', 2, ['Cenas']), R('ensal', 1.2, ['Cenas']),
  R('yogur', 0.2, ['Meriendas']), R('nueces', 1.8, ['Snacks']), R('noiron', null, ['Meriendas']),
];
const week = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
const run = async (over = {}) => (await loadApp()).eval(`planWeek(${JSON.stringify({ recipes, plan: {}, dates: week, goal: 16, seed: 1, ...over })})`);
const iron = (id) => recipes.find((r) => r.id === id).iron ?? 0;

test('planWeek: rellena los 28 huecos libres con recetas existentes', async () => {
  const { assign } = await run();
  assert.equal(Object.keys(assign).length, 28);
  for (const id of Object.values(assign)) assert.ok(recipes.some((r) => r.id === id));
});

test('planWeek: respeta las categorías (desayunos en Desayuno, meriendas en Merienda)', async () => {
  const { assign } = await run();
  for (const [k, id] of Object.entries(assign)) {
    const m = k.split('|')[1], cats = recipes.find((r) => r.id === id).categories;
    if (m === 'Desayuno') assert.ok(cats.includes('Desayunos'), k + id);
    if (m === 'Merienda') assert.ok(cats.some((c) => ['Meriendas', 'Snacks'].includes(c)), k + id);
  }
});

test('planWeek: se acerca al objetivo diario más que una propuesta al azar', async () => {
  const { totals } = await run({ goal: 16 });
  const avg = Object.values(totals).reduce((a, b) => a + b, 0) / 7;
  assert.ok(avg >= 10, `media ${avg}`);
  const low = await run({ goal: 6 });
  assert.ok(Object.values(low.totals).reduce((a, b) => a + b, 0) / 7 < avg, 'objetivo menor, hierro menor');
});

test('planWeek: no toca lo ya planificado, ni días pasados, ni huecos en skip', async () => {
  const plan = { '2026-10-12|Comida': 'arroz', '2026-10-13|Cena': 'sopa' };
  const { assign, totals } = await run({ plan, from: '2026-10-14', skip: ['2026-10-15|Comida'] });
  assert.ok(!('2026-10-12|Comida' in assign) && !('2026-10-13|Cena' in assign));
  assert.ok(Object.keys(assign).every((k) => k.slice(0, 10) >= '2026-10-14'));
  assert.ok(!('2026-10-15|Comida' in assign));
  assert.equal(totals['2026-10-12'], 1, 'el total de un día pasado refleja solo su plan');
});

test('planWeek: no repite una receta más de maxRepeat veces cuando hay alternativas', async () => {
  const { assign } = await run({ maxRepeat: 2 });
  const count = {};
  for (const id of Object.values(assign)) count[id] = (count[id] || 0) + 1;
  const comidas = Object.entries(assign).filter(([k]) => k.endsWith('|Comida')).map(([, id]) => id);
  const cc = {}; comidas.forEach((id) => { cc[id] = (cc[id] || 0) + 1; });
  assert.ok(Math.max(...Object.values(cc)) <= 2, JSON.stringify(cc));
});

test('planWeek: determinista con la misma semilla y variada con otras', async () => {
  const a = await run({ seed: 5 }), b = await run({ seed: 5 });
  assert.deepEqual(a, b);
  const distinct = new Set();
  for (let seed = 1; seed <= 8; seed++) distinct.add(JSON.stringify((await run({ seed })).assign));
  assert.ok(distinct.size >= 3, `solo ${distinct.size} propuestas distintas en 8 semillas`);
});

test('planWeek: recetas sin dato de hierro solo si no hay otra opción; sin recetas, no asigna', async () => {
  const { assign } = await run();
  assert.ok(!Object.values(assign).includes('noiron'), 'hay meriendas con hierro conocido');
  const only = await run({ recipes: [R('x', null, ['Comidas'])] });
  assert.equal(Object.keys(only.assign).length, 28);
  const none = await run({ recipes: [] });
  assert.deepEqual(none.assign, {});
});

test('copyWeekPlan: copia sin pisar lo existente', async () => {
  const app = await loadApp();
  const plan = { '2026-10-12|Comida': 'a', '2026-10-14|Cena': 'b', '2026-10-19|Comida': 'ya' };
  const { added } = app.eval(`copyWeekPlan(${JSON.stringify(plan)}, '2026-10-12', '2026-10-19')`);
  assert.deepEqual(added, { '2026-10-21|Cena': 'b' });
});

test('moveSlotPlan: mover a hueco libre, intercambiar, bloquear comidas ya comidas', async () => {
  const app = await loadApp();
  const mv = (plan, f, t, locked = []) => app.eval(`moveSlotPlan(${JSON.stringify(plan)}, ${JSON.stringify(f)}, ${JSON.stringify(t)}, (k) => ${JSON.stringify(locked)}.includes(k))`);
  assert.deepEqual(mv({ a: 'r1' }, 'a', 'b'), { b: 'r1' });
  assert.deepEqual(mv({ a: 'r1', b: 'r2' }, 'a', 'b'), { a: 'r2', b: 'r1' });
  assert.equal(mv({ a: 'r1' }, 'a', 'b', ['b']), null);
  assert.equal(mv({ a: 'r1' }, 'a', 'a'), null);
  assert.equal(mv({}, 'a', 'b'), null);
});
