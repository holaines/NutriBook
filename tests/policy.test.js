import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipRefresh, REFRESH_COOLDOWN_MS } from '../supabase/functions/_shared/policy.js';

const now = Date.parse('2026-10-12T10:00:00Z');
const ago = (ms) => new Date(now - ms).toISOString();

test('refresco: se omite solo si es reciente y no hay platos pendientes', () => {
  assert.equal(shouldSkipRefresh({ latestFetchedAt: ago(10_000), pendingCount: 0, now }), true);
  assert.equal(shouldSkipRefresh({ latestFetchedAt: ago(REFRESH_COOLDOWN_MS + 1), pendingCount: 0, now }), false);
  assert.equal(shouldSkipRefresh({ latestFetchedAt: ago(10_000), pendingCount: 3, now }), false, 'con pendientes se permite continuar');
});
test('refresco: sin datos previos o fechas raras no se omite', () => {
  assert.equal(shouldSkipRefresh({ latestFetchedAt: null, pendingCount: 0, now }), false);
  assert.equal(shouldSkipRefresh({ latestFetchedAt: 'basura', pendingCount: 0, now }), false);
  assert.equal(shouldSkipRefresh({ latestFetchedAt: ago(-5000), pendingCount: 0, now }), false, 'fecha en el futuro');
});
