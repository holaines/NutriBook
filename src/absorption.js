'use strict';
/* NutriBook — hierro absorbido (estimación) y factores que ayudan o frenan la absorción.
   Modelo deliberadamente simple: el hierro «hemo» (carne, pescado) se absorbe ~15-35 %, el «no hemo»
   (vegetal, huevo, lácteos) ~2-20 %. La vitamina C en la misma comida lo favorece; café, té, cacao y
   lácteos lo frenan. Es una orientación, no una medida. */

const HEME_SHARE = { heme: 0.4, mixed: 0.2, nonheme: 0 };            // fracción del hierro de un alimento que es hemo
const ABS_HEME = [0.15, 0.25, 0.35], ABS_NONHEME = [0.02, 0.08, 0.20];   // bajo, medio, alto
const ENHANCE = 1.5, INHIBIT = 0.5, NONHEME_CAP = 0.25;

const HEME_WORDS = /\b(ternera|vacuno|buey|cerdo|cordero|pollo|pavo|pato|conejo|jamon|higado|morcilla|carne|salchicha|bacon|atun|salmon|sardina|caballa|bacalao|merluza|pescado|mejillon|mejillones|almeja|almejas|berberecho|berberechos|pulpo|calamar|gamba|gambas|langostino|langostinos|marisco|anchoa|anchoas|hamburguesa|filete|lomo|chuleta|albondiga|albondigas)\b/;
const VITC_WORDS = /\b(pimiento|pimientos|kiwi|kiwis|naranja|naranjas|limon|limones|lima|fresa|fresas|brocoli|brecol|coliflor|col|coles|lombarda|perejil|mango|pina|guayaba|papaya|melon|zumo de naranja|zumo de limon)\b/;
const INHIB_WORDS = /\b(cafe|te|infusion|chocolate|cacao|leche|yogur|yogures|queso|quesos|requeson|nata|natillas|flan|cuajada)\b/;

const normText = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hasVitC = (text) => VITC_WORDS.test(normText(text));
const hasInhibitor = (text) => INHIB_WORDS.test(normText(text));

/** Tipo de hierro de una receta: el elegido a mano o, si no, deducido de los ingredientes. */
function recipeIronType(r) {
  if (!r) return 'mixed';
  if (['heme', 'nonheme', 'mixed'].includes(r.ironType)) return r.ironType;
  const names = (r.ingredients || []).map((i) => i.name).join(' ');
  return HEME_WORDS.test(normText(names)) ? 'mixed' : 'nonheme';
}
const recipeText = (r) => (r?.ingredients || []).map((i) => i.name).join(' ');

/** Perfil de absorción de una comida registrada: { mg, type, vitc, inhib } */
function entryProfile(x) {
  const r = x.recipeId ? recipe(x.recipeId) : null, food = x.foodId ? foodById(x.foodId) : null, text = r ? recipeText(r) + ' ' + r.name : x.name;
  return {
    mg: Number(x.iron) || 0,
    type: ['heme', 'nonheme', 'mixed'].includes(x.ironType) ? x.ironType : r ? recipeIronType(r) : (HEME_WORDS.test(normText(x.name)) ? 'mixed' : 'nonheme'),
    vitc: hasVitC(text) || Boolean(food?.tags.includes('vitc')), inhib: hasInhibitor(text) || Boolean(food?.tags.some((t) => t === 'polifenoles' || t === 'calcio')),
  };
}

/** entries: [{ mg, type, vitc, inhib }] -> { low, mid, high } en mg (1 decimal). */
function absorbedIron(entries) {
  const sum = [0, 0, 0];
  for (const e of entries) {
    const mg = Number(e.mg) || 0;
    if (mg <= 0) continue;
    const heme = mg * (HEME_SHARE[e.type] ?? HEME_SHARE.mixed), non = mg - heme;
    const m = e.vitc && !e.inhib ? ENHANCE : e.inhib && !e.vitc ? INHIBIT : 1;
    for (let i = 0; i < 3; i++) sum[i] += heme * ABS_HEME[i] + non * Math.min(ABS_NONHEME[i] * m, NONHEME_CAP);
  }
  const r = (v) => Math.round(v * 10) / 10;
  return { low: r(sum[0]), mid: r(sum[1]), high: r(sum[2]) };
}

/** Absorción estimada de lo comido en un día; vitamina C e inhibidores se aplican por comida (mismo `meal`). */
function dayAbsorbed(date) {
  const items = foodFor(date).map((x) => ({ meal: x.meal, ...entryProfile(x) }));
  for (const e of rakOf(date)) items.push({ meal: RAK_MEAL[e.service] || e.service, mg: Number(e.iron_total_mg) || 0, type: 'mixed', vitc: false, inhib: false });
  const byMeal = {};
  for (const it of items) { const m = (byMeal[it.meal] ||= { vitc: false, inhib: false }); m.vitc ||= it.vitc; m.inhib ||= it.inhib; }
  return absorbedIron(items.map((it) => ({ ...it, vitc: byMeal[it.meal].vitc, inhib: byMeal[it.meal].inhib })));
}

