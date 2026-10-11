'use strict';
/* NutriBook — página Despensa (script clásico; comparte el ámbito global con el resto de src/). */

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
