import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const submit = (app) => app.eval(`document.querySelector('#modal-root form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
const fill = (app, vals) => app.eval(`const f = document.querySelector('#modal-root form'); for (const [k, v] of Object.entries(${JSON.stringify(vals)})) f.querySelector('[name=' + k + ']').value = v;`);
const toastText = (app) => app.w.document.querySelector('.toast')?.textContent ?? '';

test('análisis: crear con ferritina y hemoglobina, ordenados por fecha', async () => {
  const app = await loadApp();
  for (const v of [{ date: '2026-09-01', ferritin: '14', hemoglobin: '11.8' }, { date: '2026-06-01', ferritin: '9.5', hemoglobin: '' }]) {
    app.eval(`openLabForm()`); fill(app, v); submit(app);
  }
  const labs = app.eval(`sortedLabs()`);
  assert.deepEqual(labs.map((l) => l.date), ['2026-06-01', '2026-09-01']);
  assert.deepEqual([labs[0].ferritin, labs[0].hemoglobin], [9.5, null]);
});

test('análisis: validaciones (vacío, fuera de rango, fecha futura)', async () => {
  const app = await loadApp();
  const bad = async (v, msg) => { app.eval(`openLabForm()`); fill(app, v); submit(app); assert.equal(app.eval(`state.labs.length`), 0, JSON.stringify(v)); assert.match(toastText(app), msg); app.w.document.querySelectorAll('.toast').forEach((t) => t.remove()); app.eval(`closeModal()`); };
  await bad({ date: '2026-10-01', ferritin: '', hemoglobin: '' }, /al menos/);
  await bad({ date: '2026-10-01', ferritin: '99999', hemoglobin: '' }, /fuera de rango/);
  await bad({ date: '2026-10-01', ferritin: '', hemoglobin: '40' }, /fuera de rango/);
  await bad({ date: '2027-01-01', ferritin: '20', hemoglobin: '' }, /futura/);
});

test('análisis: editar y eliminar con deshacer', async () => {
  const app = await loadApp({ data: { labs: [{ id: 'l', date: '2026-09-01', ferritin: 14, hemoglobin: null, notes: '' }] } });
  app.eval(`openLabForm('l')`); fill(app, { ferritin: '22' }); submit(app);
  assert.equal(app.eval(`state.labs[0].ferritin`), 22);
  app.eval(`removeLab('l')`);
  assert.equal(app.eval(`state.labs.length`), 0);
  app.w.document.querySelector('.toast button').click();
  assert.equal(app.eval(`state.labs.length`), 1);
});

test('avgIronBefore: media de los 30 días previos solo con días registrados', async () => {
  const consumed = [
    { id: '1', date: '2026-10-10', meal: 'Comida', name: 'a', iron: 10 }, { id: '2', date: '2026-10-09', meal: 'Comida', name: 'b', iron: 6 },
    { id: '3', date: '2026-10-12', meal: 'Comida', name: 'hoy no cuenta', iron: 100 }, { id: '4', date: '2026-08-01', meal: 'Comida', name: 'muy antigua', iron: 50 },
  ];
  const app = await loadApp({ data: { consumed } });
  assert.deepEqual(app.eval(`avgIronBefore('2026-10-12')`), { avg: 8, days: 2 });
  assert.deepEqual(app.eval(`avgIronBefore('2026-07-01')`), { avg: null, days: 0 });
});

test('gráfico: 0 puntos nada, 1 punto sin línea, N puntos con línea', async () => {
  const app = await loadApp();
  const chart = (pts) => app.eval(`labChart(${JSON.stringify(pts)}, 'µg/L')`);
  assert.equal(chart([]), '');
  const one = chart([{ date: '2026-09-01', value: 14 }]);
  assert.match(one, /<circle/); assert.doesNotMatch(one, /polyline/);
  const many = chart([{ date: '2026-06-01', value: 9 }, { date: '2026-08-01', value: 12 }, { date: '2026-10-01', value: 30 }]);
  assert.match(many, /polyline/); assert.equal((many.match(/<circle/g) || []).length, 3);
  assert.match(many, /30 µg\/L/);
  const same = chart([{ date: '2026-06-01', value: 10 }, { date: '2026-06-01', value: 10 }]);   // mismos valores y fecha: sin NaN
  assert.doesNotMatch(same, /NaN/);
});

test('UI: la tarjeta aparece en Mi hierro con la media previa y sin interpretar los valores', async () => {
  const app = await loadApp({ data: { labs: [{ id: 'l', date: '2026-10-11', ferritin: 18, hemoglobin: 12.5, notes: 'control' }], consumed: [{ id: '1', date: '2026-10-10', meal: 'Comida', name: 'a', iron: 9 }] } });
  await app.go('Equilibrio');
  assert.match(app.text(), /Ferritina 18 µg\/L/);
  assert.match(app.text(), /Hemoglobina 12,5 g\/dL/);
  assert.match(app.text(), /hierro medio los 30 días previos: 9 mg\/día \(1 día registrado\)/);
  assert.match(app.text(), /no interpreta ni diagnostica/);
  assert.doesNotMatch(app.text(), /anemia|deficiencia/i);
  assert.deepEqual(app.errors, []);
});

test('análisis: se sincronizan como colección y migración 5 crea labs', async () => {
  const app = await loadApp({ data: { schemaVersion: 4 } });
  assert.deepEqual(app.eval(`state.labs`), []);
  const out = app.eval(`NBMerge.mergeStates({ labs: [{ id: 'a', date: '2026-01-01', ferritin: 5, updatedAt: '2026-10-12T10:00:02.000Z' }] }, { labs: [{ id: 'b', date: '2026-02-01', ferritin: 6, updatedAt: '2026-10-12T10:00:01.000Z' }] })`);
  assert.deepEqual(out.labs.map((l) => l.id), ['a', 'b']);
});
