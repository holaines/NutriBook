import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RAK_BASE = "https://services.imt-atlantique.fr/rak/pagemenu.php";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";
const MAX_WEEKS = 3;
const GEMINI_CHUNK = 12;            // platos por llamada (evita respuestas truncadas)
const GEMINI_CONCURRENCY = 2;
const ANALYSIS_BUDGET_MS = 100_000; // por encima, se guarda lo que haya y el resto se analiza en el siguiente refresco

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const t0 = Date.now();
  try {
    const geminiKey = Deno.env.get("GEMINI_KEY");
    if (!geminiKey) throw new Error("GEMINI_KEY secret not configured");

    const body = await req.json().catch(() => ({})) as { weekStart?: string | null; weekStarts?: string[] };
    const requested = body.weekStarts?.length ? body.weekStarts : [body.weekStart ?? null];
    const starts = [...new Set(requested)].slice(0, MAX_WEEKS);

    // 1. Leer la web del RAK (una o varias semanas)
    const weeks: WeekReport[] = [];
    const byKey = new Map<string, DishEntry>();
    let basePage: string | null = null;
    for (const ws of starts) {
      const page = await fetchRAKPage(ws, basePage);
      basePage ??= page.base;
      const dishes = parseRAKHtml(page.html);
      weeks.push({ weekStart: ws, reached: page.reached, dishes: dishes.length });
      for (const d of dishes) byKey.set(`${d.menu_date}|${d.service}|${d.menu_type}|${d.dish_id}`, d);
    }
    const dishes = [...byKey.values()];
    if (dishes.length === 0) {
      return Response.json(
        { menus_fetched: 0, menus_updated: 0, analyzed: 0, pending: 0, weeks, errors: ["El RAK no tiene platos publicados para esas semanas"] },
        { headers: corsHeaders },
      );
    }

    // 2. Análisis ya guardados (se prefiere una fila buena a una fallida del mismo plato)
    const ids = [...new Set(dishes.map((d) => d.dish_id))];
    const { data: existing } = await admin
      .from("rak_menus")
      .select("dish_id, gluten_status, gluten_source, gluten_reasoning, partial_gf, partial_gf_suggestion, gluten_minor, iron_mg_estimated, iron_confidence, iron_notes")
      .in("dish_id", ids)
      .limit(5000);
    const cachedById = new Map<number, GeminiAnalysis>();
    for (const row of existing ?? []) {
      const prev = cachedById.get(row.dish_id);
      if (!prev || (isFailed(prev) && !isFailed(row as GeminiAnalysis))) cachedById.set(row.dish_id, row as GeminiAnalysis);
    }

    // 3. Guardar YA todos los platos (con el análisis previo o "pendiente"): el menú es visible aunque Gemini tarde
    const pendingRecord = (): GeminiAnalysis => failure("Análisis pendiente");
    const records = dishes.map((dish) => toRecord(dish, cachedById.get(dish.dish_id) ?? pendingRecord()));
    await upsertRecords(records);

    // 4. Analizar con Gemini por lotes pequeños los platos nuevos o con análisis fallido
    const toAnalyze = [...new Set(
      dishes.filter((d) => {
        const c = cachedById.get(d.dish_id);
        return !c || isFailed(c);
      }).map((d) => d.dish_name),
    )];
    const chunks: string[][] = [];
    for (let i = 0; i < toAnalyze.length; i += GEMINI_CHUNK) chunks.push(toAnalyze.slice(i, i + GEMINI_CHUNK));

    let analyzed = 0;
    const errors: string[] = [];
    for (let i = 0; i < chunks.length; i += GEMINI_CONCURRENCY) {
      if (Date.now() - t0 > ANALYSIS_BUDGET_MS) break;
      const group = chunks.slice(i, i + GEMINI_CONCURRENCY);
      const results = await Promise.all(group.map((names) => analyzeWithGemini(names, geminiKey)));
      for (const res of results) {
        const touched: ReturnType<typeof toRecord>[] = [];
        for (const rec of records) {
          const a = res.analyses[rec.dish_name];
          if (a && !isFailed(a)) {
            Object.assign(rec, toRecord(dishes.find((d) => d.dish_id === rec.dish_id)!, a));
            touched.push(rec);
          }
        }
        analyzed += Object.values(res.analyses).filter((a) => !isFailed(a)).length;
        if (res.error) errors.push(res.error);
        if (touched.length) await upsertRecords(touched);
      }
    }
    const pending = toAnalyze.length - analyzed;

    return Response.json(
      { menus_fetched: dishes.length, menus_updated: records.length, analyzed, pending, weeks, errors },
      { headers: corsHeaders },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("rak-fetch error:", msg);
    return Response.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
});

// ---------------------------------------------------------------------------
// Tipos y utilidades
// ---------------------------------------------------------------------------

interface DishEntry {
  menu_date: string;
  service: string;
  menu_type: string;
  dish_id: number;
  dish_name: string;
  dish_category: string | null;
}

