'use strict';
/* NutriBook — análisis de sangre (ferritina, hemoglobina) frente al hierro ingerido (script clásico; comparte el ámbito global con el resto de src/).
   Solo muestra tus valores y tu ingesta: no los interpreta ni diagnostica. */

const LAB_LIMITS = { ferritin: [0, 5000], hemoglobin: [3, 25] };

const sortedLabs = () => [...(state.labs || [])].sort((a, b) => a.date.localeCompare(b.date));

/** Media de hierro comido por día registrado en los `days` días anteriores a `date`: { avg, days } */
function avgIronBefore(date, days = 30) {
  const vals = [];
  for (let i = 1; i <= days; i++) {
    const d = datePlus(date, -i), di = dayIron(d);
    if (di.eaten > 0 || di.unknown > 0) vals.push(di.eaten);
  }
  return { avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, days: vals.length };
}

/** Gráfico de línea SVG con N puntos [{ date, value }]. 0 puntos: nada; 1 punto: solo el punto. */
function labChart(points, unit) {
  if (!points.length) return '';
  const W = 320, H = 96, P = 14, vs = points.map((p) => p.value), min = Math.min(...vs), max = Math.max(...vs), span = max - min || 1;
  const t0 = parseDate(points[0].date).getTime(), t1 = parseDate(points[points.length - 1].date).getTime(), ts = t1 - t0 || 1;
  const xy = points.map((p) => [P + (points.length === 1 ? (W - 2 * P) / 2 : (parseDate(p.date).getTime() - t0) / ts * (W - 2 * P)), H - P - (p.value - min) / span * (H - 2 * P)]);
  const line = points.length > 1 ? `<polyline class="lab-line" points="${xy.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}"/>` : '';
  const dots = xy.map(([x, y], i) => `<circle class="lab-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"><title>${h(fmtDay(points[i].date, { day: 'numeric', month: 'short', year: 'numeric' }))}: ${fmtMg(points[i].value)} ${h(unit)}</title></circle>`).join('');
  const last = points[points.length - 1];
  return `<svg class="lab-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución: último valor ${fmtMg(last.value)} ${h(unit)}">${line}${dots}
    <text x="${W - P}" y="12" text-anchor="end" class="lab-last">${fmtMg(last.value)} ${h(unit)}</text></svg>`;
}

function labsCard() {
  const labs = sortedLabs();
  const series = (key) => labs.filter((l) => l[key] != null).map((l) => ({ date: l.date, value: l[key] }));
  const rows = [...labs].reverse().map((l) => {
    const a = avgIronBefore(l.date);
    return `<div class="entry"><span class="entry-meal">${h(fmtDay(l.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
      <span class="entry-name">${l.ferritin != null ? `Ferritina <b>${fmtMg(l.ferritin)}</b> µg/L` : ''}${l.ferritin != null && l.hemoglobin != null ? ' · ' : ''}${l.hemoglobin != null ? `Hemoglobina <b>${fmtMg(l.hemoglobin)}</b> g/dL` : ''}
        <small class="muted">${a.days ? `· hierro medio los 30 días previos: ${fmtMg(a.avg)} mg/día (${a.days} ${a.days === 1 ? 'día registrado' : 'días registrados'})` : '· sin registros de comidas en los 30 días previos'}${l.notes ? ' · ' + h(l.notes) : ''}</small></span>
      <button class="icon-btn" aria-label="Editar análisis" ${on('click', 'openLabForm', l.id)}>✎</button></div>`;
  }).join('');
  const fer = series('ferritin'), hb = series('hemoglobin');
  return `<div class="card"><div class="card-title">Análisis de sangre <button class="link" ${on('click', 'openLabForm')}>+ Añadir</button></div>
    ${labs.length ? `<div class="lab-charts">${fer.length ? `<div><small class="muted">Ferritina (µg/L)</small>${labChart(fer, 'µg/L')}</div>` : ''}${hb.length ? `<div><small class="muted">Hemoglobina (g/dL)</small>${labChart(hb, 'g/dL')}</div>` : ''}</div>${rows}`
      : '<p class="muted small">Guarda aquí tus resultados (ferritina, hemoglobina) para verlos junto a lo que comes. Es solo un registro: tu médico es quien los interpreta.</p>'}
    <p class="small muted">Cada laboratorio indica su propio rango de referencia. NutriBook no interpreta ni diagnostica.</p></div>`;
}

function openLabForm(id) {
  const l = (state.labs || []).find((x) => x.id === id) || { date: today(), ferritin: '', hemoglobin: '', notes: '' };
  showModal(`${modalTop(id ? 'Editar análisis' : 'Nuevo análisis')}
    <form ${on('submit', 'saveLab', '@el', id || '')}><div class="form-grid">
      ${field('Fecha', `<input type="date" name="date" required value="${h(l.date)}" max="${today()}">`, 'wide')}
      ${field('Ferritina (µg/L)', `<input name="ferritin" type="number" step="0.1" min="0" value="${h(l.ferritin ?? '')}">`)}
      ${field('Hemoglobina (g/dL)', `<input name="hemoglobin" type="number" step="0.1" min="0" value="${h(l.hemoglobin ?? '')}">`)}
      ${field('Notas (opcional)', `<input name="notes" value="${h(l.notes || '')}" maxlength="200">`, 'wide')}</div>
      <div class="buttons" style="margin-top:15px"><button class="btn primary" type="submit">Guardar</button>
        ${id ? `<button class="btn danger" type="button" ${on('click', 'removeLab', id)}>Eliminar</button>` : ''}<button class="btn" type="button" ${on('click', 'closeModal')}>Cancelar</button></div></form>`);
}
function saveLab(form, id) {
  const f = Object.fromEntries(new FormData(form));
  const num = (v, [lo, hi]) => (v === '' ? null : Number(v) >= lo && Number(v) <= hi ? Number(v) : NaN);
  const ferritin = num(f.ferritin, LAB_LIMITS.ferritin), hemoglobin = num(f.hemoglobin, LAB_LIMITS.hemoglobin);
  if (Number.isNaN(ferritin) || Number.isNaN(hemoglobin)) { toast('Revisa los valores: parecen fuera de rango', 'warn'); return; }
  if (ferritin === null && hemoglobin === null) { toast('Indica al menos la ferritina o la hemoglobina', 'warn'); return; }
  if (!f.date || f.date > today()) { toast('La fecha no puede ser futura', 'warn'); return; }
  const lab = { id: id || eid(), date: f.date, ferritin, hemoglobin, notes: (f.notes || '').trim() };
  state.labs = id ? state.labs.map((x) => (x.id === id ? lab : x)) : [...(state.labs || []), lab];
  save(); closeModal(); render();
}
function removeLab(id) {
  const old = (state.labs || []).find((x) => x.id === id);
  state.labs = (state.labs || []).filter((x) => x.id !== id);
  save(); closeModal(); render();
  toast('Análisis eliminado', '', { label: 'Deshacer', run: () => { state.labs.push(old); save(); render(); } });
}
