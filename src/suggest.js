'use strict';
/* NutriBook — sugerencias para «llegar al objetivo» de hierro (función pura + adaptador al estado). */

const GAP_CATEGORIES = {
  light: ['Frutos secos y semillas', 'Frutas', 'Cereales y pan', 'Huevos y lácteos'],      // desayuno y merienda
  meal: ['Legumbres', 'Carnes', 'Pescado y marisco', 'Verduras', 'Cereales y pan'],       // comida y cena
};

/**
 * Qué comer para cubrir el hierro que falta.
 * input: { missing, mealsLeft, meal, recipes, pantry, foods, vegetarian, exclude }
 * Devuelve hasta 3 sugerencias: [{ kind: 'recipe'|'food', id, name, mg, why }]
 */
function suggestGap({ missing, mealsLeft = 1, meal = 'Comida', recipes = [], pantry = [], foods = [], vegetarian = false, exclude = [] }) {
  if (!(missing > 0.5)) return [];
  const need = missing / Math.max(1, mealsLeft);
  const have = pantry.map((p) => plainText(p.name)).filter(Boolean);
  const hits = (text) => { const t = plainText(text); return have.filter((p) => t.includes(p) || p.includes(t)).length; };
  const out = [];

  const rs = recipes.filter((r) => !exclude.includes(r.id) && Number(r.iron) > 0)
    .map((r) => { const pantryHits = (r.ingredients || []).filter((i) => hits(i.name)).length; return { r, pantryHits, score: Math.abs(Number(r.iron) - need) - 0.8 * pantryHits - (r.favorite ? 0.5 : 0) }; })
    .sort((a, b) => a.score - b.score).slice(0, 2);
  for (const { r, pantryHits } of rs) out.push({ kind: 'recipe', id: r.id, name: r.name, mg: Number(r.iron),
    why: pantryHits ? `usa ${pantryHits} ${pantryHits === 1 ? 'ingrediente' : 'ingredientes'} de tu despensa` : Number(r.iron) >= need ? 'cubre lo que te falta' : 'te acerca a tu objetivo' });

  const cats = GAP_CATEGORIES[meal === 'Desayuno' || meal === 'Merienda' ? 'light' : 'meal'];
  const fs = foods.filter((f) => cats.includes(f.category) && !f.tags.includes('polifenoles') && !(vegetarian && f.type === 'heme') && f.iron * f.portionG / 100 >= 0.8)
    .map((f) => { const mg = f.iron * f.portionG / 100, inPantry = hits(f.name) + f.aliases.filter(hits).length > 0; return { f, mg, inPantry, score: Math.abs(mg - need) - (inPantry ? 1.5 : 0) - (f.tags.includes('vitc') ? 0.2 : 0) }; })
    .sort((a, b) => a.score - b.score).slice(0, 3);
  for (const { f, mg, inPantry } of fs) out.push({ kind: 'food', id: f.id, name: `${f.name} (${f.portionLabel})`, mg: Math.round(mg * 10) / 10, why: inPantry ? 'ya lo tienes en casa' : mg >= need ? 'cubre lo que te falta' : 'suma sin complicarte' });
  return out.slice(0, 3);
}

/** Adaptador: calcula las entradas con el estado de la app para un día (normalmente hoy). */
function gapSuggestionsFor(date = today()) {
  const di = dayIron(date), meal = nextMealSlot(date);
  if (!meal) return [];
  const left = MEALS.slice(MEALS.indexOf(meal)).filter((m) => !mealDone(date, m)).length;
  const planned = MEALS.map((m) => state.plan[date + '|' + m]).filter(Boolean), eaten = state.consumed.filter((x) => x.date === date && x.recipeId).map((x) => x.recipeId);
  return suggestGap({ missing: di.goal - di.total, mealsLeft: left, meal, recipes: state.recipes, pantry: state.pantry, foods: FOODS, vegetarian: state.profile.diet === 'vegetarian', exclude: [...planned, ...eaten] }).map((s) => ({ ...s, meal, date }));
}
