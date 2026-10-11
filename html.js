'use strict';
/* NutriBook — plantillas HTML con escape automático.
   html`<b>${nombre}</b>` escapa cada valor salvo que sea html``/raw(). Arrays, null y false se aplanan. */
(function () {
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const raw = (s) => new Raw(String(s ?? ''));
  function part(v) {
    if (v === null || v === undefined || v === false || v === true) return '';
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(part).join('');
    return esc(v);
  }
  function html(strings, ...vals) {
    let out = strings[0];
    vals.forEach((v, i) => { out += part(v) + strings[i + 1]; });
    return new Raw(out);
  }
  window.NBHtml = { html, raw, esc, Raw };
  window.html = html; window.raw = raw;
})();