const fmtAbs = (a) => (a.low === a.high ? fmtMg(a.mid) : fmtMg(a.low) + '–' + fmtMg(a.high)) + ' mg';
/** Línea «≈ x–y mg absorbidos (estimado)» para un día, o '' si no hay nada comido. */
function absorbedLine(date) {
  const a = dayAbsorbed(date);
  if (!(a.high > 0)) return '';
  return `<div class="abs-line" title="Estimación: el hierro de carne y pescado se absorbe mejor que el vegetal, y la vitamina C ayuda. No es una medida médica.">≈ <b>${fmtAbs(a)}</b> absorbidos <small class="muted">(estimado)</small></div>`;
}

function weekAbsorbedNotice(dates, totalMg, label = 'esta semana') {
  const t = dates.map(dayAbsorbed).reduce((s, a) => ({ low: s.low + a.low, high: s.high + a.high }), { low: 0, high: 0 });
  if (!(t.high > 0) || !(totalMg > 0)) return '';
  const low = Math.round(t.low * 10) / 10, high = Math.round(t.high * 10) / 10;
  return `<div class="notice">🧪 De los <b>${fmtMg(totalMg)} mg</b> ingeridos ${label}, se absorberían unos <b>${fmtMg(low)}–${fmtMg(high)} mg</b> (estimación). Combina el hierro vegetal con vitamina C y separa el café o el té de las comidas.</div>`;
}

/** Comidas de un día con su hierro: lo comido y lo planificado (si el día no ha pasado). */
function mealGroups(date) {
  const groups = {};
  const add = (meal, it) => { (groups[meal] ||= []).push(it); };
  for (const x of foodFor(date)) add(x.meal, { name: x.name, ...entryProfile(x), planned: false });
  if (date >= today()) {
    for (const m of MEALS) {
      const k = date + '|' + m, r = recipe(state.plan[k]);
      if (!r || eatenFor(k)) continue;
      add(m, { name: r.name, mg: ironVal(r.iron) ?? 0, type: recipeIronType(r), vitc: hasVitC(recipeText(r) + ' ' + r.name), inhib: hasInhibitor(recipeText(r) + ' ' + r.name), planned: true });
    }
  }
  return groups;
}

/** Consejos de absorción para un día: [{ kind: 'warn'|'tip'|'good', text }], los más útiles primero (máx. 3). */
function absorptionTips(date) {
  const out = [];
  for (const meal of MEALS) {
    const items = mealGroups(date)[meal];
    if (!items) continue;
    const iron = items.filter((i) => i.mg >= 1.5), mg = iron.reduce((n, i) => n + i.mg, 0);
    const veg = iron.filter((i) => i.type === 'nonheme' || i.type === 'mixed');
    const vitc = items.some((i) => i.vitc), inhib = items.some((i) => i.inhib);
    const verb = items.every((i) => i.planned) ? 'llevará' : 'lleva';
    if (!iron.length) continue;
    const what = iron.length === 1 ? `«${iron[0].name}»` : `tu ${meal.toLowerCase()}`;
    if (inhib) out.push({ kind: 'warn', text: `En tu ${meal.toLowerCase()} hay café, té, chocolate o lácteos junto a ${what} (${fmtMg(mg)} mg): sepáralos 1-2 horas para no frenar el hierro.` });
    else if (veg.length && !vitc) out.push({ kind: 'tip', text: `Tu ${meal.toLowerCase()} ${verb} hierro de origen vegetal (${fmtMg(veg.reduce((n, i) => n + i.mg, 0))} mg). Añade un cítrico, pimiento o kiwi para absorberlo mejor.` });
    else if (vitc) out.push({ kind: 'good', text: `✓ La vitamina C de tu ${meal.toLowerCase()} ayuda a absorber su hierro.` });
  }
  const order = { warn: 0, tip: 1, good: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 3);
}
function tipsHtml(date) {
  const tips = absorptionTips(date);
  if (!tips.length) return '';
  const icon = { warn: '⚠️', tip: '💡', good: '' };
  return `<ul class="tips">${tips.map((t) => `<li class="${t.kind}">${icon[t.kind]} ${h(t.text)}</li>`).join('')}</ul>`;
}

/** Consejos de hoy dentro de la semana mostrada (solo si hoy está en ella). */
const todayTipsIn = (dates) => (dates.includes(today()) ? tipsHtml(today()) : '');
