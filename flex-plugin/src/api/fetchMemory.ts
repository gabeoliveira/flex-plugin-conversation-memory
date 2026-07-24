/**
 * Fetches Memora (customer memory) data from the Twilio Function proxy.
 *
 * The proxy holds the Memora API key/secret — never expose them in the browser
 * bundle. The plugin decides which identifiers to try (channel-aware, built in
 * utils/identifiers) and sends them as an ordered list; the Function tries each
 * against Memora's Lookup, then does getProfile + Recall on the first match and
 * returns the combined payload below.
 */

import type { IdentifierCandidate } from '../utils/identifiers';

export interface MemoryObservation {
  id: string;
  content: string;
  createdAt: string;
  occurredAt?: string;
  conversationIds?: string[] | null;
  source?: string;
  /** Semantic relevance score (0–1) — only meaningful on a search query. */
  score?: number;
}

export interface MemorySummary {
  id: string;
  content: string;
  createdAt: string;
  occurredAt?: string;
  conversationIds?: string[];
  source?: string;
  /** Semantic relevance score (0–1) — only meaningful on a search query. */
  score?: number;
}

export interface MemoryResponse {
  /** Echo of the identifier value the server resolved the profile with. */
  identifier: string;
  /** Which idType matched (e.g. 'whatsapp', 'phone', 'email'), or null if none. */
  matchedBy: string | null;
  /** null when no Memora profile matched the identifier. */
  profileId: string | null;
  profileCreatedAt: string | null;
  /** Keyed by Trait Group name; each group is a key→value record. */
  traits: Record<string, Record<string, unknown>>;
  observations: MemoryObservation[];
  summaries: MemorySummary[];
  /** True when one upstream call (profile or recall) failed but the other succeeded. */
  partial?: boolean;
}

export interface FetchMemoryParams {
  /** Ordered identifier candidates to resolve the profile (first match wins). */
  identifiers?: IdentifierCandidate[];
  /** Resolved profile id — skips the identifier Lookup step when provided. */
  profileId?: string | null;
  /** Semantic search query; omit for the chronological panel view. */
  query?: string;
  /** Agent Flex token, sent as Authorization: Bearer for server-side validation. */
  token: string;
}

const BASE = (process.env.FLEX_APP_FUNCTIONS_BASE_URL || '').replace(/\/$/, '');

export async function fetchMemory(
  params: FetchMemoryParams,
  signal?: AbortSignal,
): Promise<MemoryResponse> {
  if (!BASE) {
    throw new Error('FLEX_APP_FUNCTIONS_BASE_URL not configured');
  }
  // Accept either the service base URL (https://conversation-memory-xxxx-dev.twil.io)
  // or the full function URL (https://conversation-memory-xxxx-dev.twil.io/get-memory).
  const endpoint = BASE.endsWith('/get-memory') ? BASE : `${BASE}/get-memory`;

  // GET keeps read semantics; the ordered candidate list rides as one JSON param.
  const query = new URLSearchParams();
  if (params.identifiers) query.set('identifiers', JSON.stringify(params.identifiers));
  if (params.profileId) query.set('profileId', params.profileId);
  if (params.query) query.set('query', params.query);

  const res = await fetch(`${endpoint}?${query.toString()}`, {
    signal,
    headers: { Authorization: `Bearer ${params.token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`get-memory ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as MemoryResponse;
}
