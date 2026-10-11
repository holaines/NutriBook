'use strict';
/* NutriBook — aplicación principal (SPA sin framework ni build).
   Secciones: constantes · utilidades · estado · hierro · componentes · páginas · formularios · RAK · Strava · arranque */

// ═══════════════════════════════════════════════════════════════════════════
// Constantes
// ═══════════════════════════════════════════════════════════════════════════
const KEY = 'nutribook-local-v1';
const CATS = ['Desayunos', 'Comidas', 'Cenas', 'Meriendas', 'Snacks', 'Aperitivos', 'Entrantes', 'Ensaladas', 'Sopas y cremas', 'Guarniciones', 'Postres', 'Bebidas', 'Salsas', 'Batch cooking'];
const MEALS = ['Desayuno', 'Comida', 'Merienda', 'Cena'];           // orden cronológico
const RAK_SERVICE = { Comida: 'dejeuner', Cena: 'diner' };           // comida del calendario -> servicio RAK
const RAK_MEAL = { dejeuner: 'Comida', diner: 'Cena' };
const PAGES = [
  { id: 'Inicio', label: 'Inicio', icon: '🏠', main: true },
  { id: 'Calendario', label: 'Calendario', icon: '📅', main: true },
  { id: 'Recetas', label: 'Recetas', icon: '📖', main: true },
  { id: 'Equilibrio', label: 'Mi hierro', icon: '⚡', main: true },
  { id: 'Compra', label: 'Mi compra', icon: '🛒' },
  { id: 'Despensa', label: 'Despensa', icon: '🥫' },
  { id: 'Entrenamientos', label: 'Deporte', icon: '🏃' },
  { id: 'Perfil', label: 'Mi perfil', icon: '👤' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Utilidades
// ═══════════════════════════════════════════════════════════════════════════
const $ = (s) => document.querySelector(s);
const eid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Argumento seguro para atributos onclick="…": q("a'b") -> &quot;a'b&quot; */
const q = (v) => h(JSON.stringify(String(v)));
const iso = (d) => d.toLocaleDateString('en-CA');
const today = () => iso(new Date());
const parseDate = (d) => new Date(d + 'T12:00:00');
function datePlus(d, n) { const x = parseDate(d); x.setDate(x.getDate() + n); return iso(x); }
function mondayOf(d) { return datePlus(d, -((parseDate(d).getDay() + 6) % 7)); }
/** Lunes de la semana visible (weekOffset) */
function weekStart(off = weekOffset) { return datePlus(mondayOf(today()), off * 7); }
const weekDates = (start = weekStart()) => Array.from({ length: 7 }, (_, i) => datePlus(start, i));
const fmtDay = (d, o = { weekday: 'long', day: 'numeric', month: 'short' }) => parseDate(d).toLocaleDateString('es-ES', o);
const fmtMg = (n) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 1 });
const sub = (text) => String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
function ago(isoDate) {
  if (!isoDate) return 'nunca';
  const m = Math.round((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (m < 2) return 'hace un momento';
  if (m < 60) return 'hace ' + m + ' min';
  if (m < 60 * 36) return 'hace ' + Math.round(m / 60) + ' h';
  return 'hace ' + Math.round(m / 1440) + ' días';
}

function toast(msg, kind = '', action) {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  const span = document.createElement('span');
  span.textContent = msg;
  t.appendChild(span);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { t.remove(); action.run(); };
    t.appendChild(b);
  }
  box.appendChild(t);
  setTimeout(() => t.remove(), action ? 7000 : kind === 'warn' ? 6000 : 3200);
}

// ═══════════════════════════════════════════════════════════════════════════
// Estado
// ═══════════════════════════════════════════════════════════════════════════
const DEFAULTS = () => ({
  recipes: [], pantry: [], plan: {}, checked: {}, consumed: [], workouts: [], stravaCache: null, rakConsumed: [],
  profile: { name: '', goal: 'Alimentación equilibrada', priorities: 'Hierro, vitamina C, proteínas', budget: '', notes: '', ironDailyGoal: 16, ironMealGoal: 5 },
});
function hydrate(d) {
  const base = DEFAULTS();
  return { ...base, ...(d || {}), profile: { ...base.profile, ...((d && d.profile) || {}) } };
}
function load() {
  try { return hydrate(JSON.parse(localStorage.getItem(KEY))); } catch { return DEFAULTS(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { toast('No queda espacio en el navegador. Exporta tus datos desde «Mi perfil».', 'warn'); }
  window.NutriCloud?.scheduleSave(state);
}

let state = load();
let page = 'Inicio', weekOffset = 0, modal = null, authLoading = true;
let filters = { search: '', cat: '', maxTime: '', ingredient: '', sort: 'recent', fav: false, iron: false };
const recipe = (id) => state.recipes.find((r) => r.id === id);

// ═══════════════════════════════════════════════════════════════════════════
// Hierro: cálculo central (lo usan Inicio, Calendario y Mi hierro)
// ═══════════════════════════════════════════════════════════════════════════
const goalDay = () => Number(state.profile.ironDailyGoal) || 16;
const goalMeal = () => Number(state.profile.ironMealGoal) || 5;
const ironVal = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
const foodFor = (d) => state.consumed.filter((x) => x.date === d);
const eatenFor = (planKey) => state.consumed.find((x) => x.planKey === planKey);
const rakOf = (d) => window.RAK ? RAK.getConsumed(d) : [];
const ironLevel = (v, goal) => v >= goal ? 'good' : v >= goal * 0.6 ? 'mid' : 'low';

/** Hierro de un día: comido (manual + recetas + RAK confirmado) y previsto (plan sin comer + mejor opción RAK). */
function dayIron(date) {
  let eaten = 0, unknown = 0, planned = 0;
  for (const x of foodFor(date)) { const v = ironVal(x.iron); v === null ? unknown++ : (eaten += v); }
  for (const e of rakOf(date)) eaten += Number(e.iron_total_mg) || 0;
  if (date >= today()) {
    for (const m of MEALS) {
      const k = date + '|' + m, r = recipe(state.plan[k]);
      if (r && !eatenFor(k)) planned += ironVal(r.iron) ?? 0;
    }
    if (window.RAK) {
      for (const svc of ['dejeuner', 'diner']) {
        if (rakOf(date).some((e) => e.service === svc) || state.plan[date + '|' + RAK_MEAL[svc]]) continue;
        planned += RAK.getBestGlutenFreeCombo(date, svc)?.iron_total || 0;
      }
    }
  }
  const goal = goalDay();
  return { eaten, planned, total: eaten + planned, unknown, goal, level: ironLevel(eaten + planned, goal) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Componentes
// ═══════════════════════════════════════════════════════════════════════════
const field = (label, input, cls = '') => `<label class="field ${cls}"><span>${label}</span>${input}</label>`;
const empty = (title, txt, cta = '') => `<div class="empty"><strong>${title}</strong><p>${txt}</p>${cta}</div>`;
function pageHeader(title, desc, actions = '') {
  return `<div class="top"><div><div class="eyebrow">NutriBook · cocina consciente</div><h1>${title}</h1><div class="muted">${desc}</div></div><div class="buttons">${actions}</div></div>`;
}
function weekNav(extra = '') {
  const s = weekStart(), e = datePlus(s, 6);
  return `<div class="week-head"><div class="buttons"><button class="btn" onclick="shiftWeek(-1)" aria-label="Semana anterior">←</button><button class="btn" onclick="shiftWeek(0)">Hoy</button><button class="btn" onclick="shiftWeek(1)" aria-label="Semana siguiente">→</button></div>
    <strong class="week-label">${fmtDay(s, { day: 'numeric', month: 'long' })} – ${fmtDay(e, { day: 'numeric', month: 'long', year: 'numeric' })}${weekOffset === 0 ? ' <span class="pill">Esta semana</span>' : ''}</strong>${extra}</div>`;
}
function shiftWeek(n) { weekOffset = n === 0 ? 0 : weekOffset + n; render(); }

/** Barra de hierro: relleno fuerte = comido, claro = previsto */
function ironBar(di, compact = false) {
  const g = di.goal || 1, e = Math.min(di.eaten / g * 100, 100), t = Math.min(di.total / g * 100, 100);
  const tip = `${fmtMg(di.eaten)} mg comidos` + (di.planned ? ` + ${fmtMg(di.planned)} mg previstos` : '') + ` · objetivo ${g} mg`;
  return `<div class="ironbar ${di.level} ${compact ? 'compact' : ''}" title="${h(tip)}">
    <div class="ironbar-track"><span class="ironbar-plan" style="width:${t}%"></span><span class="ironbar-eaten" style="width:${e}%"></span></div>
    <div class="ironbar-text"><b>${fmtMg(di.total)}</b> / ${g} mg Fe${!compact && di.planned > 0 ? ` <small>(${fmtMg(di.eaten)} comido)</small>` : ''}</div></div>`;
}

function ironRing(di) {
  const R = 54, C = 2 * Math.PI * R, g = di.goal || 1;
  const e = Math.min(di.eaten / g, 1) * C, t = Math.min(di.total / g, 1) * C;
  return `<svg class="ring ${di.level}" viewBox="0 0 140 140" role="img" aria-label="${fmtMg(di.eaten)} de ${g} mg de hierro comidos hoy">
    <circle class="ring-bg" cx="70" cy="70" r="${R}"/>
    <circle class="ring-plan" cx="70" cy="70" r="${R}" stroke-dasharray="${t} ${C}" transform="rotate(-90 70 70)"/>
    <circle class="ring-eaten" cx="70" cy="70" r="${R}" stroke-dasharray="${e} ${C}" transform="rotate(-90 70 70)"/>
    <text x="70" y="64" class="ring-num">${fmtMg(di.eaten)}</text><text x="70" y="90" class="ring-sub">de ${g} mg</text></svg>`;
}

/** Gráfico de 7 barras con línea de objetivo. Clic en una barra -> detalle del día en «Mi hierro». */
function ironChart(dates) {
  const days = dates.map((d) => ({ d, ...dayIron(d) }));
  const goal = goalDay(), max = Math.max(goal * 1.3, ...days.map((x) => x.total));
  const pct = (v) => (v / max * 100).toFixed(1);
  return `<div class="chart"><div class="chart-area"><div class="goal-line" style="bottom:${pct(goal)}%"><span>objetivo ${goal} mg</span></div>
    ${days.map((x) => `<button class="bar-col ${x.d === today() ? 'is-today' : ''} ${x.level}" onclick="openDay(${q(x.d)})" aria-label="${fmtDay(x.d)}: ${fmtMg(x.total)} mg de hierro">
      <span class="bar-val" style="bottom:calc(${pct(x.total)}% + 3px)">${x.total > 0 ? fmtMg(x.total) : ''}</span>
      <span class="bar-plan" style="height:${pct(x.total)}%"></span><span class="bar-eaten" style="height:${pct(x.eaten)}%"></span></button>`).join('')}
    </div><div class="chart-labels">${days.map((x) => `<span class="${x.d === today() ? 'is-today' : ''}">${fmtDay(x.d, { weekday: 'short' })}</span>`).join('')}</div>
    <div class="legend"><span><i class="lg eaten"></i>Comido</span><span><i class="lg plan"></i>Previsto</span></div></div>`;
}

function recipeCard(r) {
  const fe = ironVal(r.iron);
  return `<article class="card recipe" tabindex="0" role="button" aria-label="Ver ${h(r.name)}" onclick="viewRecipe(${q(r.id)})" onkeydown="if(event.target===this&&event.key==='Enter')viewRecipe(${q(r.id)})">
    <div class="recipe-cover">${h(r.emoji || '🥗')}${fe !== null ? `<span class="fe-badge ${ironLevel(fe, goalMeal())}">${fmtMg(fe)} mg Fe</span>` : ''}
      <button class="fav ${r.favorite ? 'on' : ''}" aria-label="${r.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}" onclick="event.stopPropagation();toggleFav(${q(r.id)})">${r.favorite ? '★' : '☆'}</button></div>
    <div class="recipe-body"><h3>${h(r.name)}</h3>
      <div class="tags">${(r.categories || []).slice(0, 2).map((c) => `<span class="tag">${h(c)}</span>`).join('')}</div>
      <div class="recipe-meta"><span>◷ ${Number(r.time || 0)} min</span><span>🍽 ${Number(r.servings || 1)} raciones</span></div></div></article>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Navegación y render
// ═══════════════════════════════════════════════════════════════════════════
const VIEWS = { Inicio: home, Recetas: recipes, Calendario: calendar, Entrenamientos: trainingPage, Despensa: pantry, Compra: shopping, Equilibrio: equilibrium, Perfil: profile };

function navigate(p, opts = {}) {
  if (!PAGES.some((x) => x.id === p)) p = 'Inicio';
  page = p; modal = null;
  if (!opts.keepWeek) weekOffset = 0;
  history.replaceState(null, '', location.pathname + '#' + p);
  render();
  window.scrollTo(0, 0);
}
/** Abre «Mi hierro» en la semana del día indicado */
function openDay(d) {
  weekOffset = Math.round((parseDate(mondayOf(d)) - parseDate(mondayOf(today()))) / (7 * 864e5));
  navigate('Equilibrio', { keepWeek: true });
  setTimeout(() => document.getElementById('day-' + d)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

function nav() {
  const btn = (p) => `<button class="${p.id === page ? 'active' : ''} ${p.main ? 'is-main' : ''}" onclick="navigate('${p.id}')" ${p.id === page ? 'aria-current="page"' : ''}><span class="ico">${p.icon}</span><span class="lbl">${p.label}</span></button>`;
  const moreActive = PAGES.some((p) => !p.main && p.id === page);
  return PAGES.map(btn).join('') + `<button class="more-btn ${moreActive ? 'active' : ''}" onclick="openMore()"><span class="ico">⋯</span><span class="lbl">Más</span></button>`;
}
function openMore() {
  showModal(`<div class="top"><h2>Más secciones</h2><button class="close" onclick="closeModal()" aria-label="Cerrar">×</button></div>
    <div class="more-grid">${PAGES.filter((p) => !p.main).map((p) => `<button class="more-item" onclick="navigate('${p.id}')"><span>${p.icon}</span>${p.label}</button>`).join('')}</div>`);
}

function renderMain() {
  const a = document.activeElement, label = a?.getAttribute?.('aria-label'), pos = a?.selectionStart;
  const main = $('#view');
  if (!main) return render();
  main.innerHTML = (VIEWS[page] || home)();
  if (label && a.tagName === 'INPUT') {
    const el = [...document.querySelectorAll('#view input')].find((x) => x.getAttribute('aria-label') === label);
    if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* tipo sin selección */ } }
  }
}

function render() {
  const app = document.getElementById('app');
  if (authLoading) {
    app.innerHTML = '<div class="auth-splash"><div class="logo">Nutri<span>Book</span> 🌿</div><p>Iniciando…</p></div>';
    return;
  }
  const y = window.scrollY;
  app.innerHTML = `<div class="app"><aside class="sidebar"><div class="logo">Nutri<span>Book</span> 🌿</div><nav class="nav" aria-label="Secciones">${nav()}</nav>
    <div id="sync-slot">${window.NutriCloud?.syncBadge?.() || ''}</div>
    <div class="side-foot">Hecho para cocinar a tu ritmo.<br>🌱 ${window.NutriCloud?.getUser?.() ? 'Datos sincronizados en tu cuenta.' : 'Datos guardados en este navegador.'}</div></aside>
    <main class="main"><div id="view">${(VIEWS[page] || home)()}</div>
    <div class="footer">NutriBook · Las estimaciones nutricionales no sustituyen asesoramiento sanitario.</div></main></div><div id="modal-root"></div>`;
  if (modal) showModal(modal);
  window.scrollTo(0, y);
  afterRender();
}

function afterRender() {
  if (page === 'Calendario' || page === 'Equilibrio') ensureRak(weekStart());
  else if (page === 'Inicio') ensureRak(weekStart(0));
  if (page === 'Entrenamientos') maybeLoadStrava();
}

function showModal(markup) {
  modal = markup;
  const root = $('#modal-root');
  if (!root) return;
  root.innerHTML = `<div class="modal-bg" onclick="closeModal(event)"><div class="modal" role="dialog" aria-modal="true">${markup}</div></div>`;
  document.body.classList.add('modal-open');
  root.querySelector('input:not([type=hidden]):not([type=file]),select,textarea')?.focus({ preventScroll: true });
}
function closeModal(ev) {
  if (ev && !ev.target.classList.contains('modal-bg')) return;
  modal = null;
  const root = $('#modal-root');
  if (root) root.innerHTML = '';
  document.body.classList.remove('modal-open');
}
const modalTop = (title, sub = '') => `<div class="top"><div>${sub}<h2>${title}</h2></div><button class="close" onclick="closeModal()" aria-label="Cerrar">×</button></div>`;

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
      body = `<button class="link meal-name" onclick="viewRecipe(${q(r.id)})">${h(r.emoji || '')} ${h(r.name)}</button>
        <span class="fe ${fe === null ? '' : ironLevel(fe, goalMeal())}">${fe === null ? 'Fe ?' : fmtMg(fe) + ' mg Fe'}</span>
        <button class="btn mini ${done ? 'done' : ''}" onclick="toggleEaten(${q(k)})">${done ? '✓ Comido' : 'Marcar comido'}</button>`;
    } else if (best) {
      body = `<span class="meal-name">🍽 RAK: ${h(best.plat?.dish_name || '')}${best.accompagnement ? ' + ' + h(best.accompagnement.dish_name) : ''}</span>
        <span class="fe ${best.iron_known ? ironLevel(best.iron_total, goalMeal()) : ''}">${best.iron_known ? fmtMg(best.iron_total) + ' mg Fe' : 'Fe ?'}</span>
        <button class="btn mini" onclick="showRAKModal(${q(d)},${q(svc)})">Ver menú</button>`;
    } else body = `<button class="link muted" onclick="openPlan('',${q(d)},${q(m)})">+ Planificar</button>`;
    return `<div class="meal-row ${done || rakEaten ? 'is-eaten' : ''}"><span class="meal-label">${m}</span>${body}</div>`;
  }).join('');

  return pageHeader(`${hello}${state.profile.name ? ', ' + h(state.profile.name) : ''}`, fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long' }),
    `<button class="btn primary" onclick="openFoodForm(today())">+ Registrar comida</button><button class="btn" onclick="openForm()">+ Receta</button>`) +
  `<section class="today-grid">
    <div class="card iron-card"><div class="card-title">Hierro de hoy</div>
      <div class="iron-card-body">${ironRing(di)}
        <div class="iron-legend"><div><i class="lg eaten"></i><b>${fmtMg(di.eaten)} mg</b> comidos</div>
          ${di.planned > 0 ? `<div><i class="lg plan"></i><b>${fmtMg(di.planned)} mg</b> previstos</div>` : ''}
          <div class="${missing > 0 ? 'need' : 'ok'}">${missing > 0 ? `Te faltan <b>${fmtMg(missing)} mg</b> para tu objetivo` : '✓ ¡Objetivo de hoy cubierto!'}</div>
          ${di.unknown ? `<small class="muted">${di.unknown} comida(s) sin dato de hierro</small>` : ''}</div></div>
      ${ideas.length ? `<div class="ideas"><small class="muted">Ideas ricas en hierro:</small>${ideas.map((r) => `<button class="chip-btn" onclick="viewRecipe(${q(r.id)})">${h(r.emoji || '')} ${h(r.name)} · ${fmtMg(r.iron)} mg</button>`).join('')}</div>` : ''}</div>
    <div class="card"><div class="card-title">Hoy en tu menú <button class="link" onclick="navigate('Calendario')">Calendario →</button></div>${meals}</div>
  </section>
  <div class="section-head"><h2>Tu semana</h2><button class="btn" onclick="navigate('Equilibrio')">Ver detalle →</button></div>
  <div class="card">${ironChart(dates)}</div>
  <div class="grid stats"><button class="card stat" onclick="navigate('Recetas')"><span class="muted small">RECETAS</span><span class="metric">${state.recipes.length}</span></button>
    <button class="card stat" onclick="navigate('Calendario')"><span class="muted small">COMIDAS PLANIFICADAS (SEMANA)</span><span class="metric">${plannedWeek}</span></button>
    <button class="card stat" onclick="navigate('Despensa')"><span class="muted small">EN LA DESPENSA</span><span class="metric">${state.pantry.length}</span></button></div>
  <div class="section-head"><h2>Tus recetas recientes</h2><button class="btn" onclick="navigate('Recetas')">Ver todas →</button></div>
  ${state.recipes.length ? `<div class="grid">${[...state.recipes].reverse().slice(0, 3).map(recipeCard).join('')}</div>`
    : empty('Tu recetario empieza aquí', 'Añade tu primera receta o pega una de internet.', `<div class="buttons center"><button class="btn primary" onclick="openForm()">Añadir receta</button><button class="btn" onclick="openImport()">Pegar receta</button></div>`)}
  ${!window.NutriCloud?.getUser?.() && window.NutriCloud ? `<div class="notice">Tus datos están solo en este navegador. <button class="link" onclick="navigate('Perfil')">Inicia sesión en «Mi perfil»</button> para sincronizarlos y no perderlos.</div>` : ''}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Recetas
// ═══════════════════════════════════════════════════════════════════════════
function setFilter(k, v) { filters[k] = v; renderMain(); }
function resetFilters() { filters = { search: '', cat: '', maxTime: '', ingredient: '', sort: filters.sort, fav: false, iron: false }; renderMain(); }

function recipes() {
  const f = filters, lc = (s) => String(s || '').toLowerCase();
  let list = state.recipes.filter((r) =>
    (!f.search || lc([r.name, r.description, ingredientText(r)].join(' ')).includes(lc(f.search))) &&
    (!f.cat || (r.categories || []).includes(f.cat)) &&
    (!f.maxTime || Number(r.time) <= Number(f.maxTime)) &&
    (!f.ingredient || (r.ingredients || []).some((i) => lc(i.name).includes(lc(f.ingredient)))) &&
    (!f.fav || r.favorite) && (!f.iron || (ironVal(r.iron) ?? 0) >= goalMeal()));
  const sorters = {
    recent: () => [...list].reverse(),
    name: () => [...list].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    iron: () => [...list].sort((a, b) => (ironVal(b.iron) ?? -1) - (ironVal(a.iron) ?? -1)),
    time: () => [...list].sort((a, b) => Number(a.time) - Number(b.time)),
  };
  list = sorters[f.sort]();
  const filtered = f.search || f.cat || f.maxTime || f.ingredient || f.fav || f.iron;
  return pageHeader('Mi banco de recetas', `${state.recipes.length} recetas guardadas.`,
    `<button class="btn primary" onclick="openForm()">+ Nueva receta</button><button class="btn" onclick="openImport()">Pegar receta</button>`) +
  `<div class="toolbar"><input aria-label="Buscar recetas" placeholder="Buscar por nombre o ingrediente…" value="${h(f.search)}" oninput="setFilter('search',this.value)">
    <select aria-label="Categoría" onchange="setFilter('cat',this.value)"><option value="">Todas las categorías</option>${CATS.map((c) => `<option ${f.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <select aria-label="Tiempo máximo" onchange="setFilter('maxTime',this.value)"><option value="">Cualquier duración</option>${[10, 15, 20, 30, 45, 60].map((v) => `<option value="${v}" ${f.maxTime == v ? 'selected' : ''}>Hasta ${v} min</option>`).join('')}</select>
    <select aria-label="Ordenar" onchange="setFilter('sort',this.value)">${[['recent', 'Más recientes'], ['name', 'Nombre A-Z'], ['iron', 'Más hierro'], ['time', 'Más rápidas']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <div class="chips"><button class="chip-btn ${f.iron ? 'on' : ''}" onclick="setFilter('iron',!filters.iron)">⚡ Ricas en hierro (≥ ${goalMeal()} mg)</button>
    <button class="chip-btn ${f.fav ? 'on' : ''}" onclick="setFilter('fav',!filters.fav)">★ Favoritas</button>
    <input class="chip-input" aria-label="Filtrar ingrediente" placeholder="Con ingrediente…" value="${h(f.ingredient)}" oninput="setFilter('ingredient',this.value)">
    ${filtered ? '<button class="link" onclick="resetFilters()">Quitar filtros</button>' : ''}</div>` +
  (list.length ? `<div class="grid">${list.map(recipeCard).join('')}</div>`
    : empty('No hay recetas que mostrar', state.recipes.length ? 'Prueba con otros filtros.' : 'Empieza añadiendo la primera receta.',
      filtered ? '<button class="btn" onclick="resetFilters()">Quitar filtros</button>' : '<button class="btn primary" onclick="openForm()">Añadir receta</button>'));
}

function parseIngredients(t) {
  return sub(t).map((s) => {
    const m = s.match(/^([\d.,/½¼¾]+)\s*(?:(g|kg|ml|l|ud|unidades|cucharadas?|cucharaditas?|tazas?|pizca|dientes?)(?=\s|$))?\s*(?:de\s+)?(.+)$/i);
    if (!m) return { name: s, quantity: null, unit: '' };
    const qty = m[1].includes('/') ? m[1].split('/').reduce((a, b) => Number(a) / Number(b)) : ({ '½': .5, '¼': .25, '¾': .75 }[m[1]] ?? Number(m[1].replace(',', '.')));
    return { name: m[3], quantity: Number.isFinite(qty) ? qty : null, unit: m[2] || 'ud' };
  });
}
function ingredientText(r, mult = 1) {
  return (r.ingredients || []).map((i) => `${i.quantity == null ? '' : Number((i.quantity * mult).toFixed(2)) + ' ' + i.unit + ' '}${i.name}`).join('\n');
}

function viewRecipe(id) {
  const r = recipe(id);
  if (!r) return;
  const fe = ironVal(r.iron);
  const src = { 'usda-estimate': '🔬 USDA', 'local-db': '🏠 base local', 'ai-estimate': '✨ IA', manual: '✏️ manual' }[r.ironSource] || '✏️ manual';
  const conf = { high: 'alta confianza', medium: 'confianza media', low: 'estimación aproximada' };
  showModal(`${modalTop(`${h(r.emoji)} ${h(r.name)}`, `<div class="eyebrow">${h((r.categories || []).join(' · '))}</div>`)}
    ${r.description ? `<p>${h(r.description)}</p>` : ''}
    <div class="buttons"><span class="pill">◷ ${r.time} min</span><span class="pill">🍽 ${r.servings} raciones</span>
      ${fe !== null ? `<span class="pill fe ${ironLevel(fe, goalMeal())}">⚡ ${fmtMg(fe)} mg Fe/ración · ${src}</span>` : '<span class="pill">⚡ Hierro sin calcular</span>'}</div>
    ${r.nutrition ? `<p class="notice">✨ ${h(r.nutrition.provider || 'IA')} · ${conf[r.nutrition.confidence] || ''} · ${fmtMg(r.nutrition.estimatedRecipeIronMg)} mg en total · ${h(r.nutrition.notes)}</p>` : ''}
    <div class="buttons" style="margin-top:14px"><button class="btn primary" onclick="openPlan(${q(id)})">📅 Añadir al calendario</button><button class="btn" onclick="openEatRecipe(today(),${q(id)})">✓ Lo he comido</button></div>
    <hr class="line">
    ${field('Escalar raciones', `<input type="number" min="1" value="${r.servings}" oninput="document.getElementById('ingredients-detail').innerText=scaledIngredients(${q(id)},Number(this.value))">`)}
    <div class="split recipe-detail"><div><h3>Ingredientes</h3><div id="ingredients-detail" style="white-space:pre-line;line-height:1.9">${h(ingredientText(r))}</div></div>
      <div><h3>Preparación</h3><ol>${(r.instructions || []).map((x) => `<li>${h(x)}</li>`).join('')}</ol></div></div>
    ${r.source ? `<p class="small muted">Fuente: ${/^https?:\/\//.test(r.source) ? `<a href="${h(r.source)}" target="_blank" rel="noopener">${h(r.source)}</a>` : h(r.source)}</p>` : ''}
    <hr class="line"><div class="buttons"><button class="btn" onclick="openForm(${q(id)})">Editar</button><button id="iron-llm-btn" class="btn" onclick="estimateIron(${q(id)})">⚡ ${fe === null ? 'Calcular' : 'Recalcular'} hierro con IA</button>
      <button class="btn" onclick="duplicateRecipe(${q(id)})">Duplicar</button><button class="btn danger" onclick="deleteRecipe(${q(id)})">Eliminar</button></div>`);
}
function scaledIngredients(id, servings) {
  const r = recipe(id);
  return r ? ingredientText(r, Math.max(1, servings) / (r.servings || 1)) : '';
}
function toggleFav(id) { const r = recipe(id); if (r) { r.favorite = !r.favorite; save(); renderMain(); } }
function duplicateRecipe(id) {
  const r = recipe(id);
  if (!r) return;
  state.recipes.push({ ...structuredClone(r), id: eid(), name: r.name + ' (copia)' });
  save(); closeModal(); render(); toast('Receta duplicada');
}
function deleteRecipe(id) {
  if (!confirm('¿Eliminar esta receta? También se quitará del calendario.')) return;
  state.recipes = state.recipes.filter((r) => r.id !== id);
  Object.keys(state.plan).forEach((k) => { if (state.plan[k] === id) delete state.plan[k]; });
  save(); closeModal(); render(); toast('Receta eliminada');
}

function openForm(id, draft) {
  const r = recipe(id) || draft || { name: '', description: '', emoji: '🥗', categories: [], ingredients: [], instructions: [], servings: 4, time: 30, iron: '', favorite: false };
  const cat = (r.categories || [])[0];
  showModal(`${modalTop(id ? 'Editar receta' : 'Añadir receta')}
    <form onsubmit="event.preventDefault();saveRecipe(this,${q(id || '')})"><div class="form-grid">
      ${field('Nombre *', `<input name="name" required value="${h(r.name)}">`, 'wide')}
      ${field('Categoría', `<select name="category">${CATS.map((c) => `<option ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}
      ${field('Emoji de portada', `<input name="emoji" value="${h(r.emoji)}">`)}
      ${field('Tiempo total (min)', `<input name="time" type="number" min="0" value="${h(r.time)}">`)}
      ${field('Raciones', `<input name="servings" type="number" min="1" value="${h(r.servings)}">`)}
      ${field('Descripción', `<input name="description" value="${h(r.description)}">`, 'wide')}
      ${field('Ingredientes · uno por línea (p. ej. 200 g de lentejas coral)', `<textarea name="ingredients" rows="6" required>${h(ingredientText(r))}</textarea>`, 'wide')}
      ${field('Pasos · uno por línea', `<textarea name="instructions" rows="6" required>${h((r.instructions || []).join('\n'))}</textarea>`, 'wide')}
      ${field('Hierro por ración (mg, opcional)', `<input name="iron" type="number" min="0" step="0.1" value="${h(r.iron ?? '')}">`)}
      ${field('Fuente / URL (opcional)', `<input name="source" value="${h(r.source || '')}">`)}</div>
      <p class="info muted">Si dejas el hierro en blanco, la IA lo estimará al guardar (necesitas haber iniciado sesión). Tus valores manuales nunca se sobrescriben.</p>
      <div class="buttons"><button class="btn primary" type="submit">Guardar receta</button><button class="btn" type="button" onclick="closeModal()">Cancelar</button></div></form>`);
}
function saveRecipe(form, id) {
  const f = Object.fromEntries(new FormData(form)), old = recipe(id);
  const ingredients = parseIngredients(f.ingredients);
  const iron = f.iron === '' ? null : Number(f.iron);
  const sameIron = old && old.iron === iron;
  const obj = {
    id: id || eid(), name: f.name.trim(), description: f.description, emoji: f.emoji || '🥗', categories: [f.category],
    ingredients, instructions: sub(f.instructions), servings: Number(f.servings) || 1, time: Number(f.time) || 0,
    iron, source: f.source, favorite: old?.favorite || false,
    ironSource: iron === null ? '' : (sameIron ? old.ironSource : 'manual'),
    nutrition: sameIron ? (old.nutrition || null) : null,
  };
  const changedIngredients = old && ingredientText(old) !== ingredientText(obj);
  state.recipes = id ? state.recipes.map((r) => r.id === id ? obj : r) : [...state.recipes, obj];
  save(); modal = null; render();
  // Solo se estima con IA si no hay valor, o si el valor era de IA y los ingredientes cambiaron
  if (iron === null || (obj.ironSource === 'ai-estimate' && changedIngredients)) estimateIron(obj.id, true);
  toast('Receta guardada');
}

async function estimateIron(id, silent = false) {
  const r = recipe(id);
  if (!r) return;
  const client = window.NutriCloud?.getClient?.(), cfg = window.NUTRIBOOK_SUPABASE;
  const token = client ? (await client.auth.getSession()).data?.session?.access_token : null;
  if (!token || !cfg?.url) { if (!silent) toast('Inicia sesión en «Mi perfil» para calcular el hierro con IA.', 'warn'); return; }
  const btn = document.getElementById('iron-llm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Calculando…'; }
  try {
    const res = await fetch(cfg.url + '/functions/v1/iron-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.key, Authorization: 'Bearer ' + token },
      body: JSON.stringify({ name: r.name, servings: r.servings, ingredients: r.ingredients }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
    r.iron = data.iron_per_serving_mg;
    r.ironSource = 'ai-estimate';
    r.nutrition = { provider: data.provider || 'Gemini', estimatedRecipeIronMg: data.total_iron_mg, confidence: data.confidence, notes: data.notes, checkedAt: new Date().toISOString() };
    save();
    if (modal && !silent) viewRecipe(id); else renderMain();
    toast(`Hierro estimado: ${fmtMg(r.iron)} mg por ración`);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Calcular hierro con IA'; }
    if (!silent) toast('No se pudo calcular el hierro: ' + e.message, 'warn');
  }
}

function openImport() {
  showModal(`${modalTop('Pegar una receta')}
    <p class="muted">Pega una receta con nombre, «Ingredientes» y «Preparación». Podrás revisar los campos antes de guardar.</p>
    <textarea id="raw-recipe" style="width:100%;min-height:250px" placeholder="Galletas de avena&#10;Ingredientes&#10;120 g de avena&#10;1 plátano&#10;Preparación&#10;Mezclar todo.&#10;Hornear 20 minutos."></textarea>
    <div class="buttons" style="margin-top:15px"><button class="btn primary" onclick="parseImport()">Extraer receta</button></div>`);
}
function parseImport() {
  const rows = sub(document.getElementById('raw-recipe').value);
  if (!rows.length) { toast('Pega una receta primero', 'warn'); return; }
  const start = rows.findIndex((x) => /^ingredientes?\s*:?$/i.test(x));
  const end = rows.findIndex((x) => /^(preparaci[oó]n|instrucciones|elaboraci[oó]n)\s*:?$/i.test(x));
  const ing = (start >= 0 ? rows.slice(start + 1, end > start ? end : undefined) : []).map((x) => x.replace(/^[-•]\s*/, ''));
  const steps = (end >= 0 ? rows.slice(end + 1) : []).map((x) => x.replace(/^\d+[.)-]\s*/, ''));
  // Se abre el formulario con un borrador: si se cancela, no queda ninguna receta a medias
  openForm('', { name: rows[0], description: 'Importada a partir de texto; revisa los datos.', emoji: '🥗', categories: ['Comidas'], ingredients: parseIngredients(ing.join('\n')), instructions: steps, servings: 4, time: 30, iron: '' });
}

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

// ═══════════════════════════════════════════════════════════════════════════
// Despensa y compra
// ═══════════════════════════════════════════════════════════════════════════
function daysTo(date) { return Math.round((parseDate(date) - parseDate(today())) / 864e5); }

function pantry() {
  const items = [...state.pantry].sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
  const ideas = state.recipes.map((r) => ({
    r, n: (r.ingredients || []).filter((i) => state.pantry.some((p) => p.name.toLowerCase().includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(p.name.toLowerCase()))).length,
  })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 6);
  return pageHeader('Mi despensa', 'Los ingredientes que ya tienes en casa.', `<button class="btn primary" onclick="openPantry()">+ Añadir ingrediente</button>`) +
  `<div class="card">${items.length ? items.map((p) => {
    const dt = p.expiry ? daysTo(p.expiry) : null;
    const exp = dt === null ? '' : dt < 0 ? `<span class="tag bad">Caducado</span>` : dt <= 3 ? `<span class="tag warn">Caduca en ${dt} d</span>` : '';
    return `<div class="item"><span><b>${h(p.name)}</b> ${exp}<small>${h(p.quantity)} ${h(p.unit)}${p.expiry ? ' · Fecha límite: ' + h(p.expiry) : ''}</small></span>
      <div class="buttons"><button class="btn" onclick="openPantry(${q(p.id)})">Editar</button><button class="btn danger" onclick="removePantry(${q(p.id)})">Quitar</button></div></div>`;
  }).join('') : empty('Tu despensa está vacía', 'Añade avena, garbanzos, lentejas o lo que tengas en casa.', '<button class="btn primary" onclick="openPantry()">Añadir ingrediente</button>')}</div>
  <div class="section-head"><h2>Ideas con lo que tienes</h2></div>
  ${ideas.length ? `<div class="grid">${ideas.map((x) => recipeCard(x.r)).join('')}</div>` : '<div class="muted">Añade recetas e ingredientes para ver coincidencias.</div>'}`;
}
function openPantry(id) {
  const p = state.pantry.find((x) => x.id === id) || { name: '', quantity: '', unit: 'g', expiry: '' };
  showModal(`${modalTop(id ? 'Editar ingrediente' : 'Añadir ingrediente')}
    <form onsubmit="event.preventDefault();savePantry(this,${q(id || '')})"><div class="form-grid">
      ${field('Ingrediente', `<input name="name" required value="${h(p.name)}">`, 'wide')}
      ${field('Cantidad', `<input name="quantity" type="number" min="0" step="any" required value="${h(p.quantity)}">`)}
      ${field('Unidad', `<select name="unit">${['g', 'kg', 'ml', 'l', 'ud'].map((u) => `<option ${p.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select>`)}
      ${field('Fecha límite / consumo preferente (opcional)', `<input type="date" name="expiry" value="${h(p.expiry)}">`, 'wide')}</div>
      <div class="buttons" style="margin-top:15px"><button class="btn primary">Guardar</button></div></form>`);
}
function savePantry(form, id) {
  const p = { id: id || eid(), ...Object.fromEntries(new FormData(form)) };
  state.pantry = id ? state.pantry.map((x) => x.id === id ? p : x) : [...state.pantry, p];
  save(); modal = null; render();
}
function removePantry(id) {
  const old = state.pantry.find((p) => p.id === id);
  state.pantry = state.pantry.filter((p) => p.id !== id);
  save(); renderMain();
  toast('Ingrediente quitado', '', { label: 'Deshacer', run: () => { state.pantry.push(old); save(); renderMain(); } });
}

/** Normaliza kg->g y l->ml para poder sumar y restar */
function baseQty(qty, unit) {
  const u = String(unit || '').toLowerCase();
  return u === 'kg' ? [qty * 1000, 'g'] : u === 'l' ? [qty * 1000, 'ml'] : [qty, u];
}
function fmtQty(qty, unit) {
  if (unit === 'g' && qty >= 1000) return fmtMg(qty / 1000) + ' kg';
  if (unit === 'ml' && qty >= 1000) return fmtMg(qty / 1000) + ' l';
  return Number(qty.toFixed(2)) + (unit ? ' ' + unit : '');
}
function shoppingItems() {
  const start = weekStart(), end = datePlus(start, 6), acc = {};
  for (const [k, id] of Object.entries(state.plan)) {
    const d = k.slice(0, 10), r = recipe(id);
    if (!id || d < start || d > end || !r) continue;
    for (const i of r.ingredients || []) {
      const [qty, unit] = i.quantity == null ? [null, i.unit || ''] : baseQty(i.quantity, i.unit);
      const key = i.name.toLowerCase().trim() + '|' + unit;
      const it = acc[key] || (acc[key] = { key, name: i.name, unit, quantity: 0, unknown: 0 });
      qty == null ? it.unknown++ : (it.quantity += qty);
    }
  }
  return Object.values(acc).map((it) => {
    const have = state.pantry.filter((p) => p.name.toLowerCase().trim() === it.name.toLowerCase().trim())
      .map((p) => baseQty(Number(p.quantity) || 0, p.unit)).filter(([, u]) => u === it.unit).reduce((n, [v]) => n + v, 0);
    return { ...it, have, left: Math.max(0, it.quantity - have) };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
function shopping() {
  const items = shoppingItems(), pending = items.filter((i) => !state.checked[i.key]), done = items.filter((i) => state.checked[i.key]);
  const row = (i) => `<div class="item"><label class="check-row"><input class="check" type="checkbox" ${state.checked[i.key] ? 'checked' : ''} onchange="toggleCheck(${items.indexOf(i)},this.checked)">
    <span class="${state.checked[i.key] ? 'struck' : ''}"><b>${h(i.name)}</b><small>Necesario: ${fmtQty(i.quantity, i.unit)}${i.have ? ' · En despensa: ' + fmtQty(i.have, i.unit) : ''}${i.unknown ? ` · ${i.unknown} cantidad(es) sin indicar` : ''}</small></span></label>
    <b class="qty ${i.left === 0 && i.quantity > 0 ? 'ok' : ''}">${i.quantity > 0 && i.left === 0 ? '✓ en casa' : fmtQty(i.left, i.unit)}</b></div>`;
  return pageHeader('Mi lista de la compra', 'Ingredientes de las recetas planificadas en la semana seleccionada.',
    `<button class="btn" onclick="copyShopping()">Copiar lista</button><button class="btn" onclick="navigate('Calendario',{keepWeek:true})">← Calendario</button>`) +
  weekNav(`<span class="week-stat">${pending.length} por comprar · ${done.length} listos</span>`) +
  `<div class="card">${items.length ? pending.map(row).join('') + (done.length ? `<div class="item-sep">Ya en el carro</div>` + done.map(row).join('') : '')
    : empty('No hay nada en la lista', 'Planifica alguna receta en el calendario y aparecerán aquí sus ingredientes.', `<button class="btn primary" onclick="navigate('Calendario',{keepWeek:true})">Ir al calendario</button>`)}</div>
  <div class="notice">Se resta lo que ya tienes en la despensa (con el mismo nombre; kg↔g y l↔ml se convierten). Revisa los resultados antes de comprar.</div>`;
}
function toggleCheck(idx, checked) {
  const it = shoppingItems()[idx];
  if (!it) return;
  state.checked[it.key] = checked;
  save(); renderMain();
}
function copyShopping() {
  const list = shoppingItems().filter((i) => !state.checked[i.key] && (i.left > 0 || !i.quantity)).map((i) => `- ${i.name}${i.left ? ': ' + fmtQty(i.left, i.unit) : ''}`).join('\n');
  if (!list) { toast('No hay nada pendiente de comprar'); return; }
  (navigator.clipboard?.writeText(list) || Promise.reject()).then(() => toast('Lista copiada'), () => prompt('Copia tu lista:', list));
}

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
    `<button class="btn primary" onclick="openFoodForm(today())">+ Comida</button><button class="btn" onclick="openEatRecipe(today())">+ Receta</button>`) +
  weekNav() + rakBanner(weekStart()) +
  `<div class="grid stats4"><div class="card"><div class="muted small">HIERRO DE LA SEMANA</div><div class="metric">${fmtMg(total)} mg</div></div>
    <div class="card"><div class="muted small">MEDIA POR DÍA REGISTRADO</div><div class="metric ${ironLevel(avg, goalDay())}">${fmtMg(avg)} mg</div><small class="muted">objetivo ${goalDay()} mg</small></div>
    <div class="card"><div class="muted small">DÍAS CON OBJETIVO</div><div class="metric">${hit} / ${past.length}</div></div>
    <div class="card"><div class="muted small">COMIDAS SIN DATO</div><div class="metric">${unknown}</div></div></div>
  <div class="section-head"><h2>Hierro por día</h2></div><div class="card">${ironChart(dates)}</div>
  <div class="section-head"><h2>Detalle</h2></div>
  <div class="day-list">${days.map((x) => dayDetail(x)).join('')}</div>
  <div class="notice">💡 La vitamina C (cítricos, pimiento, kiwi) ayuda a absorber el hierro vegetal; el té y el café junto a las comidas lo dificultan. El hierro ingerido no equivale al absorbido: esto no sustituye el seguimiento médico.</div>`;
}

function dayDetail(x) {
  const d = x.d, rows = [];
  for (const f of foodFor(d)) {
    const v = ironVal(f.iron);
    rows.push(`<div class="entry"><span class="entry-meal">${h(f.meal)}</span><span class="entry-name">${h(f.name)}</span><span class="entry-fe ${v === null ? '' : ironLevel(v, goalMeal())}">${v === null ? 'Fe ?' : fmtMg(v) + ' mg'}</span>
      <button class="icon-btn" aria-label="Quitar" onclick="removeFood(${q(f.id)})">×</button></div>`);
  }
  for (const e of rakOf(d)) {
    rows.push(`<div class="entry"><span class="entry-meal">RAK ${RAK_MEAL[e.service] || ''}</span><span class="entry-name">${h((e.dishes || []).map((z) => z.dish_name).join(', '))}</span><span class="entry-fe ${ironLevel(e.iron_total_mg, goalMeal())}">${fmtMg(e.iron_total_mg)} mg</span>
      <button class="icon-btn" aria-label="Quitar" onclick="undoRAK(${q(d)},${q(e.service)})">×</button></div>`);
  }
  if (d >= today()) {
    for (const m of MEALS) {
      const k = d + '|' + m, r = recipe(state.plan[k]);
      if (!r || eatenFor(k)) continue;
      rows.push(`<div class="entry planned"><span class="entry-meal">${m}</span><span class="entry-name">${h(r.name)} <small>(previsto)</small></span><span class="entry-fe">${ironVal(r.iron) === null ? 'Fe ?' : fmtMg(r.iron) + ' mg'}</span>
        <button class="btn mini" onclick="toggleEaten(${q(k)})">Comido</button></div>`);
    }
  }
  return `<div class="card day-card ${d === today() ? 'today' : ''}" id="day-${d}"><div class="day-card-head"><div><b>${fmtDay(d)}</b></div>${ironBar(x)}</div>
    ${rows.length ? rows.join('') : '<div class="muted small" style="padding:8px 0">Nada registrado.</div>'}
    <div class="buttons day-actions"><button class="btn mini" onclick="openFoodForm(${q(d)})">+ Comida</button><button class="btn mini" onclick="openEatRecipe(${q(d)})">+ Receta</button></div></div>`;
}

const defaultMeal = () => { const hr = new Date().getHours(); return hr < 11 ? 'Desayuno' : hr < 16 ? 'Comida' : hr < 19 ? 'Merienda' : 'Cena'; };

function openFoodForm(date) {
  showModal(`${modalTop('Registrar una comida', `<div class="eyebrow">${fmtDay(date)}</div>`)}
    <form onsubmit="event.preventDefault();addFood(this,${q(date)})"><div class="form-grid">
      ${field('Momento', `<select name="meal">${MEALS.map((m) => `<option ${m === defaultMeal() ? 'selected' : ''}>${m}</option>`).join('')}</select>`)}
      ${field('Hierro ingerido (mg, opcional)', `<input name="iron" type="number" min="0" step="0.1" placeholder="En blanco si no lo sabes">`)}
      ${field('¿Qué has comido? (puede ser fuera de casa)', `<input name="name" required placeholder="Ej. Lentejas con arroz">`, 'wide')}</div>
      <div class="buttons" style="margin-top:15px"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" onclick="closeModal()">Cancelar</button></div></form>`);
}
function addFood(form, date) {
  const f = Object.fromEntries(new FormData(form));
  state.consumed.push({ id: eid(), date, meal: f.meal, name: f.name.trim(), iron: f.iron === '' ? null : Number(f.iron) });
  save(); closeModal(); render(); toast('Comida registrada');
}
function openEatRecipe(date, recipeId) {
  if (!state.recipes.length) { toast('Primero añade una receta.', 'warn'); return; }
  const list = [...state.recipes].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  showModal(`${modalTop('Registrar una receta comida', `<div class="eyebrow">${fmtDay(date)}</div>`)}
    <form onsubmit="event.preventDefault();addEatRecipe(this,${q(date)})"><div class="form-grid">
      ${field('Receta', `<select name="recipe">${list.map((r) => `<option value="${h(r.id)}" ${r.id === recipeId ? 'selected' : ''}>${h(r.name)}${ironVal(r.iron) !== null ? ' · ' + fmtMg(r.iron) + ' mg Fe' : ''}</option>`).join('')}</select>`, 'wide')}
      ${field('Raciones comidas', `<input name="portions" type="number" min="0.25" step="0.25" value="1" required>`)}
      ${field('Momento', `<select name="meal">${MEALS.map((m) => `<option ${m === defaultMeal() ? 'selected' : ''}>${m}</option>`).join('')}</select>`)}</div>
      <div class="buttons" style="margin-top:15px"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" onclick="closeModal()">Cancelar</button></div></form>`);
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

// ═══════════════════════════════════════════════════════════════════════════
// RAK (restaurante universitario)
// ═══════════════════════════════════════════════════════════════════════════
const rakWeeks = {}; // lunes ISO -> { state: loading|fetching|done|empty|error, count, fetchedAt, message, pending }
const rakBusy = (s) => s === 'loading' || s === 'fetching';
const rakPageActive = () => ['Inicio', 'Calendario', 'Equilibrio'].includes(page);

/** Carga la semana desde la base de datos y, si falta o está vieja, pide al servidor que la traiga del RAK. */
async function ensureRak(start, { force = false } = {}) {
  if (!window.RAK || !window.NutriCloud?.getClient?.()) return;
  const cur = rakWeeks[start];
  if (rakBusy(cur?.state) || (cur && !force)) return;
  const dates = weekDates(start), thisWeek = weekStart(0), horizon = datePlus(thisWeek, 14);
  const set = (key, o) => { rakWeeks[key] = o; if (rakPageActive()) renderMain(); };
  const next = datePlus(start, 7);
  let fetchingNext = false;
  set(start, { state: 'loading' });
  try {
    let info = await RAK.loadWeek(dates);
    const stale = !info.fetchedAt || Date.now() - new Date(info.fetchedAt).getTime() > 24 * 3600e3;
    if (start >= thisWeek && start <= horizon && (force || info.count === 0 || stale)) {
      const targets = [start];
      if (next <= horizon) { targets.push(next); fetchingNext = !rakBusy(rakWeeks[next]?.state); }
      if (fetchingNext) rakWeeks[next] = { state: 'fetching' };
      set(start, { state: 'fetching', count: info.count, fetchedAt: info.fetchedAt });
      const rep = await RAK.refresh(targets);
      info = await RAK.loadWeek(dates);
      if (fetchingNext) {
        const ni = await RAK.loadWeek(weekDates(next));
        rakWeeks[next] = { state: ni.count ? 'done' : 'empty', count: ni.count, fetchedAt: ni.fetchedAt };
        fetchingNext = false;
      }
      set(start, { state: info.count ? 'done' : 'empty', count: info.count, fetchedAt: info.fetchedAt, pending: rep.pending || 0 });
      if (force) {
        toast(rep.pending ? `Menú RAK actualizado. Quedan ${rep.pending} platos por analizar: vuelve a pulsar «Actualizar» en un rato.` : `Menú RAK actualizado · ${rep.menus_fetched} platos`, rep.pending ? 'warn' : '');
      }
    } else {
      set(start, { state: info.count ? 'done' : 'empty', count: info.count, fetchedAt: info.fetchedAt });
    }
  } catch (e) {
    const info = RAK.weekInfo(dates);
    set(start, { state: info.count ? 'done' : 'error', count: info.count, fetchedAt: info.fetchedAt, message: e.message });
    if (force || !info.count) toast('RAK: ' + e.message, 'warn');
  } finally {
    if (fetchingNext && rakWeeks[next]?.state === 'fetching') delete rakWeeks[next];
  }
}
function refreshRAK() { ensureRak(weekStart(), { force: true }); }

function rakBanner(start) {
  if (!window.RAK) return '';
  if (!window.NutriCloud?.getClient?.()) return `<div class="rak-banner">🍽 Configura Supabase para ver el menú del RAK.</div>`;
  const st = rakWeeks[start] || { state: 'loading' }, busy = rakBusy(st.state);
  const msg = {
    loading: 'Cargando el menú del RAK…',
    fetching: 'Buscando el menú en la web del RAK y analizando gluten y hierro… puede tardar hasta un minuto.',
    done: `Menú RAK de esta semana: <b>${st.count}</b> platos · actualizado ${ago(st.fetchedAt)}${st.pending ? ` · <b>${st.pending}</b> sin analizar aún` : ''}${st.message ? ' · ⚠ no se pudo actualizar' : ''}`,
    empty: start < weekStart(0) ? 'No hay menú RAK guardado para esta semana pasada.' : 'El RAK todavía no ha publicado el menú de esta semana (o aún no se ha cargado).',
    error: 'No se pudo cargar el menú del RAK: ' + h(st.message || 'error desconocido'),
  }[st.state];
  return `<div class="rak-banner ${st.state}">${busy ? '<span class="spinner"></span>' : '🍽'} <span>${msg}</span>
    <button class="btn mini" ${busy ? 'disabled' : ''} onclick="refreshRAK()">${busy ? 'Un momento…' : st.state === 'empty' || st.state === 'error' ? 'Buscar en el RAK' : 'Actualizar'}</button></div>`;
}

const GLUTEN_LABEL = { confirmed_gf: ['Sin gluten', 'good'], contains_gluten: ['Contiene gluten', 'low'], unknown: ['Gluten por confirmar', ''] };
const EFFECTIVE_LABEL = { confirmed_gf: '✅ Sin gluten', acceptable: '⚠️ Adaptable (gluten mínimo o evitable)', no_option: '⛔ Con gluten' };
const CONF_LABEL = { official: 'oficial', estimated: 'estimado', approximate: 'aprox.', insufficient: '?' };

/** Bloque RAK dentro de la comida/cena del calendario */
function rakSlot(date, svc) {
  const eaten = rakOf(date).find((e) => e.service === svc);
  if (eaten) {
    return `<div class="rak-slot-inner rak-status-good-iron"><div class="rak-label">RAK · comido</div><div class="rak-indicator">✓ ${fmtMg(eaten.iron_total_mg)} mg Fe</div>
      <div class="buttons"><button class="btn mini" onclick="showRAKModal(${q(date)},${q(svc)})">Ver</button><button class="btn mini" onclick="undoRAK(${q(date)},${q(svc)})">Deshacer</button></div></div>`;
  }
  const dishes = RAK.getDay(date, svc);
  if (dishes === null) {
    if (date < today()) return '';
    const st = rakWeeks[mondayOf(date)]?.state;
    return `<div class="rak-slot-inner rak-status-no-gf"><div class="rak-label">RAK</div><div class="rak-indicator">${rakBusy(st) || !st ? 'Cargando menú…' : 'Sin menú publicado'}</div></div>`;
  }
  const best = RAK.getBestGlutenFreeCombo(date, svc);
  if (!best) {
    return `<div class="rak-slot-inner rak-status-no-gf"><div class="rak-label">RAK</div><div class="rak-indicator">⛔ Sin opción sin gluten</div>
      <div class="buttons"><button class="btn mini" onclick="showRAKModal(${q(date)},${q(svc)})">Detalles</button></div></div>`;
  }
  const ironOk = best.iron_known && best.iron_total >= goalMeal(), full = best.effective_status === 'confirmed_gf';
  const cls = !full ? 'rak-status-acceptable' : !best.iron_known || ironOk ? 'rak-status-good-iron' : 'rak-status-low-iron';
  const ironText = !best.iron_known ? 'Hierro sin estimar' : `${ironOk ? 'Buen aporte' : 'Aporte bajo'} · ${fmtMg(best.iron_total)} mg Fe`;
  return `<div class="rak-slot-inner ${cls}"><div class="rak-label">RAK${full ? '' : ' · adaptable'}${best.uncertain ? ' · por confirmar' : ''}</div>
    <div class="rak-indicator">${h(best.plat?.dish_name || '')}${best.accompagnement ? ' + ' + h(best.accompagnement.dish_name) : ''}</div>
    ${best.suggestions.length ? `<div class="rak-suggestion">${h(best.suggestions[0])}</div>` : ''}
    <div class="rak-iron-note">${ironText}</div>
    <div class="buttons"><button class="btn mini" onclick="showRAKModal(${q(date)},${q(svc)})">Detalles</button><button class="btn mini primary" onclick="eatRAK(${q(date)},${q(svc)},${q(best.number)})">Lo he comido</button>
    ${best.iron_known && !ironOk ? `<button class="btn mini" onclick="showRAKRecipes(${q(date)},${q(svc)})">Alternativas</button>` : ''}</div></div>`;
}

function showRAKModal(date, svc) {
  if (!window.RAK) return;
  const combos = RAK.getCombos(date, svc), dishes = RAK.getDay(date, svc) || [];
  const eaten = rakOf(date).find((e) => e.service === svc);
  const dishLine = (d) => {
    if (!d) return '';
    const [gl, cls] = GLUTEN_LABEL[d.gluten_status] || GLUTEN_LABEL.unknown;
    const fe = d.iron_mg_estimated != null ? `${fmtMg(d.iron_mg_estimated)} mg Fe (${CONF_LABEL[d.iron_confidence] || '?'})` : 'Fe sin estimar';
    return `<div class="dish"><b>${h(d.dish_name)}</b> <span class="tag ${cls}">${gl}</span> <small>${fe}</small>
      ${d.gluten_reasoning ? `<small class="muted">${h(d.gluten_reasoning)}</small>` : ''}
      ${d.partial_gf && d.partial_gf_suggestion ? `<small class="rak-suggestion">→ ${h(d.partial_gf_suggestion)}</small>` : d.gluten_minor ? '<small class="muted">Gluten en muy poca cantidad (ligante)</small>' : ''}</div>`;
  };
  const body = combos ? combos.map((c) => `<div class="combo ${c.effective_status}"><div class="combo-head"><b>Opción ${c.number}</b><span>${EFFECTIVE_LABEL[c.effective_status]}${c.uncertain ? ' · provisional' : ''}</span>
      <b class="fe ${c.iron_known ? ironLevel(c.iron_total, goalMeal()) : ''}">${c.iron_known ? fmtMg(c.iron_total) + ' mg Fe' : 'Fe ?'}</b></div>
      ${dishLine(c.plat)}${dishLine(c.accompagnement)}
      ${!eaten && c.effective_status !== 'no_option' ? `<div class="buttons" style="margin-top:8px"><button class="btn primary mini" onclick="eatRAK(${q(date)},${q(svc)},${q(c.number)});closeModal()">Lo he comido</button></div>` : ''}</div>`).join('')
    : dishes.length ? dishes.map((d) => `<div class="combo">${dishLine(d)}</div>`).join('') : '<p class="muted">No hay platos disponibles.</p>';
  showModal(`${modalTop(`RAK · ${RAK_MEAL[svc]}`, `<div class="eyebrow">${fmtDay(date)}</div>`)}
    ${eaten ? `<div class="notice">✓ Comida confirmada · ${fmtMg(eaten.iron_total_mg)} mg Fe <button class="link" onclick="undoRAK(${q(date)},${q(svc)});closeModal()">Deshacer</button></div>` : ''}
    <div class="combos">${body}</div>
    <p class="small muted">El análisis de gluten y hierro lo estima una IA a partir del nombre del plato: confírmalo con el personal del RAK si tienes dudas.</p>
    <div class="buttons"><button class="btn" onclick="closeModal()">Cerrar</button></div>`);
}
function eatRAK(date, svc, number) {
  const combo = RAK.getCombos(date, svc)?.find((c) => c.number === number);
  if (!combo) return;
  RAK.confirmMeal(date, svc, combo.dishes);
  renderMain();
  toast(combo.iron_known ? `RAK registrado · +${fmtMg(combo.iron_total)} mg de hierro` : 'RAK registrado (sin dato de hierro)');
}
function undoRAK(date, svc) { RAK.unconfirmMeal(date, svc); renderMain(); }

function showRAKRecipes(date, svc) {
  const list = RAK.suggestRecipes().slice(0, 6);
  showModal(`${modalTop('Alternativas ricas en hierro')}
    <p class="muted">Recetas de tu biblioteca, de más a menos hierro:</p>
    ${list.length ? list.map((r) => `<div class="item"><div><b>${h(r.emoji || '')} ${h(r.name)}</b><small>${fmtMg(r.iron)} mg Fe por ración</small></div>
      <div class="buttons"><button class="btn mini" onclick="viewRecipe(${q(r.id)})">Ver</button><button class="btn mini primary" onclick="openPlan(${q(r.id)},${q(date)},${q(RAK_MEAL[svc])})">Planificar</button></div></div>`).join('') : '<p class="muted">Aún no tienes recetas con dato de hierro.</p>'}
    <div class="buttons" style="margin-top:12px"><button class="btn" onclick="closeModal()">Cerrar</button></div>`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Entrenamientos (manual, CSV Garmin y Strava)
// ═══════════════════════════════════════════════════════════════════════════
let stravaItems = state.stravaCache?.items || [], stravaStatus = 'Sin consultar', stravaLoading = false, stravaConnecting = false, stravaTried = false;
const STRAVA_CACHE_TTL = 30 * 60 * 1000;

async function connectStrava() {
  if (stravaConnecting) return;
  const client = window.NutriCloud?.getClient?.(), user = window.NutriCloud?.getUser?.(), cfg = window.NUTRIBOOK_SUPABASE;
  if (!client || !user) { toast('Primero inicia sesión en «Mi perfil».', 'warn'); return; }
  stravaConnecting = true; renderMain();
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session) throw Error(error?.message || 'No hay sesión activa');
    const res = await fetch(cfg.url + '/functions/v1/strava-oauth', {
      method: 'POST', body: '{}',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token, apikey: cfg.key },
    });
    const body = await res.json();
    if (!res.ok) throw Error(body.error || 'Error de OAuth');
    window.location.assign(body.url);
  } catch (e) { toast('Error al conectar Strava: ' + e.message, 'warn'); }
  finally { stravaConnecting = false; renderMain(); }
}
async function fetchStrava(force = false) {
  const client = window.NutriCloud?.getClient?.(), user = window.NutriCloud?.getUser?.(), cache = state.stravaCache;
  if (!client || !user) { stravaStatus = 'Inicia sesión en «Mi perfil» para consultar Strava'; renderMain(); return; }
  if (!force && cache?.items?.length && Date.now() - new Date(cache.fetchedAt).getTime() < STRAVA_CACHE_TTL) {
    stravaItems = cache.items; stravaStatus = 'Actividades de la caché (' + new Date(cache.fetchedAt).toLocaleTimeString('es-ES') + ')'; renderMain(); return;
  }
  stravaLoading = true; stravaStatus = 'Consultando actividades…'; renderMain();
  try {
    const { data, error } = await client.from('strava_activities').select('strava_id,name,sport_type,start_date,moving_time,distance_m,calories,average_heartrate').order('start_date', { ascending: false }).limit(150);
    if (error) throw error;
    stravaItems = data || [];
    state.stravaCache = { items: stravaItems, fetchedAt: new Date().toISOString() }; save();
    stravaStatus = stravaItems.length ? 'Actividades sincronizadas con Supabase' : 'Aún no hay actividades. Conecta Strava o sincroniza tu Garmin.';
  } catch (e) { stravaStatus = 'No se pudieron leer las actividades: ' + e.message; }
  finally { stravaLoading = false; renderMain(); }
}
function maybeLoadStrava() {
  if (stravaTried || !window.NutriCloud?.getUser?.()) return;
  stravaTried = true; fetchStrava(false);
}

function trainingPage() {
  const dates = weekDates(), wk = stravaItems.filter((x) => x.start_date && dates.includes(x.start_date.slice(0, 10)));
  const mins = wk.reduce((n, x) => n + (x.moving_time || 0), 0) / 60 + (state.workouts || []).filter((w) => dates.includes(w.date)).reduce((n, w) => n + (w.minutes || 0), 0);
  return pageHeader('Deporte', 'Entrenamientos manuales, Garmin (CSV) y Strava en un solo sitio.', `<button class="btn primary" onclick="openWorkoutForm(today())">+ Entrenamiento</button>`) +
  weekNav(`<span class="week-stat">🏃 <b>${Math.round(mins)}</b> min esta semana</span>`) +
  `<div class="card"><div class="card-title">Strava <span class="muted small">${h(stravaStatus)}</span></div>
    <div class="buttons"><button class="btn primary" onclick="connectStrava()" ${stravaConnecting ? 'disabled' : ''}>${stravaConnecting ? 'Conectando…' : 'Conectar Strava'}</button>
      <button class="btn" onclick="fetchStrava(true)" ${stravaLoading ? 'disabled' : ''}>${stravaLoading ? 'Cargando…' : 'Actualizar actividades'}</button>
      <button class="btn" onclick="document.getElementById('garmin-file').click()">Importar CSV Garmin</button><input id="garmin-file" type="file" accept=".csv" hidden onchange="importGarmin(this)"></div>
    <p class="small muted">Garmin → Strava → Supabase → NutriBook. Los tokens se guardan en el servidor. Strava puede no incluir calorías.</p></div>
  <div class="section-head"><h2>Semana</h2></div>
  <div class="day-list">${dates.map((d) => {
    const manual = (state.workouts || []).filter((w) => w.date === d), auto = stravaItems.filter((a) => a.start_date?.slice(0, 10) === d);
    return `<div class="card day-card ${d === today() ? 'today' : ''}"><div class="day-card-head"><b>${fmtDay(d)}</b><button class="btn mini" onclick="openWorkoutForm(${q(d)})">+ Añadir</button></div>
      ${manual.map((w) => `<div class="entry"><span class="entry-meal">${w.origin === 'garmin-csv' ? 'Garmin' : 'Manual'}</span><span class="entry-name">${h(w.sport)}${w.minutes ? ' · ' + w.minutes + ' min' : ''}${w.activeCalories ? ' · ' + w.activeCalories + ' kcal activas' : ''}${w.reportedCalories != null ? ' · ' + w.reportedCalories + ' kcal (Garmin, sin verificar)' : ''}</span><button class="icon-btn" aria-label="Quitar" onclick="removeWorkout(${q(w.id)})">×</button></div>`).join('')}
      ${auto.map((a) => `<div class="entry"><span class="entry-meal">Strava</span><span class="entry-name">${h(a.name || a.sport_type || 'Actividad')} · ${Math.round((a.moving_time || 0) / 60)} min${a.distance_m ? ' · ' + (a.distance_m / 1000).toFixed(2) + ' km' : ''}${a.average_heartrate ? ' · ' + Math.round(a.average_heartrate) + ' ppm' : ''}${a.calories != null ? ' · ' + Math.round(a.calories) + ' kcal' : ''}</span></div>`).join('')}
      ${manual.length + auto.length ? '' : '<div class="muted small" style="padding:6px 0">Sin actividad.</div>'}</div>`;
  }).join('')}</div>
  <div class="notice">Garmin Connect permite exportar la lista de actividades como CSV. La columna Calories puede ser calorías totales, no solo activas: se guarda aparte y no se usa para calcular objetivos.</div>`;
}
function openWorkoutForm(date) {
  showModal(`${modalTop('Añadir entrenamiento', `<div class="eyebrow">${fmtDay(date)}</div>`)}
    <form onsubmit="event.preventDefault();addWorkout(this,${q(date)})"><div class="form-grid">
      ${field('Deporte', `<input name="sport" required placeholder="Natación, ciclismo, carrera, fuerza…">`, 'wide')}
      ${field('Duración (min)', `<input name="minutes" type="number" min="0">`)}
      ${field('Calorías activas estimadas', `<input name="kcal" type="number" min="0">`)}</div>
      <div class="buttons" style="margin-top:15px"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" onclick="closeModal()">Cancelar</button></div></form>`);
}
function addWorkout(form, date) {
  const f = Object.fromEntries(new FormData(form));
  state.workouts = state.workouts || [];
  state.workouts.push({ id: eid(), date, sport: f.sport.trim(), minutes: f.minutes === '' ? null : Number(f.minutes), activeCalories: f.kcal === '' ? null : Number(f.kcal), origin: 'manual' });
  save(); closeModal(); render(); toast('Entrenamiento guardado');
}
function removeWorkout(id) {
  const old = state.workouts.find((x) => x.id === id);
  state.workouts = state.workouts.filter((x) => x.id !== id);
  save(); renderMain();
  toast('Entrenamiento eliminado', '', { label: 'Deshacer', run: () => { state.workouts.push(old); save(); renderMain(); } });
}
function csvRows(txt) {
  const rows = txt.replace(/^﻿/, '').trim().split(/\r?\n/), sep = (rows[0].match(/;/g) || []).length > (rows[0].match(/,/g) || []).length ? ';' : ',';
  return rows.map((line) => {
    const cells = []; let fieldText = '', quote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (quote && line[i + 1] === '"') { fieldText += '"'; i++; } else quote = !quote; }
      else if (c === sep && !quote) { cells.push(fieldText); fieldText = ''; }
      else fieldText += c;
    }
    cells.push(fieldText);
    return cells;
  });
}
async function importGarmin(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const rows = csvRows(await file.text()), heads = rows.shift().map((x) => x.toLowerCase().trim());
    const find = (variants) => heads.findIndex((x) => variants.includes(x));
    const dateCol = find(['date', 'fecha']), calCol = find(['calories', 'calorías', 'calorias']), nameCol = find(['title', 'título', 'titulo', 'activity type', 'tipo de actividad']);
    if (dateCol < 0) { toast('El CSV no tiene una columna Date/Fecha reconocible.', 'warn'); return; }
    const ws = rows.map((r) => {
      const raw = (r[dateCol] || '').trim();
      let date = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
      if (!date) { const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) date = m[3] + '-' + m[2] + '-' + m[1]; }
      if (!date) return null;
      const calories = calCol < 0 ? null : Number((r[calCol] || '').replace(/[^0-9.]/g, ''));
      return { id: eid(), date, sport: r[nameCol] || 'Actividad Garmin', minutes: null, activeCalories: null, reportedCalories: Number.isFinite(calories) ? calories : null, origin: 'garmin-csv' };
    }).filter(Boolean);
    if (!ws.length) { toast('No se encontraron fechas compatibles en el CSV.', 'warn'); return; }
    if (!confirm(`¿Importar ${ws.length} actividades? Las calorías del CSV no se considerarán calorías activas.`)) return;
    state.workouts = state.workouts || [];
    const seen = new Set(state.workouts.filter((w) => w.origin === 'garmin-csv').map((w) => w.date + '|' + w.sport + '|' + w.reportedCalories));
    let added = 0;
    for (const w of ws) { const k = w.date + '|' + w.sport + '|' + w.reportedCalories; if (!seen.has(k)) { state.workouts.push(w); seen.add(k); added++; } }
    save(); render(); toast(`Añadidas ${added} actividades`);
  } catch (e) { toast('Error leyendo el CSV: ' + e.message, 'warn'); }
  finally { input.value = ''; }
}

// ═══════════════════════════════════════════════════════════════════════════
// Perfil y datos
// ═══════════════════════════════════════════════════════════════════════════
function profile() {
  const p = state.profile;
  return pageHeader('Mi perfil', 'Tus preferencias y tus datos, bajo tu control.') + (window.NutriCloud?.panel() || '') +
  `<div class="card"><form onsubmit="event.preventDefault();saveProfile(this)"><div class="form-grid">
    ${field('Nombre (opcional)', `<input name="name" value="${h(p.name)}">`)}
    ${field('Objetivo principal', `<select name="goal">${['Alimentación equilibrada', 'Mejorar rendimiento deportivo', 'Ganar masa muscular', 'Mantener peso', 'Otro'].map((o) => `<option ${o === p.goal ? 'selected' : ''}>${o}</option>`).join('')}</select>`)}
    ${field('Nutrientes que quieres priorizar', `<input name="priorities" value="${h(p.priorities)}">`)}
    ${field('Presupuesto semanal (€)', `<input name="budget" type="number" min="0" value="${h(p.budget)}">`)}
    ${field('Objetivo de hierro diario (mg)', `<input name="ironDailyGoal" type="number" min="1" step="0.5" value="${Number(p.ironDailyGoal) || 16}">`)}
    ${field('Objetivo de hierro por comida (mg)', `<input name="ironMealGoal" type="number" min="1" step="0.5" value="${Number(p.ironMealGoal) || 5}">`)}
    ${field('Preferencias, alergias y notas', `<textarea name="notes">${h(p.notes)}</textarea>`, 'wide')}</div>
    <div class="buttons" style="margin-top:15px"><button class="btn primary" type="submit">Guardar perfil</button></div></form></div>
  <div class="section-head"><h2>Mis datos</h2></div>
  <div class="card"><p class="muted">${window.NutriCloud?.getUser?.() ? 'Tus datos se guardan en este navegador y en tu cuenta (sincronización activa).' : 'Tus datos se guardan solo en este navegador. Inicia sesión arriba para sincronizarlos.'} Exporta copias de vez en cuando.</p>
    <div class="buttons"><button class="btn primary" onclick="exportData()">↓ Exportar copia JSON</button><button class="btn" onclick="document.getElementById('import-json').click()">↑ Importar copia JSON</button><button class="btn danger" onclick="clearAll()">Eliminar todos mis datos</button>
    <input id="import-json" type="file" accept="application/json" hidden onchange="importData(this)"></div></div>`;
}
function saveProfile(form) {
  const f = Object.fromEntries(new FormData(form));
  state.profile = { ...state.profile, ...f, ironDailyGoal: Number(f.ironDailyGoal) || 16, ironMealGoal: Number(f.ironMealGoal) || 5 };
  save(); toast('Perfil guardado');
}
function exportData() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })), a = document.createElement('a');
  a.href = url; a.download = 'nutribook-copia-' + today() + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 300);
}
async function importData(inp) {
  const f = inp.files?.[0];
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.recipes) || !Array.isArray(d.pantry) || typeof d.plan !== 'object') throw 0;
    if (!confirm('Se reemplazarán los datos actuales. ¿Continuar?')) return;
    state = hydrate(d); save(); render(); toast('Datos importados');
  } catch { toast('No se pudo importar: archivo no compatible.', 'warn'); }
  finally { inp.value = ''; }
}
function clearAll() {
  if (!confirm('¿Eliminar TODAS las recetas, el calendario y la despensa de este navegador?')) return;
  state = DEFAULTS(); save(); render();
}

// ═══════════════════════════════════════════════════════════════════════════
// Arranque
// ═══════════════════════════════════════════════════════════════════════════
const hashPage = decodeURIComponent(location.hash.slice(1));
if (PAGES.some((p) => p.id === hashPage)) page = hashPage;
window.addEventListener('hashchange', () => {
  const p = decodeURIComponent(location.hash.slice(1));
  if (PAGES.some((x) => x.id === p) && p !== page) { page = p; modal = null; weekOffset = 0; render(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal) closeModal(); });

// Vuelta de Strava (?strava=connected|cancelled)
let afterStrava = null;
const stravaParam = new URLSearchParams(location.search).get('strava');
if (stravaParam) { page = 'Entrenamientos'; history.replaceState(null, '', location.pathname + '#Entrenamientos'); afterStrava = stravaParam; }

window.NutriBook = { getState: () => state, save };
if (!window.NutriCloud) authLoading = false;
render();
setTimeout(() => { if (authLoading) { authLoading = false; render(); } }, 6000); // red lenta: no dejar la pantalla de carga

window.NutriCloud?.start({
  read: () => state,
  apply: (data) => {
    state = hydrate(data);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sin espacio */ }
    render();
  },
  onReady: () => {
    authLoading = false; render();
    if (afterStrava) {
      toast(afterStrava === 'connected' ? 'Strava conectado ✓' : 'Conexión con Strava cancelada', afterStrava === 'connected' ? '' : 'warn');
      if (afterStrava === 'connected') { stravaTried = true; fetchStrava(true); }
      afterStrava = null;
    }
  },
  onConnect: () => {
    const meta = window.NutriCloud?.getUserMeta?.() || {};
    if (!state.profile.name && meta.full_name) { state.profile.name = meta.full_name; save(); }
  },
});
