'use strict';
/* NutriBook — página Mi compra (script clásico; comparte el ámbito global con el resto de src/). */

function baseQty(qty, unit) {
  const u = String(unit || '').toLowerCase();
  return u === 'kg' ? [qty * 1000, 'g'] : u === 'l' ? [qty * 1000, 'ml'] : [qty, u];
}
function fmtQty(qty, unit) {
  if (unit === 'g' && qty >= 1000) return fmtMg(qty / 1000) + ' kg';
  if (unit === 'ml' && qty >= 1000) return fmtMg(qty / 1000) + ' l';
  return Number(qty.toFixed(2)) + (unit ? ' ' + unit : '');
}
// ───────── Rayones de la compra ─────────
const AISLES = ['Verduras y frutas', 'Carne y pescado', 'Lácteos y huevos', 'Despensa seca', 'Otros'];
const AISLE_OF_CATEGORY = { 'Verduras': 'Verduras y frutas', 'Frutas': 'Verduras y frutas', 'Carnes': 'Carne y pescado', 'Pescado y marisco': 'Carne y pescado', 'Huevos y lácteos': 'Lácteos y huevos',
  'Legumbres': 'Despensa seca', 'Cereales y pan': 'Despensa seca', 'Frutos secos y semillas': 'Despensa seca', 'Otros': 'Despensa seca' };
const AISLE_WORDS = [[/\b(aceite|sal|vinagre|azucar|harina|especias?|pimienta|canela|comino|pimenton|caldo|levadura|vainilla|miel|salsa)\b/, 'Despensa seca'], [/\b(leche|nata|mantequilla|queso|yogur)\b/, 'Lácteos y huevos'], [/\b(cilantro|menta|albahaca|perejil|hierbabuena|cebollino|jengibre|limon|lima)\b/, 'Verduras y frutas']];
/** Rayón de un ingrediente: por la base de alimentos y, si no, por palabras clave. */
function aisleOf(name) {
  const food = matchFood(name);
  if (food) return AISLE_OF_CATEGORY[food.category] || 'Otros';
  const t = plainText(name);
  return (AISLE_WORDS.find(([re]) => re.test(t)) || [, 'Otros'])[1];
}
/** ¿Cuánto de este ingrediente hay en la despensa? Coincide por nombre o por ser el mismo alimento (lentejas ≈ lentejas coral). */
function pantryHave(it) {
  const name = it.name.toLowerCase().trim(), food = matchFood(it.name);
  return state.pantry.filter((p) => p.name.toLowerCase().trim() === name || (food && matchFood(p.name)?.id === food.id))
    .map((p) => baseQty(Number(p.quantity) || 0, p.unit)).filter(([, u]) => u === it.unit).reduce((n, [v]) => n + v, 0);
}
function shoppingItems() {
  const start = weekStart(), end = datePlus(start, 6), acc = {};
  for (const [k, id] of Object.entries(state.plan)) {
    const d = k.slice(0, 10), r = recipe(id);
    if (!id || d < start || d > end || !r) continue;
    for (const i of r.ingredients || []) {
      const [qty, unit] = i.quantity == null ? [null, i.unit || ''] : baseQty(i.quantity, i.unit);
      const key = i.name.toLowerCase().trim() + '|' + unit;
      const it = acc[key] || (acc[key] = { key, name: i.name, unit, quantity: 0, unknown: 0 });
      qty == null ? it.unknown++ : (it.quantity += qty);
    }
  }
  const items = Object.values(acc).map((it) => {
    const have = pantryHave(it);
    return { ...it, have, left: Math.max(0, it.quantity - have), aisle: aisleOf(it.name) };
  });
  for (const x of state.shoppingExtra || []) items.push({ key: 'extra:' + x.id, name: x.name, unit: '', quantity: 0, unknown: 0, have: 0, left: 0, extra: true, extraId: x.id, aisle: aisleOf(x.name) });
  return items.sort((a, b) => AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) || a.name.localeCompare(b.name, 'es'));
}
function shopping() {
  const items = shoppingItems(), pending = items.filter((i) => !state.checked[i.key]), done = items.filter((i) => state.checked[i.key]);
  const row = (i) => `<div class="item"><label class="check-row"><input class="check" type="checkbox" ${state.checked[i.key] ? 'checked' : ''} ${on('change', 'toggleCheck', items.indexOf(i), '@checked')}>
    <span class="${state.checked[i.key] ? 'struck' : ''}"><b>${h(i.name)}</b><small>${i.extra ? 'Añadido por ti' : `Necesario: ${fmtQty(i.quantity, i.unit)}${i.have ? ' · En despensa: ' + fmtQty(i.have, i.unit) : ''}${i.unknown ? ` · ${i.unknown} cantidad(es) sin indicar` : ''}`}</small></span></label>
    ${i.extra ? `<button class="icon-btn" aria-label="Quitar ${h(i.name)}" ${on('click', 'removeShoppingExtra', i.extraId)}>×</button>`
      : `<b class="qty ${i.left === 0 && i.quantity > 0 ? 'ok' : ''}">${i.quantity > 0 && i.left === 0 ? '✓ en casa' : fmtQty(i.left, i.unit)}</b>`}</div>`;
  const byAisle = AISLES.map((a) => ({ a, list: pending.filter((i) => i.aisle === a) })).filter((g) => g.list.length);
  return pageHeader('Mi lista de la compra', 'Ingredientes de las recetas planificadas en la semana seleccionada.',
    `<button class="btn" ${on('click', 'copyShopping')}>Copiar</button><button class="btn primary" ${on('click', 'shareShopping')}>Compartir</button><button class="btn" ${on('click', 'navigate', 'Calendario', {keepWeek:true})}>← Calendario</button>`) +
  weekNav(`<span class="week-stat">${pending.length} por comprar · ${done.length} listos</span>`) +
  `<div class="card"><form class="add-extra" ${on('submit', 'addShoppingExtra', '@el')}><input name="name" aria-label="Añadir a la lista" placeholder="Añadir algo a la lista…" maxlength="80" required><button class="btn" type="submit">+ Añadir</button></form>
    ${items.length ? byAisle.map((g) => `<div class="item-sep">${g.a}</div>${g.list.map(row).join('')}`).join('') + (done.length ? `<div class="item-sep">Ya en el carro</div>` + done.map(row).join('') : '')
    : empty('No hay nada en la lista', 'Planifica alguna receta en el calendario y aparecerán aquí sus ingredientes.', `<button class="btn primary" ${on('click', 'navigate', 'Calendario', {keepWeek:true})}>Ir al calendario</button>`)}</div>
  ${ironBoostCard()}
  <div class="notice">Se resta lo que ya tienes en la despensa (mismo nombre o mismo alimento; kg↔g y l↔ml se convierten). Revisa los resultados antes de comprar.</div>`;
}

