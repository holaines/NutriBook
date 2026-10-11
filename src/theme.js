'use strict';
/* NutriBook — tema claro/oscuro. Se aplica antes de pintar para evitar el parpadeo; la preferencia se guarda solo en este dispositivo. */
(function () {
  const KEY_THEME = 'nutribook-theme';
  const read = () => { try { return localStorage.getItem(KEY_THEME) || 'auto'; } catch { return 'auto'; } };
  const apply = (v) => { const r = document.documentElement; if (v === 'light' || v === 'dark') r.setAttribute('data-theme', v); else r.removeAttribute('data-theme'); };
  apply(read());
  window.NBTheme = {
    get: read,
    set(v) { try { if (v === 'auto') localStorage.removeItem(KEY_THEME); else localStorage.setItem(KEY_THEME, v); } catch { /* sin almacenamiento */ } apply(v); },
  };
})();
