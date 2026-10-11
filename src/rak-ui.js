'use strict';
/* NutriBook — interfaz del menú RAK (script clásico; comparte el ámbito global con el resto de src/). */

// ═══════════════════════════════════════════════════════════════════════════
// RAK (restaurante universitario)
// ═══════════════════════════════════════════════════════════════════════════
const rakWeeks = {}; // lunes ISO -> { state: loading|fetching|done|empty|error, count, fetchedAt, message, pending }
const rakBusy = (s) => s === 'loading' || s === 'fetching';
const rakPageActive = () => ['Inicio', 'Calendario', 'Equilibrio'].includes(page);

/** Carga la semana desde la base de datos y, si falta o está vieja, pide al servidor que la traiga del RAK. */
async function ensureRak(start, { force = false } = {}) {
  if (!window.RAK || !window.NutriCloud?.getClient?.()) return;
  const cur = rakWeeks[start], loggedIn = Boolean(window.NutriCloud.getUser?.());
  if (rakBusy(cur?.state) || (cur && !force && !(cur.needsLogin && loggedIn))) return;   // al iniciar sesión se reintenta
  const dates = weekDates(start), thisWeek = weekStart(0), horizon = datePlus(thisWeek, 14);
  const set = (key, o) => { rakWeeks[key] = o; if (rakPageActive()) renderMain(); };
  const next = datePlus(start, 7);
  let fetchingNext = false;
  set(start, { state: 'loading' });
  try {
    let info = await RAK.loadWeek(dates);
    const stale = !info.fetchedAt || Date.now() - new Date(info.fetchedAt).getTime() > 24 * 3600e3;
    if (start >= thisWeek && start <= horizon && (force || info.count === 0 || stale) && !loggedIn) {
      // sin sesión se muestra lo guardado, pero el servidor no aceptaría el refresco
      set(start, { state: info.count ? 'done' : 'empty', count: info.count, fetchedAt: info.fetchedAt, needsLogin: true });
      if (force) toast('Inicia sesión en «Mi perfil» para actualizar el menú del RAK', 'warn');
    } else if (start >= thisWeek && start <= horizon && (force || info.count === 0 || stale)) {
      const targets = [start];
      if (next <= horizon) { targets.push(next); fetchingNext = !rakBusy(rakWeeks[next]?.state); }
      if (fetchingNext) rakWeeks[next] = { state: 'fetching' };
      set(start, { state: 'fetching', count: info.count, fetchedAt: info.fetchedAt });
      const rep = await RAK.refresh(targets);
      info = await RAK.loadWeek(dates);
      if (fetchingNext) {
        const ni = await RAK.loadWeek(weekDates(next));
        rakWeeks[next] = { state: ni.count ? 'done' : 'empty', count: ni.count, fetchedAt: ni.fetchedAt };
        announceRak(next, ni.count);
        fetchingNext = false;
      }
      set(start, { state: info.count ? 'done' : 'empty', count: info.count, fetchedAt: info.fetchedAt, pending: rep.pending || 0 });
      announceRak(start, info.count);
      if (force && rep.skipped) toast('El menú del RAK ya estaba al día');
      else if (force) {
        toast(rep.pending ? `Menú RAK actualizado. Quedan ${rep.pending} platos por analizar: vuelve a pulsar «Actualizar» en un rato.` : `Menú RAK actualizado · ${rep.menus_fetched} platos`, rep.pending ? 'warn' : '');
      }
    } else {
      set(start, { state: info.count ? 'done' : 'empty', count: info.count, fetchedAt: info.fetchedAt });
      announceRak(start, info.count);
    }
  } catch (e) {
    const info = RAK.weekInfo(dates);
    set(start, { state: info.count ? 'done' : 'error', count: info.count, fetchedAt: info.fetchedAt, message: e.message });
    if (force || !info.count) toast('RAK: ' + e.message, 'warn');
  } finally {
    if (fetchingNext && rakWeeks[next]?.state === 'fetching') delete rakWeeks[next];
  }
}
function refreshRAK() { ensureRak(weekStart(), { force: true }); }

