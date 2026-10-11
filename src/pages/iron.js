'use strict';
/* NutriBook — página Mi hierro (script clásico; comparte el ámbito global con el resto de src/). */

// ═══════════════════════════════════════════════════════════════════════════
// Mi hierro (equilibrio)
// ═══════════════════════════════════════════════════════════════════════════
let ironView = 'week', ironMonth = null;   // ironMonth: primer día del mes mostrado (null = mes actual)
const shownMonth = () => ironMonth || monthStart(today());
function setIronView(v) { ironView = v; renderMain(); }
function shiftMonth(n) { ironMonth = n === 0 ? null : monthShift(shownMonth(), n); renderMain(); }

const segmented = () => `<div class="seg" role="tablist" aria-label="Periodo">${[['week', 'Semana'], ['month', 'Mes']].map(([v, l]) =>
  `<button role="tab" aria-selected="${ironView === v}" class="${ironView === v ? 'on' : ''}" ${on('click', 'setIronView', v)}>${l}</button>`).join('')}</div>`;

function monthNav() {
  const first = shownMonth(), label = parseDate(first).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return `<div class="week-head"><div class="buttons"><button class="btn" ${on('click', 'shiftMonth', -1)} aria-label="Mes anterior">←</button><button class="btn" ${on('click', 'shiftMonth', 0)}>Hoy</button><button class="btn" ${on('click', 'shiftMonth', 1)} aria-label="Mes siguiente">→</button></div>
    <strong class="week-label" style="text-transform:capitalize">${h(label)}</strong></div>`;
}

/** Cuadrícula tipo calendario: un cuadrado por día, coloreado según el hierro comido frente al objetivo. */
function monthHeat(dates) {
  const lead = (parseDate(dates[0]).getDay() + 6) % 7, t = today();
  const cells = [...Array(lead).fill('<i class="heat-blank"></i>'), ...dates.map((d) => {
    const di = dayIron(d), has = d <= t && (di.eaten > 0 || di.unknown > 0), lvl = has ? ironLevel(di.eaten, di.goal) : 'none';
    const mark = { good: '✓', mid: '·', low: '·', none: '' }[lvl];
    return `<button class="heat ${lvl} ${d === t ? 'is-today' : ''}" ${on('click', 'openDay', d)} aria-label="${h(fmtDay(d))}: ${has ? fmtMg(di.eaten) + ' mg' : 'sin registros'}"><b>${parseDate(d).getDate()}</b><small>${has ? fmtMg(di.eaten) : ''}</small><span class="sr">${mark}</span></button>`;
  })];
  return `<div class="heat-grid"><div class="heat-head">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((x) => `<span>${x}</span>`).join('')}</div><div class="heat-body">${cells.join('')}</div></div>
    <div class="legend"><span><i class="lg heat-good"></i>Objetivo cumplido</span><span><i class="lg heat-mid"></i>≥ 60 %</span><span><i class="lg heat-low"></i>Por debajo</span></div>`;
}

function sourcesCard(dates, title = 'De dónde viene tu hierro') {
  const top = topSources(dates);
  return `<div class="card"><div class="card-title">${title}</div>${top.length ? top.map((s) => `<div class="source-row"><span class="source-name">${h(s.name)}${s.count > 1 ? ` <small class="muted">×${s.count}</small>` : ''}</span>
    <span class="source-bar"><i style="width:${Math.max(4, s.share)}%"></i></span><b>${fmtMg(s.mg)} mg</b></div>`).join('') : '<p class="muted small">Cuando registres comidas verás aquí cuáles te aportan más hierro.</p>'}</div>`;
}

function compareLine(cmp, what) {
  if (!cmp) return '';
  const up = cmp.diff >= 0, word = up ? 'más' : 'menos';
  return `<div class="notice">${up ? '📈' : '📉'} Tu media por día registrado es de <b>${fmtMg(cmp.cur)} mg</b>, ${fmtMg(Math.abs(cmp.diff))} mg ${word} (${Math.abs(cmp.pct)} %) que ${what} (${fmtMg(cmp.prev)} mg).</div>`;
}