/** Si lo planificado se queda corto de hierro, propone alimentos para añadir a la lista. */
function ironBoostCard() {
  const days = weekDates().filter((d) => d >= today());
  if (!days.length) return '';
  const avg = days.reduce((n, d) => n + dayIron(d).total, 0) / days.length, goal = goalDay();
  if (avg >= goal * 0.85) return '';
  const inList = new Set(shoppingItems().map((i) => (matchFood(i.name) || {}).id).filter(Boolean));
  const picks = suggestGap({ missing: goal - avg, mealsLeft: 1, meal: 'Comida', recipes: [], pantry: state.pantry, foods: FOODS.filter((f) => !inList.has(f.id)), vegetarian: state.profile.diet === 'vegetarian' });
  if (!picks.length) return '';
  return `<div class="card"><div class="card-title">Para subir tu hierro esta semana <small class="muted">media prevista ${fmtMg(avg)} de ${goal} mg al día</small></div>
    <div class="chips">${picks.map((p) => `<button class="chip-btn" ${on('click', 'addShoppingExtraNamed', foodById(p.id).name)}>+ ${h(foodById(p.id).name)} <small>(${fmtMg(p.mg)} mg/ración)</small></button>`).join('')}</div></div>`;
}
function addShoppingExtraNamed(name) { state.shoppingExtra = [...(state.shoppingExtra || []), { id: eid(), name }]; save(); renderMain(); toast(`«${name}» añadido a la lista`); }
function addShoppingExtra(form) {
  const name = String(new FormData(form).get('name') || '').trim();
  if (!name) return;
  addShoppingExtraNamed(name);
}
function removeShoppingExtra(id) {
  state.shoppingExtra = (state.shoppingExtra || []).filter((x) => x.id !== id);
  delete state.checked['extra:' + id];
  save(); renderMain();
}
function toggleCheck(idx, checked) {
  const it = shoppingItems()[idx];
  if (!it) return;
  state.checked[it.key] = checked;
  save(); renderMain();
}
/** Texto de la lista pendiente, agrupado por rayón. */
function shoppingText() {
  const pending = shoppingItems().filter((i) => !state.checked[i.key] && (i.extra || i.left > 0 || !i.quantity));
  return AISLES.map((a) => ({ a, list: pending.filter((i) => i.aisle === a) })).filter((g) => g.list.length)
    .map((g) => `${g.a}\n${g.list.map((i) => `- ${i.name}${i.left ? ': ' + fmtQty(i.left, i.unit) : ''}`).join('\n')}`).join('\n\n');
}
function copyShopping() {
  const list = shoppingText();
  if (!list) { toast('No hay nada pendiente de comprar'); return; }
  (navigator.clipboard?.writeText(list) || Promise.reject()).then(() => toast('Lista copiada'), () => prompt('Copia tu lista:', list));
}
/** Compartir con el menú del móvil; si no existe, abre WhatsApp con la lista. */
function shareShopping() {
  const text = shoppingText();
  if (!text) { toast('No hay nada pendiente de comprar'); return; }
  const full = 'Lista de la compra (NutriBook)\n\n' + text;
  if (navigator.share) { navigator.share({ title: 'Lista de la compra', text: full }).catch(() => {}); return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(full), '_blank', 'noopener');
}