function rakBanner(start) {
  if (!window.RAK) return '';
  if (!window.NutriCloud?.getClient?.()) return `<div class="rak-banner">🍽 Configura Supabase para ver el menú del RAK.</div>`;
  const st = rakWeeks[start] || { state: 'loading' }, busy = rakBusy(st.state);
  const msg = {
    loading: 'Cargando el menú del RAK…',
    fetching: 'Buscando el menú en la web del RAK y analizando gluten y hierro… puede tardar hasta un minuto.',
    done: `Menú RAK de esta semana: <b>${st.count}</b> platos · actualizado ${ago(st.fetchedAt)}${st.pending ? ` · <b>${st.pending}</b> sin analizar aún` : ''}${st.message ? ' · ⚠ no se pudo actualizar' : ''}${st.needsLogin ? ' · inicia sesión para actualizarlo' : ''}`,
    empty: start < weekStart(0) ? 'No hay menú RAK guardado para esta semana pasada.' : 'El RAK todavía no ha publicado el menú de esta semana (o aún no se ha cargado).',
    error: 'No se pudo cargar el menú del RAK: ' + h(st.message || 'error desconocido'),
  }[st.state];
  return `<div class="rak-banner ${st.state}">${busy ? '<span class="spinner"></span>' : '🍽'} <span>${msg}</span>
    <button class="btn mini" ${busy ? 'disabled' : ''} ${on('click', 'refreshRAK')}>${busy ? 'Un momento…' : st.state === 'empty' || st.state === 'error' ? 'Buscar en el RAK' : 'Actualizar'}</button></div>`;
}

const GLUTEN_LABEL = { confirmed_gf: ['Sin gluten', 'good'], contains_gluten: ['Contiene gluten', 'low'], unknown: ['Gluten por confirmar', ''] };
const EFFECTIVE_LABEL = { confirmed_gf: '✅ Sin gluten', acceptable: '⚠️ Adaptable (gluten mínimo o evitable)', no_option: '⛔ Con gluten' };
const CONF_LABEL = { official: 'oficial', estimated: 'estimado', approximate: 'aprox.', insufficient: '?' };

/** Bloque RAK dentro de la comida/cena del calendario */
function rakSlot(date, svc) {
  const eaten = rakOf(date).find((e) => e.service === svc);
  if (eaten) {
    return `<div class="rak-slot-inner rak-status-good-iron"><div class="rak-label">RAK · comido</div><div class="rak-indicator">✓ ${fmtMg(eaten.iron_total_mg)} mg Fe</div>
      <div class="buttons"><button class="btn mini" ${on('click', 'showRAKModal', date, svc)}>Ver</button><button class="btn mini" ${on('click', 'undoRAK', date, svc)}>Deshacer</button></div></div>`;
  }
  const dishes = RAK.getDay(date, svc);
  if (dishes === null) {
    if (date < today()) return '';
    const st = rakWeeks[mondayOf(date)]?.state;
    return `<div class="rak-slot-inner rak-status-no-gf"><div class="rak-label">RAK</div><div class="rak-indicator">${rakBusy(st) || !st ? 'Cargando menú…' : 'Sin menú publicado'}</div></div>`;
  }
  const best = RAK.getBestGlutenFreeCombo(date, svc);
  if (!best) {
    return `<div class="rak-slot-inner rak-status-no-gf"><div class="rak-label">RAK</div><div class="rak-indicator">⛔ Sin opción sin gluten</div>
      <div class="buttons"><button class="btn mini" ${on('click', 'showRAKModal', date, svc)}>Detalles</button></div></div>`;
  }
  const ironOk = best.iron_known && best.iron_total >= goalMeal(), full = best.effective_status === 'confirmed_gf';
  const cls = !full ? 'rak-status-acceptable' : !best.iron_known || ironOk ? 'rak-status-good-iron' : 'rak-status-low-iron';
  const ironText = !best.iron_known ? 'Hierro sin estimar' : `${ironOk ? 'Buen aporte' : 'Aporte bajo'} · ${fmtMg(best.iron_total)} mg Fe`;
  return `<div class="rak-slot-inner ${cls}"><div class="rak-label">RAK${full ? '' : ' · adaptable'}${best.uncertain ? ' · por confirmar' : ''}</div>
    <div class="rak-indicator">${h(best.plat?.dish_name || '')}${best.accompagnement ? ' + ' + h(best.accompagnement.dish_name) : ''}</div>
    ${best.suggestions.length ? `<div class="rak-suggestion">${h(best.suggestions[0])}</div>` : ''}
    <div class="rak-iron-note">${ironText}</div>
    <div class="buttons"><button class="btn mini" ${on('click', 'showRAKModal', date, svc)}>Detalles</button><button class="btn mini primary" ${on('click', 'eatRAK', date, svc, best.number)}>Lo he comido</button>
    ${best.iron_known && !ironOk ? `<button class="btn mini" ${on('click', 'showRAKRecipes', date, svc)}>Alternativas</button>` : ''}</div></div>`;
}

