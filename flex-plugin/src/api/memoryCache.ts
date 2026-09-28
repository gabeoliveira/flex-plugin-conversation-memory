/**
 * Short-TTL client-side cache for panel memory loads (Workstream C1).
 *
 * Agents rapid-switch between tasks; without a cache, every switch back to a
 * customer re-hits Conversation Memory. This memoizes the panel payload per
 * identifier-candidate-list + limits for a short window. **Refresh bypasses it**
 * (the panel invalidates the key first), and it only caches the panel view
 * (no search queries — those are per-term and not reused).
 */
import type { MemoryResponse } from './fetchMemory';

const TTL_MS = 60_000;

const store = new Map<string, { at: number; data: MemoryResponse }>();

/** Cache key = the resolved identifiers + the requested limits (so "load more" misses). */
export function memoryCacheKey(candidatesKey: string, obsLimit: number, sumLimit: number): string {
  return `${candidatesKey}|o${obsLimit}|s${sumLimit}`;
}

export function getCachedMemory(key: string): MemoryResponse | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key);
    return undefined;
  }
  return hit.data;
}

export function setCachedMemory(key: string, data: MemoryResponse): void {
  store.set(key, { at: Date.now(), data });
}

/** Drop one key (Refresh) or the whole cache (no arg). */
export function invalidateMemory(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}

/** Test seam. */
export function __clearMemoryCache(): void {
  store.clear();
}
