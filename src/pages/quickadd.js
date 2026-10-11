'use strict';
/* NutriBook — saisie rápida: buscar un alimento y registrarlo en un toque (script clásico; comparte el ámbito global con el resto de src/). */

let qa = null;   // { date, meal, added: [{id, label}] }

/** Últimas comidas distintas registradas a mano (para «Repetir» en un toque). */
function recentFoods(limit = 6) {
  const seen = new Set(), out = [];
  for (const x of [...state.consumed].reverse()) {
    if (x.supplement || x.recipeId || ironVal(x.iron) === null || seen.has(x.name)) continue;
    seen.add(x.name); out.push(x);
    if (out.length >= limit) break;
  }
  return out;
}

function openQuickAdd(date = today(), meal = defaultMeal()) {
  qa = { date, meal, added: [] };
  const favs = state.recipes.filter((r) => r.favorite && ironVal(r.iron) !== null).slice(0, 4);
  const recents = recentFoods();
  showModal(`${modalTop('Registrar rápido', `<div class="eyebrow">${h(fmtDay(date))}</div>`)}
    <div class="chips" id="qa-meals">${MEALS.map((m) => `<button class="chip-btn ${m === meal ? 'on' : ''}" ${on('click', 'qaMeal', m)}>${m}</button>`).join('')}</div>
    <input class="qa-search" id="qa-search" type="search" autocomplete="off" aria-label="Buscar alimento" placeholder="Busca un alimento: lentejas, espinacas, sardinas…" ${on('input', 'qaSearch', '@value')}>
    <div id="qa-results" class="qa-results" role="list">${qaSuggestions(recents, favs)}</div>
    <div id="qa-added" class="qa-added" aria-live="polite"></div>
    <div class="buttons" style="margin-top:12px"><button class="btn primary" ${on('click', 'closeModal')}>Listo</button><button class="btn" ${on('click', 'qaManual')}>Escribir a mano</button></div>`);
  document.getElementById('qa-search')?.focus({ preventScroll: true });
}

function qaSuggestions(recents, favs) {
  const chip = (label, act, ...args) => `<button class="chip-btn" ${on('click', act, ...args)}>${label}</button>`;
  const parts = [];
  if (favs.length) parts.push(`<small class="muted">Tus recetas favoritas</small><div class="chips">${favs.map((r) => chip(`${h(r.emoji || '')} ${h(r.name)} · ${fmtMg(r.iron)} mg`, 'qaRecipe', r.id)).join('')}</div>`);
  if (recents.length) parts.push(`<small class="muted">Repetir lo último</small><div class="chips">${recents.map((x) => chip(`${h(x.name)} · ${fmtMg(x.iron)} mg`, 'qaRepeat', x.id)).join('')}</div>`);
  if (!parts.length) parts.push('<p class="muted small">Escribe arriba para buscar entre más de 130 alimentos con su hierro por ración.</p>');
  return parts.join('');
}

function qaMeal(meal) {
  if (!qa) return;
  qa.meal = meal;
  document.querySelectorAll('#qa-meals .chip-btn').forEach((b) => b.classList.toggle('on', b.textContent === meal));
}

function qaSearch(text) {
  const box = document.getElementById('qa-results');
  if (!box) return;
  if (!text.trim()) { box.innerHTML = qaSuggestions(recentFoods(), state.recipes.filter((r) => r.favorite && ironVal(r.iron) !== null).slice(0, 4)); return; }
  const found = foodSearch(text, 8);
  box.innerHTML = found.length ? found.map((f) => {
    const fe = foodPortionIron(f), lvl = ironLevel(fe, goalMeal());
    return `<div class="qa-row" role="listitem"><div class="qa-name"><b>${h(f.name)}</b><small class="muted">${h(f.portionLabel)} · ${fmtMg(f.iron)} mg/100 g</small></div>
      <span class="entry-fe ${lvl}">${fmtMg(fe)} mg</span>
      <div class="qa-portions">${[0.5, 1, 2].map((p) => `<button class="btn mini" aria-label="${p === 0.5 ? 'Media' : p} ración de ${h(f.name)}" ${on('click', 'qaAdd', f.id, p)}>${p === 0.5 ? '½' : p === 1 ? '1' : '2'}</button>`).join('')}</div></div>`;
  }).join('') : `<p class="muted small">No encuentro «${h(text)}». Prueba con otro nombre o <button class="link" ${on('click', 'qaManual')}>escríbelo a mano</button>.</p>`;
}

function qaFlash(label, id) {
  const el = document.getElementById('qa-added');
  if (!el) return;
  qa.added.push({ id, label });
  el.innerHTML = qa.added.map((a) => `<div class="qa-flash">✓ ${h(a.label)} <button class="link" ${on('click', 'qaUndo', a.id)}>Deshacer</button></div>`).join('');
}

function qaAdd(foodId, portions = 1) {
  const f = foodById(foodId);
  if (!f || !qa) return;
  const fe = foodPortionIron(f, portions), id = eid();
  const label = (portions === 0.5 ? '½ ración' : portions === 1 ? '1 ración' : portions + ' raciones');
  state.consumed.push({ id, date: qa.date, meal: qa.meal, name: f.name, iron: fe, ironType: f.type, foodId: f.id, portions });
  save(); renderMain();
  qaFlash(`${f.name} (${label}) · +${fmtMg(fe)} mg`, id);
}
function qaRepeat(entryId) {
  const x = state.consumed.find((e) => e.id === entryId);
  if (!x || !qa) return;
  const copy = { ...x, id: eid(), date: qa.date, meal: qa.meal, planKey: undefined };
  delete copy.planKey; delete copy.updatedAt;
  state.consumed.push(copy); save(); renderMain();
  qaFlash(`${x.name} · +${fmtMg(x.iron)} mg`, copy.id);
}
function qaRecipe(recipeId) {
  const r = recipe(recipeId);
  if (!r || !qa) return;
  const id = eid();
  state.consumed.push({ id, date: qa.date, meal: qa.meal, name: r.name, iron: ironVal(r.iron), recipeId: r.id });
  save(); renderMain();
  qaFlash(`${r.name} · +${fmtMg(r.iron)} mg`, id);
}
function qaUndo(id) {
  if (!qa) return;
  state.consumed = state.consumed.filter((x) => x.id !== id);
  qa.added = qa.added.filter((a) => a.id !== id);
  save(); renderMain();
  const el = document.getElementById('qa-added');
  if (el) el.innerHTML = qa.added.map((a) => `<div class="qa-flash">✓ ${h(a.label)} <button class="link" ${on('click', 'qaUndo', a.id)}>Deshacer</button></div>`).join('');
}
function qaManual() { const d = qa?.date || today(); qa = null; openFoodForm(d); }
