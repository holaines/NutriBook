'use strict';
/* NutriBook — página Calendario (script clásico; comparte el ámbito global con el resto de src/). */

// ═══════════════════════════════════════════════════════════════════════════
// Calendario
// ═══════════════════════════════════════════════════════════════════════════
function calendar() {
  const start = weekStart(), dates = weekDates(start), days = dates.map(dayIron);
  const counted = dates.map((d, i) => ({ d, di: days[i] })).filter((x) => x.d >= today() || x.di.eaten > 0);
  const avg = counted.length ? counted.reduce((n, x) => n + x.di.total, 0) / counted.length : 0;
  const planned = dates.reduce((n, d) => n + MEALS.filter((m) => state.plan[d + '|' + m]).length, 0);
  return pageHeader('Mi planificación', 'Planifica tus comidas y mira el hierro de cada día de un vistazo.',
    `<button class="btn" ${on('click', 'openSuggestWeek')}>✨ Sugerir semana</button><button class="btn" ${on('click', 'copyWeek')}>📋 Copiar a la siguiente</button><button class="btn primary" ${on('click', 'navigate', 'Compra', {keepWeek:true})}>🛒 Lista de la compra</button>`) +
  weekNav(`<span class="week-stat">⚡ Media prevista: <b>${fmtMg(avg)}</b> / ${goalDay()} mg al día · ${planned} ${planned === 1 ? 'comida planificada' : 'comidas planificadas'}</span>`) +
  rakBanner(start) +
  dayStrip(dates, days) +
  `<div class="calendar">${dates.map((d, i) => dayCard(d, days[i])).join('')}</div>
   <div class="notice">«Sugerir semana» solo rellena huecos vacíos y te enseña la propuesta antes de aplicarla. En el ordenador puedes arrastrar una receta a otro hueco. Las barras suman lo ya comido (color fuerte) y lo previsto (claro): recetas planificadas y mejor opción del RAK. No sustituye una evaluación nutricional.</div>`;
}

function dayCard(d, di) {
  const day = parseDate(d);
  return `<div class="day ${d === today() ? 'today' : ''} ${d < today() ? 'past' : ''} ${d === selectedDay() ? 'is-sel' : ''}" id="cal-${d}">
    <div class="day-head"><div><div class="day-title">${day.toLocaleDateString('es-ES', { weekday: 'long' })}</div><div class="day-date">${day.getDate()}</div></div>${ironBar(di, true)}</div>
    ${MEALS.map((m) => slot(d, m)).join('')}</div>`;
}

function slot(d, m) {
  const k = d + '|' + m, r = recipe(state.plan[k]), done = eatenFor(k), svc = RAK_SERVICE[m];
  const fe = r ? ironVal(r.iron) : null;
  const drag = r && !done ? ` draggable="true" ${on('dragstart', 'dragSlot', k, '@event')}` : '';
  return `<div class="slot ${done ? 'is-eaten' : ''}"${drag} ${on('dragover', 'allowDrop')} ${on('drop', 'dropSlot', k, '@event')}><div class="slot-label">${m}</div>
    <select aria-label="${m} ${d}" ${on('change', 'setPlan', k, '@value')}><option value="">+ Elegir receta</option>${state.recipes.map((x) => `<option value="${h(x.id)}" ${x.id === state.plan[k] ? 'selected' : ''}>${h(x.name)}</option>`).join('')}</select>
    ${r ? `<div class="slot-recipe"><button class="link" ${on('click', 'viewRecipe', r.id)}>Ver receta</button>
      <span class="fe ${fe === null ? '' : ironLevel(fe, goalMeal())}">${fe === null ? 'Fe ?' : fmtMg(fe) + ' mg'}</span>
      <button class="btn mini ${done ? 'done' : ''}" ${on('click', 'toggleEaten', k)} title="${done ? 'Quitar de lo comido' : 'Cuenta este plato en tu hierro del día'}">${done ? '✓ Comido' : 'Comido'}</button></div>` : ''}
    ${svc ? `<div class="rak-slot">${rakSlot(d, svc)}</div>` : ''}</div>`;
}

