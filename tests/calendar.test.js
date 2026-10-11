import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, sampleRecipes } from './helpers/loadApp.js';

const NOW = '2026-10-20T10:00:00';   // semana sin menú RAK en las fixtures
const recipes = [
  { id: 'd1', name: 'Avena', iron: 2, categories: ['Desayunos'] }, { id: 'c1', name: 'Lentejas', iron: 6, categories: ['Comidas'], favorite: true },
  { id: 'c2', name: 'Garbanzos', iron: 4, categories: ['Comidas'] }, { id: 'n1', name: 'Tortilla', iron: 2, categories: ['Cenas'] }, { id: 'm1', name: 'Nueces', iron: 1.8, categories: ['Snacks'] },
].map((r) => ({ ingredients: [], instructions: [], servings: 1, ...r }));
const click = (app, sel) => app.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; })()`);
const dnd = (app, type, key, dt) => app.eval(`(() => { const el = document.querySelector('.slot [data-click="viewRecipe"]') && [...document.querySelectorAll('.slot')].find((s) => s.getAttribute('data-args') === ${JSON.stringify(JSON.stringify([key]))} || s.getAttribute('data-args')?.startsWith('["${key}"')); return !!el; })()`);

test('Sugerir semana: muestra la propuesta sin aplicar, «Otra propuesta» cambia, «Aplicar» rellena y se puede deshacer', async () => {
  const app = await loadApp({ now: NOW, data: { recipes } });
  await app.go('Calendario');
  assert.ok(click(app, '[data-click="openSuggestWeek"]'));
  assert.match(app.w.document.getElementById('modal-root').textContent, /Propuesta para tu semana/);
  assert.deepEqual(app.eval(`state.plan`), {}, 'no se aplica solo');
  const first = app.w.document.querySelector('.suggest-list').textContent;
  assert.ok(click(app, '#modal-root [data-click="openSuggestWeek"]'));
  assert.equal(app.eval(`suggestSeed`), 2);
  assert.ok(click(app, '#modal-root [data-click="applySuggestion"]'));
  const planned = Object.keys(app.eval(`state.plan`)).length;
  assert.ok(planned >= 20, `planificadas ${planned}`);
  assert.equal(app.eval(`modal`), null);
  app.w.document.querySelector('.toast button').click();
  assert.deepEqual(app.eval(`state.plan`), {});
  assert.ok(first.length > 50);
});

test('Sugerir semana: no toca huecos con el RAK adaptable ni lo ya planificado, y avisa si no queda nada', async () => {
  const app = await loadApp({ now: '2026-10-12T10:00:00', data: { recipes, plan: { '2026-10-13|Desayuno': 'd1' } } });
  await app.eval(`RAK.loadWeek(weekDates('2026-10-12'))`);
  await app.go('Calendario');
  const { assign } = app.eval(`suggestionFor(1)`);
  assert.ok(!('2026-10-12|Comida' in assign), 'lunes comida: el RAK ya la cubre');
  assert.ok(!('2026-10-13|Desayuno' in assign));
  const full = {};
  for (let i = 0; i < 7; i++) for (const m of ['Desayuno', 'Comida', 'Merienda', 'Cena']) full[`${app.eval(`datePlus('2026-10-12', ${i})`)}|${m}`] = 'c1';
  const b = await loadApp({ now: '2026-10-12T10:00:00', data: { recipes, plan: full } });
  await b.go('Calendario');
  b.eval(`openSuggestWeek()`);
  assert.equal(b.eval(`modal`), null);
  assert.match(b.w.document.body.textContent, /No quedan huecos libres/);
});

test('Copiar a la semana siguiente copia sin pisar y se deshace', async () => {
  const app = await loadApp({ now: NOW, data: { recipes, plan: { '2026-10-19|Comida': 'c1', '2026-10-21|Cena': 'n1', '2026-10-26|Comida': 'c2' } } });
  await app.go('Calendario');
  assert.ok(click(app, '[data-click="copyWeek"]'));
  assert.deepEqual(app.eval(`state.plan`), { '2026-10-19|Comida': 'c1', '2026-10-21|Cena': 'n1', '2026-10-26|Comida': 'c2', '2026-10-28|Cena': 'n1' });
  app.w.document.querySelector('.toast button').click();
  assert.equal(app.eval(`state.plan['2026-10-28|Cena']`), undefined);
  assert.ok(click(app, '[data-click="copyWeek"]'));
  assert.equal(app.eval(`Object.keys(state.plan).length`), 4);
});

test('Móvil: el selector de día marca el día elegido y calShift cruza de semana', async () => {
  const app = await loadApp({ now: '2026-10-21T10:00:00', data: { recipes } });   // miércoles
  await app.go('Calendario');
  assert.equal(app.eval(`selectedDay()`), '2026-10-21');
  assert.equal(app.w.document.querySelectorAll('.day-strip button').length, 7);
  assert.equal(app.w.document.querySelectorAll('.day.is-sel').length, 1);
  assert.ok(click(app, '.day-strip [data-args=\'["2026-10-23"]\']'));
  assert.equal(app.eval(`selectedDay()`), '2026-10-23');
  assert.equal(app.w.document.querySelector('.day.is-sel').id, 'cal-2026-10-23');
  app.eval(`calShift(1); calShift(1); calShift(1);`);
  assert.equal(app.eval(`weekOffset`), 1, 'pasó a la semana siguiente');
  assert.equal(app.eval(`selectedDay()`), '2026-10-26');
  app.eval(`calShift(-1)`);
  assert.equal(app.eval(`weekOffset`), 0);
  assert.equal(app.eval(`selectedDay()`), '2026-10-25');
});

test('Móvil: deslizar el dedo cambia de día (solo en pantalla estrecha)', async () => {
  const app = await loadApp({ now: '2026-10-21T10:00:00', data: { recipes } });
  await app.go('Calendario');
  const swipe = (x0, x1) => app.eval(`(() => {
    const t = document.querySelector('.calendar .slot');
    const mk = (type, x) => { const e = new Event(type, { bubbles: true }); e.changedTouches = [{ clientX: x }]; t.dispatchEvent(e); };
    mk('touchstart', ${x0}); mk('touchend', ${x1}); })()`);
  app.w.innerWidth = 400;
  swipe(300, 100);
  assert.equal(app.eval(`selectedDay()`), '2026-10-22', 'izquierda = día siguiente');
  swipe(100, 300);
  assert.equal(app.eval(`selectedDay()`), '2026-10-21', 'derecha = día anterior');
  swipe(200, 180);
  assert.equal(app.eval(`selectedDay()`), '2026-10-21', 'un gesto corto no cuenta');
  app.w.innerWidth = 1200;
  swipe(300, 100);
  assert.equal(app.eval(`selectedDay()`), '2026-10-21', 'en escritorio no desliza');
});

test('Arrastrar y soltar: mover a un hueco libre, intercambiar y bloquear lo ya comido', async () => {
  const app = await loadApp({ now: NOW, data: { recipes, plan: { '2026-10-20|Comida': 'c1', '2026-10-20|Cena': 'n1', '2026-10-21|Comida': 'c2' } } });
  await app.go('Calendario');
  const drag = (from, to) => app.eval(`(() => {
    const dt = { data: {}, setData(k, v) { this.data[k] = v; }, getData(k) { return this.data[k]; } };
    const slots = [...document.querySelectorAll('.slot')];
    const find = (key) => slots.find((s) => (s.getAttribute('data-drop') === 'dropSlot') && JSON.parse(s.getAttribute('data-args'))[0] === key);
    const mk = (type, el) => { const e = new Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = dt; el.dispatchEvent(e); return e; };
    const src = find(${JSON.stringify(from)}), dst = find(${JSON.stringify(to)});
    const draggable = src.getAttribute('draggable') === 'true';
    mk('dragstart', src); const over = mk('dragover', dst); mk('drop', dst);
    return { draggable, overPrevented: over.defaultPrevented };
  })()`);
  let r = drag('2026-10-20|Comida', '2026-10-22|Comida');
  assert.deepEqual(r, { draggable: true, overPrevented: true });
  assert.equal(app.eval(`state.plan['2026-10-22|Comida']`), 'c1');
  assert.equal(app.eval(`state.plan['2026-10-20|Comida']`), undefined);
  drag('2026-10-22|Comida', '2026-10-21|Comida');
  assert.equal(app.eval(`state.plan['2026-10-21|Comida']`), 'c1'); assert.equal(app.eval(`state.plan['2026-10-22|Comida']`), 'c2');
  app.eval(`toggleEaten('2026-10-20|Cena')`);
  await app.go('Calendario');
  r = drag('2026-10-20|Cena', '2026-10-23|Cena');
  assert.equal(r.draggable, false, 'lo ya comido no se arrastra');
  assert.equal(app.eval(`state.plan['2026-10-20|Cena']`), 'n1');
  app.w.document.querySelector('.toast button')?.click();
});

test('el calendario sigue sin errores con todas las acciones', async () => {
  const app = await loadApp({ now: NOW, data: { recipes: sampleRecipes } });
  await app.go('Calendario');
  assert.deepEqual(app.errors, []);
});
