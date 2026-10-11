import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const setUrl = (app, v) => app.eval(`document.getElementById('import-url').value = ${JSON.stringify(v)}`);
const toastText = (app) => app.w.document.querySelector('.toast')?.textContent ?? '';
const stubFetch = (app, status, body) => app.eval(`window.__calls = []; window.fetch = async (u, o) => { window.__calls.push([u, o]); return { ok: ${status < 400}, status: ${status}, json: async () => (${JSON.stringify(body)}) }; }`);

test('importar enlace: sin sesión avisa y no llama al servidor', async () => {
  const app = await loadApp({ user: false });
  app.eval(`openImport()`); setUrl(app, 'https://blog.es/receta');
  stubFetch(app, 200, {});
  await app.eval(`importFromUrl()`);
  assert.match(toastText(app), /Inicia sesión/);
  assert.equal(app.eval(`window.__calls.length`), 0);
});

test('importar enlace: un texto que no es un enlace no se envía', async () => {
  const app = await loadApp();
  app.eval(`openImport()`); stubFetch(app, 200, {});
  for (const v of ['', 'receta de lentejas', 'ftp://x.es/a', 'http://']) { setUrl(app, v); await app.eval(`importFromUrl()`); assert.match(toastText(app), /enlace completo/, v); app.w.document.querySelectorAll('.toast').forEach((t) => t.remove()); }
  assert.equal(app.eval(`window.__calls.length`), 0);
});

test('importar enlace: éxito -> abre el formulario con un borrador y no guarda nada hasta confirmar', async () => {
  const app = await loadApp();
  app.eval(`openImport()`); setUrl(app, 'https://blog.es/estofado');
  stubFetch(app, 200, { recipe: { name: 'Estofado', description: 'Rico', servings: 6, time: 110, ingredients: ['500 g de ternera', '2 patatas'], instructions: ['Sella', 'Cuece'], source: 'https://blog.es/estofado' } });
  await app.eval(`importFromUrl()`);
  const [url, opts] = app.eval(`window.__calls[0]`);
  assert.match(url, /\/functions\/v1\/recipe-import$/); assert.equal(opts.headers.Authorization, 'Bearer t'); assert.deepEqual(JSON.parse(opts.body), { url: 'https://blog.es/estofado' });
  const f = (n) => app.eval(`document.querySelector('#modal-root form [name=${n}]').value`);
  assert.equal(f('name'), 'Estofado'); assert.equal(f('servings'), '6'); assert.equal(f('time'), '110'); assert.equal(f('source'), 'https://blog.es/estofado');
  assert.match(f('ingredients'), /500 g ternera/); assert.match(f('instructions'), /Sella\nCuece/); assert.equal(f('iron'), '');
  assert.deepEqual(app.eval(`state.recipes`), [], 'nada guardado aún');
  app.eval(`document.querySelector('#modal-root form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  assert.equal(app.eval(`state.recipes[0].name`), 'Estofado');
  assert.equal(app.eval(`state.recipes[0].source`), 'https://blog.es/estofado');
  assert.equal(app.eval(`state.recipes[0].ironSource`), 'calc', 'el hierro se calcula con los ingredientes al guardar');
});

test('importar enlace: error del servidor -> mensaje claro y el botón vuelve a estar activo', async () => {
  const app = await loadApp();
  app.eval(`openImport()`); setUrl(app, 'https://blog.es/nada');
  stubFetch(app, 422, { error: 'No encontré una receta estructurada en esa página.' });
  await app.eval(`importFromUrl()`);
  assert.match(toastText(app), /No encontré una receta estructurada/);
  assert.equal(app.eval(`document.getElementById('import-url-btn').disabled`), false);
  assert.equal(app.eval(`document.getElementById('import-url-btn').textContent`), 'Importar enlace');
  assert.deepEqual(app.eval(`state.recipes`), []);
});

test('el pegado de texto sigue funcionando desde la nueva ventana', async () => {
  const app = await loadApp();
  app.eval(`openImport()`);
  app.eval(`document.getElementById('raw-recipe').value = 'Galletas\\nIngredientes\\n120 g de avena\\n1 plátano\\nPreparación\\nMezclar.'`);
  app.eval(`parseImport()`);
  assert.equal(app.eval(`document.querySelector('#modal-root form [name=name]').value`), 'Galletas');
  assert.match(app.eval(`document.querySelector('#modal-root form [name=ingredients]').value`), /120 g avena/);
});
