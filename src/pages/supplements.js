'use strict';
/* NutriBook — complementos de hierro (script clásico; comparte el ámbito global con el resto de src/).
   state.supplements = definiciones (nombre, mg de hierro por toma); cada toma se guarda en state.consumed
   con supplement:true, de modo que dayIron, el diario y la sincronización la tratan como cualquier comida. */

const takenOn = (supId, date) => state.consumed.find((x) => x.supplement && x.supId === supId && x.date === date);

function supplementsCard(date = today()) {
  const list = state.supplements || [];
  const rows = list.map((s) => {
    const t = takenOn(s.id, date);
    return `<div class="entry"><span class="entry-meal">💊</span><span class="entry-name">${h(s.name)} <small class="muted">${fmtMg(s.ironMg)} mg de hierro</small></span>
      <button class="btn mini ${t ? 'done' : ''}" ${on('click', t ? 'untakeSupplement' : 'takeSupplement', s.id, date)}>${t ? '✓ Tomado' : 'Tomar'}</button>
      <button class="icon-btn" aria-label="Editar ${h(s.name)}" ${on('click', 'openSupplementForm', s.id)}>✎</button></div>`;
  }).join('');
  return `<div class="card"><div class="card-title">Complementos <button class="link" ${on('click', 'openSupplementForm')}>+ Añadir</button></div>
    ${rows || '<p class="muted small">Si tomas un suplemento de hierro, añádelo aquí y márcalo cada día con un toque. Cuenta en tu total de hierro.</p>'}
    <p class="small muted">Toma los suplementos solo si te los ha recomendado un profesional sanitario.</p></div>`;
}

function openSupplementForm(id) {
  const s = (state.supplements || []).find((x) => x.id === id) || { name: '', ironMg: '' };
  showModal(`${modalTop(id ? 'Editar complemento' : 'Nuevo complemento')}
    <form ${on('submit', 'saveSupplement', '@el', id || '')}><div class="form-grid">
      ${field('Nombre', `<input name="name" required value="${h(s.name)}" placeholder="Ej. Hierro bisglicinato">`, 'wide')}
      ${field('Hierro por toma (mg)', `<input name="ironMg" type="number" min="0.1" step="0.1" required value="${h(s.ironMg)}">`)}</div>
      <div class="buttons" style="margin-top:15px"><button class="btn primary" type="submit">Guardar</button>
        ${id ? `<button class="btn danger" type="button" ${on('click', 'removeSupplement', id)}>Eliminar</button>` : ''}<button class="btn" type="button" ${on('click', 'closeModal')}>Cancelar</button></div></form>`);
}
function saveSupplement(form, id) {
  const f = Object.fromEntries(new FormData(form)), ironMg = Number(f.ironMg);
  if (!f.name.trim() || !(ironMg > 0)) { toast('Indica un nombre y los mg de hierro', 'warn'); return; }
  const s = { id: id || eid(), name: f.name.trim(), ironMg };
  state.supplements = id ? state.supplements.map((x) => (x.id === id ? s : x)) : [...(state.supplements || []), s];
  // las tomas ya registradas conservan el valor que tenían
  save(); closeModal(); render();
}
function removeSupplement(id) {
  state.supplements = (state.supplements || []).filter((x) => x.id !== id);
  save(); closeModal(); render();
  toast('Complemento eliminado (sus tomas anteriores se conservan)');
}
function takeSupplement(supId, date = today()) {
  const s = (state.supplements || []).find((x) => x.id === supId);
  if (!s || takenOn(supId, date)) return;
  state.consumed.push({ id: eid(), date, meal: 'Suplemento', name: s.name, iron: s.ironMg, supplement: true, supId, ironType: 'nonheme' });
  save(); renderMain(); toast(`+${fmtMg(s.ironMg)} mg de hierro (${s.name})`);
}
function untakeSupplement(supId, date = today()) {
  const t = takenOn(supId, date);
  if (!t) return;
  state.consumed = state.consumed.filter((x) => x !== t);
  save(); renderMain();
  toast('Toma deshecha', '', { label: 'Deshacer', run: () => { state.consumed.push(t); save(); renderMain(); } });
}
