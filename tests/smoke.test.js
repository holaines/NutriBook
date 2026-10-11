import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sampleRecipes } from './helpers/loadApp.js';

test('todas las páginas se renderizan sin errores', async () => {
  const app = await loadApp({ data: { recipes: sampleRecipes, plan: { '2026-10-12|Comida': 'r1' }, pantry: [{ id: 'p', name: 'lentejas', quantity: 1, unit: 'kg' }] } });
  const pages = app.eval(`PAGES.map((p) => p.id)`);
  assert.ok(pages.length >= 7);
  for (const p of pages) {
    await app.go(p);
    assert.ok(app.html().length > 200, `${p} vacía`);
  }
  await app.settle();
  assert.deepEqual(app.errors, []);
});

test('ya no existe la página Deporte', async () => {
  const app = await loadApp();
  assert.equal(app.eval(`PAGES.some((p) => p.id === 'Entrenamientos')`), false);
  assert.doesNotMatch(app.w.document.body.innerHTML, /Strava|Garmin|Deporte/);
});

test('navegar con keepWeek conserva la semana', async () => {
  const app = await loadApp();
  await app.go('Calendario');
  app.eval(`shiftWeek(1)`);
  await app.go('Compra', '{keepWeek:true}');
  assert.equal(app.eval(`weekOffset`), 1);
  await app.go('Inicio');
  assert.equal(app.eval(`weekOffset`), 0);
});

test('RAK: la semana siguiente se carga sola y aparece el menú', async () => {
  const app = await loadApp();
  await app.go('Calendario');
  await app.settle(500);
  assert.match(app.html(), /RAK/);
});

test('registrar y quitar una comida manual', async () => {
  const app = await loadApp();
  app.eval(`state.consumed.push({id:'f1',date:'2026-10-12',meal:'Comida',name:'Garbanzos',iron:4.5}); save();`);
  await app.go('Equilibrio');
  assert.match(app.text(), /Garbanzos/);
  app.eval(`removeFood('f1')`);
  assert.doesNotMatch(app.text(), /Garbanzos/);
});