// ───────── Historial, favoritos y aviso del menú de la semana siguiente ─────────
const rakTimesEaten = (dishId) => (state.rakConsumed || []).filter((e) => (e.dishes || []).some((d) => d.dish_id === dishId)).length;
const isRakFav = (dishId) => (state.rakFavs || []).some((f) => f.id === String(dishId));
function toggleRakFav(dishId, name, date, svc) {
  const id = String(dishId);
  state.rakFavs = isRakFav(dishId) ? state.rakFavs.filter((f) => f.id !== id) : [...(state.rakFavs || []), { id, name }];
  save(); showRAKModal(date, svc);
}
/** ¿Hay que avisar de que ya está el menú de una semana futura? Solo una vez por semana y dispositivo; la primera vez solo se anota (seen === null). */
function shouldAnnounceRak(seen, week, count, thisWeek) {
  if (!(count > 0) || week <= thisWeek || seen === null) return false;
  return !seen[week];
}
function announceRak(week, count) {
  if (!(count > 0)) return;
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem('nutribook-rak-seen')); } catch { /* sin datos */ }
  if (seen && seen[week]) return;
  const announce = shouldAnnounceRak(seen, week, count, weekStart(0));
  try { localStorage.setItem('nutribook-rak-seen', JSON.stringify({ ...(seen || {}), [week]: true })); } catch { /* sin almacenamiento */ }
  if (announce) toast('🍽 Ya está el menú del RAK de la semana que viene', '', { label: 'Verlo', run: () => { weekOffset = Math.round((parseDate(week) - parseDate(mondayOf(today()))) / (7 * 864e5)); navigate('Calendario', { keepWeek: true }); } });
}

