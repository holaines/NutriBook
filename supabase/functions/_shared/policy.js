// Reglas puras compartidas por las Edge Functions (probadas con node en tests/policy.test.js).

export const REFRESH_COOLDOWN_MS = 60_000;

/**
 * ¿Se puede responder «ya está al día» sin volver a leer la web del RAK ni llamar a Gemini?
 * Solo si el último refresco es muy reciente y no queda ningún plato por analizar
 * (si quedan pendientes, el usuario debe poder reintentar para continuar el análisis).
 */
export function shouldSkipRefresh({ latestFetchedAt, pendingCount, now = Date.now(), cooldownMs = REFRESH_COOLDOWN_MS }) {
  if (pendingCount > 0 || !latestFetchedAt) return false;
  const age = now - Date.parse(latestFetchedAt);
  return Number.isFinite(age) && age >= 0 && age < cooldownMs;
}

// ───────── Importar recetas por URL: solo páginas públicas (evita que la función sirva para sondear la red interna) ─────────
const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^192\.0\.0\./, /^198\.1[89]\./, /^(22[4-9]|2[3-5]\d)\./];
/** ¿Es una IP privada, local o reservada? (IPv4 en decimal con puntos, o IPv6 habitual). */
export function isPrivateIp(ip) {
  const s = String(ip).trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return PRIVATE_V4.some((re) => re.test(s));
  if (s.includes(':')) {
    if (s === '::' || s === '::1' || s.startsWith('fe80') || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('ff')) return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    const hex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);   // forma que devuelve new URL(): [::ffff:7f00:1]
    if (hex) { const a = parseInt(hex[1], 16), b = parseInt(hex[2], 16); return isPrivateIp(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`); }
    return false;
  }
  return false;
}
/** Comprobación sintáctica de una URL antes de pedirla. Devuelve { ok, url } o { ok: false, reason }. */
export function checkImportUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return { ok: false, reason: 'Enlace no válido' }; }
  if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, reason: 'Solo se admiten enlaces http o https' };
  if (u.username || u.password) return { ok: false, reason: 'El enlace no puede llevar usuario ni contraseña' };
  if (u.port && !['80', '443'].includes(u.port)) return { ok: false, reason: 'Puerto no permitido' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') && !host.includes(':')) return { ok: false, reason: 'Dirección no permitida' };
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(host) || host === 'metadata.google.internal') return { ok: false, reason: 'Dirección no permitida' };
  if (isPrivateIp(host) || /^\d+$/.test(host) || /^0x/i.test(host)) return { ok: false, reason: 'Dirección no permitida' };
  return { ok: true, url: u.toString() };
}
