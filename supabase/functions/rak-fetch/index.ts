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

    // Récupérer les plats déjà analysés en DB pour ne pas rappeler Gemini
    const allDishIds = dishes.map((d) => d.dish_id);
    const { data: existing } = await admin
      .from("rak_menus")
      .select("dish_id, dish_name, gluten_status, gluten_source, gluten_reasoning, iron_mg_estimated, iron_confidence, iron_notes")
      .in("dish_id", allDishIds);

    const existingMap: Record<number, typeof existing[0]> = {};
    for (const row of existing ?? []) existingMap[row.dish_id] = row;

    // Gemini pour : nouveaux plats OU plats avec analyse ratée (unknown + insufficient)
    const needsAnalysis = [...new Set(
      dishes
        .filter((d) => {
          const c = existingMap[d.dish_id];
          return !c || (c.gluten_status === "unknown" && c.iron_confidence === "insufficient");
        })
        .map((d) => d.dish_name)
    )];
    const geminiResults = needsAnalysis.length > 0
      ? await analyzeWithGemini(needsAnalysis, geminiKey)
      : {};

    // Construction des records a upsert
    const records = dishes.map((dish) => {
      // Priorité : résultat Gemini frais > données déjà en DB > fallback
      const cached = existingMap[dish.dish_id];
      const a = geminiResults[dish.dish_name] ?? (cached ? {
        gluten_status: cached.gluten_status,
        gluten_source: cached.gluten_source,
        gluten_reasoning: cached.gluten_reasoning,
        iron_mg_estimated: cached.iron_mg_estimated,
        iron_confidence: cached.iron_confidence,
        iron_notes: cached.iron_notes,
      } : {
        gluten_status: "unknown",
        gluten_source: "ai_analysis",
        gluten_reasoning: "Analyse non disponible",
        iron_mg_estimated: null,
        iron_confidence: "insufficient",
        iron_notes: null,
      });
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

// Parse DD/MM/YYYY -> YYYY-MM-DD
function parseDMY(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseRAKHtml(html: string): DishEntry[] {
  const dishes: DishEntry[] = [];
  const seen = new Set<string>();

  // 1. Build day -> ISO date map from headings like:
  //    "Menu du lundi : 05/10/2026"
  const dateMap: Record<string, string> = {};
  for (const m of html.matchAll(/Menu du (\w+)\s*:\s*(\d{2}\/\d{2}\/\d{4})/gi)) {
    const iso = parseDMY(m[2]);
    if (iso) dateMap[m[1].toLowerCase()] = iso;
  }

  // 2. Find every plat.php link (href is UNQUOTED in the RAK HTML):
  //    <a href=./plat.php?id_plat=4694 >
  //      <font color="black">Calamars à la romaine</font>
  //    </a>
  const linkRe = /href=\.\/plat\.php\?id_plat=(\d+)[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkRe)) {
    const dishId = parseInt(match[1], 10);
    const rawContent = match[2];

    // Dish name: prefer text inside <font>, else strip all tags
    const fontM = rawContent.match(/<font[^>]*>([^<]+)<\/font>/i);
    const dishName = decodeHtmlEntities(
      fontM ? fontM[1] : rawContent.replace(/<[^>]+>/g, " ").trim()
    );
    if (!dishName) continue;

    // 3. Recover context from the NEAREST PRECEDING modal ID:
    //    id="rampe_lundi_dejeuner_entree_chaude"
    const before = html.slice(Math.max(0, match.index! - 4000), match.index!);
    const modalMatches = [
      ...before.matchAll(
        /id="((rampe|cafeteria)_(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)_(dejeuner|diner)_(\w+))"\s+class="modal/gi
      ),
    ];
    const lastModal = modalMatches[modalMatches.length - 1];

    let menuType = "rampe";
    let day = "";
    let service = "dejeuner";
    let category: string | null = null;

    if (lastModal) {
      const parts = lastModal[1].split("_");
      menuType = parts[0];                   // rampe | cafeteria
      day      = parts[1];                   // lundi | mardi | …
      service  = parts[2];                   // dejeuner | diner
      category = parts.slice(3).join("_") || null;
    }

    const menuDate = (day && dateMap[day]) ? dateMap[day] : todayISO();

    const key = `${menuDate}|${service}|${menuType}|${dishId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    dishes.push({
      menu_date: menuDate,
      service,
      menu_type: menuType,
      dish_id: dishId,
      dish_name: dishName,
      dish_category: category,
      allergen_raw: null,
    });
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
  return analyzeGeminiBatch(dishNames, geminiKey);
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function analyzeGeminiBatch(
  dishNames: string[],
  geminiKey: string,
  attempt = 0
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
      // Retry on 429 / 503 / overload with exponential backoff (max 3 attempts)
      if ((res.status === 429 || res.status === 503 || res.status === 529) && attempt < 3) {
        const delay = (attempt + 1) * 4000; // 4s, 8s, 12s
        console.warn(`Gemini overloaded (${res.status}), retry in ${delay}ms…`);
        await sleep(delay);
        return analyzeGeminiBatch(dishNames, geminiKey, attempt + 1);
      }
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
