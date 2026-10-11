import { createClient } from "npm:@supabase/supabase-js@2";

// Estima el hierro de una receta con Gemini. La clave GEMINI_KEY vive solo en el servidor
// y únicamente responde a usuarios con sesión iniciada.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });

interface Ingredient { name?: string; quantity?: number | null; unit?: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return reply({ error: "Inicia sesión para usar el cálculo con IA" }, 401);

    const geminiKey = Deno.env.get("GEMINI_KEY");
    if (!geminiKey) return reply({ error: "GEMINI_KEY no configurada" }, 500);

    const body = await req.json() as { name?: string; servings?: number; ingredients?: Ingredient[] };
    const name = String(body.name ?? "").slice(0, 200);
    const servings = Math.max(1, Number(body.servings) || 1);
    const ingredients = (body.ingredients ?? []).slice(0, 60)
      .map((i) => `- ${i.quantity != null ? `${i.quantity} ${i.unit ?? ""} ` : ""}${String(i.name ?? "").slice(0, 120)}`)
      .join("\n");
    if (!name || !ingredients) return reply({ error: "Receta incompleta" }, 400);

    const prompt = `Eres un experto en nutrición. Estima el contenido de hierro de esta receta usando datos USDA.

Receta: ${name}
Raciones: ${servings}
Ingredientes:
${ingredients}

Para cantidades vagas (un poquito, al gusto, etc.), asume una cantidad típica pequeña.
En "notes" indica en 1-2 frases cuáles son los ingredientes que más hierro aportan.
Devuelve SOLO JSON válido:
{"iron_per_serving_mg":<número>,"total_iron_mg":<número>,"confidence":"high|medium|low","notes":"<explicación breve en español>"}`;

    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      });
      lastStatus = res.status;
      if ([429, 503, 529].includes(res.status)) { await new Promise((r) => setTimeout(r, (attempt + 1) * 2500)); continue; }
      if (!res.ok) return reply({ error: `Gemini ${res.status}` }, 502);

      const data = await res.json();
      const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return reply({ error: "Respuesta inesperada de Gemini" }, 502);
      const r = JSON.parse(match[0]);
      const perServing = Number(r.iron_per_serving_mg);
      if (!Number.isFinite(perServing) || perServing < 0) return reply({ error: "Valor de hierro no válido" }, 502);
      return reply({
        iron_per_serving_mg: Math.round(perServing * 1000) / 1000,
        total_iron_mg: Number(r.total_iron_mg) || perServing * servings,
        confidence: ["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low",
        notes: String(r.notes ?? "").slice(0, 400),
        provider: "Gemini",
      });
    }
    return reply({ error: `Gemini saturado (${lastStatus}); inténtalo en un minuto` }, 503);
  } catch (e) {
    console.error("iron-estimate error:", e);
    return reply({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
