/* NutriBook: base de datos local de hierro (mg/100 g). Fuente: USDA SR Legacy / FoodData Central. */
(function () {
  'use strict';
  // [nombre_canónico_ES, iron100_mg, ...aliases]
  const DATA = [
    // Legumbres
    ['lentejas cocidas', 3.3, 'lentejas', 'lentils cooked'],
    ['lentejas secas', 7.54, 'lentejas crudas', 'lentils dry', 'lentils'],
    ['lentejas coral', 7.58, 'lentejas rojas', 'lentejas coral secas', 'red lentils', 'lentejas naranjas'],
    ['garbanzos cocidos', 2.89, 'garbanzos', 'chickpeas cooked', 'chickpeas'],
    ['garbanzos secos', 6.24, 'garbanzos crudos', 'chickpeas dry'],
    ['alubias cocidas', 2.94, 'judias cocidas', 'judias blancas cocidas', 'frijoles', 'alubias', 'judias'],
    ['alubias secas', 6.69, 'judias secas', 'frijoles secos', 'alubias blancas'],
    ['alubias negras cocidas', 2.1, 'frijoles negros'],
    ['soja seca', 9.7, 'soja', 'soya', 'soybeans'],
    ['edamame cocido', 2.27, 'edamame'],
    ['tofu', 2.66, 'tofu firme', 'tofu blando'],
    ['tempeh', 4.4],
    ['guisantes cocidos', 1.47, 'guisantes', 'piselli', 'peas'],
    ['habas cocidas', 1.5, 'habas'],

    // Carnes y órganos
    ['higado de pollo cocido', 8.99, 'higado de pollo', 'hígado de pollo', 'chicken liver'],
    ['higado de ternera cocido', 6.54, 'higado de ternera', 'hígado de ternera', 'beef liver'],
    ['higado de cerdo cocido', 18.0, 'higado de cerdo', 'hígado de cerdo', 'pork liver'],
    ['carne de ternera magra', 2.6, 'ternera', 'carne de vaca', 'beef', 'carne picada ternera'],
    ['carne picada', 2.1, 'carne picada de ternera', 'ground beef', 'picadillo'],
    ['pechuga de pollo', 0.73, 'pollo', 'pechuga', 'chicken breast', 'pollo cocido'],
    ['muslo de pollo', 1.08, 'pollo muslo', 'chicken thigh'],
    ['carne de cerdo', 0.87, 'cerdo', 'lomo de cerdo', 'pork'],
    ['cordero', 1.97, 'carne de cordero', 'lamb'],
    ['pavo', 1.44, 'pavo cocido', 'turkey'],

    // Pescados y mariscos
    ['almejas cocidas', 28.0, 'almejas', 'chirlas', 'clams'],
    ['berberechos', 24.0, 'berberechos cocidos', 'cockles'],
    ['mejillones cocidos', 6.72, 'mejillones', 'mussels'],
    ['sardinas en conserva', 2.92, 'sardinas', 'sardines'],
    ['atun en conserva', 1.3, 'atún en conserva', 'atun', 'tuna', 'bonito en aceite'],
    ['salmon cocido', 0.8, 'salmon', 'salmón', 'salmon'],
    ['bacalao', 1.11, 'bacalao cocido'],
    ['gambas cocidas', 0.52, 'gambas', 'camarones', 'shrimp'],
    ['pulpo cocido', 8.1, 'pulpo'],

    // Verduras y hortalizas
    ['espinacas crudas', 2.71, 'espinacas', 'spinach raw'],
    ['espinacas cocidas', 3.57, 'espinacas congeladas cocidas'],
    ['acelgas cocidas', 1.8, 'acelgas', 'chard'],
    ['col rizada cruda', 1.47, 'kale', 'col rizada', 'berza'],
    ['brocoli cocido', 0.67, 'brócoli', 'brocoli', 'broccoli'],
    ['remolacha cocida', 0.8, 'remolacha', 'remolacha cruda', 'beet', 'beetroot'],
    ['puerro cocido', 2.1, 'puerros', 'puerro', 'leek'],
    ['alcachofa cocida', 1.28, 'alcachofa', 'artichoke'],
    ['guisantes frescos', 1.47],
    ['cebolla', 0.21, 'cebollas', 'onion'],
    ['ajo', 1.7, 'dientes de ajo', 'garlic'],
    ['zanahoria', 0.3, 'zanahorias', 'carrot'],
    ['patata cocida', 0.31, 'patata', 'patatas', 'papa', 'potato'],
    ['tomate', 0.27, 'tomates', 'tomato'],
    ['pimiento rojo', 0.43, 'pimiento', 'pimiento verde', 'pepper'],
    ['calabaza cocida', 0.8, 'calabaza', 'pumpkin', 'butternut squash'],
    ['berenjena cocida', 0.23, 'berenjena', 'eggplant'],
    ['calabacin cocido', 0.37, 'calabacin', 'calabacín', 'zucchini'],
    ['apio', 0.2, 'celery'],
    ['lechuga', 0.86, 'lechuga romana', 'lettuce'],

    // Cereales y harinas
    ['avena', 3.96, 'copos de avena', 'rolled oats', 'harina de avena', 'porridge', 'oats'],
    ['quinoa cocida', 1.49, 'quinoa', 'quinua', 'quinua cocida'],
    ['quinoa seca', 4.57, 'quinoa cruda', 'quinua seca'],
    ['arroz blanco cocido', 0.2, 'arroz cocido', 'arroz blanco', 'arroz'],
    ['arroz integral cocido', 0.56, 'arroz integral'],
    ['pasta cocida', 0.9, 'pasta', 'espaguetis cocidos', 'macarrones', 'fideos cocidos', 'pasta blanca'],
    ['pasta integral cocida', 1.7, 'pasta integral'],
    ['pan blanco', 1.2, 'pan', 'bread'],
    ['pan integral', 2.5, 'pan de centeno', 'whole wheat bread'],
    ['harina de trigo', 3.88, 'harina blanca', 'flour', 'harina'],
    ['harina integral', 4.64, 'harina de trigo integral'],
    ['harina de garbanzos', 4.86, 'harina de legumbres'],
    ['cuscus cocido', 0.8, 'cuscús', 'couscous'],
    ['bulgur cocido', 1.75, 'bulgur'],
    ['pan de pita', 1.7, 'pita'],

    // Semillas y frutos secos
    ['semillas de calabaza', 8.82, 'pipas de calabaza', 'pumpkin seeds', 'pepitas'],
    ['semillas de sesamo', 14.55, 'sesamo', 'sésamo', 'tahini seeds', 'sesame seeds'],
    ['tahini', 8.95, 'pasta de sesamo', 'crema de sesamo'],
    ['semillas de girasol', 5.25, 'pipas de girasol', 'sunflower seeds'],
    ['semillas de lino', 5.73, 'lino', 'flaxseed', 'linaza'],
    ['semillas de chia', 7.72, 'chía', 'chia seeds'],
    ['semillas de canamo', 7.95, 'cañamo', 'hemp seeds'],
    ['nueces', 2.91, 'nueces peladas', 'walnuts'],
    ['almendras', 3.71, 'almendra', 'almendras crudas', 'almonds'],
    ['anacardos', 6.68, 'anacardos crudos', 'cashews'],
    ['pistachos', 3.92, 'pistacho', 'pistachios'],
    ['cacahuetes', 1.58, 'mani', 'maní', 'peanuts'],
    ['avellanas', 4.7, 'avellana', 'hazelnuts'],
    ['pinones', 5.53, 'piñones', 'pine nuts'],
    ['nueces de brasil', 2.43, 'nueces del brasil', 'brazil nuts'],

    // Frutas secas y frutos con cáscara
    ['castanas', 1.01, 'castañas', 'castaña', 'chestnuts', 'chestnut', 'castañas asadas', 'castañas cocidas', 'castañas al horno', 'chataignes', 'chataigne', 'marrons', 'marron'],
    ['datiles secos', 1.02, 'dátiles', 'datiles', 'dates'],
    ['pasas', 1.79, 'uvas pasas', 'raisins'],
    ['orejones', 6.31, 'albaricoques secos', 'orejones de albaricoque', 'dried apricots'],
    ['ciruelas pasas', 0.93, 'ciruelas secas', 'prunes'],
    ['higos secos', 2.03, 'higos secos', 'dried figs'],
    ['arandanos secos', 0.7, 'arándanos secos', 'cranberries dried'],

    // Frutas frescas
    ['platano', 0.26, 'plátano', 'banana'],
    ['manzana', 0.12, 'manzanas', 'apple'],
    ['naranja', 0.1, 'naranjas', 'orange'],
    ['limon', 0.08, 'limón', 'lemon', 'zumo de limon'],
    ['fresas', 0.41, 'fresa', 'strawberry'],
    ['aguacate', 0.55, 'avocado'],
    ['mango', 0.16],
    ['kiwi', 0.31],
    ['granada', 0.3, 'pomegranate'],

    // Huevos y lácteos
    ['huevo entero', 1.75, 'huevo', 'huevos', 'egg'],
    ['clara de huevo', 0.08, 'clara', 'egg white'],
    ['yema de huevo', 2.73, 'yema', 'egg yolk'],
    ['leche entera', 0.05, 'leche', 'milk'],
    ['leche desnatada', 0.02, 'leche semidesnatada'],
    ['yogur natural', 0.05, 'yogur', 'yogurt'],
    ['queso fresco', 0.16, 'queso', 'cheese'],
    ['queso parmesano', 0.44, 'parmesano', 'parmesan'],
    ['queso feta', 0.65, 'feta'],
    ['mantequilla', 0.02, 'butter'],

    // Dulces y cacao
    ['cacao en polvo', 13.86, 'cacao', 'cocoa powder', 'chocolate en polvo'],
    ['chocolate negro 70', 11.9, 'chocolate negro', 'dark chocolate', 'chocolate 70%', 'chocolate 85%'],
    ['chocolate con leche', 2.4, 'chocolate'],
    ['miel', 0.42, 'honey'],
    ['azucar', 0.01, 'azúcar', 'azucar blanco', 'sugar'],
    ['sirope de agave', 0.19, 'agave', 'agave syrup'],
    ['sirope de arce', 0.11, 'maple syrup'],

    // Grasas y condimentos
    ['aceite de oliva', 0.07, 'aceite', 'olive oil'],
    ['vinagre', 0.1, 'vinegar'],
    ['sal', 0.0, 'salt'],
    ['agua', 0.0, 'water'],
    ['caldo de verduras', 0.2, 'caldo vegetal', 'vegetable broth'],
    ['caldo de pollo', 0.15, 'chicken broth'],

    // Especias (cantidades pequeñas pero registrables)
    ['curcuma', 41.4, 'cúrcuma', 'turmeric'],
    ['comino', 66.4, 'cumin'],
    ['canela', 38.1, 'cinnamon'],
    ['perejil seco', 22.0, 'parsley dried'],
    ['oregano seco', 36.8, 'orégano', 'oregano'],
    ['tomillo seco', 123.6, 'thyme', 'tomillo'],
    ['levadura nutricional', 10.7, 'levadura de cerveza', 'nutritional yeast', 'levadura'],
  ];

  function normalize(s) {
    return String(s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const index = new Map();
  for (const [name, iron100, ...aliases] of DATA) {
    const entry = { description: name, iron100, source: 'local' };
    index.set(normalize(name), entry);
    for (const alias of aliases) {
      const k = normalize(alias);
      if (!index.has(k)) index.set(k, entry);
    }
  }

  function lookup(name) {
    if (!name) return null;
    const key = normalize(name);
    if (index.has(key)) return index.get(key);
    // Partial: DB key fully contained in query (keys >= 5 chars only)
    for (const [k, v] of index) {
      if (k.length >= 5 && key.includes(k)) return v;
    }
    // Partial: query fully contained in DB key
    if (key.length >= 5) {
      for (const [k, v] of index) {
        if (k.includes(key)) return v;
      }
    }
    return null;
  }

  window.IRON_DB = { lookup, size: index.size };
})();
