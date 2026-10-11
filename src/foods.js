'use strict';
/* NutriBook — base de alimentos con hierro (mg por 100 g, tal como se comen: cocidos si procede).
   Valores redondeados y aproximados a partir de tablas públicas (CIQUAL / USDA FoodData Central):
   varían según marca, variedad y cocinado. Sirven para estimar, no para diagnosticar.
   Fila: [id, nombre, hierro/100 g, gramos de una ración, etiqueta de ración, tipo, categoría, etiquetas, alias]
   tipo: heme (carne/pescado) · nonheme (vegetal/huevo/lácteo)
   etiquetas: vitc (≥ 25 mg de vitamina C/100 g) · calcio / polifenoles / fitatos (pueden frenar la absorción) */

const FOOD_CATEGORIES = ['Legumbres', 'Carnes', 'Pescado y marisco', 'Huevos y lácteos', 'Verduras', 'Frutas', 'Frutos secos y semillas', 'Cereales y pan', 'Otros'];

const FOOD_ROWS = [
  // Legumbres (cocidas salvo indicación)
  ['lentejas', 'Lentejas cocidas', 3.3, 200, '1 plato (200 g)', 'nonheme', 'Legumbres', ['fitatos'], ['lenteja']],
  ['garbanzos', 'Garbanzos cocidos', 2.9, 150, '1 ración (150 g)', 'nonheme', 'Legumbres', ['fitatos']],
  ['alubias-blancas', 'Alubias blancas cocidas', 3.7, 200, '1 plato (200 g)', 'nonheme', 'Legumbres', ['fitatos'], ['judías blancas', 'fabada']],
  ['alubias-negras', 'Alubias negras cocidas', 2.1, 200, '1 plato (200 g)', 'nonheme', 'Legumbres', ['fitatos'], ['frijoles']],
  ['alubias-pintas', 'Alubias pintas / rojas cocidas', 2.2, 200, '1 plato (200 g)', 'nonheme', 'Legumbres', ['fitatos'], ['judías pintas', 'frijoles rojos']],
  ['soja-cocida', 'Soja cocida', 5.1, 150, '1 ración (150 g)', 'nonheme', 'Legumbres', ['fitatos']],
  ['edamame', 'Edamame', 2.3, 100, '1 cuenco (100 g)', 'nonheme', 'Legumbres', []],
  ['tofu', 'Tofu firme', 2.7, 100, '1 ración (100 g)', 'nonheme', 'Legumbres', ['calcio']],
  ['tempeh', 'Tempeh', 2.7, 100, '1 ración (100 g)', 'nonheme', 'Legumbres', []],
  ['hummus', 'Hummus', 2.4, 50, '3 cucharadas (50 g)', 'nonheme', 'Legumbres', [], ['humus']],
  ['guisantes', 'Guisantes cocidos', 1.5, 100, '1 ración (100 g)', 'nonheme', 'Legumbres', []],
  ['lentejas-secas', 'Lentejas secas (en crudo)', 7.5, 60, '60 g en crudo', 'nonheme', 'Legumbres', ['fitatos']],
  ['garbanzos-secos', 'Garbanzos secos (en crudo)', 6.2, 60, '60 g en crudo', 'nonheme', 'Legumbres', ['fitatos']],
  ['harina-garbanzo', 'Harina de garbanzo', 4.9, 40, '40 g', 'nonheme', 'Legumbres', ['fitatos']],
  // Carnes
  ['ternera-magra', 'Ternera magra cocinada', 2.6, 120, '1 filete (120 g)', 'heme', 'Carnes', [], ['filete de ternera', 'vacuno', 'entrecot']],
  ['ternera-picada', 'Carne picada de ternera cocinada', 2.5, 120, '1 ración (120 g)', 'heme', 'Carnes', [], ['hamburguesa']],
  ['higado-ternera', 'Hígado de ternera cocinado', 5.0, 100, '1 ración (100 g)', 'heme', 'Carnes', [], ['hígado']],
  ['higado-pollo', 'Hígado de pollo cocinado', 9.0, 100, '1 ración (100 g)', 'heme', 'Carnes', [], ['hígado']],
  ['morcilla', 'Morcilla', 6.0, 60, '1 trozo (60 g)', 'heme', 'Carnes', [], ['boudin noir']],
  ['cordero', 'Cordero cocinado', 2.0, 120, '1 ración (120 g)', 'heme', 'Carnes', []],
  ['cerdo-lomo', 'Lomo de cerdo cocinado', 1.0, 120, '1 filete (120 g)', 'heme', 'Carnes', []],
  ['jamon-serrano', 'Jamón serrano', 1.2, 40, '4 lonchas (40 g)', 'heme', 'Carnes', []],
  ['jamon-cocido', 'Jamón cocido', 0.9, 40, '2 lonchas (40 g)', 'heme', 'Carnes', []],
  ['pollo-pechuga', 'Pechuga de pollo cocinada', 0.4, 120, '1 filete (120 g)', 'heme', 'Carnes', []],
  ['pollo-muslo', 'Muslo de pollo cocinado', 1.0, 120, '1 muslo (120 g)', 'heme', 'Carnes', []],
  ['pavo', 'Pavo cocinado', 0.7, 120, '1 filete (120 g)', 'heme', 'Carnes', []],
  ['conejo', 'Conejo cocinado', 1.5, 120, '1 ración (120 g)', 'heme', 'Carnes', []],
  ['pato', 'Pato cocinado', 2.7, 120, '1 ración (120 g)', 'heme', 'Carnes', []],
  ['salchicha', 'Salchicha cocinada', 1.2, 80, '2 unidades (80 g)', 'heme', 'Carnes', []],
  ['bacon', 'Bacon cocinado', 0.8, 30, '3 lonchas (30 g)', 'heme', 'Carnes', [], ['beicon', 'panceta']],
  // Pescado y marisco
  ['mejillones', 'Mejillones cocidos', 6.7, 100, '1 ración (100 g)', 'heme', 'Pescado y marisco', []],
  ['almejas', 'Almejas cocidas', 14, 100, '1 ración (100 g)', 'heme', 'Pescado y marisco', [], ['berberechos']],
  ['berberechos', 'Berberechos', 11, 100, '1 ración (100 g)', 'heme', 'Pescado y marisco', []],
  ['ostras', 'Ostras', 5.1, 100, '6 ostras (100 g)', 'heme', 'Pescado y marisco', []],
  ['pulpo', 'Pulpo cocido', 9.5, 100, '1 ración (100 g)', 'heme', 'Pescado y marisco', []],
  ['sardinas-lata', 'Sardinas en lata', 2.9, 90, '1 lata (90 g)', 'heme', 'Pescado y marisco', [], ['sardina']],
  ['anchoas', 'Anchoas en conserva', 3.3, 30, '6 filetes (30 g)', 'heme', 'Pescado y marisco', []],
  ['atun-lata', 'Atún en lata', 1.4, 80, '1 lata (80 g)', 'heme', 'Pescado y marisco', []],
  ['atun-fresco', 'Atún fresco cocinado', 1.0, 120, '1 filete (120 g)', 'heme', 'Pescado y marisco', []],
  ['caballa', 'Caballa cocinada', 1.6, 120, '1 filete (120 g)', 'heme', 'Pescado y marisco', []],
  ['salmon', 'Salmón cocinado', 0.5, 120, '1 filete (120 g)', 'heme', 'Pescado y marisco', []],
  ['bacalao', 'Bacalao cocinado', 0.5, 120, '1 lomo (120 g)', 'heme', 'Pescado y marisco', []],
  ['merluza', 'Merluza cocinada', 0.4, 120, '1 filete (120 g)', 'heme', 'Pescado y marisco', []],
  ['gambas', 'Gambas cocidas', 0.5, 100, '1 ración (100 g)', 'heme', 'Pescado y marisco', [], ['langostinos']],
  ['calamar', 'Calamar cocinado', 0.9, 100, '1 ración (100 g)', 'heme', 'Pescado y marisco', []],
  // Huevos y lácteos
  ['huevo', 'Huevo cocido', 1.2, 60, '1 huevo (60 g)', 'nonheme', 'Huevos y lácteos', []],
  ['yema', 'Yema de huevo', 2.7, 20, '1 yema (20 g)', 'nonheme', 'Huevos y lácteos', []],
  ['leche', 'Leche', 0.03, 200, '1 vaso (200 ml)', 'nonheme', 'Huevos y lácteos', ['calcio']],
  ['yogur', 'Yogur natural', 0.1, 125, '1 yogur (125 g)', 'nonheme', 'Huevos y lácteos', ['calcio']],
  ['queso-fresco', 'Queso fresco', 0.1, 60, '1 ración (60 g)', 'nonheme', 'Huevos y lácteos', ['calcio']],
  ['queso-curado', 'Queso curado', 0.5, 30, '1 ración (30 g)', 'nonheme', 'Huevos y lácteos', ['calcio']],
  ['mozzarella', 'Mozzarella', 0.4, 60, '1 ración (60 g)', 'nonheme', 'Huevos y lácteos', ['calcio']],
  // Verduras
  ['espinacas-crudas', 'Espinacas crudas', 2.7, 60, '1 puñado (60 g)', 'nonheme', 'Verduras', ['vitc'], ['espinaca']],
  ['espinacas-cocidas', 'Espinacas cocidas', 3.6, 150, '1 plato (150 g)', 'nonheme', 'Verduras', ['vitc'], ['espinaca']],
  ['acelgas', 'Acelgas cocidas', 2.3, 150, '1 plato (150 g)', 'nonheme', 'Verduras', []],
  ['kale', 'Col rizada (kale)', 1.5, 60, '1 puñado (60 g)', 'nonheme', 'Verduras', ['vitc']],
  ['brocoli', 'Brócoli cocido', 0.7, 150, '1 plato (150 g)', 'nonheme', 'Verduras', ['vitc'], ['brécol']],
  ['lombarda', 'Col lombarda', 0.8, 100, '1 ración (100 g)', 'nonheme', 'Verduras', ['vitc'], ['repollo']],
  ['col-bruselas', 'Coles de Bruselas cocidas', 0.9, 120, '1 ración (120 g)', 'nonheme', 'Verduras', ['vitc']],
  ['coliflor', 'Coliflor cocida', 0.4, 150, '1 plato (150 g)', 'nonheme', 'Verduras', ['vitc']],
  ['judias-verdes', 'Judías verdes cocidas', 0.7, 150, '1 plato (150 g)', 'nonheme', 'Verduras', []],
  ['pimiento-rojo', 'Pimiento rojo', 0.4, 100, '1 pimiento (100 g)', 'nonheme', 'Verduras', ['vitc']],
  ['pimiento-verde', 'Pimiento verde', 0.3, 100, '1 pimiento (100 g)', 'nonheme', 'Verduras', ['vitc']],
  ['tomate', 'Tomate', 0.3, 120, '1 tomate (120 g)', 'nonheme', 'Verduras', []],
  ['zanahoria', 'Zanahoria', 0.3, 80, '1 zanahoria (80 g)', 'nonheme', 'Verduras', []],
  ['lechuga', 'Lechuga', 0.9, 60, '1 plato (60 g)', 'nonheme', 'Verduras', []],
  ['rucula', 'Rúcula', 1.5, 40, '1 puñado (40 g)', 'nonheme', 'Verduras', []],
  ['patata', 'Patata cocida', 0.3, 150, '1 patata (150 g)', 'nonheme', 'Verduras', []],
  ['boniato', 'Boniato cocido', 0.7, 150, '1 pieza (150 g)', 'nonheme', 'Verduras', [], ['batata']],
  ['remolacha', 'Remolacha cocida', 0.7, 100, '1 ración (100 g)', 'nonheme', 'Verduras', []],
  ['calabacin', 'Calabacín', 0.4, 150, '1 ración (150 g)', 'nonheme', 'Verduras', []],
  ['berenjena', 'Berenjena', 0.2, 150, '1 ración (150 g)', 'nonheme', 'Verduras', []],
  ['champinones', 'Champiñones', 0.5, 80, '1 ración (80 g)', 'nonheme', 'Verduras', [], ['setas']],
  ['cebolla', 'Cebolla', 0.2, 80, '1 cebolla (80 g)', 'nonheme', 'Verduras', []],
  ['ajo', 'Ajo', 1.7, 5, '1 diente (5 g)', 'nonheme', 'Verduras', []],
  ['alcachofa', 'Alcachofa cocida', 0.5, 120, '1 ración (120 g)', 'nonheme', 'Verduras', []],
  ['esparragos', 'Espárragos cocidos', 0.9, 100, '1 ración (100 g)', 'nonheme', 'Verduras', []],
  ['calabaza', 'Calabaza cocida', 0.6, 150, '1 ración (150 g)', 'nonheme', 'Verduras', []],
  ['pepino', 'Pepino', 0.3, 100, '1/2 pepino (100 g)', 'nonheme', 'Verduras', []],
  ['perejil', 'Perejil fresco', 6.2, 10, '1 cucharada (10 g)', 'nonheme', 'Verduras', ['vitc']],
  ['maiz', 'Maíz cocido', 0.5, 100, '1 ración (100 g)', 'nonheme', 'Verduras', []],
  // Frutas
  ['kiwi', 'Kiwi', 0.3, 80, '1 kiwi (80 g)', 'nonheme', 'Frutas', ['vitc']],
  ['naranja', 'Naranja', 0.1, 150, '1 naranja (150 g)', 'nonheme', 'Frutas', ['vitc']],
  ['zumo-naranja', 'Zumo de naranja', 0.2, 200, '1 vaso (200 ml)', 'nonheme', 'Frutas', ['vitc']],
  ['limon', 'Limón (zumo)', 0.1, 20, '1 chorrito (20 ml)', 'nonheme', 'Frutas', ['vitc']],
  ['fresas', 'Fresas', 0.4, 150, '1 cuenco (150 g)', 'nonheme', 'Frutas', ['vitc']],
  ['platano', 'Plátano', 0.3, 120, '1 plátano (120 g)', 'nonheme', 'Frutas', []],
  ['manzana', 'Manzana', 0.1, 150, '1 manzana (150 g)', 'nonheme', 'Frutas', []],
  ['uvas', 'Uvas', 0.4, 100, '1 racimo (100 g)', 'nonheme', 'Frutas', []],
  ['mango', 'Mango', 0.2, 150, '1/2 mango (150 g)', 'nonheme', 'Frutas', ['vitc']],
  ['pina', 'Piña', 0.3, 150, '1 ración (150 g)', 'nonheme', 'Frutas', ['vitc']],
  ['melon', 'Melón', 0.2, 200, '1 tajada (200 g)', 'nonheme', 'Frutas', ['vitc']],
  ['frambuesas', 'Frambuesas', 0.7, 100, '1 cuenco (100 g)', 'nonheme', 'Frutas', ['vitc']],
  ['arandanos', 'Arándanos', 0.3, 100, '1 cuenco (100 g)', 'nonheme', 'Frutas', []],
  ['aguacate', 'Aguacate', 0.6, 100, '1/2 aguacate (100 g)', 'nonheme', 'Frutas', []],
  ['albaricoque-seco', 'Orejones (albaricoque seco)', 2.7, 40, '5 orejones (40 g)', 'nonheme', 'Frutas', []],
  ['higos-secos', 'Higos secos', 2.0, 40, '3 higos (40 g)', 'nonheme', 'Frutas', []],
  ['datiles', 'Dátiles', 1.0, 40, '3 dátiles (40 g)', 'nonheme', 'Frutas', []],
  ['ciruelas-pasas', 'Ciruelas pasas', 0.9, 40, '4 ciruelas (40 g)', 'nonheme', 'Frutas', []],
  ['pasas', 'Pasas', 1.9, 30, '1 puñado (30 g)', 'nonheme', 'Frutas', []],
  // Frutos secos y semillas
  ['almendras', 'Almendras', 3.7, 30, '1 puñado (30 g)', 'nonheme', 'Frutos secos y semillas', ['fitatos']],
  ['nueces', 'Nueces', 2.9, 30, '1 puñado (30 g)', 'nonheme', 'Frutos secos y semillas', ['fitatos']],
  ['pistachos', 'Pistachos', 3.9, 30, '1 puñado (30 g)', 'nonheme', 'Frutos secos y semillas', ['fitatos']],
  ['anacardos', 'Anacardos', 6.7, 30, '1 puñado (30 g)', 'nonheme', 'Frutos secos y semillas', ['fitatos']],
  ['avellanas', 'Avellanas', 4.7, 30, '1 puñado (30 g)', 'nonheme', 'Frutos secos y semillas', ['fitatos']],
  ['cacahuetes', 'Cacahuetes', 4.6, 30, '1 puñado (30 g)', 'nonheme', 'Frutos secos y semillas', ['fitatos']],
  ['mantequilla-cacahuete', 'Crema de cacahuete', 1.9, 20, '1 cucharada (20 g)', 'nonheme', 'Frutos secos y semillas', []],
  ['pipas-calabaza', 'Pipas de calabaza', 8.8, 20, '2 cucharadas (20 g)', 'nonheme', 'Frutos secos y semillas', ['fitatos']],
  ['pipas-girasol', 'Pipas de girasol', 5.3, 20, '2 cucharadas (20 g)', 'nonheme', 'Frutos secos y semillas', ['fitatos']],
  ['sesamo', 'Semillas de sésamo', 14.6, 10, '1 cucharada (10 g)', 'nonheme', 'Frutos secos y semillas', ['fitatos'], ['ajonjolí']],
  ['tahini', 'Tahini (crema de sésamo)', 8.9, 20, '1 cucharada (20 g)', 'nonheme', 'Frutos secos y semillas', []],
  ['chia', 'Semillas de chía', 7.7, 15, '1 cucharada (15 g)', 'nonheme', 'Frutos secos y semillas', ['fitatos']],
  ['lino', 'Semillas de lino', 5.7, 10, '1 cucharada (10 g)', 'nonheme', 'Frutos secos y semillas', ['fitatos']],
  ['canamo', 'Semillas de cáñamo', 8.0, 15, '1 cucharada (15 g)', 'nonheme', 'Frutos secos y semillas', []],
  ['coco-rallado', 'Coco rallado', 3.3, 15, '1 cucharada (15 g)', 'nonheme', 'Frutos secos y semillas', []],
  // Cereales y pan
  ['avena', 'Copos de avena', 4.3, 40, '1 cuenco (40 g en crudo)', 'nonheme', 'Cereales y pan', ['fitatos']],
  ['arroz-blanco', 'Arroz blanco cocido', 0.2, 150, '1 plato (150 g)', 'nonheme', 'Cereales y pan', []],
  ['arroz-integral', 'Arroz integral cocido', 0.4, 150, '1 plato (150 g)', 'nonheme', 'Cereales y pan', ['fitatos']],
  ['pasta', 'Pasta cocida', 0.5, 180, '1 plato (180 g)', 'nonheme', 'Cereales y pan', []],
  ['pasta-integral', 'Pasta integral cocida', 1.1, 180, '1 plato (180 g)', 'nonheme', 'Cereales y pan', ['fitatos']],
  ['pan-blanco', 'Pan blanco', 1.5, 60, '2 rebanadas (60 g)', 'nonheme', 'Cereales y pan', []],
  ['pan-integral', 'Pan integral', 2.5, 60, '2 rebanadas (60 g)', 'nonheme', 'Cereales y pan', ['fitatos']],
  ['pan-centeno', 'Pan de centeno', 2.8, 60, '2 rebanadas (60 g)', 'nonheme', 'Cereales y pan', ['fitatos']],
  ['quinoa', 'Quinoa cocida', 1.5, 150, '1 plato (150 g)', 'nonheme', 'Cereales y pan', ['fitatos']],
  ['cuscus', 'Cuscús cocido', 0.4, 150, '1 plato (150 g)', 'nonheme', 'Cereales y pan', []],
  ['mijo', 'Mijo cocido', 0.6, 150, '1 plato (150 g)', 'nonheme', 'Cereales y pan', []],
  ['amaranto', 'Amaranto cocido', 2.1, 150, '1 plato (150 g)', 'nonheme', 'Cereales y pan', ['fitatos']],
  ['trigo-sarraceno', 'Trigo sarraceno cocido', 0.8, 150, '1 plato (150 g)', 'nonheme', 'Cereales y pan', []],
  ['cereales-fortificados', 'Cereales de desayuno fortificados', 10, 30, '1 cuenco (30 g)', 'nonheme', 'Cereales y pan', [], ['cereales']],
  // Otros
  ['chocolate-negro', 'Chocolate negro (70 %)', 11.9, 20, '2 onzas (20 g)', 'nonheme', 'Otros', ['polifenoles']],
  ['cacao-polvo', 'Cacao en polvo', 13.9, 10, '1 cucharada (10 g)', 'nonheme', 'Otros', ['polifenoles']],
  ['melaza', 'Melaza negra', 4.7, 20, '1 cucharada (20 g)', 'nonheme', 'Otros', []],
  ['nori', 'Alga nori seca', 11.8, 5, '1 hoja (5 g)', 'nonheme', 'Otros', []],
  ['espirulina', 'Espirulina en polvo', 28.5, 5, '1 cucharadita (5 g)', 'nonheme', 'Otros', []],
  ['miso', 'Miso', 2.5, 20, '1 cucharada (20 g)', 'nonheme', 'Otros', []],
  ['cafe', 'Café', 0.0, 150, '1 taza (150 ml)', 'nonheme', 'Otros', ['polifenoles']],
  ['te', 'Té negro / verde', 0.0, 200, '1 taza (200 ml)', 'nonheme', 'Otros', ['polifenoles'], ['infusión']],
];

