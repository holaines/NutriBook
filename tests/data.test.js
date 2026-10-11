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
