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
  return Object.values(acc).map((it) => {
    const have = state.pantry.filter((p) => p.name.toLowerCase().trim() === it.name.toLowerCase().trim())
      .map((p) => baseQty(Number(p.quantity) || 0, p.unit)).filter(([, u]) => u === it.unit).reduce((n, [v]) => n + v, 0);
    return { ...it, have, left: Math.max(0, it.quantity - have) };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
function shopping() {
  const items = shoppingItems(), pending = items.filter((i) => !state.checked[i.key]), done = items.filter((i) => state.checked[i.key]);
  const row = (i) => `<div class="item"><label class="check-row"><input class="check" type="checkbox" ${state.checked[i.key] ? 'checked' : ''} ${on('change', 'toggleCheck', items.indexOf(i), '@checked')}>
    <span class="${state.checked[i.key] ? 'struck' : ''}"><b>${h(i.name)}</b><small>Necesario: ${fmtQty(i.quantity, i.unit)}${i.have ? ' · En despensa: ' + fmtQty(i.have, i.unit) : ''}${i.unknown ? ` · ${i.unknown} cantidad(es) sin indicar` : ''}</small></span></label>
    <b class="qty ${i.left === 0 && i.quantity > 0 ? 'ok' : ''}">${i.quantity > 0 && i.left === 0 ? '✓ en casa' : fmtQty(i.left, i.unit)}</b></div>`;
  return pageHeader('Mi lista de la compra', 'Ingredientes de las recetas planificadas en la semana seleccionada.',
    `<button class="btn" ${on('click', 'copyShopping')}>Copiar lista</button><button class="btn" ${on('click', 'navigate', 'Calendario', {keepWeek:true})}>← Calendario</button>`) +
  weekNav(`<span class="week-stat">${pending.length} por comprar · ${done.length} listos</span>`) +
  `<div class="card">${items.length ? pending.map(row).join('') + (done.length ? `<div class="item-sep">Ya en el carro</div>` + done.map(row).join('') : '')
    : empty('No hay nada en la lista', 'Planifica alguna receta en el calendario y aparecerán aquí sus ingredientes.', `<button class="btn primary" ${on('click', 'navigate', 'Calendario', {keepWeek:true})}>Ir al calendario</button>`)}</div>
  <div class="notice">Se resta lo que ya tienes en la despensa (con el mismo nombre; kg↔g y l↔ml se convierten). Revisa los resultados antes de comprar.</div>`;
}
function toggleCheck(idx, checked) {
  const it = shoppingItems()[idx];
  if (!it) return;
  state.checked[it.key] = checked;
  save(); renderMain();
}
function copyShopping() {
  const list = shoppingItems().filter((i) => !state.checked[i.key] && (i.left > 0 || !i.quantity)).map((i) => `- ${i.name}${i.left ? ': ' + fmtQty(i.left, i.unit) : ''}`).join('\n');
  if (!list) { toast('No hay nada pendiente de comprar'); return; }
  (navigator.clipboard?.writeText(list) || Promise.reject()).then(() => toast('Lista copiada'), () => prompt('Copia tu lista:', list));
}
