import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sampleRecipes } from './helpers/loadApp.js';

const rec = async (p) => (await loadApp()).eval(`recommendedIron(${JSON.stringify(p)})`);

test('recommendedIron: tabla de referencia', async () => {
  const cases = [
    [{}, 16], [{ sex: 'F', age: 25 }, 16], [{ sex: 'F', age: 51 }, 11], [{ sex: 'F', age: 30, status: 'pregnant' }, 16],
    [{ sex: 'F', age: 30, status: 'breastfeeding' }, 16], [{ sex: 'M', age: 30 }, 11], [{ sex: 'F', age: 15 }, 13], [{ sex: 'M', age: 15 }, 11], [{ sex: 'F', age: 8 }, 11],
  ];
  for (const [p, mg] of cases) assert.equal((await rec(p)).mg, mg, JSON.stringify(p));
});
test('recommendedIron: reparto por comida y aviso vegetariano', async () => {
  const r = await rec({ sex: 'F', age: 25, diet: 'vegetarian' });
  assert.equal(r.mg, 16); assert.equal(r.meal, 5.5); assert.equal(r.vegetarian, true);
  assert.equal((await rec({ sex: 'M', age: 40 })).meal, 3.5);
  assert.ok((await rec({})).basis.length > 10);
});

test('bienvenida: aparece en el primer uso y recorre los 3 pasos hasta guardar el perfil', async () => {
  const app = await loadApp({ onboarding: true });
  assert.ok(app.eval(`ob`) && app.eval(`ob.step`) === 1);
  const modalText = () => app.w.document.getElementById('modal-root').textContent;
  assert.match(modalText(), /Cuéntanos un poco/);
  app.eval(`obSet('sex','F'); obSet('age','55'); obSet('name','Inès')`);
  assert.match(app.w.document.getElementById('ob-rec').textContent, /11 mg/);
  app.eval(`obGo(2)`); assert.match(modalText(), /Tu objetivo de hierro/);
  app.eval(`obSet('ironDailyGoal','12')`);
  app.eval(`obGo(3)`); assert.match(modalText(), /Guarda tus datos|Todo listo/);
  app.eval(`obFinish(false)`);
  const p = app.eval(`state.profile`);
  assert.deepEqual([p.name, p.sex, p.age, p.ironDailyGoal, p.onboarded], ['Inès', 'F', 55, 12, true]);
  assert.equal(app.eval(`modal`), null);
  assert.equal(app.eval(`goalDay()`), 12);
  assert.deepEqual(app.errors, []);
});

test('bienvenida: no reaparece tras recargar, ni «Ahora no»', async () => {
  const a = await loadApp({ onboarding: true });
  a.eval(`obSkip()`);
  const saved = JSON.parse(a.w.localStorage.getItem('nutribook-local-v1'));
  assert.equal(saved.profile.onboarded, true);
  const b = await loadApp({ onboarding: true, data: saved });
  assert.equal(b.eval(`ob`), null);
  assert.equal(b.eval(`modal`), null);
});

test('migración: quien ya usa la app (recetas, comidas o nombre) no ve la bienvenida', async () => {
  for (const data of [{ recipes: sampleRecipes }, { consumed: [{ id: 'x', date: '2026-10-01', name: 'a', iron: 1 }] }, { profile: { name: 'Inès' } }]) {
    const app = await loadApp({ onboarding: true, data });
    assert.equal(app.eval(`state.profile.onboarded`), true, JSON.stringify(Object.keys(data)));
    assert.equal(app.eval(`ob`), null);
  }
  assert.equal((await loadApp({ onboarding: true })).eval(`state.profile.onboarded`), false);
});

test('perfil: campos nuevos se guardan y «Calcular mi objetivo» abre la bienvenida en el paso 1', async () => {
  const app = await loadApp({ data: { profile: { onboarded: true, ironDailyGoal: 18, ironMealGoal: 6 } } });
  await app.go('Perfil');
  app.eval(`document.querySelector('#view form [name=sex]').value = 'M'; document.querySelector('#view form [name=age]').value = '33'`);
  app.eval(`document.querySelector('#view form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  assert.deepEqual([app.eval(`state.profile.sex`), app.eval(`state.profile.age`), app.eval(`state.profile.ironDailyGoal`)], ['M', '33', 18], 'no pisa el objetivo manual');
  app.eval(`document.querySelector('[data-click="openOnboarding"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  assert.equal(app.eval(`ob.step`), 1);
  assert.equal(app.eval(`ob.draft.sex`), 'M');
  assert.equal(app.eval(`ob.draft.ironDailyGoal`), 18, 'con perfil ya completo se parte de su objetivo actual');
});
