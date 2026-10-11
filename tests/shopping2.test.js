import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const NOW = '2026-10-20T10:00:00';
const ing = (name, quantity, unit) => ({ name, quantity, unit });
const R = (id, ingredients, iron = 3) => ({ id, name: id, iron, servings: 1, categories: ['Comidas'], instructions: [], ingredients });
const click = (app, sel) => app.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; })()`);

test('aisleOf: rayón por categoría de la base y por palabras clave', async () => {
  const app = await loadApp();
  const a = (n) => app.eval(`aisleOf(${JSON.stringify(n)})`);
  assert.equal(a('espinacas'), 'Verduras y frutas'); assert.equal(a('kiwi'), 'Verduras y frutas'); assert.equal(a('ternera picada'), 'Carne y pescado'); assert.equal(a('merluza'), 'Carne y pescado');
  assert.equal(a('yogur natural'), 'Lácteos y huevos'); assert.equal(a('huevos'), 'Lácteos y huevos'); assert.equal(a('lentejas'), 'Despensa seca'); assert.equal(a('avena'), 'Despensa seca');
  assert.equal(a('aceite de oliva'), 'Despensa seca'); assert.equal(a('nata para cocinar'), 'Lácteos y huevos'); assert.equal(a('cilantro'), 'Verduras y frutas'); assert.equal(a('papel de horno'), 'Otros');
});

test('la lista se agrupa y ordena por rayón y nombre', async () => {
  const data = { recipes: [R('r', [ing('lentejas', 200, 'g'), ing('espinacas', 100, 'g'), ing('ternera picada', 300, 'g'), ing('yogur', 1, 'ud'), ing('papel de horno', 1, 'ud'), ing('aceite de oliva', 2, 'cucharadas')])], plan: { '2026-10-20|Comida': 'r' } };
  const app = await loadApp({ now: NOW, data });
  await app.go('Compra');
  assert.deepEqual(app.eval(`shoppingItems().map((i) => i.aisle)`), ['Verduras y frutas', 'Carne y pescado', 'Lácteos y huevos', 'Despensa seca', 'Despensa seca', 'Otros']);
  const seps = [...app.w.document.querySelectorAll('.item-sep')].map((e) => e.textContent);
  assert.deepEqual(seps, ['Verduras y frutas', 'Carne y pescado', 'Lácteos y huevos', 'Despensa seca', 'Otros']);
});

test('despensa: resta por nombre o por ser el mismo alimento (lentejas ≈ lentejas coral), con conversión de unidades', async () => {
  const data = { recipes: [R('r', [ing('lentejas coral', 300, 'g'), ing('espinacas', 1, 'kg')])], plan: { '2026-10-20|Comida': 'r' },
    pantry: [{ id: 'p', name: 'Lentejas', quantity: 0.2, unit: 'kg' }, { id: 'q', name: 'Espinacas', quantity: 400, unit: 'g' }] };
  const app = await loadApp({ now: NOW, data });
  const it = (n) => app.eval(`shoppingItems().find((i) => i.name === ${JSON.stringify(n)})`);
  assert.deepEqual([it('lentejas coral').have, it('lentejas coral').left], [200, 100]);
  assert.deepEqual([it('espinacas').have, it('espinacas').left], [400, 600]);
});

test('extras: añadir, marcar como comprado, quitar; no dependen de la semana', async () => {
  const app = await loadApp({ now: NOW });
  await app.go('Compra');
  app.eval(`const f = document.querySelector('.add-extra'); f.querySelector('[name=name]').value = 'Papel de cocina'; f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  assert.equal(app.eval(`state.shoppingExtra.length`), 1);
  assert.match(app.text(), /Papel de cocina/); assert.match(app.text(), /Añadido por ti/);
  const key = app.eval(`'extra:' + state.shoppingExtra[0].id`);
  app.eval(`toggleCheck(0, true)`);
  assert.equal(app.eval(`state.checked[${JSON.stringify(key)}]`), true);
  app.eval(`shiftWeek(2)`);
  assert.match(app.text(), /Papel de cocina/, 'sigue en otra semana');
  assert.ok(click(app, '[data-click="removeShoppingExtra"]'));
  assert.deepEqual([app.eval(`state.shoppingExtra.length`), app.eval(`key in state.checked`.replace('key', JSON.stringify(key)))], [0, false]);
});

