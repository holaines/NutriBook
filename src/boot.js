'use strict';
/* NutriBook — arranque (script clásico; comparte el ámbito global con el resto de src/). */

const VIEWS = { Inicio: home, Recetas: recipes, Calendario: calendar, Despensa: pantry, Compra: shopping, Equilibrio: equilibrium, Perfil: profile };

const hashPage = decodeURIComponent(location.hash.slice(1));
if (PAGES.some((p) => p.id === hashPage)) page = hashPage;
window.addEventListener('hashchange', () => {
  const p = decodeURIComponent(location.hash.slice(1));
  if (PAGES.some((x) => x.id === p) && p !== page) { page = p; modal = null; weekOffset = 0; render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal) closeModal();
  if (e.key === 'Tab' && modal) {   // el foco no sale de la ventana abierta
    const items = [...document.querySelectorAll('#modal-root .modal button:not([disabled]), #modal-root .modal input:not([type=hidden]):not([disabled]), #modal-root .modal select:not([disabled]), #modal-root .modal textarea:not([disabled]), #modal-root .modal a[href]')].filter((x) => x.offsetParent !== null || x.getClientRects().length);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1], cur = document.activeElement;
    if (!document.querySelector('#modal-root .modal')?.contains(cur)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  }
  // «n» abre el registro rápido (si no se está escribiendo y no hay otra ventana abierta)
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
  if (e.key === 'n' && !typing && !modal && !e.ctrlKey && !e.metaKey && !e.altKey && !authLoading) { e.preventDefault(); openQuickAdd(); }
});

window.NutriBook = { getState: () => state, save };

// App instalable y disponible sin conexión
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (page === 'Perfil') renderMain(); });
window.addEventListener('appinstalled', () => { installPrompt = null; if (page === 'Perfil') renderMain(); });
function installApp() { if (!installPrompt) return; installPrompt.prompt(); installPrompt.userChoice.finally(() => { installPrompt = null; renderMain(); }); }
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { /* sin SW la app sigue funcionando en línea */ }));
}
if (!window.NutriCloud) authLoading = false;
render();
setTimeout(() => { if (authLoading) { authLoading = false; render(); } }, 6000); // red lenta: no dejar la pantalla de carga

window.NutriCloud?.start({
  read: () => state,
  apply: (data) => {
    state = hydrate(data);
    if (ob && state.profile.onboarded) { ob = null; modal = null; }   // la nube ya tenía un perfil completo
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
