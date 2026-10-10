import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const geminiKey = Deno.env.get("GEMINI_KEY");
    if (!geminiKey) throw new Error("GEMINI_KEY secret not configured");

    // Fetch RAK menu page
    const rakRes = await fetch("https://services.imt-atlantique.fr/rak/pagemenu.php", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NutriBook/1.0)" },
    });
    if (!rakRes.ok) throw new Error(`RAK fetch failed: ${rakRes.status}`);
    const html = await rakRes.text();

    const dishes = parseRAKHtml(html);
    if (dishes.length === 0) {
      return Response.json(
        { menus_fetched: 0, menus_updated: 0, errors: ["No dishes found in RAK page"] },
        { headers: corsHeaders }
      );
    }

    // Analyse Gemini pour tous les plats uniques
    const uniqueNames = [...new Set(dishes.map((d) => d.dish_name))];
    const geminiResults = await analyzeWithGemini(uniqueNames, geminiKey);

    // Construction des records a upsert
    const records = dishes.map((dish) => {
      const a = geminiResults[dish.dish_name] ?? {
        gluten_status: "unknown",
        gluten_source: "ai_analysis",
        gluten_reasoning: "Analyse non disponible",
        iron_mg_estimated: null,
        iron_confidence: "insufficient",
        iron_notes: null,
      };
      return {
        menu_date: dish.menu_date,
        service: dish.service,
        menu_type: dish.menu_type,
        dish_id: dish.dish_id,
        dish_name: dish.dish_name,
        dish_category: dish.dish_category ?? null,
        gluten_status: a.gluten_status,
        gluten_source: a.gluten_source,
        gluten_reasoning: a.gluten_reasoning ?? null,
        iron_mg_estimated: a.iron_mg_estimated,
        iron_confidence: a.iron_confidence,
        iron_notes: a.iron_notes ?? null,
        allergen_raw: dish.allergen_raw ?? null,
        fetched_at: new Date().toISOString(),
      };
    });

    const { error } = await admin
      .from("rak_menus")
      .upsert(records, { onConflict: "menu_date,service,menu_type,dish_id" });

    if (error) throw error;

    return Response.json(
      { menus_fetched: dishes.length, menus_updated: records.length, errors: [] },
      { headers: corsHeaders }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("rak-fetch error:", msg);
    return Response.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DishEntry {
  menu_date: string;
  service: string;
  menu_type: string;
  dish_id: number;
  dish_name: string;
  dish_category: string | null;
  allergen_raw: Record<string, unknown> | null;
}

interface GeminiAnalysis {
  gluten_status: string;
  gluten_source: string;
  gluten_reasoning: string | null;
  iron_mg_estimated: number | null;
  iron_confidence: string;
  iron_notes: string | null;
}

// ---------------------------------------------------------------------------
// HTML parsing
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseFrenchDate(text: string): string | null {
  const months: Record<string, string> = {
    janvier: "01", "f\u00e9vrier": "02", mars: "03", avril: "04",
    mai: "05", juin: "06", juillet: "07", ao\u00fbt: "08",
    septembre: "09", octobre: "10", novembre: "11", "d\u00e9cembre": "12",
  };
  const m = text.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (!m) return null;
  const month = months[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseRAKHtml(html: string): DishEntry[] {
  const dishes: DishEntry[] = [];
  const seen = new Set<string>();

  let currentDate = todayISO();
  let currentService = "dejeuner";
  let currentMenuType = "rampe";
  let currentCategory: string | null = null;

  // Normalise HTML: split into pseudo-lines on tag boundaries for easier scanning
  const lines = html
    .replace(/>\s*</g, ">\n<")
    .replace(/\r/g, "")
    .split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Detect date (French format: "Lundi 13 octobre 2025")
    const dateMatch = line.match(
      /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2}\s+\w+\s+\d{4})/i
    );
    if (dateMatch) {
      const parsed = parseFrenchDate(dateMatch[1]);
      if (parsed) currentDate = parsed;
    }

    // Detect service
    if (/d[eé]jeuner/i.test(line) && !/diner|d[iî]ner/i.test(line)) {
      currentService = "dejeuner";
    } else if (/d[iî]ner/i.test(line)) {
      currentService = "diner";
    }

    // Detect menu type
    if (/\brampe\b/i.test(line)) currentMenuType = "rampe";
    else if (/caf[eé]t[eé]ria/i.test(line)) currentMenuType = "cafeteria";

    // Detect dish category
    if (/entr[eé]e\s*chaude/i.test(line)) currentCategory = "entree_chaude";
    else if (/entr[eé]e\s*froide/i.test(line)) currentCategory = "entree_froide";
    else if (/plat\s*principal|plat\s*1\b/i.test(line)) currentCategory = "plat1";
    else if (/plat\s*2\b/i.test(line)) currentCategory = "plat2";
    else if (/accompagnement\s*1\b/i.test(line)) currentCategory = "accompagnement1";
    else if (/accompagnement\s*2\b/i.test(line)) currentCategory = "accompagnement2";
    else if (/dessert/i.test(line)) currentCategory = "dessert";
    else if (/fromage/i.test(line)) currentCategory = "fromage";
    else if (/p[aâ]tisserie|viennoiserie/i.test(line)) currentCategory = "patisserie";

    // Match dish links: <a href="./plat.php?id_plat=123">Dish Name</a>
    const dishMatch = line.match(
      /<a[^>]+href=["'](?:\.\/)?plat\.php\?id_plat=(\d+)["'][^>]*>([^<]+)<\/a>/i
    );
    if (dishMatch) {
      const dishId = parseInt(dishMatch[1], 10);
      const dishName = decodeHtmlEntities(dishMatch[2]);
      if (!dishName) continue;

      const key = `${currentDate}|${currentService}|${currentMenuType}|${dishId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      dishes.push({
        menu_date: currentDate,
        service: currentService,
        menu_type: currentMenuType,
        dish_id: dishId,
        dish_name: dishName,
        dish_category: currentCategory,
        allergen_raw: null,
      });
    }
  }

  return dishes;
}

// ---------------------------------------------------------------------------
// Gemini analysis
// ---------------------------------------------------------------------------

async function analyzeWithGemini(
  dishNames: string[],
  geminiKey: string
): Promise<Record<string, GeminiAnalysis>> {
  const results: Record<string, GeminiAnalysis> = {};
  const batchSize = 15;
  for (let i = 0; i < dishNames.length; i += batchSize) {
    const batch = dishNames.slice(i, i + batchSize);
    const batchResults = await analyzeGeminiBatch(batch, geminiKey);
    Object.assign(results, batchResults);
  }
  return results;
}

async function analyzeGeminiBatch(
  dishNames: string[],
  geminiKey: string
): Promise<Record<string, GeminiAnalysis>> {
  const dishList = dishNames.map((name, idx) => `${idx + 1}. ${name}`).join("\n");

  const prompt = `Tu es un expert en nutrition et allergènes dans la cuisine française de restauration collective.

Pour chaque plat de cette liste, analyse:
1. La présence de gluten (blé, orge, seigle, avoine, épeautre et dérivés; incluant panure, farine, pâtes, pain, béchamel)
2. La teneur en fer estimée en mg pour une portion standard de restaurant (environ 150-200g pour les plats chauds)

Plats à analyser:
${dishList}

Réponds UNIQUEMENT avec un JSON valide. Chaque clé doit être le NOM EXACT du plat:
{
  "Nom exact du plat": {
    "gluten_status": "confirmed_gf ou contains_gluten ou unknown",
    "gluten_reasoning": "explication courte en français (max 15 mots)",
    "iron_mg_estimated": nombre décimal ou null si vraiment incertain,
    "iron_confidence": "estimated ou approximate ou insufficient",
    "iron_notes": "principaux contributeurs en fer ou null"
  }
}

Règles:
- confirmed_gf: aucun ingredient avec gluten detectable
- contains_gluten: contient clairement du gluten (calamars romaine = panure de farine donc contains_gluten)
- unknown: ambiguite trop importante
- iron_confidence insufficient seulement si le plat est vraiment inconnu`;

  const fallback = (reason: string): Record<string, GeminiAnalysis> =>
    Object.fromEntries(
      dishNames.map((name) => [
        name,
        {
          gluten_status: "unknown",
          gluten_source: "ai_analysis",
          gluten_reasoning: reason,
          iron_mg_estimated: null,
          iron_confidence: "insufficient",
          iron_notes: null,
        },
      ])
    );

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0 },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
      console.error("Gemini error:", msg);
      return fallback("Erreur Gemini: " + msg);
    }

    const data = await res.json();
    const raw: string = data.candidates[0].content.parts[0].text;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback("Reponse Gemini non parseable");

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, Record<string, unknown>>;
    const results: Record<string, GeminiAnalysis> = {};

    for (const [name, a] of Object.entries(parsed)) {
      results[name] = {
        gluten_status: (a.gluten_status as string) || "unknown",
        gluten_source: "ai_analysis",
        gluten_reasoning: (a.gluten_reasoning as string) ?? null,
        iron_mg_estimated:
          a.iron_mg_estimated != null ? Number(a.iron_mg_estimated) : null,
        iron_confidence: (a.iron_confidence as string) || "insufficient",
        iron_notes: (a.iron_notes as string) ?? null,
      };
    }

    // Remplir les plats non trouvés dans la réponse
    for (const name of dishNames) {
      if (!results[name]) {
        results[name] = {
          gluten_status: "unknown",
          gluten_source: "ai_analysis",
          gluten_reasoning: "Non trouve dans la reponse Gemini",
          iron_mg_estimated: null,
          iron_confidence: "insufficient",
          iron_notes: null,
        };
      }
    }

    return results;
  } catch (e) {
    console.error("Gemini batch exception:", e);
    return fallback("Exception lors de l'analyse");
  }
}
