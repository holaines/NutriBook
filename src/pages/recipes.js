'use strict';
/* NutriBook — página Recetas (script clásico; comparte el ámbito global con el resto de src/). */

// ═══════════════════════════════════════════════════════════════════════════
// Recetas
// ═══════════════════════════════════════════════════════════════════════════
function toggleFilter(k) { setFilter(k, !filters[k]); }
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
    `<button class="btn primary" ${on('click', 'openForm')}>+ Nueva receta</button><button class="btn" ${on('click', 'openImport')}>Pegar receta</button>`) +
  `<div class="toolbar"><input aria-label="Buscar recetas" placeholder="Buscar por nombre o ingrediente…" value="${h(f.search)}" ${on('input', 'setFilter', 'search', '@value')}>
    <select aria-label="Categoría" ${on('change', 'setFilter', 'cat', '@value')}><option value="">Todas las categorías</option>${CATS.map((c) => `<option ${f.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
    <select aria-label="Tiempo máximo" ${on('change', 'setFilter', 'maxTime', '@value')}><option value="">Cualquier duración</option>${[10, 15, 20, 30, 45, 60].map((v) => `<option value="${v}" ${f.maxTime == v ? 'selected' : ''}>Hasta ${v} min</option>`).join('')}</select>
    <select aria-label="Ordenar" ${on('change', 'setFilter', 'sort', '@value')}>${[['recent', 'Más recientes'], ['name', 'Nombre A-Z'], ['iron', 'Más hierro'], ['time', 'Más rápidas']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <div class="chips"><button class="chip-btn ${f.iron ? 'on' : ''}" ${on('click', 'toggleFilter', 'iron')}>⚡ Ricas en hierro (≥ ${goalMeal()} mg)</button>
    <button class="chip-btn ${f.fav ? 'on' : ''}" ${on('click', 'toggleFilter', 'fav')}>★ Favoritas</button>
    <input class="chip-input" aria-label="Filtrar ingrediente" placeholder="Con ingrediente…" value="${h(f.ingredient)}" ${on('input', 'setFilter', 'ingredient', '@value')}>
    ${filtered ? `<button class="link"${on('click', 'resetFilters')}>Quitar filtros</button>` : ''}</div>` +
  (list.length ? `<div class="grid">${list.map(recipeCard).join('')}</div>`
    : empty('No hay recetas que mostrar', state.recipes.length ? 'Prueba con otros filtros.' : 'Empieza añadiendo la primera receta.',
      filtered ? `<button class="btn"${on('click', 'resetFilters')}>Quitar filtros</button>` : `<button class="btn primary"${on('click', 'openForm')}>Añadir receta</button>`));
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
  const src = { 'usda-estimate': '🔬 USDA', 'local-db': '🏠 base local', 'ai-estimate': '✨ IA', calc: '🧮 calculado', 'calc-partial': '🧮 parcial', manual: '✏️ manual' }[r.ironSource] || '✏️ manual';
  const calc = computeRecipeIron(r);
  const conf = { high: 'alta confianza', medium: 'confianza media', low: 'estimación aproximada' };
  showModal(`${modalTop(`${h(r.emoji)} ${h(r.name)}`, `<div class="eyebrow">${h((r.categories || []).join(' · '))}</div>`)}
    ${r.description ? `<p>${h(r.description)}</p>` : ''}
    <div class="buttons"><span class="pill">◷ ${r.time} min</span><span class="pill">🍽 ${r.servings} raciones</span>
      ${fe !== null ? `<span class="pill fe ${ironLevel(fe, goalMeal())}">⚡ ${fmtMg(fe)} mg Fe/ración · ${src}</span>` : '<span class="pill">⚡ Hierro sin calcular</span>'}</div>
    ${r.nutrition ? `<p class="notice">✨ ${h(r.nutrition.provider || 'IA')} · ${conf[r.nutrition.confidence] || ''} · ${fmtMg(r.nutrition.estimatedRecipeIronMg)} mg en total · ${h(r.nutrition.notes)}</p>` : ''}
    ${calc.rows.length ? ironBreakdown(calc) : ''}
    <div class="buttons" style="margin-top:14px"><button class="btn primary" ${on('click', 'openPlan', id)}>📅 Añadir al calendario</button><button class="btn" ${on('click', 'openEatRecipe', today(), id)}>✓ Lo he comido</button></div>
    <hr class="line">
    ${field('Escalar raciones', `<input type="number" min="1" value="${r.servings}" ${on('input', 'rescaleIngredients', id, '@value')}>`)}
    <div class="split recipe-detail"><div><h3>Ingredientes</h3><div id="ingredients-detail" style="white-space:pre-line;line-height:1.9">${h(ingredientText(r))}</div></div>
      <div><h3>Preparación</h3><ol>${(r.instructions || []).map((x) => `<li>${h(x)}</li>`).join('')}</ol></div></div>
    ${r.source ? `<p class="small muted">Fuente: ${/^https?:\/\//.test(r.source) ? `<a href="${h(r.source)}" target="_blank" rel="noopener">${h(r.source)}</a>` : h(r.source)}</p>` : ''}
    <hr class="line"><div class="buttons"><button class="btn" ${on('click', 'openForm', id)}>Editar</button><button class="btn" ${on('click', 'calcIron', id)}>🧮 Calcular con ingredientes</button><button id="iron-llm-btn" class="btn" ${on('click', 'estimateIron', id)}>⚡ ${fe === null ? 'Calcular' : 'Recalcular'} hierro con IA</button>
      <button class="btn" ${on('click', 'duplicateRecipe', id)}>Duplicar</button><button class="btn danger" ${on('click', 'deleteRecipe', id)}>Eliminar</button></div>`);
}
function rescaleIngredients(id, n) { document.getElementById('ingredients-detail').innerText = scaledIngredients(id, Number(n)); }
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
    <form ${on('submit', 'saveRecipe', '@el', id || '')}><div class="form-grid">
      ${field('Nombre *', `<input name="name" required value="${h(r.name)}">`, 'wide')}
      ${field('Categoría', `<select name="category">${CATS.map((c) => `<option ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}
      ${field('Emoji de portada', `<input name="emoji" value="${h(r.emoji)}">`)}
      ${field('Tiempo total (min)', `<input name="time" type="number" min="0" value="${h(r.time)}">`)}
      ${field('Raciones', `<input name="servings" type="number" min="1" value="${h(r.servings)}">`)}
      ${field('Descripción', `<input name="description" value="${h(r.description)}">`, 'wide')}
      ${field('Ingredientes · uno por línea (p. ej. 200 g de lentejas coral)', `<textarea name="ingredients" rows="6" required>${h(ingredientText(r))}</textarea>`, 'wide')}
      ${field('Pasos · uno por línea', `<textarea name="instructions" rows="6" required>${h((r.instructions || []).join('\n'))}</textarea>`, 'wide')}
      ${field('Hierro por ración (mg, opcional)', `<input name="iron" type="number" min="0" step="0.1" value="${h(r.iron ?? '')}">`)}
      ${field('Tipo de hierro (para estimar la absorción)', `<select name="ironType">${[['', 'Automático según ingredientes'], ['heme', 'Animal (carne, pescado)'], ['nonheme', 'Vegetal'], ['mixed', 'Mezcla']].map(([v, l]) => `<option value="${v}" ${(r.ironType || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${field('Fuente / URL (opcional)', `<input name="source" value="${h(r.source || '')}">`)}</div>
      <p class="info muted">Si dejas el hierro en blanco, la IA lo estimará al guardar (necesitas haber iniciado sesión). Tus valores manuales nunca se sobrescriben.</p>
      <div class="buttons"><button class="btn primary" type="submit">Guardar receta</button><button class="btn" type="button" ${on('click', 'closeModal')}>Cancelar</button></div></form>`);
}
function saveRecipe(form, id) {
  const f = Object.fromEntries(new FormData(form)), old = recipe(id);
  const ingredients = parseIngredients(f.ingredients);
  const iron = f.iron === '' ? null : Number(f.iron);
  const sameIron = old && old.iron === iron;
  const obj = {
    id: id || eid(), name: f.name.trim(), description: f.description, emoji: f.emoji || '🥗', categories: [f.category],
    ingredients, instructions: sub(f.instructions), servings: Number(f.servings) || 1, time: Number(f.time) || 0,
    iron, ironType: f.ironType || '', source: f.source, favorite: old?.favorite || false,
    ironSource: iron === null ? '' : (sameIron ? old.ironSource : 'manual'),
    nutrition: sameIron ? (old.nutrition || null) : null,
  };
  const changedIngredients = old && ingredientText(old) !== ingredientText(obj);
  state.recipes = id ? state.recipes.map((r) => r.id === id ? obj : r) : [...state.recipes, obj];
  const needsAi = autoIron(obj, changedIngredients);
  save(); modal = null; render();
  if (needsAi) estimateIron(obj.id, true);
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
  showModal(`${modalTop('Importar una receta')}
    <div class="import-url"><label class="field"><span>Desde un enlace (recetas con datos estructurados: la mayoría de blogs y webs de cocina)</span>
      <input id="import-url" type="url" inputmode="url" placeholder="https://…" autocomplete="off"></label>
      <button id="import-url-btn" class="btn primary" ${on('click', 'importFromUrl')}>Importar enlace</button></div>
    <hr class="line"><p class="muted">O pega una receta con nombre, «Ingredientes» y «Preparación». Podrás revisar los campos antes de guardar.</p>
    <textarea id="raw-recipe" style="width:100%;min-height:200px" placeholder="Galletas de avena&#10;Ingredientes&#10;120 g de avena&#10;1 plátano&#10;Preparación&#10;Mezclar todo.&#10;Hornear 20 minutos."></textarea>
    <div class="buttons" style="margin-top:15px"><button class="btn" ${on('click', 'parseImport')}>Extraer del texto</button></div>`);
}
/** Pide al servidor que lea la página y abre el formulario con un borrador (nada se guarda hasta confirmar). */
async function importFromUrl() {
  const input = document.getElementById('import-url'), btn = document.getElementById('import-url-btn'), url = (input?.value || '').trim();
  if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) { toast('Pega un enlace completo que empiece por https://', 'warn'); return; }
  const client = window.NutriCloud?.getClient?.(), cfg = window.NUTRIBOOK_SUPABASE;
  const token = client ? (await client.auth.getSession()).data?.session?.access_token : null;
  if (!token || !cfg?.url) { toast('Inicia sesión en «Mi perfil» para importar desde un enlace.', 'warn'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Leyendo la página…'; }
  try {
    const res = await fetch(cfg.url + '/functions/v1/recipe-import', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.key, Authorization: 'Bearer ' + token }, body: JSON.stringify({ url }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.recipe) throw new Error(data.error || 'Error ' + res.status);
    const r = data.recipe;
    openForm('', { name: r.name, description: r.description || 'Importada de un enlace; revisa los datos.', emoji: '🥗', categories: ['Comidas'], ingredients: parseIngredients((r.ingredients || []).join('\n')),
      instructions: r.instructions || [], servings: r.servings || 4, time: r.time || 30, iron: '', source: r.source || url });
    toast('Receta leída: revisa los datos y guarda', '');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Importar enlace'; }
    toast('No se pudo importar: ' + e.message, 'warn');
  }
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

// ───────── Hierro calculado con los ingredientes (con la IA solo como repuesto) ─────────
/** Rellena el hierro de una receta recién guardada sin tocar nunca un valor puesto a mano. Devuelve true si hace falta pedirlo a la IA. */
function autoIron(r, changedIngredients) {
  const fromCalc = String(r.ironSource || '').startsWith('calc');
  if (!(r.iron === null || ((fromCalc || r.ironSource === 'ai-estimate') && changedIngredients))) return false;
  const res = computeRecipeIron(r);
  if (res.coverage >= IRON_CALC_TRUST) { applyCalc(r, res); return false; }
  if (window.NutriCloud?.getUser?.()) return true;                       // pocos ingredientes reconocidos: la IA completa el cálculo
  if (res.rows.length) applyCalc(r, res);                                // sin sesión no hay IA: se guarda el cálculo parcial
  return false;
}
function applyCalc(r, res) {
  const full = res.coverage >= IRON_CALC_TRUST;
  r.iron = res.perServing; r.ironSource = full ? 'calc' : 'calc-partial';
  r.nutrition = { provider: 'NutriBook', estimatedRecipeIronMg: res.total, confidence: full ? 'high' : 'low', checkedAt: new Date().toISOString(),
    notes: full ? 'Suma del hierro de cada ingrediente según la base de alimentos.' : `Solo se reconocieron ${res.rows.length} de ${res.rows.length + res.unmatched.length} ingredientes: es un mínimo.` };
}
/** Botón «Calcular con ingredientes»: reemplaza el valor actual, con opción de deshacer. */
function calcIron(id) {
  const r = recipe(id);
  if (!r) return;
  const res = computeRecipeIron(r);
  if (!res.rows.length) { toast('No reconozco ningún ingrediente con cantidad. Revisa la lista o usa el cálculo con IA.', 'warn'); return; }
  const before = { iron: r.iron, ironSource: r.ironSource, nutrition: r.nutrition };
  applyCalc(r, res); save(); viewRecipe(id);
  toast(`Hierro calculado: ${fmtMg(r.iron)} mg por ración`, '', { label: 'Deshacer', run: () => { Object.assign(r, before); save(); viewRecipe(id); } });
}
function ironBreakdown(calc) {
  return `<details class="breakdown"><summary>Ver cómo se calcula el hierro (${fmtMg(calc.total)} mg en total)</summary>
    <div class="breakdown-rows">${calc.rows.map((x) => `<div class="entry"><span class="entry-name">${h(x.name)} <small class="muted">→ ${h(x.food)} · ${x.grams} g</small></span><span class="entry-fe">${fmtMg(x.mg)} mg</span></div>`).join('')}
    ${calc.unmatched.map((x) => `<div class="entry"><span class="entry-name">${h(x.name)} <small class="muted">· ${h(x.reason)}</small></span><span class="entry-fe">?</span></div>`).join('')}</div>
    <p class="small muted">Cantidades en crudo salvo que se indique «cocido». Estimación con tablas de composición: varía según marca y cocinado.</p></details>`;
}
