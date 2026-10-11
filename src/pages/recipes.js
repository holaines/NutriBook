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
  const src = { 'usda-estimate': '🔬 USDA', 'local-db': '🏠 base local', 'ai-estimate': '✨ IA', manual: '✏️ manual' }[r.ironSource] || '✏️ manual';
  const conf = { high: 'alta confianza', medium: 'confianza media', low: 'estimación aproximada' };
  showModal(`${modalTop(`${h(r.emoji)} ${h(r.name)}`, `<div class="eyebrow">${h((r.categories || []).join(' · '))}</div>`)}
    ${r.description ? `<p>${h(r.description)}</p>` : ''}
    <div class="buttons"><span class="pill">◷ ${r.time} min</span><span class="pill">🍽 ${r.servings} raciones</span>
      ${fe !== null ? `<span class="pill fe ${ironLevel(fe, goalMeal())}">⚡ ${fmtMg(fe)} mg Fe/ración · ${src}</span>` : '<span class="pill">⚡ Hierro sin calcular</span>'}</div>
    ${r.nutrition ? `<p class="notice">✨ ${h(r.nutrition.provider || 'IA')} · ${conf[r.nutrition.confidence] || ''} · ${fmtMg(r.nutrition.estimatedRecipeIronMg)} mg en total · ${h(r.nutrition.notes)}</p>` : ''}
    <div class="buttons" style="margin-top:14px"><button class="btn primary" ${on('click', 'openPlan', id)}>📅 Añadir al calendario</button><button class="btn" ${on('click', 'openEatRecipe', today(), id)}>✓ Lo he comido</button></div>
    <hr class="line">
    ${field('Escalar raciones', `<input type="number" min="1" value="${r.servings}" ${on('input', 'rescaleIngredients', id, '@value')}>`)}
    <div class="split recipe-detail"><div><h3>Ingredientes</h3><div id="ingredients-detail" style="white-space:pre-line;line-height:1.9">${h(ingredientText(r))}</div></div>
      <div><h3>Preparación</h3><ol>${(r.instructions || []).map((x) => `<li>${h(x)}</li>`).join('')}</ol></div></div>
    ${r.source ? `<p class="small muted">Fuente: ${/^https?:\/\//.test(r.source) ? `<a href="${h(r.source)}" target="_blank" rel="noopener">${h(r.source)}</a>` : h(r.source)}</p>` : ''}
    <hr class="line"><div class="buttons"><button class="btn" ${on('click', 'openForm', id)}>Editar</button><button id="iron-llm-btn" class="btn" ${on('click', 'estimateIron', id)}>⚡ ${fe === null ? 'Calcular' : 'Recalcular'} hierro con IA</button>
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
    <div class="buttons" style="margin-top:15px"><button class="btn primary" ${on('click', 'parseImport')}>Extraer receta</button></div>`);
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