function statCards(s, streak, periodLabel) {
  return `<div class="grid stats4"><div class="card"><div class="muted small">HIERRO ${periodLabel}</div><div class="metric">${fmtMg(s.total)} mg</div></div>
    <div class="card"><div class="muted small">MEDIA POR DÍA REGISTRADO</div><div class="metric ${ironLevel(s.avg, goalDay())}">${fmtMg(s.avg)} mg</div><small class="muted">objetivo ${goalDay()} mg</small></div>
    <div class="card"><div class="muted small">DÍAS CON OBJETIVO</div><div class="metric">${s.hit} / ${s.pastDays}</div></div>
    <div class="card"><div class="muted small">RACHA</div><div class="metric">${streak > 0 ? '🔥 ' : ''}${streak} ${streak === 1 ? 'día' : 'días'}</div><small class="muted">${streak > 0 ? 'cumpliendo tu objetivo' : 'empieza hoy'}</small></div></div>
    ${s.unknown ? `<p class="small muted">${s.unknown} ${s.unknown === 1 ? 'comida' : 'comidas'} sin dato de hierro (no se cuentan como cero verificado).</p>` : ''}`;
}

function equilibrium() {
  const actions = `<button class="btn primary" ${on('click', 'openQuickAdd')}>+ Registrar</button><button class="btn" ${on('click', 'openEatRecipe', today())}>+ Receta</button>`;
  const head = pageHeader('Mi hierro', 'Lo que has comido de verdad, día a día, frente a tu objetivo.', actions) + segmented();
  const streak = ironStreak();
  if (ironView === 'month') {
    const dates = monthDates(shownMonth()), s = periodStats(dates), prev = monthDates(monthShift(shownMonth(), -1));
    return head + monthNav() +
      statCards(s, streak, 'DEL MES') + compareLine(comparePeriods(dates, prev), 'el mes anterior') + weekAbsorbedNotice(dates, s.total, 'este mes') +
      `<div class="section-head"><h2>Mapa del mes</h2></div><div class="card">${monthHeat(dates)}</div>` +
      `<div class="section-head"><h2>Fuentes</h2></div>${sourcesCard(dates)}`;
  }
  const dates = weekDates(), s = periodStats(dates), prev = weekDates(datePlus(weekStart(), -7)), days = s.days;
  return head + weekNav() + rakBanner(weekStart()) +
  statCards(s, streak, 'DE LA SEMANA') + compareLine(comparePeriods(dates, prev), 'la semana anterior') + weekAbsorbedNotice(dates, s.total) +
  `<div class="section-head"><h2>Hierro por día</h2></div><div class="card">${ironChart(dates)}</div>
  ${sourcesCard(dates)}
  ${supplementsCard()}
  ${labsCard()}
  <div class="section-head"><h2>Detalle</h2></div>
  <div class="day-list">${days.map((x) => dayDetail(x)).join('')}</div>
  ${todayTipsIn(dates)}<div class="notice">💡 La vitamina C (cítricos, pimiento, kiwi) ayuda a absorber el hierro vegetal; el té y el café junto a las comidas lo dificultan. El hierro ingerido no equivale al absorbido: esto no sustituye el seguimiento médico.</div>`;
}

function dayDetail(x) {
  const d = x.d, rows = [];
  for (const f of foodFor(d)) {
    const v = ironVal(f.iron);
    rows.push(`<div class="entry"><span class="entry-meal">${f.supplement ? '💊 ' : ''}${h(f.meal)}</span><span class="entry-name">${h(f.name)}</span><span class="entry-fe ${v === null ? '' : ironLevel(v, goalMeal())}">${v === null ? 'Fe ?' : fmtMg(v) + ' mg'}</span>
      <button class="icon-btn" aria-label="Quitar" ${on('click', 'removeFood', f.id)}>×</button></div>`);
  }
  for (const e of rakOf(d)) {
    rows.push(`<div class="entry"><span class="entry-meal">RAK ${RAK_MEAL[e.service] || ''}</span><span class="entry-name">${h((e.dishes || []).map((z) => z.dish_name).join(', '))}</span><span class="entry-fe ${ironLevel(e.iron_total_mg, goalMeal())}">${fmtMg(e.iron_total_mg)} mg</span>
      <button class="icon-btn" aria-label="Quitar" ${on('click', 'undoRAK', d, e.service)}>×</button></div>`);
  }
  if (d >= today()) {
    for (const m of MEALS) {
      const k = d + '|' + m, r = recipe(state.plan[k]);
      if (!r || eatenFor(k)) continue;
      rows.push(`<div class="entry planned"><span class="entry-meal">${m}</span><span class="entry-name">${h(r.name)} <small>(previsto)</small></span><span class="entry-fe">${ironVal(r.iron) === null ? 'Fe ?' : fmtMg(r.iron) + ' mg'}</span>
        <button class="btn mini" ${on('click', 'toggleEaten', k)}>Comido</button></div>`);
    }
  }
  return `<div class="card day-card ${d === today() ? 'today' : ''}" id="day-${d}"><div class="day-card-head"><div><b>${fmtDay(d)}</b></div>${ironBar(x)}</div>${absorbedLine(d)}
    ${rows.length ? rows.join('') : '<div class="muted small" style="padding:8px 0">Nada registrado.</div>'}
    <div class="buttons day-actions"><button class="btn mini" ${on('click', 'openFoodForm', d)}>+ Comida</button><button class="btn mini" ${on('click', 'openEatRecipe', d)}>+ Receta</button></div></div>`;
}

