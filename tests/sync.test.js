import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sleep } from './helpers/loadApp.js';

const T = (n) => `2026-10-12T10:00:0${n}.000Z`;
const rec = (id, name, t) => ({ id, name, updatedAt: t });
const merge = (app, a, b) => app.eval(`NBMerge.mergeStates(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
const names = (st) => st.recipes.map((r) => r.name).sort();

test('merge: elementos distintos de cada lado sobreviven', async () => {
  const app = await loadApp();
  const out = merge(app, { recipes: [rec('a', 'A', T(1))] }, { recipes: [rec('b', 'B', T(2))] });
  assert.deepEqual(names(out), ['A', 'B']);
});

test('merge: mismo elemento, gana la modificación más reciente (en ambos sentidos)', async () => {
  const app = await loadApp();
  const x = { recipes: [rec('a', 'vieja', T(1))] }, y = { recipes: [rec('a', 'nueva', T(5))] };
  assert.deepEqual(names(merge(app, x, y)), ['nueva']);
  assert.deepEqual(names(merge(app, y, x)), ['nueva']);
});

test('merge: un borrado posterior a la última edición elimina el elemento; una edición posterior lo recupera', async () => {
  const app = await loadApp();
  const del = { recipes: [], sync: { deleted: { 'recipes:a': T(5) }, stamps: {} } };
  assert.deepEqual(merge(app, del, { recipes: [rec('a', 'A', T(1))] }).recipes, []);
  assert.deepEqual(merge(app, { recipes: [rec('a', 'A', T(1))] }, del).recipes, []);
  assert.deepEqual(names(merge(app, del, { recipes: [rec('a', 'editada después', T(9))] })), ['editada después']);
});

test('merge: plan y compra por clave, con borrados', async () => {
  const app = await loadApp();
  const a = { plan: { 'd|Comida': 'r1' }, sync: { deleted: {}, stamps: { 'plan:d|Comida': T(1) } } };
  const b = { plan: { 'd|Cena': 'r2' }, sync: { deleted: {}, stamps: { 'plan:d|Cena': T(2) } } };
  assert.deepEqual(merge(app, a, b).plan, { 'd|Comida': 'r1', 'd|Cena': 'r2' });
  const borrado = { plan: {}, sync: { deleted: {}, stamps: { 'plan:d|Comida': T(7) } } };
  assert.deepEqual(merge(app, borrado, a).plan, {});
  assert.deepEqual(merge(app, a, borrado).plan, {});
  const cambia = { plan: { 'd|Comida': 'r9' }, sync: { deleted: {}, stamps: { 'plan:d|Comida': T(8) } } };
  assert.deepEqual(merge(app, borrado, cambia).plan, { 'd|Comida': 'r9' });
});

test('merge: perfil por marca, claves desconocidas conservadas, idempotente y conmutativo sin empates', async () => {
  const app = await loadApp();
  const a = { profile: { name: 'Local' }, futuro: 1, recipes: [rec('a', 'A', T(1))], sync: { deleted: {}, stamps: { profile: T(2) } } };
  const b = { profile: { name: 'Nube' }, otro: 2, recipes: [rec('b', 'B', T(3))], sync: { deleted: {}, stamps: { profile: T(4) } } };
  const ab = merge(app, a, b), ba = merge(app, b, a);
  assert.equal(ab.profile.name, 'Nube'); assert.equal(ab.futuro, 1); assert.equal(ab.otro, 2);
  assert.deepEqual(ab, ba);
  assert.deepEqual(merge(app, ab, ab), ab);
});

test('merge: las tumbas de más de 90 días se olvidan', async () => {
  const app = await loadApp();
  const out = merge(app, { sync: { deleted: { 'recipes:z': '2020-01-01T00:00:00.000Z', 'recipes:y': new Date().toISOString() }, stamps: {} } }, {});
  assert.deepEqual(Object.keys(out.sync.deleted), ['recipes:y']);
});

test('stamp: marca elementos modificados, nuevos y borrados sin tocar el resto de la app', async () => {
  const app = await loadApp({ data: { recipes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], plan: { 'd|Comida': 'a' } } });
  app.setNow(T(5));
  app.eval(`state.recipes[0].name = 'A2'; state.recipes.push({ id: 'c', name: 'C' }); state.recipes = state.recipes.filter((r) => r.id !== 'b'); delete state.plan['d|Comida']; state.profile.name = 'Nueva'; save();`);
  const st = app.eval(`state`);
  const byId = Object.fromEntries(st.recipes.map((r) => [r.id, r]));
  assert.equal(byId.a.updatedAt, T(5).replace('.000Z', '.000Z'));
  assert.ok(byId.c.updatedAt);
  assert.equal(st.sync.deleted['recipes:b'], byId.a.updatedAt);
  assert.equal(st.sync.stamps['plan:d|Comida'], byId.a.updatedAt);
  assert.equal(st.sync.stamps.profile, byId.a.updatedAt);
  // sin cambios no se re-marca
  app.setNow(T(9)); app.eval(`save()`);
  assert.equal(app.eval(`state.recipes.find((r) => r.id === 'a').updatedAt`), byId.a.updatedAt);
});

test('dos dispositivos: cada uno añade una receta y ambas sobreviven', async () => {
  const db = { payload: null };
  const A = await loadApp({ db, now: '2026-10-12T10:00:00Z' });
  const B = await loadApp({ db, now: '2026-10-12T10:00:00Z' });      // arranca antes de que A suba nada propio
  A.setNow('2026-10-12T10:01:00Z');
  A.eval(`state.recipes.push({ id: 'ra', name: 'De A' }); save();`);
  await A.eval(`NutriCloud.syncNow()`);
  B.setNow('2026-10-12T10:02:00Z');
  B.eval(`state.recipes.push({ id: 'rb', name: 'De B' }); save();`);
  await B.eval(`NutriCloud.syncNow()`);
  assert.deepEqual(names(B.eval(`state`)), ['De A', 'De B']);
  assert.deepEqual(names(db.payload), ['De A', 'De B']);
  await A.eval(`NutriCloud.syncNow()`);
  assert.deepEqual(names(A.eval(`state`)), ['De A', 'De B']);
  assert.deepEqual(A.errors.concat(B.errors), []);
});

test('dos dispositivos: un borrado en A no resucita desde un B desactualizado', async () => {
  const db = { payload: { schemaVersion: 2, recipes: [rec('r', 'Original', T(1))], sync: { deleted: {}, stamps: {} } } };
  const A = await loadApp({ db });
  const B = await loadApp({ db });
  A.setNow('2026-10-12T11:00:00Z');
  A.eval(`state.recipes = []; save();`);
  await A.eval(`NutriCloud.syncNow()`);
  assert.deepEqual(db.payload.recipes, []);
  await B.eval(`NutriCloud.syncNow()`);
  assert.deepEqual(B.eval(`state.recipes`), []);
  assert.deepEqual(db.payload.recipes, []);
});

test('guardado automático: tras editar, la nube se actualiza sola (debounce) uniendo con lo remoto', async () => {
  const db = { payload: null };
  const A = await loadApp({ db });
  db.payload = { ...db.payload, recipes: [...(db.payload.recipes || []), rec('remota', 'Remota', T(1))] };   // otro dispositivo guardó
  A.setNow('2026-10-12T10:30:00Z');
  A.eval(`state.recipes.push({ id: 'loc', name: 'Local' }); save();`);
  await sleep(1300);
  assert.deepEqual(names(db.payload), ['Local', 'Remota']);
  assert.deepEqual(names(A.eval(`state`)), ['Local', 'Remota']);
});
