'use strict';
/* NutriBook — sincronización sin pisadas.
   Cada elemento de recetas/despensa/comidas lleva updatedAt; los borrados dejan una tumba en sync.deleted;
   plan/compra/perfil llevan su marca en sync.stamps. mergeStates(a, b) une dos copias y, ante el mismo
   elemento, gana la modificación más reciente. stamp(state) detecta qué cambió desde la última vez
   (comparando con una instantánea), de modo que el resto de la app no necesita saber nada de marcas. */
(function () {
  const COLLECTIONS = ['recipes', 'pantry', 'consumed', 'rakConsumed', 'supplements'];
  const MAPS = ['plan', 'checked'];            // clave -> valor, con marca por clave
  const TOMB_TTL = 90 * 864e5;                 // las tumbas se olvidan a los 90 días
  const json = (v) => JSON.stringify(v, (k, x) => (k === 'updatedAt' ? undefined : x));
  const num = (v) => Number(v) || 0;
  const emptySync = () => ({ deleted: {}, stamps: {} });
  const syncOf = (s) => ({ deleted: { ...(s?.sync?.deleted) }, stamps: { ...(s?.sync?.stamps) } });

  let prev = null;   // instantánea: { 'recipes:id': json, 'plan:key': json, 'profile': json, ... }

  function snapshot(state) {
    const snap = {};
    for (const c of COLLECTIONS) for (const it of state[c] || []) if (it?.id) snap[c + ':' + it.id] = json(it);
    for (const m of MAPS) for (const [k, v] of Object.entries(state[m] || {})) snap[m + ':' + k] = json(v);
    snap.profile = json(state.profile || {});
    return snap;
  }
  const reset = (state) => { prev = snapshot(state); };

  /** Marca lo que cambió desde la última instantánea. Modifica `state` y devuelve true si hubo cambios. */
  function stamp(state, now = new Date().toISOString()) {
    if (!prev) { reset(state); return false; }
    const sync = (state.sync = { ...emptySync(), ...(state.sync || {}) });
    sync.deleted = { ...sync.deleted }; sync.stamps = { ...sync.stamps };
    const cur = snapshot(state);
    let changed = false;
    for (const c of COLLECTIONS) {
      for (const it of state[c] || []) {
        if (!it?.id) continue;
        const k = c + ':' + it.id;
        if (prev[k] !== cur[k]) { it.updatedAt = now; delete sync.deleted[k]; changed = true; }
      }
    }
    for (const k of Object.keys(prev)) {
      if (k in cur) continue;
      if (COLLECTIONS.some((c) => k.startsWith(c + ':'))) sync.deleted[k] = now;
      else sync.stamps[k] = now;                       // clave de plan/compra borrada: la marca basta
      changed = true;
    }
    for (const k of Object.keys(cur)) {
      if (prev[k] === cur[k]) continue;
      if (MAPS.some((m) => k.startsWith(m + ':')) || k === 'profile') { sync.stamps[k] = now; changed = true; }
    }
    prev = cur;
    return changed;
  }

  /** Une dos estados. Neutral respecto al orden salvo empates exactos (gana `a`, la copia local). */
  function mergeStates(a, b, now = Date.now()) {
    a = a || {}; b = b || {};
    const sa = syncOf(a), sb = syncOf(b);
    const deleted = { ...sb.deleted };
    for (const [k, t] of Object.entries(sa.deleted)) if (!(k in deleted) || t > deleted[k]) deleted[k] = t;
    const stamps = { ...sb.stamps };
    for (const [k, t] of Object.entries(sa.stamps)) if (!(k in stamps) || t > stamps[k]) stamps[k] = t;

    const out = { ...b, ...a };                         // claves desconocidas de ambos lados se conservan

    for (const c of COLLECTIONS) {
      const byId = new Map();
      for (const it of [...(b[c] || []), ...(a[c] || [])]) {   // a después: gana el empate
        const old = byId.get(it.id);
        if (!old || String(it.updatedAt || '') >= String(old.updatedAt || '')) byId.set(it.id, it);
      }
      out[c] = [...byId.values()].sort((x, y) => String(x.id).localeCompare(String(y.id))).filter((it) => {
        const t = deleted[c + ':' + it.id];
        return !(t && String(t) > String(it.updatedAt || ''));
      });
    }
    for (const m of MAPS) {
      const res = {};
      const keys = new Set([...Object.keys(a[m] || {}), ...Object.keys(b[m] || {})]);
      for (const k of keys) {
        const sk = m + ':' + k, ta = String(sa.stamps[sk] || ''), tb = String(sb.stamps[sk] || '');
        const inA = k in (a[m] || {}), inB = k in (b[m] || {});
        const pickA = ta >= tb;                         // empate: local
        const src = pickA ? (inA ? a[m] : null) : (inB ? b[m] : null);
        const fallback = pickA ? (inB ? b[m] : null) : (inA ? a[m] : null);
        // si el ganador borró la clave (marca sin valor) se respeta el borrado
        if (src) res[k] = src[k];
        else if (!(ta || tb) && fallback) res[k] = fallback[k];
      }
      out[m] = res;
    }
    const pa = String(sa.stamps.profile || ''), pb = String(sb.stamps.profile || '');
    out.profile = { ...(pa >= pb ? { ...(b.profile || {}), ...(a.profile || {}) } : { ...(a.profile || {}), ...(b.profile || {}) }) };

    for (const [k, t] of Object.entries(deleted)) if (now - Date.parse(t) > TOMB_TTL) delete deleted[k];
    out.sync = { deleted, stamps };
    out.schemaVersion = Math.max(num(a.schemaVersion), num(b.schemaVersion));
    return out;
  }

  window.NBMerge = { mergeStates, stamp, reset, snapshot };
})();
