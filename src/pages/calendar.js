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
    `<button class="btn" onclick="generateWeek()">✨ Sugerir semana</button><button class="btn primary" onclick="navigate('Compra',{keepWeek:true})">🛒 Lista de la compra</button>`) +
  weekNav(`<span class="week-stat">⚡ Media prevista: <b>${fmtMg(avg)}</b> / ${goalDay()} mg al día · ${planned} comidas planificadas</span>`) +
  rakBanner(start) +
  `<div class="calendar">${dates.map((d, i) => dayCard(d, days[i])).join('')}</div>
   <div class="notice">«Sugerir semana» solo rellena huecos vacíos, previa confirmación. Las barras suman lo ya comido (color fuerte) y lo previsto (claro): recetas planificadas y mejor opción del RAK. No sustituye una evaluación nutricional.</div>`;
}

function dayCard(d, di) {
  const day = parseDate(d);
  return `<div class="day ${d === today() ? 'today' : ''} ${d < today() ? 'past' : ''}" id="cal-${d}">
    <div class="day-head"><div><div class="day-title">${day.toLocaleDateString('es-ES', { weekday: 'long' })}</div><div class="day-date">${day.getDate()}</div></div>${ironBar(di, true)}</div>
    ${MEALS.map((m) => slot(d, m)).join('')}</div>`;
}

function slot(d, m) {
  const k = d + '|' + m, r = recipe(state.plan[k]), done = eatenFor(k), svc = RAK_SERVICE[m];
  const fe = r ? ironVal(r.iron) : null;
  return `<div class="slot ${done ? 'is-eaten' : ''}"><div class="slot-label">${m}</div>
    <select aria-label="${m} ${d}" onchange="setPlan(${q(k)},this.value)"><option value="">+ Elegir receta</option>${state.recipes.map((x) => `<option value="${h(x.id)}" ${x.id === state.plan[k] ? 'selected' : ''}>${h(x.name)}</option>`).join('')}</select>
    ${r ? `<div class="slot-recipe"><button class="link" onclick="viewRecipe(${q(r.id)})">Ver receta</button>
      <span class="fe ${fe === null ? '' : ironLevel(fe, goalMeal())}">${fe === null ? 'Fe ?' : fmtMg(fe) + ' mg'}</span>
      <button class="btn mini ${done ? 'done' : ''}" onclick="toggleEaten(${q(k)})" title="${done ? 'Quitar de lo comido' : 'Cuenta este plato en tu hierro del día'}">${done ? '✓ Comido' : 'Comido'}</button></div>` : ''}
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
    <form onsubmit="event.preventDefault();savePlan(this)"><div class="form-grid">
      ${field('Receta', `<select name="recipe">${state.recipes.map((r) => `<option value="${h(r.id)}" ${r.id === recipeId ? 'selected' : ''}>${h(r.name)}</option>`).join('')}</select>`, 'wide')}
      ${field('Día', `<input type="date" name="date" value="${d}" required>`)}
      ${field('Comida', `<select name="meal">${MEALS.map((m) => `<option ${m === (meal || 'Comida') ? 'selected' : ''}>${m}</option>`).join('')}</select>`)}</div>
      <div class="buttons" style="margin-top:15px"><button class="btn primary" type="submit">Añadir</button><button class="btn" type="button" onclick="closeModal()">Cancelar</button></div></form>`);
}
function savePlan(form) {
  const f = Object.fromEntries(new FormData(form));
  setPlan(f.date + '|' + f.meal, f.recipe);
  closeModal();
  toast(`Añadido: ${fmtDay(f.date)} · ${f.meal}`, '', { label: 'Ver calendario', run: () => { weekOffset = Math.round((parseDate(mondayOf(f.date)) - parseDate(mondayOf(today()))) / (7 * 864e5)); navigate('Calendario', { keepWeek: true }); } });
}

function generateWeek() {
  if (!state.recipes.length) { toast('Añade primero alguna receta.', 'warn'); return; }
  if (!confirm('¿Rellenar los huecos libres de esta semana con recetas de tu colección? (No se tocará lo que ya has planificado.)')) return;
  const prefers = { Desayuno: ['Desayunos'], Comida: ['Comidas', 'Cenas'], Merienda: ['Meriendas', 'Snacks'], Cena: ['Cenas', 'Comidas'] };
  weekDates().forEach((d, i) => MEALS.forEach((m, j) => {
    const k = d + '|' + m;
    if (state.plan[k]) return;
    const pool = state.recipes.filter((r) => (r.categories || []).some((c) => prefers[m].includes(c)));
    const list = pool.length ? pool : state.recipes;
    state.plan[k] = list[(i + j) % list.length].id;
  }));
  save(); render(); toast('Semana completada con tus recetas');
}
