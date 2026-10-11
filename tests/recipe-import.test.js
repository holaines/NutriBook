import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRecipe, isoDurationToMinutes, decodeEntities } from '../supabase/functions/_shared/recipe-extract.js';
import { checkImportUrl, isPrivateIp } from '../supabase/functions/_shared/policy.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/recipes');
const html = (n) => fs.readFileSync(path.join(dir, n), 'utf8');

test('JSON-LD simple: nombre, descripción, raciones, tiempo, ingredientes y pasos', () => {
  const r = extractRecipe(html('simple.html'), 'https://x.es/lentejas');
  assert.deepEqual(r, { name: 'Lentejas con verduras', description: 'Un plato de cuchara & barato.', servings: 4, time: 45,
    ingredients: ['200 g de lentejas', '1 cebolla', '2 zanahorias', 'Aceite de oliva'], instructions: ['Pocha la cebolla.', 'Añade las lentejas.', 'Cuece 30 minutos.'], source: 'https://x.es/lentejas' });
});

test('@graph con tipo múltiple, JSON roto antes, HowToSection/HowToStep, entidades y tiempo prep+cocción', () => {
  const r = extractRecipe(html('graph.html'));
  assert.equal(r.name, "Estofado de ternera 'casero'");
  assert.equal(r.servings, 6); assert.equal(r.time, 110);
  assert.deepEqual(r.ingredients, ['500 g de ternera', '2 patatas', '1 cucharada de pimentón']);
  assert.deepEqual(r.instructions, ['Sella la carne.', 'Añade las verduras.', 'Cuece 1 hora & sirve.']);
});

test('microdatos cuando no hay JSON-LD', () => {
  const r = extractRecipe(html('microdata.html'), 'https://x.es/t');
  assert.equal(r.name, 'Tortilla de espinacas'); assert.equal(r.servings, 2); assert.equal(r.time, 25);
  assert.deepEqual(r.ingredients, ['4 huevos', '100 g de espinacas']);
  assert.deepEqual(r.instructions, ['Bate los huevos.', 'Cuaja la tortilla.']);
});

test('páginas sin receta (o vacías) devuelven null', () => {
  assert.equal(extractRecipe(html('none.html')), null);
  assert.equal(extractRecipe(''), null); assert.equal(extractRecipe(null), null); assert.equal(extractRecipe('<html>x</html>'), null);
  assert.equal(extractRecipe('<script type="application/ld+json">{"@type":"Recipe","name":"Sin nada"}</script>'), null, 'sin ingredientes ni pasos no sirve');
});

test('duraciones ISO 8601 y entidades', () => {
  assert.equal(isoDurationToMinutes('PT1H30M'), 90); assert.equal(isoDurationToMinutes('PT45M'), 45); assert.equal(isoDurationToMinutes('P1DT2H'), 1560);
  assert.equal(isoDurationToMinutes('PT0M'), null); assert.equal(isoDurationToMinutes('rápido'), null); assert.equal(isoDurationToMinutes(undefined), null);
  assert.equal(decodeEntities('a&amp;b &#233; &#xE9; &nbsp;&frac12; &raro;'), 'a&b é é  ½ &raro;');
});

test('raciones raras y datos de tipo inesperado no rompen', () => {
  const page = (y, ing) => `<script type="application/ld+json">{"@type":"Recipe","name":"X","recipeYield":${y},"recipeIngredient":${ing},"recipeInstructions":null}</script>`;
  assert.equal(extractRecipe(page('"Para 12 personas"', '["a"]')).servings, 12);
  assert.equal(extractRecipe(page('8', '["a"]')).servings, 8);
  assert.equal(extractRecipe(page('"muchas"', '["a"]')).servings, null);
  assert.equal(extractRecipe(page('999', '["a"]')).servings, null);
  assert.deepEqual(extractRecipe(page('1', '"solo una cadena"')).ingredients, ['solo una cadena']);
});

test('URL: acepta páginas públicas y rechaza esquemas, credenciales, puertos y direcciones internas', () => {
  for (const ok of ['https://www.recetasgratis.net/receta/x', 'http://blog.ejemplo.com/a?b=1', 'https://cocina.example.org:443/x']) assert.equal(checkImportUrl(ok).ok, true, ok);
  const bad = ['ftp://x.com/a', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pw@x.com/', 'https://x.com:8080/', 'http://localhost/', 'http://localhost:3000/',
    'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://10.0.0.5/', 'http://172.16.0.1/', 'http://172.31.255.255/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/', 'http://[::1]/', 'http://[fe80::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://servidor/', 'http://impresora.local/', 'http://nas.lan/', 'no es una url', ''];
  for (const b of bad) assert.equal(checkImportUrl(b).ok, false, b);
  assert.equal(checkImportUrl('http://172.32.0.1/').ok, true, '172.32 ya es público');
});

test('isPrivateIp: rangos privados, loopback, enlace local, CGNAT y reservados', () => {
  for (const ip of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.1.1', '172.20.0.1', '192.168.0.1', '100.64.0.1', '224.0.0.1', '255.255.255.255', '::1', 'fe80::1', 'fc00::1', '::ffff:10.0.0.1']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
});