interface GeminiAnalysis {
  gluten_status: string;
  gluten_source: string | null;
  gluten_reasoning: string | null;
  partial_gf: boolean | null;
  partial_gf_suggestion: string | null;
  gluten_minor: boolean | null;
  iron_mg_estimated: number | null;
  iron_confidence: string | null;
  iron_notes: string | null;
}

interface WeekReport {
  weekStart: string | null;
  reached: boolean;
  dishes: number;
}

const isFailed = (a: GeminiAnalysis) => a.gluten_status === "unknown" && a.iron_confidence === "insufficient";

function failure(reason: string): GeminiAnalysis {
  return {
    gluten_status: "unknown",
    gluten_source: "ai_analysis",
    gluten_reasoning: reason,
    partial_gf: false,
    partial_gf_suggestion: null,
    gluten_minor: false,
    iron_mg_estimated: null,
    iron_confidence: "insufficient",
    iron_notes: null,
  };
}

function toRecord(dish: DishEntry, a: GeminiAnalysis) {
  return {
    menu_date: dish.menu_date,
    service: dish.service,
    menu_type: dish.menu_type,
    dish_id: dish.dish_id,
    dish_name: dish.dish_name,
    dish_category: dish.dish_category,
    gluten_status: a.gluten_status,
    gluten_source: a.gluten_source,
    gluten_reasoning: a.gluten_reasoning ?? null,
    partial_gf: a.partial_gf ?? false,
    partial_gf_suggestion: a.partial_gf_suggestion ?? null,
    gluten_minor: a.gluten_minor ?? false,
    iron_mg_estimated: a.iron_mg_estimated,
    iron_confidence: a.iron_confidence,
    iron_notes: a.iron_notes ?? null,
    fetched_at: new Date().toISOString(),
  };
}

async function upsertRecords(records: ReturnType<typeof toRecord>[]) {
  for (let i = 0; i < records.length; i += 200) {
    const { error } = await admin
      .from("rak_menus")
      .upsert(records.slice(i, i + 200), { onConflict: "menu_date,service,menu_type,dish_id" });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Navegación por la web del RAK
// ---------------------------------------------------------------------------

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; NutriBook/1.0)" } });
  if (!res.ok) throw new Error(`RAK fetch failed: ${res.status}`);
  return res.text();
}

// Devuelve el HTML de la semana pedida (navegando con las flechas ◀ ▶ de la web).
// `base` permite reutilizar la página inicial entre varias semanas.
async function fetchRAKPage(
  weekStart: string | null,
  base: string | null,
): Promise<{ html: string; base: string; reached: boolean }> {
  const first = base ?? await fetchPage(RAK_BASE);
  let html = first;
  if (!weekStart) return { html, base: first, reached: true };

  for (let i = 0; i < 8; i++) {
    const monday = extractPageDates(html).sort()[0];
    if (!monday) break;
    if (monday === weekStart) return { html, base: first, reached: true };
    const semaine = extractNavSemaine(html, weekStart > monday);
    if (!semaine) break;
    html = await fetchPage(`${RAK_BASE}?semaine=${semaine}`);
  }
  return { html, base: first, reached: extractPageDates(html).sort()[0] === weekStart };
}

function extractPageDates(html: string): string[] {
  const dates: string[] = [];
  for (const m of html.matchAll(/Menu du \w+\s*:\s*(\d{2}\/\d{2}\/\d{4})/gi)) {
    const iso = parseDMY(m[1]);
    if (iso) dates.push(iso);
  }
  return dates;
}

// Primer valor "semaine" = semana anterior, último = semana siguiente
function extractNavSemaine(html: string, next: boolean): string | null {
  const matches = [...html.matchAll(/name="semaine"\s+value=(\d+)/g)];
  if (!matches.length) return null;
  return next ? matches[matches.length - 1][1] : matches[0][1];
}

// ---------------------------------------------------------------------------
// Parseo del HTML
// ---------------------------------------------------------------------------

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

