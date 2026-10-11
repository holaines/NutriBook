'use strict';
/* NutriBook — informe imprimible y CSV para llevar al médico o dietista (script clásico; comparte el ámbito global con el resto de src/). */

let reportDays = 30;
const REPORT_RANGES = [[30, 'Últimos 30 días'], [90, 'Últimos 90 días'], [180, 'Últimos 6 meses']];
const reportDates = (days = reportDays) => Array.from({ length: days }, (_, i) => datePlus(today(), i - days + 1));

/** Datos del informe: un registro por día + resumen. Solo cuentan los días ya pasados con algún registro. */
function buildReport(dates = reportDates()) {
  const rows = dates.map((d) => {
    const di = dayIron(d), ab = dayAbsorbed(d);
    const sup = foodFor(d).filter((x) => x.supplement).reduce((n, x) => n + (ironVal(x.iron) ?? 0), 0);
    return { date: d, eaten: di.eaten, goal: di.goal, hit: di.eaten >= di.goal, supplementMg: Math.round(sup * 100) / 100, absLow: ab.low, absHigh: ab.high, unknown: di.unknown, logged: di.eaten > 0 || di.unknown > 0 };
  });
  const logged = rows.filter((r) => r.logged);
  const sum = (k, list = logged) => list.reduce((n, r) => n + r[k], 0), avg = (k) => (logged.length ? sum(k) / logged.length : 0);
  const eatenVals = logged.map((r) => r.eaten);
  return { from: dates[0], to: dates[dates.length - 1], rows, summary: {
    days: dates.length, loggedDays: logged.length, avg: avg('eaten'), goal: goalDay(), hitDays: logged.filter((r) => r.hit).length,
    hitPct: logged.length ? Math.round(logged.filter((r) => r.hit).length / logged.length * 100) : 0,
    min: eatenVals.length ? Math.min(...eatenVals) : 0, max: eatenVals.length ? Math.max(...eatenVals) : 0,
    supplementDays: logged.filter((r) => r.supplementMg > 0).length, avgAbsLow: avg('absLow'), avgAbsHigh: avg('absHigh'), unknown: sum('unknown', rows),
  }, labs: sortedLabs().filter((l) => l.date >= dates[0] && l.date <= dates[dates.length - 1]), supplements: state.supplements || [] };
}

// ───────── CSV (separador «;» y coma decimal, para abrirlo directamente en Excel en español) ─────────
const csvNum = (n) => String(Math.round(Number(n) * 100) / 100).replace('.', ',');
const csvCell = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function toCsv(header, rows) { return [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'; }
function reportCsv(rep = buildReport()) {
  return toCsv(['fecha', 'hierro_mg', 'objetivo_mg', 'cumple_objetivo', 'complementos_mg', 'absorcion_estimada_min_mg', 'absorcion_estimada_max_mg', 'comidas_sin_dato'],
    rep.rows.filter((r) => r.logged).map((r) => [r.date, csvNum(r.eaten), csvNum(r.goal), r.hit ? 'sí' : 'no', csvNum(r.supplementMg), csvNum(r.absLow), csvNum(r.absHigh), r.unknown]));
}
function downloadReportCsv() {
  const url = URL.createObjectURL(new Blob(['﻿' + reportCsv()], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = `nutribook-informe-${today()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 300);
}

// ───────── Página ─────────
function setReportDays(n) { reportDays = Number(n) || 30; renderMain(); }
function printReport() { window.print(); }
function report() {
  const rep = buildReport(), s = rep.summary, fmtD = (d) => fmtDay(d, { day: 'numeric', month: 'long', year: 'numeric' });
  const name = state.profile.name ? ` · ${h(state.profile.name)}` : '';
  return pageHeader('Informe de hierro', 'Un resumen para enseñar a tu médico o dietista.',
    `<button class="btn primary" ${on('click', 'printReport')}>🖨 Imprimir / guardar PDF</button><button class="btn" ${on('click', 'downloadReportCsv')}>↓ Descargar CSV</button><button class="btn" ${on('click', 'navigate', 'Equilibrio')}>← Mi hierro</button>`) +
  `<div class="seg no-print" role="radiogroup" aria-label="Periodo del informe">${REPORT_RANGES.map(([n, l]) => `<button role="radio" aria-checked="${reportDays === n}" class="${reportDays === n ? 'on' : ''}" ${on('click', 'setReportDays', n)}>${l}</button>`).join('')}</div>
  <div class="card report" id="report-sheet">
    <h2>Seguimiento de hierro${name}</h2>
    <p class="muted">Del ${h(fmtD(rep.from))} al ${h(fmtD(rep.to))} · generado con NutriBook el ${h(fmtD(today()))}</p>
    ${s.loggedDays ? `<div class="report-grid">
      <div><span class="muted small">Días con registro</span><b>${s.loggedDays} de ${s.days}</b></div>
      <div><span class="muted small">Hierro medio por día registrado</span><b>${fmtMg(s.avg)} mg</b></div>
      <div><span class="muted small">Objetivo diario</span><b>${fmtMg(s.goal)} mg</b></div>
      <div><span class="muted small">Días que llegó al objetivo</span><b>${s.hitDays} (${s.hitPct} %)</b></div>
      <div><span class="muted small">Día más bajo / más alto</span><b>${fmtMg(s.min)} / ${fmtMg(s.max)} mg</b></div>
      <div><span class="muted small">Absorción estimada media</span><b>${fmtMg(s.avgAbsLow)}–${fmtMg(s.avgAbsHigh)} mg</b></div>
      <div><span class="muted small">Días con suplemento</span><b>${s.supplementDays}</b></div></div>` : '<p class="muted">No hay comidas registradas en este periodo.</p>'}
    ${rep.supplements.length ? `<h3>Complementos</h3><ul>${rep.supplements.map((x) => `<li>${h(x.name)} · ${fmtMg(x.ironMg)} mg de hierro por toma</li>`).join('')}</ul>` : ''}
    ${rep.labs.length ? `<h3>Análisis de sangre</h3><table class="report-table"><thead><tr><th>Fecha</th><th>Ferritina (µg/L)</th><th>Hemoglobina (g/dL)</th><th>Notas</th></tr></thead><tbody>${rep.labs.map((l) => `<tr><td>${h(fmtD(l.date))}</td><td>${l.ferritin ?? '—'}</td><td>${l.hemoglobin ?? '—'}</td><td>${h(l.notes || '')}</td></tr>`).join('')}</tbody></table>` : ''}
    ${s.loggedDays ? `<h3>Detalle diario</h3><table class="report-table"><thead><tr><th>Fecha</th><th>Hierro (mg)</th><th>Objetivo</th><th>Complementos</th></tr></thead><tbody>${rep.rows.filter((r) => r.logged).map((r) => `<tr><td>${h(fmtDay(r.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</td><td>${fmtMg(r.eaten)}</td><td>${r.hit ? '✓' : '—'}</td><td>${r.supplementMg ? fmtMg(r.supplementMg) + ' mg' : ''}</td></tr>`).join('')}</tbody></table>` : ''}
    <p class="small muted">Los valores son estimaciones a partir de lo que se ha registrado (tablas de composición y cálculos propios); las comidas sin dato no se cuentan como cero. NutriBook no diagnostica ni sustituye la valoración de un profesional sanitario.</p>
  </div>`;
}