function setPlan(key, value) {
  if (value) state.plan[key] = value; else delete state.plan[key];
  // Si se cambia la receta de un hueco ya marcado como comido, se quita el registro anterior
  const old = eatenFor(key);
  if (old && old.recipeId !== value) state.consumed = state.consumed.filter((x) => x !== old);
  save(); renderMain();
}

/** Marca/desmarca una comida planificada como comida: así entra en «Mi hierro». */
function toggleEaten(key) {
  const [date, meal] = key.split('|'), r = recipe(state.plan[key]), old = eatenFor(key);
  if (old) { state.consumed = state.consumed.filter((x) => x !== old); save(); renderMain(); return; }
  if (!r) return;
  state.consumed.push({ id: eid(), date, meal, name: r.name, iron: ironVal(r.iron), recipeId: r.id, planKey: key });
  save(); renderMain();
  toast(ironVal(r.iron) === null ? 'Marcado como comido (esta receta no tiene dato de hierro)' : `+${fmtMg(r.iron)} mg de hierro registrados`);
}

function openPlan(recipeId, date, meal) {
  if (!state.recipes.length) { toast('Primero añade una receta.', 'warn'); return; }
  const d = date || today();
  showModal(`${modalTop('Añadir al calendario')}
    <form ${on('submit', 'savePlan', '@el')}><div class="form-grid">
      ${field('Receta', `<select name="recipe">${state.recipes.map((r) => `<option value="${h(r.id)}" ${r.id === recipeId ? 'selected' : ''}>${h(r.name)}</option>`).join('')}</select>`, 'wide')}
      ${field('Día', `<input type="date" name="date" value="${d}" required>`)}
      ${field('Comida', `<select name="meal">${MEALS.map((m) => `<option ${m === (meal || 'Comida') ? 'selected' : ''}>${m}</option>`).join('')}</select>`)}</div>
      <div class="buttons" style="margin-top:15px"><button class="btn primary" type="submit">Añadir</button><button class="btn" type="button" ${on('click', 'closeModal')}>Cancelar</button></div></form>`);
}
function savePlan(form) {
  const f = Object.fromEntries(new FormData(form));
  setPlan(f.date + '|' + f.meal, f.recipe);
  closeModal();
  toast(`Añadido: ${fmtDay(f.date)} · ${f.meal}`, '', { label: 'Ver calendario', run: () => { weekOffset = Math.round((parseDate(mondayOf(f.date)) - parseDate(mondayOf(today()))) / (7 * 864e5)); navigate('Calendario', { keepWeek: true }); } });
}

// ───────── Vista de un día en móvil (selector + deslizar) ─────────
let calSel = null;
const selectedDay = (dates = weekDates()) => (dates.includes(calSel) ? calSel : dates.includes(today()) ? today() : dates[0]);
function dayStrip(dates, days) {
  const sel = selectedDay(dates);
  return `<div class="day-strip" role="tablist" aria-label="Días de la semana">${dates.map((d, i) => {
    const day = parseDate(d);
    return `<button role="tab" aria-selected="${d === sel}" class="${d === sel ? 'on' : ''} ${d === today() ? 'is-today' : ''}" ${on('click', 'calSelect', d)}>
      <small>${day.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}</small><b>${day.getDate()}</b><i class="dot ${days[i].level}"></i></button>`;
  }).join('')}</div>`;
}
function calSelect(d) { calSel = d; renderMain(); }
/** Desplaza el día seleccionado; al salir de la semana cambia de semana. */
function calShift(n) {
  const dates = weekDates(), i = dates.indexOf(selectedDay(dates)) + n;
  if (i >= 0 && i < 7) { calSelect(dates[i]); return; }
  calSel = datePlus(dates[0], i < 0 ? -1 : 7); shiftWeek(i < 0 ? -1 : 1);
}
let swipeX = null;
document.addEventListener('touchstart', (e) => { swipeX = e.target.closest?.('.calendar') && page === 'Calendario' ? e.changedTouches[0].clientX : null; }, { passive: true });
document.addEventListener('touchend', (e) => {
  if (swipeX === null) return;
  const dx = e.changedTouches[0].clientX - swipeX; swipeX = null;
  if (Math.abs(dx) > 60 && window.innerWidth <= 750) calShift(dx < 0 ? 1 : -1);
}, { passive: true });

