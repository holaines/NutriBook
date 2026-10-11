import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

async function mount(markup) {
  const app = await loadApp();
  app.eval(`window.calls = []; NBEvents.register({ rec: (...a) => calls.push(a.slice(0, -2)) });
    const box = document.createElement('div'); box.id = 'box'; box.innerHTML = ${JSON.stringify(markup)}; document.body.appendChild(box);`);
  return app;
}
const fire = (app, sel, type) => app.eval(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new Event(${JSON.stringify(type)}, { bubbles: true, cancelable: true })); calls`);

test('on(): genera atributos y escapa las comillas del JSON', async () => {
  const app = await loadApp();
  const out = app.eval(`String(on('click', 'rec', 'a"b'))`);
  assert.ok(out.startsWith(' data-click="rec" data-args="'));
  assert.equal(out.slice(' data-click="rec" data-args="'.length).includes('"b'), false, 'sin comillas sin escapar dentro del atributo');
  assert.throws(() => app.eval(`on('hover', 'x')`));
});

test('click: llama a la acción con los argumentos exactos (comillas y apóstrofos incluidos)', async () => {
  const app = await loadApp();
  const markup = app.eval(`String(html\`<button id="b" \${on('click', 'rec', 'a"b\\'c', 3, { x: 1 })}>go</button>\`)`);
  app.eval(`window.calls = []; NBEvents.register({ rec: (...a) => calls.push(a.slice(0, -2)) });
    const box = document.createElement('div'); box.innerHTML = ${JSON.stringify(markup)}; document.body.appendChild(box);`);
  const calls = fire(app, '#b', 'click');
  assert.deepEqual(calls, [['a"b\'c', 3, { x: 1 }]]);
});

test('el clic en un hijo sube hasta el elemento con data-click', async () => {
  const app = await mount(`<button data-click="rec" data-args='["k"]'><span id="in">x</span></button>`);
  assert.deepEqual(fire(app, '#in', 'click'), [['k']]);
});

test('change e input pasan el elemento; submit evita la recarga', async () => {
  const app = await mount(`<input id="i" data-change="rec"><form id="f" data-submit="rec"></form>`);
  assert.deepEqual(fire(app, '#i', 'change'), [[]]);
  const prevented = app.eval(`(() => { const e = new Event('submit', { bubbles: true, cancelable: true });
    document.getElementById('f').dispatchEvent(e); return e.defaultPrevented; })()`);
  assert.equal(prevented, true);
});

test('acción desconocida no rompe la página', async () => {
  const app = await mount(`<button id="x" data-click="noExiste">x</button>`);
  fire(app, '#x', 'click');
  assert.deepEqual(app.errors, []);
});

test('recurre a funciones globales mientras dura la migración', async () => {
  const app = await mount(`<button id="g" data-click="globalFn" data-args='[7]'>x</button>`);
  app.eval(`window.globalFn = (n) => calls.push(['g', n])`);
  assert.deepEqual(fire(app, '#g', 'click'), [['g', 7]]);
});