const defaultMeal = () => { const hr = new Date().getHours(); return hr < 11 ? 'Desayuno' : hr < 16 ? 'Comida' : hr < 19 ? 'Merienda' : 'Cena'; };

function openFoodForm(date) {
  showModal(`${modalTop('Registrar una comida', `<div class="eyebrow">${fmtDay(date)}</div>`)}
    <form ${on('submit', 'addFood', '@el', date)}><div class="form-grid">
      ${field('Momento', `<select name="meal">${MEALS.map((m) => `<option ${m === defaultMeal() ? 'selected' : ''}>${m}</option>`).join('')}</select>`)}
      ${field('Hierro ingerido (mg, opcional)', `<input name="iron" type="number" min="0" step="0.1" placeholder="En blanco si no lo sabes">`)}
      ${field('Tipo de hierro (para estimar la absorción)', `<select name="ironType">${[['', 'No lo sé / automático'], ['heme', 'Animal (carne, pescado)'], ['nonheme', 'Vegetal, huevo o lácteo'], ['mixed', 'Mezcla']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`)}
      ${field('¿Qué has comido? (puede ser fuera de casa)', `<input name="name" required placeholder="Ej. Lentejas con arroz">`, 'wide')}</div>
      <div class="buttons" style="margin-top:15px"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" ${on('click', 'closeModal')}>Cancelar</button></div></form>`);
}
function addFood(form, date) {
  const f = Object.fromEntries(new FormData(form));
  state.consumed.push({ id: eid(), date, meal: f.meal, name: f.name.trim(), iron: f.iron === '' ? null : Number(f.iron), ...(f.ironType ? { ironType: f.ironType } : {}) });
  save(); closeModal(); render(); toast('Comida registrada');
}
function openEatRecipe(date, recipeId) {
  if (!state.recipes.length) { toast('Primero añade una receta.', 'warn'); return; }
  const list = [...state.recipes].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  showModal(`${modalTop('Registrar una receta comida', `<div class="eyebrow">${fmtDay(date)}</div>`)}
    <form ${on('submit', 'addEatRecipe', '@el', date)}><div class="form-grid">
      ${field('Receta', `<select name="recipe">${list.map((r) => `<option value="${h(r.id)}" ${r.id === recipeId ? 'selected' : ''}>${h(r.name)}${ironVal(r.iron) !== null ? ' · ' + fmtMg(r.iron) + ' mg Fe' : ''}</option>`).join('')}</select>`, 'wide')}
      ${field('Raciones comidas', `<input name="portions" type="number" min="0.25" step="0.25" value="1" required>`)}
      ${field('Momento', `<select name="meal">${MEALS.map((m) => `<option ${m === defaultMeal() ? 'selected' : ''}>${m}</option>`).join('')}</select>`)}</div>
      <div class="buttons" style="margin-top:15px"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" ${on('click', 'closeModal')}>Cancelar</button></div></form>`);
}
function addEatRecipe(form, date) {
  const f = Object.fromEntries(new FormData(form)), r = recipe(f.recipe), p = Number(f.portions);
  if (!r || !(p > 0)) return;
  const fe = ironVal(r.iron);
  state.consumed.push({ id: eid(), date, meal: f.meal, name: r.name, iron: fe === null ? null : Math.round(fe * p * 100) / 100, recipeId: r.id });
  save(); closeModal(); render(); toast(fe === null ? 'Registrado (receta sin dato de hierro)' : `+${fmtMg(fe * p)} mg de hierro`);
}
function removeFood(id) {
  const old = state.consumed.find((x) => x.id === id);
  state.consumed = state.consumed.filter((x) => x.id !== id);
  save(); renderMain();
  toast('Registro eliminado', '', { label: 'Deshacer', run: () => { state.consumed.push(old); save(); renderMain(); } });
}
