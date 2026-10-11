import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './helpers/loadApp.js';

const NOW = '2026-10-14T10:00:00';
const e = (date, iron, extra = {}) => ({ id: date + iron + extra.name, date, meal: 'Comida', name: 'Plato', iron, ...extra });
const click = (app, sel) => app.eval(`(() => { const x = document.querySelector(${JSON.stringify(sel)}); if (!x) return false; x.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; })()`);
const data = { consumed: [e('2026-10-05', 10, { name: 'A' }), e('2026-10-12', 17, { name: 'Lentejas', foodId: 'lentejas' }), e('2026-10-13', 17, { name: 'Lentejas', foodId: 'lentejas' }), e('2026-10-14', 5, { name: 'Tortilla' }), e('2026-09-20', 8, { name: 'B' })] };

test('Mi hierro (semana): tarjetas, racha, comparación, fuentes y gráfico', async () => {
  const app = await loadApp({ now: NOW, data });
  await app.go('Equilibrio');
  const t = app.text();
  assert.match(t, /HIERRO DE LA SEMANA/); assert.match(t, /RACHA/); assert.match(t, /🔥 2 días/);
  assert.match(t, /que la semana anterior/); assert.match(t, /De dónde viene tu hierro/); assert.match(t, /Lentejas ×2/);
  assert.equal(app.w.document.querySelectorAll('.source-row').length, 2);
  assert.match(t, /Hierro por día/);
  assert.equal(app.w.document.querySelector('.seg button.on').textContent, 'Semana');
  assert.deepEqual(app.errors, []);
});

test('Mi hierro: cambiar a «Mes» muestra el mapa del mes con un cuadrado por día y navegación de meses', async () => {
  const app = await loadApp({ now: NOW, data });
  await app.go('Equilibrio');
  assert.ok(click(app, '.seg [data-args=\'["month"]\']'));
  assert.equal(app.w.document.querySelectorAll('.heat').length, 31);
  assert.equal(app.w.document.querySelector('.seg button.on').textContent, 'Mes');
  assert.equal(app.w.document.querySelector('.seg button.on').getAttribute('aria-selected'), 'true');
  assert.match(app.text(), /HIERRO DEL MES/); assert.match(app.text(), /octubre de 2026/);
  const lvl = (d) => [...app.w.document.querySelectorAll('.heat')].find((x) => x.getAttribute('aria-label').includes(', ' + d + ':'))?.className;
  assert.match(lvl('12 oct'), /\bgood\b/);
  assert.match(lvl('14 oct'), /\blow\b/);
  assert.match(lvl('15 oct'), /\bnone\b/, 'el futuro no se pinta');
  assert.match(lvl('1 oct'), /\bnone\b/, 'sin registros');
  assert.ok(click(app, '[data-click="shiftMonth"][data-args=\'[-1]\']'));
  assert.match(app.text(), /septiembre de 2026/);
  assert.equal(app.w.document.querySelectorAll('.heat').length, 30);
  assert.ok(click(app, '[data-click="shiftMonth"][data-args=\'[0]\']'));
  assert.match(app.text(), /octubre de 2026/);
});

test('Mi hierro (mes): empieza en el día de la semana correcto y los cuadrados abren el día', async () => {
  const app = await loadApp({ now: NOW, data });
  await app.go('Equilibrio'); app.eval(`setIronView('month')`);
  assert.equal(app.w.document.querySelectorAll('.heat-blank').length, 3, '1 oct 2026 es jueves: 3 huecos');
  assert.ok(click(app, '.heat[aria-label*=", 12 oct:"]'));
  assert.equal(app.eval(`ironView`), 'week', 'abre el detalle del día en la vista semanal');
  assert.ok(app.w.document.getElementById('day-2026-10-12'), 'la tarjeta de ese día existe');
});

test('Mi hierro: sin datos no rompe (semana y mes) y no muestra comparación', async () => {
  const app = await loadApp({ now: NOW });
  await app.go('Equilibrio');
  assert.match(app.text(), /0 días/); assert.doesNotMatch(app.text(), /que la semana anterior/);
  assert.match(app.text(), /Cuando registres comidas/);
  app.eval(`setIronView('month')`);
  assert.equal(app.w.document.querySelectorAll('.heat').length, 31);
  assert.deepEqual(app.errors, []);
});
