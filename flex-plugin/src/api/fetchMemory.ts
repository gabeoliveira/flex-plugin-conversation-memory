/**
 * Fetches Conversation Memory data from the Twilio Function proxy.
 *
 * The proxy holds the Conversation Memory API key/secret — never expose them in the browser
 * bundle. The plugin decides which identifiers to try (channel-aware, built in
 * utils/identifiers) and sends them as an ordered list; the Function tries each
 * against Conversation Memory's Lookup, then does getProfile + Recall on the first match and
 * returns the combined payload below.
 */

import type { IdentifierCandidate } from '../utils/identifiers';
import { apiErrorFromResponse } from './errors';

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

/** A recalled cross-channel communication (D4 — opt-in). Shape is permissive
 *  since Recall's fields vary; the tab renders defensively. */
export interface MemoryCommunication {
  id: string;
  content: string;
  author?: string;
  role?: string;
  channel?: string;
  createdAt?: string;
  occurredAt?: string;
  source?: string;
  conversationIds?: string[];
}

export interface MemoryResponse {
  /** Echo of the identifier value the server resolved the profile with. */
  identifier: string;
  /** Which idType matched (e.g. 'whatsapp', 'phone', 'email'), or null if none. */
  matchedBy: string | null;
  /** null when no Conversation Memory profile matched the identifier. */
  profileId: string | null;
  profileCreatedAt: string | null;
  /** Keyed by Trait Group name; each group is a key→value record. */
  traits: Record<string, Record<string, unknown>>;
  observations: MemoryObservation[];
  summaries: MemorySummary[];
  /** Recalled cross-channel messages — populated only when requested (D4 opt-in). */
  communications?: MemoryCommunication[];
  /** How many profiles the matching identifier resolved to (0 when none matched). */
  profileCount?: number;
  /** True when the identifier resolved to more than one profile (first is used). */
  ambiguous?: boolean;
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
  /** Panel-view Recall limits (clamped to 20 server-side); default 10 / 5. "Load more" raises these. */
  observationsLimit?: number;
  summariesLimit?: number;
  /** Request N recent communications (D4); omit/0 = don't fetch them. */
  communicationsLimit?: number;
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
  if (params.observationsLimit) query.set('observationsLimit', String(params.observationsLimit));
  if (params.summariesLimit) query.set('summariesLimit', String(params.summariesLimit));
  if (params.communicationsLimit) query.set('communicationsLimit', String(params.communicationsLimit));

  const res = await fetch(`${endpoint}?${query.toString()}`, {
    signal,
    headers: { Authorization: `Bearer ${params.token}` },
  });
  if (!res.ok) {
    throw await apiErrorFromResponse(res, 'get-memory');
  }
  return (await res.json()) as MemoryResponse;
}
