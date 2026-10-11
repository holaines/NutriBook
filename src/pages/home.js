'use strict';
/* NutriBook — página Inicio (script clásico; comparte el ámbito global con el resto de src/). */

// ═══════════════════════════════════════════════════════════════════════════
// Inicio
// ═══════════════════════════════════════════════════════════════════════════
function home() {
  const d = today(), di = dayIron(d), hour = new Date().getHours();
  const hello = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const missing = Math.max(0, di.goal - di.total);
  const ideas = missing > 0 ? (window.RAK ? RAK.suggestRecipes() : []).slice(0, 2) : [];
  const dates = weekDates(weekStart(0));
  const plannedWeek = dates.reduce((n, x) => n + MEALS.filter((m) => state.plan[x + '|' + m]).length, 0);

  const meals = MEALS.map((m) => {
    const k = d + '|' + m, r = recipe(state.plan[k]), done = eatenFor(k), svc = RAK_SERVICE[m];
    const rakEaten = svc && rakOf(d).find((e) => e.service === svc);
    const best = svc && !rakEaten && window.RAK ? RAK.getBestGlutenFreeCombo(d, svc) : null;
    let body;
    if (rakEaten) body = `<span class="meal-name">🍽 RAK</span><span class="fe good">${fmtMg(rakEaten.iron_total_mg)} mg Fe</span><span class="meal-state">✓ Comido</span>`;
    else if (r) {
      const fe = ironVal(r.iron);
      body = `<button class="link meal-name" ${on('click', 'viewRecipe', r.id)}>${h(r.emoji || '')} ${h(r.name)}</button>
        <span class="fe ${fe === null ? '' : ironLevel(fe, goalMeal())}">${fe === null ? 'Fe ?' : fmtMg(fe) + ' mg Fe'}</span>
        <button class="btn mini ${done ? 'done' : ''}" ${on('click', 'toggleEaten', k)}>${done ? '✓ Comido' : 'Marcar comido'}</button>`;
    } else if (best) {
      body = `<span class="meal-name">🍽 RAK: ${h(best.plat?.dish_name || '')}${best.accompagnement ? ' + ' + h(best.accompagnement.dish_name) : ''}</span>
        <span class="fe ${best.iron_known ? ironLevel(best.iron_total, goalMeal()) : ''}">${best.iron_known ? fmtMg(best.iron_total) + ' mg Fe' : 'Fe ?'}</span>
        <button class="btn mini" ${on('click', 'showRAKModal', d, svc)}>Ver menú</button>`;
    } else body = `<button class="link muted" ${on('click', 'openPlan', '', d, m)}>+ Planificar</button>`;
    return `<div class="meal-row ${done || rakEaten ? 'is-eaten' : ''}"><span class="meal-label">${m}</span>${body}</div>`;
  }).join('');

  return pageHeader(`${hello}${state.profile.name ? ', ' + h(state.profile.name) : ''}`, fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long' }),
    `<button class="btn primary" ${on('click', 'openFoodForm', today())}>+ Registrar comida</button><button class="btn" ${on('click', 'openForm')}>+ Receta</button>`) +
  `<section class="today-grid">
    <div class="card iron-card"><div class="card-title">Hierro de hoy</div>
      <div class="iron-card-body">${ironRing(di)}
        <div class="iron-legend"><div><i class="lg eaten"></i><b>${fmtMg(di.eaten)} mg</b> comidos</div>
          ${absorbedLine(d)}
          ${di.planned > 0 ? `<div><i class="lg plan"></i><b>${fmtMg(di.planned)} mg</b> previstos</div>` : ''}
          <div class="${missing > 0 ? 'need' : 'ok'}">${missing > 0 ? `Te faltan <b>${fmtMg(missing)} mg</b> para tu objetivo` : '✓ ¡Objetivo de hoy cubierto!'}</div>
          ${di.unknown ? `<small class="muted">${di.unknown} comida(s) sin dato de hierro</small>` : ''}</div></div>
      ${tipsHtml(d)}
      ${ideas.length ? `<div class="ideas"><small class="muted">Ideas ricas en hierro:</small>${ideas.map((r) => `<button class="chip-btn" ${on('click', 'viewRecipe', r.id)}>${h(r.emoji || '')} ${h(r.name)} · ${fmtMg(r.iron)} mg</button>`).join('')}</div>` : ''}</div>
    ${(state.supplements || []).length ? supplementsCard() : ''}
    <div class="card"><div class="card-title">Hoy en tu menú <button class="link" ${on('click', 'navigate', 'Calendario')}>Calendario →</button></div>${meals}</div>
  </section>
  <div class="section-head"><h2>Tu semana</h2><button class="btn" ${on('click', 'navigate', 'Equilibrio')}>Ver detalle →</button></div>
  <div class="card">${ironChart(dates)}</div>
  <div class="grid stats"><button class="card stat" ${on('click', 'navigate', 'Recetas')}><span class="muted small">RECETAS</span><span class="metric">${state.recipes.length}</span></button>
    <button class="card stat" ${on('click', 'navigate', 'Calendario')}><span class="muted small">COMIDAS PLANIFICADAS (SEMANA)</span><span class="metric">${plannedWeek}</span></button>
    <button class="card stat" ${on('click', 'navigate', 'Despensa')}><span class="muted small">EN LA DESPENSA</span><span class="metric">${state.pantry.length}</span></button></div>
  <div class="section-head"><h2>Tus recetas recientes</h2><button class="btn" ${on('click', 'navigate', 'Recetas')}>Ver todas →</button></div>
  ${state.recipes.length ? `<div class="grid">${[...state.recipes].reverse().slice(0, 3).map(recipeCard).join('')}</div>`
    : empty('Tu recetario empieza aquí', 'Añade tu primera receta o pega una de internet.', `<div class="buttons center"><button class="btn primary" ${on('click', 'openForm')}>Añadir receta</button><button class="btn" ${on('click', 'openImport')}>Pegar receta</button></div>`)}
  ${!window.NutriCloud?.getUser?.() && window.NutriCloud ? `<div class="notice">Tus datos están solo en este navegador. <button class="link" ${on('click', 'navigate', 'Perfil')}>Inicia sesión en «Mi perfil»</button> para sincronizarlos y no perderlos.</div>` : ''}`;
}