function showRAKModal(date, svc) {
  if (!window.RAK) return;
  const combos = RAK.getCombos(date, svc), dishes = RAK.getDay(date, svc) || [];
  const eaten = rakOf(date).find((e) => e.service === svc);
  const dishLine = (d) => {
    if (!d) return '';
    const [gl, cls] = GLUTEN_LABEL[d.gluten_status] || GLUTEN_LABEL.unknown;
    const fe = d.iron_mg_estimated != null ? `${fmtMg(d.iron_mg_estimated)} mg Fe (${CONF_LABEL[d.iron_confidence] || '?'})` : 'Fe sin estimar';
    const n = rakTimesEaten(d.dish_id), fav = isRakFav(d.dish_id);
    return `<div class="dish"><b>${h(d.dish_name)}</b> <span class="tag ${cls}">${gl}</span> ${d.gluten_source === 'ai_analysis' ? '<span class="tag" title="Estimado por IA a partir del nombre del plato">🤖 IA</span>' : ''} <small>${fe}</small>
      <button class="icon-btn fav-dish ${fav ? 'on' : ''}" aria-label="${fav ? 'Quitar de favoritos' : 'Marcar como favorito'}: ${h(d.dish_name)}" aria-pressed="${fav}" ${on('click', 'toggleRakFav', d.dish_id, d.dish_name, date, svc)}>${fav ? '★' : '☆'}</button>
      ${n ? `<small class="muted">🔁 Lo has comido ${n} ${n === 1 ? 'vez' : 'veces'}</small>` : ''}
      ${d.gluten_reasoning ? `<small class="muted">${h(d.gluten_reasoning)}</small>` : ''}
      ${d.partial_gf && d.partial_gf_suggestion ? `<small class="rak-suggestion">→ ${h(d.partial_gf_suggestion)}</small>` : d.gluten_minor ? '<small class="muted">Gluten en muy poca cantidad (ligante)</small>' : ''}</div>`;
  };
  const body = combos ? combos.map((c) => `<div class="combo ${c.effective_status}"><div class="combo-head"><b>Opción ${c.number}${c.dishes.some((d) => isRakFav(d.dish_id)) ? ' ★' : ''}</b><span>${EFFECTIVE_LABEL[c.effective_status]}${c.uncertain ? ' · provisional' : ''}</span>
      <b class="fe ${c.iron_known ? ironLevel(c.iron_total, goalMeal()) : ''}">${c.iron_known ? fmtMg(c.iron_total) + ' mg Fe' : 'Fe ?'}</b></div>
      ${dishLine(c.plat)}${dishLine(c.accompagnement)}
      ${!eaten && c.effective_status !== 'no_option' ? `<div class="buttons" style="margin-top:8px"><button class="btn primary mini" ${on('click', 'eatRAK', date, svc, c.number, true)}>Lo he comido</button></div>` : ''}</div>`).join('')
    : dishes.length ? dishes.map((d) => `<div class="combo">${dishLine(d)}</div>`).join('') : '<p class="muted">No hay platos disponibles.</p>';
  showModal(`${modalTop(`RAK · ${RAK_MEAL[svc]}`, `<div class="eyebrow">${fmtDay(date)}</div>`)}
    ${eaten ? `<div class="notice">✓ Comida confirmada · ${fmtMg(eaten.iron_total_mg)} mg Fe <button class="link" ${on('click', 'undoRAK', date, svc, true)}>Deshacer</button></div>` : ''}
    <div class="combos">${body}</div>
    <p class="small muted">El análisis de gluten y hierro lo estima una IA a partir del nombre del plato: confírmalo con el personal del RAK si tienes dudas.</p>
    <div class="buttons"><button class="btn" ${on('click', 'closeModal')}>Cerrar</button></div>`);
}
function eatRAK(date, svc, number, closeAfter = false) {
  const combo = RAK.getCombos(date, svc)?.find((c) => c.number === number);
  if (!combo) return;
  RAK.confirmMeal(date, svc, combo.dishes);
  if (closeAfter) closeModal();
  renderMain();
  toast(combo.iron_known ? `RAK registrado · +${fmtMg(combo.iron_total)} mg de hierro` : 'RAK registrado (sin dato de hierro)');
}
function undoRAK(date, svc, closeAfter = false) { RAK.unconfirmMeal(date, svc); if (closeAfter) closeModal(); renderMain(); }

function showRAKRecipes(date, svc) {
  const list = RAK.suggestRecipes().slice(0, 6);
  showModal(`${modalTop('Alternativas ricas en hierro')}
    <p class="muted">Recetas de tu biblioteca, de más a menos hierro:</p>
    ${list.length ? list.map((r) => `<div class="item"><div><b>${h(r.emoji || '')} ${h(r.name)}</b><small>${fmtMg(r.iron)} mg Fe por ración</small></div>
      <div class="buttons"><button class="btn mini" ${on('click', 'viewRecipe', r.id)}>Ver</button><button class="btn mini primary" ${on('click', 'openPlan', r.id, date, RAK_MEAL[svc])}>Planificar</button></div></div>`).join('') : '<p class="muted">Aún no tienes recetas con dato de hierro.</p>'}
    <div class="buttons" style="margin-top:12px"><button class="btn" ${on('click', 'closeModal')}>Cerrar</button></div>`);
}
