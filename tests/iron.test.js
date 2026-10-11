import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sampleRecipes } from './helpers/loadApp.js';

const base = (extra = {}) => ({ recipes: sampleRecipes, ...extra });

test('dayIron: día vacío', async () => {
  const app = await loadApp({ data: base() });
  const di = app.eval(`dayIron('2026-10-11')`);
  assert.equal(di.eaten, 0); assert.equal(di.planned, 0); assert.equal(di.level, 'low'); assert.equal(di.goal, 16);
});

test('dayIron: receta comida cuenta como comido, no como previsto', async () => {
  const app = await loadApp({ data: base({ plan: { '2026-10-12|Comida': 'r1' } }) });
  assert.equal(app.eval(`dayIron('2026-10-12').planned`) >= 6.4, true);
  app.eval(`toggleEaten('2026-10-12|Comida')`);
  const di = app.eval(`dayIron('2026-10-12')`);
  assert.equal(di.eaten, 6.4);
  assert.equal(di.planned < 6.4, true, 'ya no se cuenta dos veces');
});

test('dayIron: receta sin dato de hierro suma 0 y se marca desconocida al comerla', async () => {
  const app = await loadApp({ data: base({ plan: { '2026-10-12|Cena': 'r2' } }) });
  app.eval(`toggleEaten('2026-10-12|Cena')`);
  const di = app.eval(`dayIron('2026-10-12')`);
  assert.equal(di.unknown, 1); assert.equal(di.eaten, 0);
});

test('dayIron: RAK confirmado suma su hierro y desplaza la previsión', async () => {
  const app = await loadApp({ data: base() });
  await app.eval(`RAK.loadWeek(weekDates('2026-10-12'))`);
  const before = app.eval(`dayIron('2026-10-12')`);
  assert.ok(before.planned > 0, 'el mejor combo RAK cuenta como previsto');
  const combo = app.eval(`RAK.getBestGlutenFreeCombo('2026-10-12','dejeuner')`);
  app.eval(`eatRAK('2026-10-12','dejeuner',${JSON.stringify(combo.number)})`);
  const after = app.eval(`dayIron('2026-10-12')`);
  assert.equal(after.eaten, combo.iron_total);
  assert.ok(after.planned < before.planned);
});

test('dayIron: días pasados no tienen previsto', async () => {
  const app = await loadApp({ data: base({ plan: { '2026-10-10|Comida': 'r1' } }) });
  assert.equal(app.eval(`dayIron('2026-10-10').planned`), 0);
});

test('ironLevel: umbrales', async () => {
  const app = await loadApp();
  assert.equal(app.eval(`ironLevel(16,16)`), 'good');
  assert.equal(app.eval(`ironLevel(10,16)`), 'mid');
  assert.equal(app.eval(`ironLevel(5,16)`), 'low');
});
