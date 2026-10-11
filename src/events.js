'use strict';
/* NutriBook — delegación de eventos.
   En vez de onclick="fn('x')" se escribe ${on('click', 'fn', 'x')} -> data-click="fn" data-args='["x"]'.
   Un único listener por tipo de evento llama a actions[nombre](...args, elemento, evento).
   Mientras dure la migración, si el nombre no está registrado se busca en window. */
(function () {
  const actions = {};
  const TYPES = ['click', 'change', 'input', 'submit'];
  const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /** Atributos data-* para un evento; devuelve html seguro para insertar dentro de una etiqueta. */
  function on(type, name, ...args) {
    if (!TYPES.includes(type)) throw new Error('Evento no soportado: ' + type);
    return window.raw(` data-${type}="${attr(name)}"` + (args.length ? ` data-args="${attr(JSON.stringify(args))}"` : ''));
  }
  const register = (map) => Object.assign(actions, map);
  const resolve = (name) => actions[name] || (typeof window[name] === 'function' ? window[name] : null);

  function handle(ev) {
    const type = ev.type, el = ev.target.closest?.(`[data-${type}]`);
    if (!el) return;
    const fn = resolve(el.getAttribute('data-' + type));
    if (!fn) { console.error('Acción desconocida:', el.getAttribute('data-' + type)); return; }
    let args = [];
    try { args = JSON.parse(el.getAttribute('data-args') || '[]'); } catch { /* sin argumentos */ }
    if (type === 'submit') ev.preventDefault();
    fn(...args, el, ev);
  }
  TYPES.forEach((t) => document.addEventListener(t, handle));
  window.NBEvents = { on, register, actions };
  window.on = on;
})();
