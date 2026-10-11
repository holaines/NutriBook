import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const NOW = '2026-10-14T10:00:00';   // miércoles
const e = (date, iron, extra = {}) => ({ id: date + iron + Math.random(), date, meal: 'Comida', name: 'Plato ' + iron, iron, ...extra });
const wk = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
const load = (consumed, extra = {}) => loadApp({ now: NOW, data: { consumed, ...extra } });

test('periodStats: total, media de días registrados, días con objetivo y futuros ignorados', async () => {
  const app = await load([e('2026-10-12', 20), e('2026-10-13', 6), e('2026-10-14', 16), e('2026-10-16', 99)]);
  const s = app.eval(`periodStats(${JSON.stringify(wk)})`);
  assert.equal(s.total, 141);
  assert.equal(s.pastDays, 3); assert.equal(s.loggedDays, 3);
  assert.equal(s.avg, 14, 'el futuro (99 mg del viernes) no entra en la media');
  assert.equal(s.hit, 2);
  assert.equal(s.days.length, 7);
});

test('periodStats: sin registros no divide por cero', async () => {
  const s = (await load([])).eval(`periodStats(${JSON.stringify(wk)})`);
  assert.deepEqual([s.total, s.avg, s.hit, s.loggedDays, s.unknown], [0, 0, 0, 0, 0]);
});

test('ironStreak: cuenta días seguidos y no se rompe si hoy aún no llega', async () => {
  const days = (n, from) => Array.from({ length: n }, (_, i) => e(from(i), 17));
  const back = (i) => ['2026-10-13', '2026-10-12', '2026-10-11'][i];
  assert.equal((await load(days(3, back))).eval(`ironStreak('2026-10-14')`), 3, 'hoy sin registrar: cuenta desde ayer');
  assert.equal((await load([...days(3, back), e('2026-10-14', 16)])).eval(`ironStreak('2026-10-14')`), 4, 'hoy cumplido suma');
  assert.equal((await load([e('2026-10-13', 17), e('2026-10-12', 3), e('2026-10-11', 17)])).eval(`ironStreak('2026-10-14')`), 1, 'un día flojo corta la racha');
  assert.equal((await load([])).eval(`ironStreak('2026-10-14')`), 0);
});

test('topSources: agrupa por alimento/receta, suma, ordena y calcula el porcentaje', async () => {
  const consumed = [
    e('2026-10-12', 6.6, { name: 'Lentejas cocidas', foodId: 'lentejas' }), e('2026-10-13', 3.3, { name: 'Lentejas cocidas', foodId: 'lentejas' }),
    e('2026-10-13', 5, { name: 'Estofado', recipeId: 'r' }), e('2026-10-14', 1, { name: 'Tostada' }), e('2026-10-14', 1, { name: 'tostada ' }), e('2026-10-14', 0, { name: 'Café' }),
    e('2026-10-14', 14, { name: 'Fe', supplement: true, supId: 's' }),
  ];
  const app = await load(consumed, { recipes: [{ id: 'r', name: 'Estofado de ternera', iron: 5, ingredients: [] }] });
  const t = app.eval(`topSources(${JSON.stringify(wk)}, 3)`);
  assert.deepEqual(t.map((x) => [x.name, x.mg, x.count]), [['💊 Fe', 14, 1], ['Lentejas cocidas', 9.9, 2], ['Estofado de ternera', 5, 1]]);
  assert.equal(t[0].share, Math.round(14 / 30.9 * 100));
  assert.equal(app.eval(`topSources(${JSON.stringify(wk)}).length`), 4, 'sin límite de 3: Tostada agrupada, Café (0 mg) excluido');
});

test('topSources: el RAK cuenta como una fuente y los días sin datos devuelven []', async () => {
  const app = await loadApp({ now: NOW, data: { rakConsumed: [{ id: 'x', date: '2026-10-13', service: 'dejeuner', dishes: [], iron_total_mg: 4.5 }] } });
  assert.deepEqual(app.eval(`topSources(${JSON.stringify(wk)})`).map((x) => [x.name, x.mg]), [['Menú del RAK', 4.5]]);
  assert.deepEqual((await load([])).eval(`topSources(${JSON.stringify(wk)})`), []);
});

test('comparePeriods: diferencia y porcentaje; null sin base', async () => {
  const prev = ['2026-10-05', '2026-10-06', '2026-10-07'].map((d) => e(d, 10)), cur = ['2026-10-12', '2026-10-13'].map((d) => e(d, 15));
  const app = await load([...prev, ...cur]);
  const prevWeek = Array.from({ length: 7 }, (_, i) => app.eval(`datePlus('2026-10-05', ${i})`));
  const c = app.eval(`comparePeriods(${JSON.stringify(wk)}, ${JSON.stringify(prevWeek)})`);
  assert.deepEqual([c.cur, c.prev, c.diff, c.pct], [15, 10, 5, 50]);
  assert.equal(app.eval(`comparePeriods(${JSON.stringify(prevWeek)}, ${JSON.stringify(wk.map((d) => app.eval(`datePlus('${d}', 30)`)))})`), null);
});

test('monthDates / monthShift: meses de distinta longitud y cruce de año', async () => {
  const app = await load([]);
  assert.equal(app.eval(`monthDates('2026-02-10').length`), 28);
  assert.equal(app.eval(`monthDates('2028-02-10').length`), 29);
  assert.equal(app.eval(`monthDates('2026-10-31').length`), 31);
  assert.equal(app.eval(`monthDates('2026-10-31')[0]`), '2026-10-01');
  assert.equal(app.eval(`monthShift('2026-12-15', 1)`), '2027-01-01');
  assert.equal(app.eval(`monthShift('2026-01-15', -1)`), '2025-12-01');
  assert.equal(app.eval(`monthShift('2026-10-15', 0)`), '2026-10-01');
});