/** Alimentos como objetos: { id, name, iron, portionG, portionLabel, type, category, tags, aliases } */
const FOODS = FOOD_ROWS.map(([id, name, iron, portionG, portionLabel, type, category, tags = [], aliases = []]) =>
  ({ id, name, iron, portionG, portionLabel, type, category, tags, aliases }));

const plainText = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const foodById = (id) => FOODS.find((f) => f.id === id);
/** mg de hierro de `grams` gramos (o de `portions` raciones) de un alimento, con 1 decimal. */
const foodIron = (food, grams) => Math.round((food.iron * grams / 100) * 10) / 10;
const foodPortionIron = (food, portions = 1) => foodIron(food, food.portionG * portions);
/** Busca por nombre, alias o categoría sin distinguir acentos; empiezan-por antes que contiene; luego más hierro. */
function foodSearch(query, limit = 12) {
  const q = plainText(query);
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored = [];
  for (const f of FOODS) {
    const hay = [f.name, ...f.aliases, f.category].map(plainText);
    if (!words.every((w) => hay.some((t) => t.includes(w)))) continue;
    const starts = hay.slice(0, 1 + f.aliases.length).some((t) => t.startsWith(q));
    scored.push([starts ? 0 : 1, f]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length || b[1].iron - a[1].iron).slice(0, limit).map((x) => x[1]);
}
