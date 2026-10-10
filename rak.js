/* NutriBook: module RAK — menus du restaurant universitaire. */
(function () {
  'use strict';

  // Cache en memoire: cle = "YYYY-MM-DD|service"
  const cache = {};
  let lastFetch = null;

  function getClient() {
    return window.NutriCloud?.getClient?.() ?? null;
  }

  // Charge les plats RAK pour une liste de dates ISO (semaine visible)
  async function loadWeek(weekDates) {
    const client = getClient();
    if (!client) return;

    const { data, error } = await client
      .from('rak_menus')
      .select('*')
      .in('menu_date', weekDates);

    if (error) {
      console.warn('RAK loadWeek error:', error.message);
      return;
    }

    // Vider le cache pour ces dates
    for (const d of weekDates) {
      delete cache[d + '|dejeuner'];
      delete cache[d + '|diner'];
    }

    // Remplir le cache
    for (const dish of (data || [])) {
      const key = dish.menu_date + '|' + dish.service;
      if (!cache[key]) cache[key] = [];
      cache[key].push(dish);
    }

    lastFetch = new Date();
  }

  // Retourne les plats du jour/service (null = pas encore chargé)
  function getDay(date, service) {
    const key = date + '|' + service;
    return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null;
  }

  // Regroupe les plats par combo : plat1+accompagnement1, plat2+accompagnement2, etc.
  // Retourne [{number, plat, accompagnement, dishes, iron_total, gluten_status}] ou null
  function getCombos(date, service) {
    const dishes = getDay(date, service);
    if (!dishes) return null;

    var numbers = [];
    dishes.forEach(function (d) {
      var m = (d.dish_category || '').match(/^(?:plat|accompagnement)(\d+)$/);
      if (m && numbers.indexOf(m[1]) === -1) numbers.push(m[1]);
    });
    numbers.sort();

    var combos = numbers.map(function (n) {
      var plat = dishes.find(function (d) { return d.dish_category === 'plat' + n; }) || null;
      var acc  = dishes.find(function (d) { return d.dish_category === 'accompagnement' + n; }) || null;
      var items = [plat, acc].filter(Boolean);
      var iron = items.reduce(function (s, d) { return s + (Number(d.iron_mg_estimated) || 0); }, 0);
      var hasGluten = items.some(function (d) { return d.gluten_status === 'contains_gluten'; });
      var allGF = items.length > 0 && items.every(function (d) { return d.gluten_status === 'confirmed_gf'; });
      return {
        number: n,
        plat: plat,
        accompagnement: acc,
        dishes: items,
        iron_total: Math.round(iron * 10) / 10,
        gluten_status: hasGluten ? 'contains_gluten' : (allGF ? 'confirmed_gf' : 'unknown')
      };
    });

    return combos.length ? combos : null;
  }

  // Meilleur combo sans gluten (fer max), ou null
  function getBestGlutenFreeCombo(date, service) {
    var combos = getCombos(date, service);
    if (!combos) return null;
    var gf = combos.filter(function (c) { return c.gluten_status === 'confirmed_gf'; });
    if (!gf.length) return null;
    return gf.slice().sort(function (a, b) { return (b.iron_total || 0) - (a.iron_total || 0); })[0];
  }

  // Meilleur plat sans gluten (fer max), ou null — conservé pour compatibilité
  function getBestGlutenFreeOption(date, service) {
    var combo = getBestGlutenFreeCombo(date, service);
    return combo ? (combo.plat || combo.dishes[0] || null) : null;
  }

  // Appelle la Edge Function pour scraper + analyser le RAK, puis vide le cache
  // weekStart : date ISO du lundi de la semaine visible (ex: "2026-10-12")
  async function refresh(weekStart) {
    const client = getClient();
    const cfg = window.NUTRIBOOK_SUPABASE;
    if (!client || !cfg?.url) throw new Error('Supabase non configuré');

    const { data: sessData } = await client.auth.getSession();
    const token = sessData?.session?.access_token;

    const headers = { 'Content-Type': 'application/json', 'apikey': cfg.key };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(cfg.url + '/functions/v1/rak-fetch', {
      method: 'POST',
      headers,
      body: JSON.stringify({ weekStart: weekStart || null }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur Edge Function rak-fetch');

    // Vider tout le cache pour forcer le rechargement
    for (const key of Object.keys(cache)) delete cache[key];
    lastFetch = new Date();
    return body;
  }

  // Enregistre un repas RAK consommé dans state.rakConsumed
  function confirmMeal(date, service, dishes) {
    const nb = window.NutriBook;
    if (!nb) return;
    const state = nb.getState();
    state.rakConsumed = state.rakConsumed || [];

    const ironTotal = dishes.reduce(function (n, d) {
      return n + (Number(d.iron_mg_estimated) || 0);
    }, 0);

    // Remplacer une éventuelle entrée existante pour ce date+service
    state.rakConsumed = state.rakConsumed.filter(function (x) {
      return !(x.date === date && x.service === service);
    });

    state.rakConsumed.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      date: date,
      service: service,
      dishes: dishes.map(function (d) {
        return { dish_id: d.dish_id, dish_name: d.dish_name, category: d.dish_category };
      }),
      iron_total_mg: Math.round(ironTotal * 10) / 10,
      confirmed_at: new Date().toISOString(),
    });

    nb.save();
  }

  // Repas RAK confirmés pour une date
  function getConsumed(date) {
    const state = window.NutriBook?.getState?.();
    return (state?.rakConsumed || []).filter(function (x) { return x.date === date; });
  }

  // Objectifs fer depuis le profil
  function ironGoal() {
    const p = window.NutriBook?.getState?.()?.profile || {};
    return { daily: Number(p.ironDailyGoal) || 16, meal: Number(p.ironMealGoal) || 5 };
  }

  // Recettes sans gluten triées par fer desc (depuis la bibliothèque)
  function suggestRecipes() {
    const state = window.NutriBook?.getState?.();
    const recipes = state?.recipes || [];
    return recipes
      .filter(function (r) { return r.iron != null && Number(r.iron) > 0; })
      .slice()
      .sort(function (a, b) { return (Number(b.iron) || 0) - (Number(a.iron) || 0); });
  }

  function getLastFetch() { return lastFetch; }

  window.RAK = {
    loadWeek: loadWeek,
    getDay: getDay,
    getCombos: getCombos,
    getBestGlutenFreeCombo: getBestGlutenFreeCombo,
    getBestGlutenFreeOption: getBestGlutenFreeOption,
    refresh: refresh,
    confirmMeal: confirmMeal,
    getConsumed: getConsumed,
    ironGoal: ironGoal,
    suggestRecipes: suggestRecipes,
    getLastFetch: getLastFetch,
  };
})();