test('compartir y copiar: texto agrupado, solo lo pendiente, con extras', async () => {
  const data = { recipes: [R('r', [ing('espinacas', 100, 'g'), ing('lentejas', 200, 'g')])], plan: { '2026-10-20|Comida': 'r' }, shoppingExtra: [{ id: 'x', name: 'Pilas' }], pantry: [{ id: 'p', name: 'lentejas', quantity: 500, unit: 'g' }] };
  const app = await loadApp({ now: NOW, data });
  const txt = app.eval(`shoppingText()`);
  assert.equal(txt, 'Verduras y frutas\n- espinacas: 100 g\n\nOtros\n- Pilas');
  app.eval(`toggleCheck(0, true)`);
  assert.equal(app.eval(`shoppingText()`), 'Otros\n- Pilas');
  assert.equal(app.eval(`state.checked['espinacas|g']`), true);
});

test('compartir: usa el menú del sistema si existe y si no abre WhatsApp con el texto codificado', async () => {
  const data = { recipes: [R('r', [ing('espinacas', 100, 'g')])], plan: { '2026-10-20|Comida': 'r' } };
  const a = await loadApp({ now: NOW, data });
  a.eval(`window.__shared = null; navigator.share = (o) => { window.__shared = o; return Promise.resolve(); }`);
  a.eval(`shareShopping()`);
  assert.match(a.eval(`window.__shared.text`), /Lista de la compra \(NutriBook\)\n\nVerduras y frutas\n- espinacas: 100 g/);
  const b = await loadApp({ now: NOW, data });
  b.eval(`window.__opened = null; window.open = (u, t, f) => { window.__opened = [u, t, f]; }`);
  b.eval(`shareShopping()`);
  const [u, t, f] = b.eval(`window.__opened`);
  assert.match(u, /^https:\/\/wa\.me\/\?text=Lista%20de%20la%20compra/); assert.equal(t, '_blank'); assert.equal(f, 'noopener');
  const empty = await loadApp({ now: NOW });
  empty.eval(`window.__opened = null; window.open = () => { window.__opened = true; }; shareShopping()`);
  assert.equal(empty.eval(`window.__opened`), null, 'lista vacía: no abre nada');
});

test('«Para subir tu hierro»: solo si lo planificado se queda corto; añade el alimento a la lista y deja de sugerirlo', async () => {
  const low = { recipes: [R('r', [ing('arroz', 100, 'g')], 1)], plan: { '2026-10-21|Comida': 'r' } };
  const app = await loadApp({ now: NOW, data: low });
  await app.go('Compra');
  assert.match(app.text(), /Para subir tu hierro esta semana/);
  const first = app.eval(`document.querySelector('.chip-btn[data-click="addShoppingExtraNamed"]').getAttribute('data-args')`);
  assert.ok(click(app, '.chip-btn[data-click="addShoppingExtraNamed"]'));
  assert.equal(app.eval(`state.shoppingExtra.length`), 1);
  assert.ok(!app.w.document.querySelector(`.chip-btn[data-args='${first}']`), 'ya no se vuelve a sugerir');
  const rich = await loadApp({ now: NOW, data: { consumed: [], recipes: [R('big', [ing('lentejas', 100, 'g')], 40)], plan: Object.fromEntries(['20', '21', '22', '23', '24', '25', '26'].flatMap((d) => ['Comida', 'Cena'].map((m) => [`2026-10-${d}|${m}`, 'big']))) } });
  await rich.go('Compra');
  assert.doesNotMatch(rich.text(), /Para subir tu hierro/);
});

test('migración 6 y sincronización de extras', async () => {
  const app = await loadApp({ data: { schemaVersion: 5 } });
  assert.deepEqual(app.eval(`state.shoppingExtra`), []);
  const out = app.eval(`NBMerge.mergeStates({ shoppingExtra: [{ id: 'a', name: 'A', updatedAt: '2026-10-12T10:00:02.000Z' }] }, { shoppingExtra: [{ id: 'b', name: 'B', updatedAt: '2026-10-12T10:00:01.000Z' }] })`);
  assert.deepEqual(out.shoppingExtra.map((x) => x.id), ['a', 'b']);
});
