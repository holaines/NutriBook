'use strict';
/* NutriBook — página Mi hierro (script clásico; comparte el ámbito global con el resto de src/). */

// ═══════════════════════════════════════════════════════════════════════════
// Mi hierro (equilibrio)
// ═══════════════════════════════════════════════════════════════════════════
function equilibrium() {
  const dates = weekDates(), days = dates.map((d) => ({ d, ...dayIron(d) })), t = today();
  const past = days.filter((x) => x.d <= t);
  const logged = past.filter((x) => x.eaten > 0 || x.unknown > 0);   // la media solo cuenta días con algún registro
  const total = days.reduce((n, x) => n + x.eaten, 0);
  const avg = logged.length ? logged.reduce((n, x) => n + x.eaten, 0) / logged.length : 0;
  const hit = past.filter((x) => x.eaten >= x.goal).length;
  const unknown = days.reduce((n, x) => n + x.unknown, 0);
  return pageHeader('Mi hierro', 'Lo que has comido de verdad, día a día, frente a tu objetivo.',
    `<button class="btn primary" ${on('click', 'openFoodForm', today())}>+ Comida</button><button class="btn" ${on('click', 'openEatRecipe', today())}>+ Receta</button>`) +
  weekNav() + rakBanner(weekStart()) +
  `<div class="grid stats4"><div class="card"><div class="muted small">HIERRO DE LA SEMANA</div><div class="metric">${fmtMg(total)} mg</div></div>
    <div class="card"><div class="muted small">MEDIA POR DÍA REGISTRADO</div><div class="metric ${ironLevel(avg, goalDay())}">${fmtMg(avg)} mg</div><small class="muted">objetivo ${goalDay()} mg</small></div>
    <div class="card"><div class="muted small">DÍAS CON OBJETIVO</div><div class="metric">${hit} / ${past.length}</div></div>
    <div class="card"><div class="muted small">COMIDAS SIN DATO</div><div class="metric">${unknown}</div></div></div>
  ${weekAbsorbedNotice(dates, total)}
  <div class="section-head"><h2>Hierro por día</h2></div><div class="card">${ironChart(dates)}</div>
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
