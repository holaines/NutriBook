'use strict';
/* NutriBook — planificación automática de la semana (funciones puras: no tocan el estado). */

const PLAN_ORDER = ['Comida', 'Cena', 'Desayuno', 'Merienda'];   // primero lo que más hierro suele aportar
const PLAN_PREFERS = {
  Desayuno: ['Desayunos'],
  Comida: ['Comidas', 'Batch cooking', 'Ensaladas', 'Sopas y cremas', 'Guarniciones'],
  Merienda: ['Meriendas', 'Snacks', 'Aperitivos'],
  Cena: ['Cenas', 'Comidas', 'Sopas y cremas', 'Ensaladas'],
};

/** Generador pseudoaleatorio determinista (mulberry32): misma semilla, misma propuesta. */
function seededRandom(seed) {
  let a = (Number(seed) || 0) + 0x6D2B79F5;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Propone recetas para los huecos libres de `dates` intentando llegar a `goal` mg de hierro al día.
 * Solo rellena huecos vacíos de días >= `from`, no repite una receta más de `maxRepeat` veces y respeta `skip`.
 * Devuelve { assign: { 'fecha|Comida': idReceta }, totals: { fecha: mg planificados tras la propuesta } }.
 */
function planWeek({ recipes, plan, dates, goal, skip = new Set(), seed = 0, maxRepeat = 2, from = '0000-00-00' }) {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const iron = (r) => (r && Number.isFinite(Number(r.iron)) && r.iron !== null && r.iron !== '' ? Number(r.iron) : null);
  const rnd = seededRandom(seed), usage = {}, assign = {}, totals = {}, skipSet = skip instanceof Set ? skip : new Set(skip);
  for (const d of dates) for (const m of MEALS) { const id = plan[d + '|' + m]; if (id) usage[id] = (usage[id] || 0) + 1; }
  for (const d of dates) {
    let cur = MEALS.reduce((n, m) => n + (iron(byId.get(plan[d + '|' + m])) ?? 0), 0);
    if (d >= from) {
      const empty = PLAN_ORDER.filter((m) => !plan[d + '|' + m] && !skipSet.has(d + '|' + m));
      empty.forEach((m, i) => {
        const target = Math.max(0, (goal - cur) / (empty.length - i));
        let pool = recipes.filter((r) => (r.categories || []).some((c) => PLAN_PREFERS[m].includes(c)));
        if (!pool.length) pool = recipes;
        const known = pool.filter((r) => iron(r) !== null);
        if (known.length) pool = known;                                   // sin dato de hierro solo si no hay otra opción
        const fresh = pool.filter((r) => (usage[r.id] || 0) < maxRepeat);
        if (fresh.length) pool = fresh;
        let best = null, bestScore = Infinity;
        for (const r of pool) {
          const fe = iron(r);
          const score = (fe === null ? target + 2 : Math.abs(fe - target)) - (r.favorite ? 0.3 : 0) + rnd() * 1.5;
          if (score < bestScore) { best = r; bestScore = score; }
        }
        if (best) { assign[d + '|' + m] = best.id; usage[best.id] = (usage[best.id] || 0) + 1; cur += iron(best) ?? 0; }
      });
    }
    totals[d] = Math.round(cur * 10) / 10;
  }
  return { assign, totals };
}

/** Copia la planificación de una semana a otra sin pisar lo ya planificado. Devuelve { added: { clave: idReceta } }. */
function copyWeekPlan(plan, fromStart, toStart) {
  const added = {};
  for (let i = 0; i < 7; i++) for (const m of MEALS) {
    const id = plan[datePlus(fromStart, i) + '|' + m], dest = datePlus(toStart, i) + '|' + m;
    if (id && !plan[dest]) added[dest] = id;
  }
  return { added };
}

/** Mueve (o intercambia) una receta planificada entre dos huecos. Las comidas ya marcadas como comidas no se mueven. */
function moveSlotPlan(plan, from, to, locked = () => false) {
  if (from === to || !plan[from] || locked(from) || locked(to)) return null;
  const next = { ...plan };
  if (next[to]) { next[from] = plan[to]; next[to] = plan[from]; } else { next[to] = plan[from]; delete next[from]; }
  return next;
}
