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
