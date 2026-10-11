import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const actionable = (app) => app.w.document.querySelectorAll('#view button[data-click]').length;

test('estados vacíos: cada página sin datos explica qué hacer y ofrece una acción', async () => {
  const app = await loadApp({ now: '2026-10-20T10:00:00' });
  const expect = { Recetas: /No hay recetas|empieza|Añade/i, Compra: /No hay nada en la lista/, Despensa: /despensa está vacía/i, Calendario: /Aún no tienes recetas/, Equilibrio: /Cuando registres comidas/ };
  for (const [p, re] of Object.entries(expect)) {
    await app.go(p);
    assert.match(app.text(), re, p);
    assert.ok(actionable(app) >= 2, `${p}: debe haber botones de acción`);
  }
  assert.deepEqual(app.errors, []);
});

test('estado vacío del calendario: los enlaces abren el formulario de receta y la importación', async () => {
  const app = await loadApp({ now: '2026-10-20T10:00:00' });
  await app.go('Calendario');
  app.eval(`document.querySelector('.notice [data-click="openForm"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  assert.match(app.w.document.getElementById('modal-root').textContent, /receta/i);
  app.eval(`closeModal()`);
  app.eval(`document.querySelector('.notice [data-click="openImport"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  assert.match(app.w.document.getElementById('modal-root').textContent, /Pegar|pega/i);
});
