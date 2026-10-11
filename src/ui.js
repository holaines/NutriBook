'use strict';
/* NutriBook — componentes compartidos, navegación y render (script clásico; comparte el ámbito global con el resto de src/). */

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
