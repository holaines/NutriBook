import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const click = (app, sel) => app.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; })()`);
const submit = (app, sel = '#modal-root form') => app.eval(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
const fill = (app, vals) => app.eval(`const f = document.querySelector('#modal-root form'); for (const [k, v] of Object.entries(${JSON.stringify(vals)})) f.querySelector('[name=' + k + ']').value = v;`);

test('recorrido completo: bienvenida → receta → plan → RAK → registro rápido → complemento → análisis → informe', async () => {
  const db = { payload: null };
  const app = await loadApp({ now: '2026-10-12T13:00:00Z', onboarding: true, db });
  const D = '2026-10-12';

  // 1. bienvenida: 3 pasos y objetivo propio
  assert.ok(app.eval(`ob`));
  app.eval(`obSet('sex','F'); obSet('age','28'); obSet('name','Inès'); obGo(2); obSet('ironDailyGoal','18'); obGo(3); obFinish(false)`);
  assert.equal(app.eval(`goalDay()`), 18);

  // 2. receta: el hierro se calcula con los ingredientes (sin IA)
  app.eval(`openForm()`);
  fill(app, { name: 'Lentejas con pimiento', ingredients: '200 g de lentejas\n1 pimiento rojo\n1 cebolla', instructions: 'Cocer', servings: '2', iron: '' });
  submit(app); await app.settle(100);
  const rid = app.eval(`state.recipes[0].id`);
  assert.equal(app.eval(`state.recipes[0].ironSource`), 'calc');
  assert.equal(app.fetchCalls.filter((c) => /iron-estimate/.test(c.u)).length, 0);

  // 3. planificar para hoy y marcar como comida: el hierro del día sube
  app.eval(`setPlan('${D}|Cena', ${JSON.stringify(rid)})`);
  app.eval(`toggleEaten('${D}|Cena')`);
  const afterRecipe = app.eval(`dayIron('${D}').eaten`);
  assert.ok(afterRecipe > 7);

  // 4. menú RAK: confirmar la comida
  await app.eval(`RAK.loadWeek(weekDates('${D}'))`);
  const combo = app.eval(`RAK.getBestGlutenFreeCombo('${D}', 'dejeuner')`);
  app.eval(`eatRAK('${D}', 'dejeuner', ${JSON.stringify(combo.number)})`);
  assert.equal(app.eval(`dayIron('${D}').eaten`), Math.round((afterRecipe + combo.iron_total) * 100) / 100);

  // 5. registro rápido con búsqueda
  app.eval(`openQuickAdd('${D}', 'Desayuno')`);
  app.eval(`qaAdd('almendras', 1)`);
  assert.ok(app.eval(`state.consumed.some((x) => x.foodId === 'almendras' && x.meal === 'Desayuno')`));

  // 6. complemento y análisis
  app.eval(`openSupplementForm()`); fill(app, { name: 'Hierro', ironMg: '14' }); submit(app);
  app.eval(`takeSupplement(state.supplements[0].id, '${D}')`);
  app.eval(`openLabForm()`); fill(app, { date: '2026-10-01', ferritin: '21', hemoglobin: '12.8' }); submit(app);

  // 7. las pantallas muestran todo y no hay errores
  await app.go('Equilibrio');
  for (const re of [/Lentejas con pimiento/, /Hierro/, /Ferritina 21/, /Complementos/, /De dónde viene tu hierro/, /absorbidos|absorberían/]) assert.match(app.text(), re);
  await app.go('Informe');
  assert.match(app.text(), /Seguimiento de hierro · Inès/); assert.match(app.text(), /Ferritina/);
  const csv = app.eval(`reportCsv(buildReport())`);
  assert.match(csv, new RegExp(`${D};`));
  await app.go('Inicio');
  assert.match(app.text(), /Ahora toca|todas las comidas/);

  // 8. sincronización: todo llegó a la nube sin perder nada
  await app.eval(`NutriCloud.syncNow()`);
  const cloud = db.payload;
  assert.equal(cloud.recipes.length, 1); assert.equal(cloud.consumed.length, 3); assert.equal(cloud.rakConsumed.length, 1); assert.equal(cloud.supplements.length, 1); assert.equal(cloud.labs.length, 1);
  assert.equal(cloud.profile.ironDailyGoal, 18);
  assert.deepEqual(app.errors, []);
});

test('recorrido en un segundo dispositivo: abre con los datos de la nube', async () => {
  const db = { payload: { schemaVersion: 7, recipes: [{ id: 'r', name: 'Estofado', iron: 5, categories: ['Comidas'], ingredients: [], instructions: [], servings: 1, updatedAt: '2026-10-01T10:00:00.000Z' }], profile: { name: 'Inès', onboarded: true, ironDailyGoal: 16 },
    consumed: [{ id: 'c', date: '2026-10-12', meal: 'Comida', name: 'Garbanzos', iron: 4.4, updatedAt: '2026-10-12T08:00:00.000Z' }], sync: { deleted: {}, stamps: {} } } };
  const phone = await loadApp({ now: '2026-10-12T13:00:00Z', db });
  assert.equal(phone.eval(`state.recipes[0].name`), 'Estofado');
  assert.equal(phone.eval(`dayIron('2026-10-12').eaten`), 4.4);
  assert.equal(phone.eval(`ob`), null, 'no se vuelve a pedir la bienvenida');
  assert.match(phone.text(), /Inès/);
});
