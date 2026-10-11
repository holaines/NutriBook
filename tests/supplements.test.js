import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const D = '2026-10-12';
const submit = (app, sel = '#modal-root form') => app.eval(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);

test('complementos: crear, tomar, y el hierro entra en dayIron', async () => {
  const app = await loadApp();
  app.eval(`openSupplementForm()`);
  app.eval(`const f = document.querySelector('#modal-root form'); f.querySelector('[name=name]').value = 'Hierro bisglicinato'; f.querySelector('[name=ironMg]').value = '14'`);
  submit(app);
  assert.equal(app.eval(`state.supplements.length`), 1);
  const id = app.eval(`state.supplements[0].id`);
  assert.equal(app.eval(`dayIron('${D}').eaten`), 0);
  app.eval(`takeSupplement(${JSON.stringify(id)}, '${D}')`);
  assert.equal(app.eval(`dayIron('${D}').eaten`), 14);
  assert.ok(app.eval(`dayAbsorbed('${D}').mid`) > 0, 'cuenta para la absorción');
});

test('complementos: tomar dos veces el mismo día no duplica; deshacer la quita', async () => {
  const app = await loadApp({ data: { supplements: [{ id: 's', name: 'Fe', ironMg: 10 }] } });
  app.eval(`takeSupplement('s', '${D}'); takeSupplement('s', '${D}')`);
  assert.equal(app.eval(`state.consumed.filter((x) => x.supplement).length`), 1);
  app.eval(`untakeSupplement('s', '${D}')`);
  assert.equal(app.eval(`dayIron('${D}').eaten`), 0);
});

test('complementos: editar no cambia las tomas pasadas; eliminar las conserva', async () => {
  const app = await loadApp({ data: { supplements: [{ id: 's', name: 'Fe', ironMg: 10 }] } });
  app.eval(`takeSupplement('s', '${D}')`);
  app.eval(`openSupplementForm('s')`);
  app.eval(`const f = document.querySelector('#modal-root form'); f.querySelector('[name=ironMg]').value = '20'`);
  submit(app);
  assert.equal(app.eval(`state.supplements[0].ironMg`), 20);
  assert.equal(app.eval(`dayIron('${D}').eaten`), 10, 'la toma anterior sigue valiendo 10');
  app.eval(`removeSupplement('s')`);
  assert.equal(app.eval(`state.supplements.length`), 0);
  assert.equal(app.eval(`dayIron('${D}').eaten`), 10);
});

test('complementos: validación del formulario', async () => {
  const app = await loadApp();
  app.eval(`openSupplementForm()`);
  app.eval(`const f = document.querySelector('#modal-root form'); f.querySelector('[name=name]').value = 'X'; f.querySelector('[name=ironMg]').value = '0'`);
  submit(app);
  assert.equal(app.eval(`state.supplements.length`), 0);
});

test('complementos: aparecen en Mi hierro y en Inicio (si hay alguno), con clic real', async () => {
  const app = await loadApp({ data: { supplements: [{ id: 's', name: 'Fe bisglicinato', ironMg: 14 }] } });
  assert.match(app.text(), /Fe bisglicinato/);
  app.eval(`document.querySelector('#view [data-click="takeSupplement"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  assert.equal(app.eval(`dayIron(today()).eaten`), 14);
  assert.match(app.text(), /✓ Tomado/);
  await app.go('Equilibrio');
  assert.match(app.text(), /Complementos/);
  assert.match(app.text(), /💊 Suplemento/);
  assert.deepEqual(app.errors, []);
});

test('complementos: se sincronizan como colección (borrado con tumba)', async () => {
  const app = await loadApp();
  const out = app.eval(`NBMerge.mergeStates({ supplements: [], sync: { deleted: { 'supplements:s': '2026-10-12T10:00:05.000Z' }, stamps: {} } }, { supplements: [{ id: 's', name: 'Fe', ironMg: 5, updatedAt: '2026-10-12T10:00:01.000Z' }] })`);
  assert.deepEqual(out.supplements, []);
});

test('migración 4: datos antiguos obtienen supplements vacíos', async () => {
  const app = await loadApp({ data: { schemaVersion: 3, recipes: [] } });
  assert.deepEqual(app.eval(`state.supplements`), []);
});
