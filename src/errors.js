'use strict';
/* NutriBook — pantalla de error si el arranque falla (sin script en línea por la CSP). */
window.addEventListener('error', function(event) {
  const root = document.getElementById('app');
  if (root && !root.querySelector('.app')) {
    root.innerHTML = '<main style="padding:40px;font:16px system-ui"><h1>NutriBook no ha podido iniciarse</h1><p>Abre la consola de Chrome con F12 para ver el error. Comprueba que index.html, styles.css y app.js están juntos.</p><pre id="startup-error" style="white-space:pre-wrap;color:#9b3434"></pre></main>';
    const detail = document.getElementById('startup-error');
    if (detail) detail.textContent = (event.error && (event.error.stack || event.error.message)) || event.message || 'Error al cargar JavaScript';
  }
});
