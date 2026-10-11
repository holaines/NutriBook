// Extrae una receta de una página web (JSON-LD de schema.org/Recipe y, si no hay, microdatos).
// Lógica pura, sin red: la usa la Edge Function recipe-import y se prueba con node en tests/recipe-import.test.js.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', deg: '°', frac12: '½', frac14: '¼', frac34: '¾' };
export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
const stripTags = (s) => decodeEntities(String(s ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t ]+/g, ' ').replace(/ *\n+ */g, '\n').trim();
const clean = (s) => stripTags(s).replace(/\s+/g, ' ').trim();

/** «PT1H30M» -> 90 minutos; null si no se entiende. */
export function isoDurationToMinutes(d) {
  const m = String(d ?? '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const [, days, h, min, sec] = m.map((x) => (x === undefined ? 0 : Number(x)));
  const total = days * 1440 + h * 60 + min + Math.round(sec / 60);
  return total > 0 ? total : null;
}

function yieldToServings(y) {
  const list = Array.isArray(y) ? y : [y];
  for (const v of list) { const m = String(v ?? '').match(/\d+/); if (m && Number(m[0]) > 0 && Number(m[0]) <= 100) return Number(m[0]); }
  return null;
}

function instructionsOf(v) {
  if (!v) return [];
  if (typeof v === 'string') return stripTags(v).split(/\n+/).map((x) => x.replace(/^\s*\d+[.)-]\s*/, '').trim()).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(instructionsOf);
  if (typeof v === 'object') {
    if (v.itemListElement) return instructionsOf(v.itemListElement);
    if (v.text) return instructionsOf(v.text);
    if (v.name && !v.text) return instructionsOf(v.name);
  }
  return [];
}

function isRecipe(node) {
  const t = node?.['@type'];
  return (Array.isArray(t) ? t : [t]).some((x) => String(x).toLowerCase().endsWith('recipe'));
}
function findRecipeNode(json) {
  const stack = [json];
  while (stack.length) {
    const n = stack.shift();
    if (Array.isArray(n)) { stack.push(...n); continue; }
    if (n && typeof n === 'object') {
      if (isRecipe(n)) return n;
      if (n['@graph']) stack.push(n['@graph']);
      if (n.mainEntity) stack.push(n.mainEntity);
      if (n.itemListElement) stack.push(n.itemListElement);
      if (n.item) stack.push(n.item);
    }
  }
  return null;
}

function fromJsonLd(html) {
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let json;
    try { json = JSON.parse(m[1].trim()); } catch { try { json = JSON.parse(m[1].replace(/,\s*([}\]])/g, '$1').trim()); } catch { continue; } }
    const r = findRecipeNode(json);
    if (!r) continue;
    const ingredients = (r.recipeIngredient ?? r.ingredients ?? []);
    const time = isoDurationToMinutes(r.totalTime) ?? ((isoDurationToMinutes(r.prepTime) || 0) + (isoDurationToMinutes(r.cookTime) || 0) || null);
    return { name: clean(r.name), description: clean(r.description), servings: yieldToServings(r.recipeYield), time,
      ingredients: (Array.isArray(ingredients) ? ingredients : [ingredients]).map(clean).filter(Boolean), instructions: instructionsOf(r.recipeInstructions).map(clean).filter(Boolean) };
  }
  return null;
}

function fromMicrodata(html) {
  const all = (prop) => [...html.matchAll(new RegExp(`<([a-z0-9]+)\\b[^>]*itemprop\\s*=\\s*["']${prop}["'][^>]*>([\\s\\S]*?)</\\1>`, 'gi'))].map((m) => clean(m[2])).filter(Boolean);
  const ingredients = [...all('recipeIngredient'), ...all('ingredients')];
  if (!ingredients.length) return null;
  const steps = html.match(/<(div|section|ol|ul|p)\b[^>]*itemprop\s*=\s*["']recipeInstructions["'][^>]*>([\s\S]*?)<\/\1>/i);
  const name = all('name')[0] || clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  const time = (html.match(/itemprop\s*=\s*["']totalTime["'][^>]*(?:content|datetime)\s*=\s*["']([^"']+)["']/i) || [])[1];
  const yld = (html.match(/itemprop\s*=\s*["']recipeYield["'][^>]*>([\s\S]*?)</i) || [])[1];
  return { name, description: all('description')[0] || '', servings: yieldToServings(yld), time: isoDurationToMinutes(time), ingredients, instructions: steps ? instructionsOf(steps[2]) : [] };
}

/** Devuelve { name, description, servings, time, ingredients[], instructions[], source } o null si la página no trae una receta utilizable. */
export function extractRecipe(html, url = '') {
  const r = fromJsonLd(String(html ?? '')) || fromMicrodata(String(html ?? ''));
  if (!r || !r.name || (!r.ingredients.length && !r.instructions.length)) return null;
  return { ...r, source: url };
}