// ───────── Arrastrar y soltar recetas entre huecos (ordenador) ─────────
function dragSlot(key, ev) { ev.dataTransfer.setData('text/plain', key); ev.dataTransfer.effectAllowed = 'move'; }
function allowDrop() { /* events.js ya cancela dragover: el hueco acepta soltar */ }
function dropSlot(to, ev) {
  const from = ev.dataTransfer.getData('text/plain'), next = moveSlotPlan(state.plan, from, to, (k) => Boolean(eatenFor(k)));
  if (!next) return;
  const before = { ...state.plan };
  state.plan = next; save(); renderMain();
  toast('Receta movida', '', { label: 'Deshacer', run: () => { state.plan = before; save(); renderMain(); } });
}

// ───────── Sugerir y copiar semana ─────────
let suggestSeed = 1;
function suggestionFor(seed) {
  const dates = weekDates(), skip = new Set();
  for (const d of dates) for (const [m, svc] of Object.entries(RAK_SERVICE)) if (window.RAK && RAK.getBestGlutenFreeCombo(d, svc)) skip.add(d + '|' + m);   // el RAK ya cubre ese hueco
  return planWeek({ recipes: state.recipes, plan: state.plan, dates, goal: goalDay(), seed, from: today(), skip });
}
function openSuggestWeek(seed = 1) {
  if (!state.recipes.length) { toast('Añade primero alguna receta.', 'warn'); return; }
  suggestSeed = seed;
  const { assign, totals } = suggestionFor(seed), dates = weekDates().filter((d) => d >= today());
  if (!Object.keys(assign).length) { toast('No quedan huecos libres que rellenar esta semana'); return; }
  const rows = dates.map((d) => {
    const items = PLAN_ORDER.filter((m) => assign[d + '|' + m]).sort((a, b) => MEALS.indexOf(a) - MEALS.indexOf(b)).map((m) => {
      const r = recipe(assign[d + '|' + m]), fe = ironVal(r.iron);
      return `<div class="entry"><span class="entry-meal">${m}</span><span class="entry-name">${h(r.name)}</span><span class="entry-fe ${fe === null ? '' : ironLevel(fe, goalMeal())}">${fe === null ? 'Fe ?' : fmtMg(fe) + ' mg'}</span></div>`;
    }).join('');
    return items ? `<div class="suggest-day"><b>${h(fmtDay(d))}</b> <small class="muted">· ${fmtMg(totals[d])} / ${goalDay()} mg planificados</small>${items}</div>` : '';
  }).join('');
  showModal(`${modalTop('Propuesta para tu semana', '<div class="eyebrow">Solo se rellenan huecos libres</div>')}
    <div class="suggest-list">${rows}</div>
    <p class="small muted">Se reparte el hierro para acercarte a tu objetivo, priorizando tus favoritas y sin repetir demasiado. Los huecos con menú del RAK adaptable se dejan libres.</p>
    <div class="buttons" style="margin-top:12px"><button class="btn primary" ${on('click', 'applySuggestion')}>Aplicar propuesta</button><button class="btn" ${on('click', 'openSuggestWeek', seed + 1)}>Otra propuesta</button><button class="btn" ${on('click', 'closeModal')}>Cancelar</button></div>`);
}
function applySuggestion() {
  const { assign } = suggestionFor(suggestSeed), keys = Object.keys(assign);
  Object.assign(state.plan, assign);
  save(); closeModal(); render();
  toast(`${keys.length} comidas añadidas a tu semana`, '', { label: 'Deshacer', run: () => { keys.forEach((k) => delete state.plan[k]); save(); renderMain(); } });
}
function copyWeek() {
  const { added } = copyWeekPlan(state.plan, weekStart(), datePlus(weekStart(), 7)), keys = Object.keys(added);
  if (!keys.length) { toast('No hay nada que copiar (o la semana siguiente ya está planificada)'); return; }
  Object.assign(state.plan, added);
  save(); renderMain();
  toast(`${keys.length} comidas copiadas a la semana siguiente`, '', { label: 'Deshacer', run: () => { keys.forEach((k) => delete state.plan[k]); save(); renderMain(); } });
}
