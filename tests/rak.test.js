import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const week = ['2026-10-12', '2026-10-13', '2026-10-14'];

test('RAK: loadWeek carga las fixtures y getCombos agrupa plat+accompagnement', async () => {
  const app = await loadApp();
  const info = await app.eval(`RAK.loadWeek(${JSON.stringify(week)})`);
  assert.ok(info.count > 0);
  const combos = app.eval(`RAK.getCombos('2026-10-12','dejeuner')`);
  assert.ok(combos.length >= 1);
  for (const c of combos) {
    assert.ok(['confirmed_gf', 'acceptable', 'no_option'].includes(c.effective_status));
    assert.ok(c.dishes.length >= 1);
  }
});

test('RAK: el mejor combo prefiere confirmed_gf y, dentro del nivel, más hierro', async () => {
  const app = await loadApp();
  await app.eval(`RAK.loadWeek(${JSON.stringify(week)})`);
  for (const d of week) for (const s of ['dejeuner', 'diner']) {
    const combos = app.eval(`RAK.getCombos('${d}','${s}')`);
    const best = app.eval(`RAK.getBestGlutenFreeCombo('${d}','${s}')`);
    if (!combos) { assert.equal(best, null); continue; }
    const ok = combos.filter((c) => c.effective_status !== 'no_option');
    if (!ok.length) { assert.equal(best, null); continue; }
    const hasGf = ok.some((c) => c.effective_status === 'confirmed_gf');
    assert.equal(best.effective_status, hasGf ? 'confirmed_gf' : 'acceptable');
    const same = ok.filter((c) => c.effective_status === best.effective_status);
    assert.equal(best.iron_total, Math.max(...same.map((c) => c.iron_total)));
  }
});

test('RAK: día sin datos devuelve null', async () => {
  const app = await loadApp();
  assert.equal(app.eval(`RAK.getDay('2030-01-01','dejeuner')`), null);
  assert.equal(app.eval(`RAK.getCombos('2030-01-01','dejeuner')`), null);
});

test('RAK: confirmMeal / unconfirmMeal / getConsumed', async () => {
  const app = await loadApp();
  const dish = { dish_id: 1, dish_name: 'Test', dish_category: 'plat1', iron_mg_estimated: 2.25 };
  app.eval(`RAK.confirmMeal('2026-10-12','dejeuner',[${JSON.stringify(dish)},{dish_id:2,dish_name:'B',dish_category:'accompagnement1',iron_mg_estimated:1}])`);
  const got = app.eval(`RAK.getConsumed('2026-10-12')`);
  assert.equal(got.length, 1); assert.equal(got[0].iron_total_mg, 3.3);
  app.eval(`RAK.confirmMeal('2026-10-12','dejeuner',[${JSON.stringify(dish)}])`);
  assert.equal(app.eval(`RAK.getConsumed('2026-10-12')`).length, 1, 'reconfirmar reemplaza');
  app.eval(`RAK.unconfirmMeal('2026-10-12','dejeuner')`);
  assert.equal(app.eval(`RAK.getConsumed('2026-10-12')`).length, 0);
});
