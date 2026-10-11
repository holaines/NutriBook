'use strict';
/* NutriBook — núcleo: constantes, utilidades, estado y cálculo de hierro (script clásico; comparte el ámbito global con el resto de src/). */

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
  { id: 'Perfil', label: 'Mi perfil', icon: '👤' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Utilidades
// ═══════════════════════════════════════════════════════════════════════════
const $ = (s) => document.querySelector(s);
const eid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  schemaVersion: SCHEMA_VERSION,
  sync: { deleted: {}, stamps: {} },
  recipes: [], pantry: [], plan: {}, checked: {}, consumed: [], rakConsumed: [], supplements: [], labs: [], shoppingExtra: [], rakFavs: [],
  profile: { name: '', goal: 'Alimentación equilibrada', priorities: 'Hierro, vitamina C, proteínas', budget: '', notes: '', ironDailyGoal: 16, ironMealGoal: 5, sex: '', age: '', status: 'none', diet: 'omnivore', onboarded: false },
});
/** Migraciones del JSON guardado: MIGRATIONS[n] lleva los datos de la versión n-1 a la n. */
const SCHEMA_VERSION = 7;
const MIGRATIONS = {
  1: (d) => { delete d.workouts; delete d.stravaCache; return d; },   // sección Deporte retirada
  2: (d) => ({ ...d, sync: { deleted: {}, stamps: {}, ...(d.sync || {}) } }),   // marcas para la sincronización por elemento
  // quien ya usa la app no vuelve a ver la bienvenida
  3: (d) => ({ ...d, profile: { ...(d.profile || {}), onboarded: Boolean((d.profile || {}).onboarded || (d.recipes || []).length || (d.consumed || []).length || (d.profile || {}).name) } }),
  4: (d) => ({ ...d, supplements: d.supplements || [] }),   // complementos de hierro
  5: (d) => ({ ...d, labs: d.labs || [] }),   // análisis de sangre
  6: (d) => ({ ...d, shoppingExtra: d.shoppingExtra || [] }),   // extras de la lista de la compra
  7: (d) => ({ ...d, rakFavs: d.rakFavs || [] }),   // platos favoritos del RAK
};
function migrate(d) {
  d = { ...d };
  for (let v = (Number(d.schemaVersion) || 0) + 1; v <= SCHEMA_VERSION; v++) d = MIGRATIONS[v](d);
  d.schemaVersion = Math.max(Number(d.schemaVersion) || 0, SCHEMA_VERSION);
  return d;
}
function hydrate(d) {
  const base = DEFAULTS();
  d = migrate(d || {});
  return { ...base, ...d, profile: { ...base.profile, ...(d.profile || {}) } };
}
function load() {
  try { return hydrate(JSON.parse(localStorage.getItem(KEY))); } catch { return DEFAULTS(); }
}
function save() {
  window.NBMerge?.stamp(state);   // marca lo modificado/borrado antes de guardar (sincronización por elemento)
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { toast('No queda espacio en el navegador. Exporta tus datos desde «Mi perfil».', 'warn'); }
  window.NutriCloud?.scheduleSave(state);
}

let state = load();
window.NBMerge?.reset(state);
let page = 'Inicio', weekOffset = 0, modal = null, authLoading = true;
let filters = { search: '', cat: '', maxTime: '', ingredient: '', sort: 'recent', fav: false, iron: false };
const recipe = (id) => state.recipes.find((r) => r.id === id);

// ═══════════════════════════════════════════════════════════════════════════
// Hierro: cálculo central (lo usan Inicio, Calendario y Mi hierro)
// ═══════════════════════════════════════════════════════════════════════════
/** Objetivo orientativo de hierro (mg/día) según el perfil. Valores de referencia de población general (EFSA 2015); no es consejo médico. */
function recommendedIron(p = {}) {
  const age = Number(p.age) || null, female = p.sex === 'F', male = p.sex === 'M';
  let mg = 16, basis = 'Valor habitual para una mujer adulta (completa tu perfil para afinarlo)';
  if (age && age < 12) { mg = 11; basis = 'Referencia para niñas y niños de 4 a 11 años'; }
  else if (age && age < 18) { mg = female ? 13 : 11; basis = 'Referencia para adolescentes'; }
  else if (male) { mg = 11; basis = 'Referencia para hombres adultos'; }
  else if (female && (p.status === 'pregnant' || p.status === 'breastfeeding')) { mg = 16; basis = p.status === 'pregnant' ? 'Referencia durante el embarazo' : 'Referencia durante la lactancia'; }
  else if (female && age && age >= 51) { mg = 11; basis = 'Referencia para mujeres posmenopáusicas'; }
  else if (female) { mg = 16; basis = 'Referencia para mujeres adultas antes de la menopausia'; }
  return { mg, meal: Math.round(mg / 3 * 2) / 2, basis, vegetarian: p.diet === 'vegetarian' };
}
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
  const goal = goalDay(), r2 = (v) => Math.round(v * 100) / 100;   // sin ruido de coma flotante
  eaten = r2(eaten); planned = r2(planned);
  return { eaten, planned, total: r2(eaten + planned), unknown, goal, level: ironLevel(eaten + planned, goal) };
}
