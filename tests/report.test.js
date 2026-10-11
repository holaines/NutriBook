import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './helpers/loadApp.js';

const css = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'), 'utf8');
const NOW = '2026-10-20T10:00:00';
const e = (date, iron, extra = {}) => ({ id: date + iron + (extra.name || ''), date, meal: 'Comida', name: 'Plato', iron, ...extra });
const data = {
  consumed: [e('2026-10-19', 17.5, { name: 'Lentejas; con "ajo"\ny comino' }), e('2026-10-18', 6), e('2026-10-10', 16), e('2026-10-05', 14, { name: 'Suplemento', supplement: true, supId: 's', meal: 'Suplemento' }), e('2026-08-01', 99)],
  supplements: [{ id: 's', name: 'Hierro bisglicinato', ironMg: 14 }], labs: [{ id: 'l1', date: '2026-10-01', ferritin: 18, hemoglobin: 12.4, notes: 'control' }, { id: 'l0', date: '2026-01-01', ferritin: 9, hemoglobin: null, notes: '' }],
  profile: { name: 'Inès', ironDailyGoal: 16, onboarded: true },
};

/** Lector CSV mínimo (separador «;», comillas dobles) para comprobar que lo exportado se puede volver a leer. */
const parseCsv = (text) => {
  const rows = []; let row = [], cell = '', q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ';') { row.push(cell); cell = ''; } else if (c === '\r') { /* se ignora */ } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  return rows;
};
const num = (s) => Number(String(s).replace(',', '.'));

test('buildReport: resumen coherente con dayIron (media, días con objetivo, mínimo y máximo)', async () => {
  const app = await loadApp({ now: NOW, data });
  const rep = app.eval(`buildReport(reportDates(30))`);
  const s = rep.summary;
  assert.equal(rep.rows.length, 30); assert.equal(rep.to, '2026-10-20'); assert.equal(rep.from, '2026-09-21');
  assert.equal(s.loggedDays, 4);
  const eaten = [17.5, 6, 16, 14];
  assert.ok(Math.abs(s.avg - eaten.reduce((a, b) => a + b) / 4) < 1e-9);
  assert.equal(s.hitDays, 2); assert.equal(s.hitPct, 50); assert.equal(s.min, 6); assert.equal(s.max, 17.5); assert.equal(s.supplementDays, 1);
  for (const r of rep.rows) assert.equal(r.eaten, app.eval(`dayIron('${r.date}').eaten`), r.date);
  assert.equal(rep.rows.some((r) => r.date === '2026-08-01'), false, 'fuera del periodo');
  assert.deepEqual(rep.labs.map((l) => l.id), ['l1'], 'solo los análisis del periodo');
});

test('CSV: cabecera, solo días con registro, coma decimal, «sí/no» y se vuelve a leer igual que dayIron', async () => {
  const app = await loadApp({ now: NOW, data });
  const csv = app.eval(`reportCsv(buildReport(reportDates(30)))`);
  assert.ok(csv.endsWith('\r\n'));
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], ['fecha', 'hierro_mg', 'objetivo_mg', 'cumple_objetivo', 'complementos_mg', 'absorcion_estimada_min_mg', 'absorcion_estimada_max_mg', 'comidas_sin_dato']);
  assert.equal(rows.length - 1, 4);
  assert.match(csv, /2026-10-19;17,5;16;sí;0;/);
  assert.match(csv, /2026-10-18;6;16;no;/);
  for (const r of rows.slice(1)) { assert.equal(num(r[1]), app.eval(`dayIron('${r[0]}').eaten`)); assert.equal(r[3], num(r[1]) >= num(r[2]) ? 'sí' : 'no'); }
  const sup = rows.find((r) => r[0] === '2026-10-05');
  assert.equal(num(sup[4]), 14);
});

test('toCsv: escapa «;», comillas y saltos de línea y se re-lee idéntico', async () => {
  const app = await loadApp();
  const cells = ['simple', 'con ; punto y coma', 'con "comillas"', 'dos\nlíneas', '', 'ñandú ½ µg'];
  const csv = app.eval(`toCsv(['a','b','c','d','e','f'], [${JSON.stringify(cells)}])`);
  assert.deepEqual(parseCsv(csv)[1], cells);
  assert.deepEqual(parseCsv(csv)[0], ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('página Informe: resumen, complementos, análisis del periodo y detalle diario; cambia de periodo', async () => {
  const app = await loadApp({ now: NOW, data });
  await app.go('Informe');
  const t = app.text();
  assert.match(t, /Seguimiento de hierro · Inès/); assert.match(t, /Días con registro4 de 30/); assert.match(t, /Hierro medio por día registrado13,4 mg/);
  assert.match(t, /Hierro bisglicinato · 14 mg/); assert.match(t, /Ferritina \(µg\/L\)/); assert.match(t, /control/); assert.doesNotMatch(t, /\b9\b.*—.*Hemoglobina/);
  assert.match(t, /Detalle diario/); assert.match(t, /no diagnostica/);
  app.eval(`document.querySelector('[data-click="setReportDays"][data-args="[180]"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  assert.equal(app.eval(`reportDays`), 180);
  assert.match(app.text(), /Días con registro5 de 180/);
  assert.match(app.text(), /9<|—/.source ? /Ferritina/ : /x/);
  assert.deepEqual(app.errors, []);
});

test('Informe vacío: no inventa datos', async () => {
  const app = await loadApp({ now: NOW });
  await app.go('Informe');
  assert.match(app.text(), /No hay comidas registradas en este periodo/);
  assert.doesNotMatch(app.text(), /Detalle diario/);
  assert.equal(app.eval(`reportCsv(buildReport())`).trim().split('\n').length, 1, 'solo la cabecera');
});

test('imprimir y descargar: llaman a window.print y generan un CSV con BOM para Excel', async () => {
  const app = await loadApp({ now: NOW, data });
  await app.go('Informe');
  app.eval(`window.__printed = 0; window.print = () => { window.__printed++; }`);
  app.eval(`document.querySelector('[data-click="printReport"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  assert.equal(app.eval(`window.__printed`), 1);
  app.eval(`window.__blob = null; window.__name = null; URL.createObjectURL = (b) => { window.__blob = b; return 'blob:x'; }; URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () { window.__name = this.download; };`);
  app.eval(`downloadReportCsv()`);
  assert.equal(app.eval(`window.__name`), 'nutribook-informe-2026-10-20.csv');
  assert.equal(app.eval(`window.__blob.type`), 'text/csv;charset=utf-8');
  const text = await app.eval(`window.__blob.text()`);
  assert.ok(text.startsWith('﻿fecha;hierro_mg'));
});

test('navegación: «Informe» sale en «Más» y en Mi hierro; el CSS de impresión oculta el menú y los botones', async () => {
  const app = await loadApp({ now: NOW });
  assert.ok(app.eval(`PAGES.some((p) => p.id === 'Informe')`));
  await app.go('Equilibrio');
  assert.match(app.html(), /data-click="navigate" data-args="\[&quot;Informe&quot;\]"/);
  app.eval(`openMore()`);
  assert.match(app.w.document.getElementById('modal-root').textContent, /Informe/);
  const print = css.match(/@media print \{([\s\S]*?)\n\}\n/)[1];
  assert.match(print, /\.sidebar/); assert.match(print, /\.fab/); assert.match(print, /display: none !important/); assert.match(print, /--cream: #fff/);
});
