import { createClient } from "npm:@supabase/supabase-js@2";
import { checkImportUrl, isPrivateIp } from "../_shared/policy.js";
import { extractRecipe } from "../_shared/recipe-extract.js";

// Lee una página de receta (JSON-LD / microdatos) y devuelve los datos para rellenar el formulario.
// Solo para usuarios con sesión. Solo páginas públicas: sin IP privadas, sin credenciales, con límite de tamaño y de tiempo.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });

/** Resuelve el nombre de host y comprueba que ninguna IP sea privada (si el entorno permite DNS). */
async function hostIsPublic(host: string): Promise<boolean> {
  if (/^[\d.]+$/.test(host) || host.includes(":")) return !isPrivateIp(host);
  // deno-lint-ignore no-explicit-any
  const d = Deno as any;
  if (typeof d.resolveDns !== "function") return true; // sin DNS disponible solo queda la comprobación sintáctica
  const ips: string[] = [];
  for (const type of ["A", "AAAA"]) {
    try { ips.push(...(await d.resolveDns(host, type))); } catch { /* sin registros de ese tipo */ }
  }
  return ips.length > 0 && !ips.some(isPrivateIp);
}

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error("La página es demasiado grande"); }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.length; }
  const charset = (res.headers.get("content-type") ?? "").match(/charset=([\w-]+)/i)?.[1] ?? "utf-8";
  try { return new TextDecoder(charset).decode(all); } catch { return new TextDecoder("utf-8").decode(all); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return reply({ error: "Inicia sesión para importar recetas desde un enlace" }, 401);

    const body = await req.json().catch(() => ({})) as { url?: string };
    let current = String(body.url ?? "");
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const check = checkImportUrl(current);
      if (!check.ok) return reply({ error: check.reason }, 400);
      const u = new URL(check.url!);
      if (!(await hostIsPublic(u.hostname))) return reply({ error: "Dirección no permitida" }, 400);

      const res = await fetch(u, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "NutriBook/1.0 (importar receta)", "Accept": "text/html,application/xhtml+xml" },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) return reply({ error: "Redirección no válida" }, 502);
        current = new URL(loc, u).toString();
        continue;
      }
      if (!res.ok) return reply({ error: `La web respondió con el error ${res.status}` }, 502);
      if (!/html|xml/i.test(res.headers.get("content-type") ?? "")) return reply({ error: "El enlace no es una página web" }, 415);

      const recipe = extractRecipe(await readLimited(res), u.toString());
      if (!recipe) return reply({ error: "No encontré una receta estructurada en esa página. Puedes pegar su texto en su lugar." }, 422);
      return reply({ recipe });
    }
    return reply({ error: "Demasiadas redirecciones" }, 400);
  } catch (e) {
    console.error("recipe-import error:", e);
    const timeout = e instanceof DOMException && e.name === "TimeoutError";
    return reply({ error: timeout ? "La web tardó demasiado en responder" : e instanceof Error ? e.message : String(e) }, timeout ? 504 : 500);
  }
});
