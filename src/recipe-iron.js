'use strict';
/* NutriBook — hierro de una receta calculado a partir de sus ingredientes y de la base de alimentos (src/foods.js).
   Es explicable (se ve cuánto aporta cada ingrediente), gratuito e instantáneo; la IA solo se usa si no basta. */

const UNIT_GRAMS = { g: 1, kg: 1000, ml: 1, l: 1000, cucharada: 15, cucharadas: 15, cucharadita: 5, cucharaditas: 5, taza: 240, tazas: 240, pizca: 0.5, diente: 5, dientes: 5 };
const ING_STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'y', 'o', 'al', 'un', 'una', 'unos', 'unas', 'fresco', 'fresca', 'natural', 'troceado', 'troceada', 'rallado', 'rallada', 'lata', 'bote', 'grande', 'pequeno', 'pequena', 'mediano', 'mediana', 'cocido', 'cocida', 'cocidos', 'cocidas', 'cocinado', 'cocinada', 'cocinados', 'cocinadas', 'crudo', 'cruda', 'crudos', 'crudas', 'seco', 'seca', 'secos', 'secas', 'hervido', 'hervida', 'bio']);
/** Ingredientes con hierro despreciable en las cantidades habituales: no cuentan como «sin dato». */
const NEGLIGIBLE = /\b(sal|agua|aceite|vinagre|pimienta|azucar|canela|comino|pimenton|oregano|laurel|tomillo|romero|albahaca|especias?|hierbas?|caldo|levadura|vainilla|miel|mantequilla|nata|limon|zumo)\b/;

const singular = (w) => (w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const tokensOf = (text) => plainText(text).replace(/\([^)]*\)/g, ' ').split(/[^a-z]+/).filter(Boolean).filter((w) => !ING_STOP.has(w)).map(singular);

let _foodIndex = null;
/** Conjuntos de palabras por alimento (nombre y alias) para emparejar con el texto de un ingrediente. */
function foodIndex() {
  return (_foodIndex ||= FOODS.map((f) => ({ food: f, sets: [f.name, ...f.aliases].map((n) => new Set(tokensOf(n))).filter((s) => s.size) })));
}

/** Alimento de la base que corresponde a un ingrediente («200 g de lentejas coral» -> lentejas), o null. */
const SAUCE_FIRST = new Set(['salsa', 'aceite', 'vinagre', 'caldo', 'esencia', 'extracto']);   // «salsa de soja» no es soja
function matchFood(name) {
  const first = plainText(name).split(/[^a-z]+/).filter(Boolean)[0];
  const ing = new Set(tokensOf(name)), cooked = /cocid|hervid/.test(plainText(name));
  let best = [], bestScore = 0;
  for (const { food, sets } of foodIndex()) {
    for (const set of sets) {
      if (![...set].every((t) => ing.has(t))) continue;
      if (set.size > bestScore) { best = [food]; bestScore = set.size; } else if (set.size === bestScore && !best.includes(food)) best.push(food);
    }
  }
  if (!best.length || (SAUCE_FIRST.has(first) && !best.some((f) => plainText(f.name).includes(first)))) return null;
  const isRaw = (f) => /\b(secas?|secos?|crud[oa]s?)\b/.test(plainText(f.name));
  const isCooked = (f) => /cocid/.test(plainText(f.name));
  const pick = cooked ? best.find(isCooked) : best.find(isRaw);
  return pick || best.sort((a, b) => a.name.length - b.name.length)[0];
}

/** Gramos de un ingrediente con cantidad y unidad; null si no se puede saber. */
function ingredientGrams(ing, food) {
  if (ing.quantity == null || !(Number(ing.quantity) > 0)) return null;
  const unit = String(ing.unit || 'ud').toLowerCase(), q = Number(ing.quantity);
  if (unit in UNIT_GRAMS) return q * UNIT_GRAMS[unit];
  return q * food.portionG;    // «2 huevos», «1 cebolla»: unidades -> ración típica del alimento
}

/** Calcula el hierro de una receta: { total, perServing, rows, unmatched, coverage }. */
function computeRecipeIron(r) {
  const rows = [], unmatched = [];
  let counted = 0;
  for (const ing of r.ingredients || []) {
    const food = matchFood(ing.name);
    if (!food) { if (!NEGLIGIBLE.test(plainText(ing.name))) { unmatched.push({ name: ing.name, reason: 'no está en la base de alimentos' }); counted++; } continue; }
    counted++;
    const grams = ingredientGrams(ing, food);
    if (grams === null) { unmatched.push({ name: ing.name, reason: 'falta la cantidad' }); continue; }
    rows.push({ name: ing.name, food: food.name, grams: Math.round(grams), mg: Math.round(food.iron * grams) / 100 });
  }
  const total = Math.round(rows.reduce((n, x) => n + x.mg, 0) * 100) / 100, servings = Math.max(1, Number(r.servings) || 1);
  return { total, perServing: Math.round(total / servings * 100) / 100, rows, unmatched, coverage: counted ? rows.length / counted : 0 };
}
const IRON_CALC_TRUST = 0.7;   // con al menos este porcentaje de ingredientes reconocidos se fía del cálculo