function parseDMY(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parseRAKHtml(html: string): DishEntry[] {
  const dishes: DishEntry[] = [];
  const seen = new Set<string>();

  // "Menu du lundi : 05/10/2026" -> dateMap["lundi"] = "2026-10-05"
  const dateMap: Record<string, string> = {};
  for (const m of html.matchAll(/Menu du (\w+)\s*:\s*(\d{2}\/\d{2}\/\d{4})/gi)) {
    const iso = parseDMY(m[2]);
    if (iso) dateMap[m[1].toLowerCase()] = iso;
  }

  // Enlaces plat.php (href sin comillas en el HTML del RAK)
  const linkRe = /href=\.\/plat\.php\?id_plat=(\d+)[^>]*>([\s\S]*?)<\/a>/gi;
  const modalRe = /id="((rampe|cafeteria)_(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)_(dejeuner|diner)_(\w+))"\s+class="modal/gi;

  for (const match of html.matchAll(linkRe)) {
    const dishId = parseInt(match[1], 10);
    const rawContent = match[2];
    const fontM = rawContent.match(/<font[^>]*>([^<]+)<\/font>/i);
    const dishName = decodeHtmlEntities(fontM ? fontM[1] : rawContent.replace(/<[^>]+>/g, " ").trim());
    if (!dishName) continue;

    // Contexto = modal más cercano ANTES del enlace: id="rampe_lundi_dejeuner_plat1"
    const before = html.slice(Math.max(0, match.index! - 4000), match.index!);
    const lastModal = [...before.matchAll(modalRe)].pop();
    if (!lastModal) continue;

    const parts = lastModal[1].split("_");
    const [menuType, day, service] = parts;
    const category = parts.slice(3).join("_") || null;
    const menuDate = dateMap[day];
    if (!menuDate) continue; // sin fecha fiable no se guarda (antes se usaba "hoy", lo que mezclaba días)

    const key = `${menuDate}|${service}|${menuType}|${dishId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dishes.push({ menu_date: menuDate, service, menu_type: menuType, dish_id: dishId, dish_name: dishName, dish_category: category });
  }
  return dishes;
}

// ---------------------------------------------------------------------------
// Análisis Gemini
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function analyzeWithGemini(
  dishNames: string[],
  geminiKey: string,
): Promise<{ analyses: Record<string, GeminiAnalysis>; error?: string }> {
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
    "partial_gf": true ou false,
    "partial_gf_suggestion": "ce que l'on peut manger (ex: prendre uniquement les légumes) ou null",
    "gluten_minor": true ou false,
    "iron_mg_estimated": nombre décimal ou null si vraiment incertain,
    "iron_confidence": "estimated ou approximate ou insufficient",
    "iron_notes": "principaux contributeurs en fer ou null"
  }
}

Règles gluten_status:
- confirmed_gf: aucun ingrédient avec gluten détectable
- contains_gluten: contient du gluten (panure, pâtes, pain, béchamel, semoule, couscous, etc.)
- unknown: ambiguïté trop importante

Règles partial_gf (true si le gluten peut être physiquement évité):
- Plat mixte comme "semoule + légumes" ou "boulgour + haricots verts" : partial_gf=true, suggestion="Prendre uniquement les légumes"
- Plat type "poulet + riz" où le riz serait en sauce à la farine : partial_gf=true si on peut prendre le poulet seul
- Pâtes, lasagnes, pizza, quiche (gluten omniprésent) : partial_gf=false
- Si partial_gf=false mais contient gluten : partial_gf_suggestion=null

Règles gluten_minor (true si gluten en très faible quantité, non dominant):
- Boulettes de viande ou steaks hachés avec liant/chapelure minimale : gluten_minor=true
- Sauces légèrement liées à la farine : gluten_minor=true
- Pain, pâtes, béchamel épaisse, panure visible : gluten_minor=false

- iron_confidence insufficient seulement si le plat est vraiment inconnu`;

  const fail = (reason: string) => ({
    analyses: Object.fromEntries(dishNames.map((n) => [n, failure(reason)])),
    error: reason,
  });

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 8192 },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        const msg = err?.error?.message ?? `HTTP ${res.status}`;
        if ([429, 503, 529].includes(res.status) && attempt < 3) {
          await sleep((attempt + 1) * 3000);
          continue;
        }
        console.error("Gemini error:", msg);
        return fail("Error Gemini: " + msg);
      }

      const data = await res.json();
      const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return fail("Respuesta Gemini no interpretable");

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, Record<string, unknown>>;
      const analyses: Record<string, GeminiAnalysis> = {};
      for (const name of dishNames) {
        const a = parsed[name];
        analyses[name] = !a ? failure("No encontrado en la respuesta de Gemini") : {
          gluten_status: ["confirmed_gf", "contains_gluten", "unknown"].includes(a.gluten_status as string)
            ? (a.gluten_status as string) : "unknown",
          gluten_source: "ai_analysis",
          gluten_reasoning: (a.gluten_reasoning as string) ?? null,
          partial_gf: Boolean(a.partial_gf),
          partial_gf_suggestion: (a.partial_gf_suggestion as string) ?? null,
          gluten_minor: Boolean(a.gluten_minor),
          iron_mg_estimated: a.iron_mg_estimated != null && Number.isFinite(Number(a.iron_mg_estimated))
            ? Number(a.iron_mg_estimated) : null,
          iron_confidence: (a.iron_confidence as string) || "insufficient",
          iron_notes: (a.iron_notes as string) ?? null,
        };
      }
      return { analyses };
    } catch (e) {
      console.error("Gemini batch exception:", e);
      if (attempt < 3) { await sleep((attempt + 1) * 2000); continue; }
      return fail("Excepción durante el análisis");
    }
  }
  return fail("Gemini no disponible");
}
