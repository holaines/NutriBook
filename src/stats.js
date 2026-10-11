'use strict';
/* NutriBook — estadísticas de hierro por periodo (semana o mes), rachas y fuentes principales. */

/** Resumen de un conjunto de días. Solo cuentan los días que ya han llegado; la media solo los días con algún registro. */
function periodStats(dates) {
  const days = dates.map((d) => ({ d, ...dayIron(d) })), past = days.filter((x) => x.d <= today());
  const logged = past.filter((x) => x.eaten > 0 || x.unknown > 0);
  return {
    days, total: days.reduce((n, x) => n + x.eaten, 0), loggedDays: logged.length, pastDays: past.length,
    avg: logged.length ? logged.reduce((n, x) => n + x.eaten, 0) / logged.length : 0,
    hit: past.filter((x) => x.eaten >= x.goal).length, unknown: days.reduce((n, x) => n + x.unknown, 0),
  };
}

/** Días seguidos cumpliendo el objetivo hasta hoy (si hoy aún no lo cumple, se cuenta desde ayer). */
function ironStreak(end = today()) {
  let d = dayIron(end).eaten >= goalDay() ? end : datePlus(end, -1), n = 0;
  while (n < 1000 && dayIron(d).eaten >= goalDay()) { n++; d = datePlus(d, -1); }
  return n;
}

/** Alimentos o recetas que más hierro han aportado en `dates`: [{ name, mg, count, share }]. */
function topSources(dates, limit = 5) {
  const acc = new Map();
  const add = (key, name, mg) => { if (!(mg > 0)) return; const s = acc.get(key) || { name, mg: 0, count: 0 }; s.mg += mg; s.count++; acc.set(key, s); };
  for (const d of dates) {
    for (const x of foodFor(d)) {
      const r = x.recipeId ? recipe(x.recipeId) : null;
      add(x.supplement ? 'sup:' + x.supId : x.foodId ? 'food:' + x.foodId : x.recipeId ? 'rec:' + x.recipeId : 'name:' + x.name.trim().toLowerCase(), (x.supplement ? '💊 ' : '') + (r?.name || x.name), Number(x.iron) || 0);
    }
    for (const e of rakOf(d)) add('rak', 'Menú del RAK', Number(e.iron_total_mg) || 0);
  }
  const all = [...acc.values()], total = all.reduce((n, s) => n + s.mg, 0);
  return all.sort((a, b) => b.mg - a.mg).slice(0, limit).map((s) => ({ ...s, mg: Math.round(s.mg * 10) / 10, share: total ? Math.round(s.mg / total * 100) : 0 }));
}

/** Compara la media por día registrado de dos periodos: { cur, prev, diff, pct } o null si no hay base de comparación. */
function comparePeriods(curDates, prevDates) {
  const cur = periodStats(curDates), prev = periodStats(prevDates);
  if (!cur.loggedDays || !prev.loggedDays || !(prev.avg > 0)) return null;
  return { cur: cur.avg, prev: prev.avg, diff: cur.avg - prev.avg, pct: Math.round((cur.avg - prev.avg) / prev.avg * 100) };
}

const monthStart = (d) => d.slice(0, 8) + '01';
/** Todas las fechas del mes (YYYY-MM) que contiene `anchor`. */
function monthDates(anchor) {
  const first = monthStart(anchor), out = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = datePlus(d, 1)) out.push(d);
  return out;
}
/** Primer día del mes `n` meses antes/después de `anchor`. */
function monthShift(anchor, n) { const x = parseDate(monthStart(anchor)); x.setMonth(x.getMonth() + n); return iso(x); }
