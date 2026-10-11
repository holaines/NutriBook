'use strict';
/* NutriBook — arranque (script clásico; comparte el ámbito global con el resto de src/). */

const VIEWS = { Inicio: home, Recetas: recipes, Calendario: calendar, Despensa: pantry, Compra: shopping, Equilibrio: equilibrium, Perfil: profile };

const hashPage = decodeURIComponent(location.hash.slice(1));
if (PAGES.some((p) => p.id === hashPage)) page = hashPage;
window.addEventListener('hashchange', () => {
  const p = decodeURIComponent(location.hash.slice(1));
  if (PAGES.some((x) => x.id === p) && p !== page) { page = p; modal = null; weekOffset = 0; render(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal) closeModal(); });

window.NutriBook = { getState: () => state, save };
if (!window.NutriCloud) authLoading = false;
render();
setTimeout(() => { if (authLoading) { authLoading = false; render(); } }, 6000); // red lenta: no dejar la pantalla de carga

window.NutriCloud?.start({
  read: () => state,
  apply: (data) => {
    state = hydrate(data);
    window.NBMerge?.reset(state);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sin espacio */ }
    render();
  },
  onReady: () => {
    authLoading = false; render();
  },
  onConnect: () => {
    const meta = window.NutriCloud?.getUserMeta?.() || {};
    if (!state.profile.name && meta.full_name) { state.profile.name = meta.full_name; save(); }
  },
});
