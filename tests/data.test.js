import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sampleRecipes } from './helpers/loadApp.js';

test('hydrate: JSON antiguo (con workouts/stravaCache) carga sin errores', async () => {
  const old = { recipes: sampleRecipes, workouts: [{ id: 'w', date: '2026-10-01', sport: 'Yoga' }], stravaCache: { items: [] }, profile: { name: 'Inès' } };
  const app = await loadApp({ data: old });
  assert.equal(app.eval(`state.recipes.length`), 2);
  assert.equal(app.eval(`state.profile.name`), 'Inès');
  assert.equal(app.eval(`state.profile.ironDailyGoal`), 16, 'rellena valores por defecto');
  assert.deepEqual(app.errors, []);
});

test('hydrate: localStorage corrupto cae a valores por defecto', async () => {
  const app = await loadApp();
  app.w.localStorage.setItem('nutribook-local-v1', '{no json');
  assert.deepEqual(app.eval(`load().recipes`), []);
});

test('save: persiste en localStorage y avisa a la nube', async () => {
  const app = await loadApp();
  app.eval(`state.recipes.push({id:'x',name:'X'}); save();`);
  assert.equal(JSON.parse(app.w.localStorage.getItem('nutribook-local-v1')).recipes[0].id, 'x');
  assert.ok(app.saved.length >= 1);
});

test('migración: v0 -> versión actual, sin claves muertas y conservando datos desconocidos', async () => {
  const old = { recipes: sampleRecipes, workouts: [{ id: 'w' }], stravaCache: {}, futuro: { a: 1 } };
  const app = await loadApp({ data: old });
  const st = app.eval(`state`);
  assert.equal(st.schemaVersion, app.eval(`SCHEMA_VERSION`));
  assert.equal('workouts' in st, false);
  assert.equal('stravaCache' in st, false);
  assert.deepEqual(st.futuro, { a: 1 });
});

test('migración: idempotente y no baja la versión de datos más nuevos', async () => {
  const app = await loadApp();
  const once = app.eval(`hydrate({ recipes: [], workouts: [1] })`);
  const twice = app.eval(`hydrate(${JSON.stringify(once)})`);
  assert.deepEqual(twice, once);
  assert.equal(app.eval(`hydrate({ schemaVersion: 99 }).schemaVersion`), 99);
});
