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
  assert.doesNotMatch(app.w.document.getElementById('app').innerHTML, /Strava|Garmin|Deporte/);
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

/** Todas las acciones data-* del DOM deben apuntar a una función existente (detecta enlaces rotos). */
const deadActions = (app) => app.eval(`(() => {
  const dead = [];
  for (const el of document.querySelectorAll('[data-click],[data-change],[data-input],[data-submit],[data-keydown]')) {
    for (const t of ['click', 'change', 'input', 'submit', 'keydown']) {
      const n = el.getAttribute('data-' + t);
      if (n && !(NBEvents.actions[n] || typeof window[n] === 'function' || (() => { try { return typeof eval(n) === 'function'; } catch { return false; } })())) dead.push(n);
    }
  }
  return dead;
})()`);

test('ninguna acción de ninguna página ni modal apunta a una función inexistente', async () => {
  const app = await loadApp({ data: { recipes: sampleRecipes, plan: { '2026-10-12|Comida': 'r1' }, pantry: [{ id: 'p', name: 'lentejas', quantity: 1, unit: 'kg' }] } });
  await app.eval(`RAK.loadWeek(weekDates('2026-10-12'))`);
  for (const p of app.eval(`PAGES.map((x) => x.id)`)) { await app.go(p); assert.deepEqual(deadActions(app), [], 'página ' + p); }
  const modals = [`openForm()`, `openForm('r1')`, `viewRecipe('r1')`, `openImport()`, `openFoodForm('2026-10-12')`, `openEatRecipe('2026-10-12')`,
    `openPlan('', '2026-10-12', 'Cena')`, `openPantry()`, `openPantry('p')`, `showRAKModal('2026-10-12','dejeuner')`, `showRAKRecipes('2026-10-12','dejeuner')`, `openMore()`, `openDay('2026-10-12')`];
  for (const m of modals) {
    await app.go('Calendario');
    app.eval(m);
    assert.deepEqual(deadActions(app), [], 'modal ' + m);
    app.eval(`closeModal()`);
  }
  assert.deepEqual(app.errors, []);
});

test('clic real: marcar comido, navegar y cerrar modal a través de la delegación', async () => {
  const app = await loadApp({ data: { recipes: sampleRecipes, plan: { '2026-10-12|Comida': 'r1' } } });
  const click = (sel) => app.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; })()`);
  assert.ok(click(`#view [data-click="toggleEaten"]`), 'botón Marcar comido en Inicio');
  assert.equal(app.eval(`dayIron('2026-10-12').eaten`), 6.4);
  assert.ok(click(`.nav [data-click="navigate"][data-args='["Recetas"]']`));
  assert.equal(app.eval(`page`), 'Recetas');
  app.eval(`openMore()`);
  assert.ok(click(`.more-grid [data-click="navigate"]`));
  assert.notEqual(app.eval(`page`), 'Recetas');
  assert.deepEqual(app.errors, []);
});

test('formularios: el envío pasa el <form> real (perfil, comida manual, receta)', async () => {
  const app = await loadApp();
  const submit = (sel) => app.eval(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  await app.go('Perfil');
  app.eval(`document.querySelector('#view form [name=name]').value = 'Inès'`);
  submit('#view form');
  assert.equal(app.eval(`state.profile.name`), 'Inès');

  app.eval(`openFoodForm('2026-10-12')`);
  app.eval(`const f = document.querySelector('#modal-root form'); f.querySelector('[name=name]').value = "Pan d'ail"; f.querySelector('[name=iron]').value = '2.5'`);
  submit('#modal-root form');
  assert.equal(app.eval(`state.consumed.some((x) => x.name === "Pan d'ail" && x.iron == 2.5)`), true);

  app.eval(`openForm()`);
  app.eval(`const f = document.querySelector('#modal-root form'); f.querySelector('[name=name]').value = 'Tortilla'`);
  submit('#modal-root form');
  assert.equal(app.eval(`state.recipes.some((r) => r.name === 'Tortilla')`), true);
  assert.deepEqual(app.errors, []);
});

test('RAK sin sesión: pulsar «Actualizar» avisa de que hay que iniciar sesión y no llama al servidor', async () => {
  const app = await loadApp({ user: false });
  await app.go('Calendario');
  await app.settle(300);
  app.eval(`refreshRAK()`);
  await app.settle(300);
  assert.equal(app.fetchCalls.filter((c) => /rak-fetch/.test(c.u)).length, 0);
  assert.match(app.w.document.body.textContent, /Inicia sesión en «Mi perfil» para actualizar el menú del RAK/);
  assert.match(app.text(), /inicia sesión para actualizarlo/);
});

test('RAK con sesión: pulsar «Actualizar» llama a rak-fetch con el token del usuario', async () => {
  const app = await loadApp();
  await app.go('Calendario');
  await app.settle(300);
  app.eval(`refreshRAK()`);
  await app.settle(300);
  const calls = app.fetchCalls.filter((c) => /rak-fetch/.test(c.u));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].o.headers.Authorization, 'Bearer t');
});
