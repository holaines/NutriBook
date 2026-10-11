/* NutriBook: módulo RAK — menús del restaurante universitario (lectura en Supabase + refresco vía Edge Function). */
(function () {
  'use strict';

  // Caché en memoria: clave = "YYYY-MM-DD|service"  (service = dejeuner | diner)
  const cache = {};
  // Última fecha de actualización (fetched_at) vista por día: "YYYY-MM-DD" -> ISO
  const fetchedByDate = {};

  const getClient = () => window.NutriCloud?.getClient?.() ?? null;
  const isIso = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);

  // Carga los platos de una lista de fechas ISO. Devuelve { count, fetchedAt }.
  async function loadWeek(dates) {
    const client = getClient();
    if (!client) throw new Error('Supabase no está configurado');

    const { data, error } = await client.from('rak_menus').select('*').in('menu_date', dates);
    if (error) throw new Error(error.message);

    for (const d of dates) {
      delete cache[d + '|dejeuner'];
      delete cache[d + '|diner'];
      delete fetchedByDate[d];
    }
    for (const dish of data || []) {
      const key = dish.menu_date + '|' + dish.service;
      (cache[key] = cache[key] || []).push(dish);
      if (!fetchedByDate[dish.menu_date] || dish.fetched_at > fetchedByDate[dish.menu_date]) {
        fetchedByDate[dish.menu_date] = dish.fetched_at;
      }
    }
    return weekInfo(dates);
  }

  // Resumen de lo que hay en caché para unas fechas: { count, fetchedAt }
  function weekInfo(dates) {
    let count = 0, fetchedAt = null;
    for (const d of dates) {
      count += (cache[d + '|dejeuner'] || []).length + (cache[d + '|diner'] || []).length;
      if (fetchedByDate[d] && (!fetchedAt || fetchedByDate[d] > fetchedAt)) fetchedAt = fetchedByDate[d];
    }
    return { count, fetchedAt };
  }

  // Platos del día/servicio. null = día sin datos cargados.
  function getDay(date, service) {
    const key = date + '|' + service;
    return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null;
  }

  // Estado efectivo de un plato: confirmed_gf > acceptable > no_option
  //  - acceptable: contiene gluten pero evitable (partial_gf) o mínimo (gluten_minor), o estado desconocido
  function itemEffective(d) {
    if (!d) return 'confirmed_gf';
    if (d.gluten_status === 'confirmed_gf') return 'confirmed_gf';
    if (d.gluten_status === 'contains_gluten') return (d.partial_gf || d.gluten_minor) ? 'acceptable' : 'no_option';
    return 'acceptable';
  }

  // Agrupa plat{N} + accompagnement{N} en combos. null si no hay combos.
  function getCombos(date, service) {
    const dishes = getDay(date, service);
    if (!dishes) return null;

    const numbers = [];
    dishes.forEach((d) => {
      const m = (d.dish_category || '').match(/^(?:plat|accompagnement)(\d+)$/);
      if (m && !numbers.includes(m[1])) numbers.push(m[1]);
    });
    numbers.sort((a, b) => Number(a) - Number(b));

    const combos = numbers.map((n) => {
      const plat = dishes.find((d) => d.dish_category === 'plat' + n) || null;
      const acc = dishes.find((d) => d.dish_category === 'accompagnement' + n) || null;
      const items = [plat, acc].filter(Boolean);
      const iron = items.reduce((s, d) => s + (Number(d.iron_mg_estimated) || 0), 0);

      const statuses = items.map(itemEffective);
      const effective = statuses.every((s) => s === 'confirmed_gf') ? 'confirmed_gf'
        : statuses.includes('no_option') ? 'no_option' : 'acceptable';

      return {
        number: n,
        plat, accompagnement: acc, dishes: items,
        iron_total: Math.round(iron * 10) / 10,
        iron_known: items.some((d) => d.iron_mg_estimated != null),
        effective_status: effective,
        // algún plato sin analizar (o análisis fallido): el resultado es provisional
        uncertain: items.some((d) => d.gluten_status === 'unknown'),
        suggestions: items.filter((d) => d.partial_gf && d.partial_gf_suggestion).map((d) => d.partial_gf_suggestion),
      };
    });
    return combos.length ? combos : null;
  }

  // Mejor combo: confirmed_gf antes que acceptable; dentro de cada nivel, el de más hierro.
  function getBestGlutenFreeCombo(date, service) {
    const combos = getCombos(date, service);
    if (!combos) return null;
    const byIron = (a, b) => (b.iron_total || 0) - (a.iron_total || 0);
    for (const level of ['confirmed_gf', 'acceptable']) {
      const list = combos.filter((c) => c.effective_status === level);
      if (list.length) return list.sort(byIron)[0];
    }
    return null;
  }

  // Pide a la Edge Function que lea la web del RAK y analice los platos nuevos.
  // weekStarts: lunes ISO de las semanas a traer (máx. 3). Devuelve el informe del servidor.
  async function refresh(weekStarts) {
    const client = getClient();
    const cfg = window.NUTRIBOOK_SUPABASE;
    if (!client || !cfg?.url) throw new Error('Supabase no está configurado');
    const starts = (Array.isArray(weekStarts) ? weekStarts : [weekStarts]).filter(isIso);

    const { data: sessData } = await client.auth.getSession();
    const token = sessData?.session?.access_token;
    const headers = { 'Content-Type': 'application/json', apikey: cfg.key };
    headers.Authorization = 'Bearer ' + (token || cfg.key);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 170000);
    let res, text;
    try {
      res = await fetch(cfg.url + '/functions/v1/rak-fetch', {
        method: 'POST', headers, signal: ctrl.signal,
        body: JSON.stringify({ weekStarts: starts }),
      });
      text = await res.text();
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'El servidor tardó demasiado. Vuelve a intentarlo: el progreso se conserva.' : e.message);
    } finally {
      clearTimeout(timer);
    }
    let body = {};
    try { body = JSON.parse(text); } catch { /* respuesta no JSON (timeout de la plataforma) */ }
    if (!res.ok) {
      throw new Error(body.error || (res.status === 504 || res.status === 546
        ? 'El servidor tardó demasiado. Vuelve a intentarlo: el progreso se conserva.'
        : 'Error ' + res.status + ' en rak-fetch'));
    }
    return body;
  }

  // ───────── Comidas RAK confirmadas (state.rakConsumed)
  const appState = () => window.NutriBook?.getState?.();

  function confirmMeal(date, service, dishes) {
    const nb = window.NutriBook;
    if (!nb) return;
    const state = nb.getState();
    const iron = dishes.reduce((n, d) => n + (Number(d.iron_mg_estimated) || 0), 0);
    state.rakConsumed = (state.rakConsumed || []).filter((x) => !(x.date === date && x.service === service));
    state.rakConsumed.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      date, service,
      dishes: dishes.map((d) => ({ dish_id: d.dish_id, dish_name: d.dish_name, category: d.dish_category })),
      iron_total_mg: Math.round(iron * 10) / 10,
      confirmed_at: new Date().toISOString(),
    });
    nb.save();
  }

  function unconfirmMeal(date, service) {
    const nb = window.NutriBook;
    if (!nb) return;
    const state = nb.getState();
    state.rakConsumed = (state.rakConsumed || []).filter((x) => !(x.date === date && x.service === service));
    nb.save();
  }

  const getConsumed = (date) => (appState()?.rakConsumed || []).filter((x) => x.date === date);

  function ironGoal() {
    const p = appState()?.profile || {};
    return { daily: Number(p.ironDailyGoal) || 16, meal: Number(p.ironMealGoal) || 5 };
  }

  // Recetas de la biblioteca con hierro conocido, de mayor a menor.
  function suggestRecipes() {
    return (appState()?.recipes || [])
      .filter((r) => r.iron != null && Number(r.iron) > 0)
      .sort((a, b) => Number(b.iron) - Number(a.iron));
  }

  window.RAK = {
    loadWeek, weekInfo, getDay, getCombos, getBestGlutenFreeCombo,
    refresh, confirmMeal, unconfirmMeal, getConsumed, ironGoal, suggestRecipes,
  };
})();
