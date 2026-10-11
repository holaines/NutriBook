'use strict';
/* NutriBook — página Mi perfil y datos (script clásico; comparte el ámbito global con el resto de src/). */

// ═══════════════════════════════════════════════════════════════════════════
// Perfil y datos
// ═══════════════════════════════════════════════════════════════════════════
function profile() {
  const p = state.profile;
  return pageHeader('Mi perfil', 'Tus preferencias y tus datos, bajo tu control.') + (window.NutriCloud?.panel() || '') +
  `<div class="card"><form onsubmit="event.preventDefault();saveProfile(this)"><div class="form-grid">
    ${field('Nombre (opcional)', `<input name="name" value="${h(p.name)}">`)}
    ${field('Objetivo principal', `<select name="goal">${['Alimentación equilibrada', 'Mejorar rendimiento deportivo', 'Ganar masa muscular', 'Mantener peso', 'Otro'].map((o) => `<option ${o === p.goal ? 'selected' : ''}>${o}</option>`).join('')}</select>`)}
    ${field('Nutrientes que quieres priorizar', `<input name="priorities" value="${h(p.priorities)}">`)}
    ${field('Presupuesto semanal (€)', `<input name="budget" type="number" min="0" value="${h(p.budget)}">`)}
    ${field('Objetivo de hierro diario (mg)', `<input name="ironDailyGoal" type="number" min="1" step="0.5" value="${Number(p.ironDailyGoal) || 16}">`)}
    ${field('Objetivo de hierro por comida (mg)', `<input name="ironMealGoal" type="number" min="1" step="0.5" value="${Number(p.ironMealGoal) || 5}">`)}
    ${field('Preferencias, alergias y notas', `<textarea name="notes">${h(p.notes)}</textarea>`, 'wide')}</div>
    <div class="buttons" style="margin-top:15px"><button class="btn primary" type="submit">Guardar perfil</button></div></form></div>
  <div class="section-head"><h2>Mis datos</h2></div>
  <div class="card"><p class="muted">${window.NutriCloud?.getUser?.() ? 'Tus datos se guardan en este navegador y en tu cuenta (sincronización activa).' : 'Tus datos se guardan solo en este navegador. Inicia sesión arriba para sincronizarlos.'} Exporta copias de vez en cuando.</p>
    <div class="buttons"><button class="btn primary" onclick="exportData()">↓ Exportar copia JSON</button><button class="btn" onclick="document.getElementById('import-json').click()">↑ Importar copia JSON</button><button class="btn danger" onclick="clearAll()">Eliminar todos mis datos</button>
    <input id="import-json" type="file" accept="application/json" hidden onchange="importData(this)"></div></div>`;
}
function saveProfile(form) {
  const f = Object.fromEntries(new FormData(form));
  state.profile = { ...state.profile, ...f, ironDailyGoal: Number(f.ironDailyGoal) || 16, ironMealGoal: Number(f.ironMealGoal) || 5 };
  save(); toast('Perfil guardado');
}
function exportData() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })), a = document.createElement('a');
  a.href = url; a.download = 'nutribook-copia-' + today() + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 300);
}
async function importData(inp) {
  const f = inp.files?.[0];
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.recipes) || !Array.isArray(d.pantry) || typeof d.plan !== 'object') throw 0;
    if (!confirm('Se reemplazarán los datos actuales. ¿Continuar?')) return;
    state = hydrate(d); save(); render(); toast('Datos importados');
  } catch { toast('No se pudo importar: archivo no compatible.', 'warn'); }
  finally { inp.value = ''; }
}
function clearAll() {
  if (!confirm('¿Eliminar TODAS las recetas, el calendario y la despensa de este navegador?')) return;
  state = DEFAULTS(); save(); render();
}
