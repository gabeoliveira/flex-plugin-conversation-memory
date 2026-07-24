/**
 * Searches the org's Enterprise Knowledge base via the Twilio Function proxy.
 *
 * Org-wide (not customer-scoped) semantic search — the "Knowledge base" section
 * of the unified search. Credentials stay server-side; the agent's Flex token is
 * sent as Authorization: Bearer and validated server-side.
 */

export interface KnowledgeChunk {
  content: string;
  score?: number;
  knowledgeId?: string;
}

export interface KnowledgeSearchResponse {
  query: string;
  chunks: KnowledgeChunk[];
}

export interface SearchKnowledgeParams {
  query: string;
  /** Max results (server clamps to 1–20). */
  top?: number;
  token: string;
}

const BASE = (process.env.FLEX_APP_FUNCTIONS_BASE_URL || '').replace(/\/$/, '');

export async function searchKnowledge(
  params: SearchKnowledgeParams,
  signal?: AbortSignal,
): Promise<KnowledgeSearchResponse> {
  if (!BASE) {
    throw new Error('FLEX_APP_FUNCTIONS_BASE_URL not configured');
  }
  const endpoint = BASE.endsWith('/search-knowledge') ? BASE : `${BASE}/search-knowledge`;

  const query = new URLSearchParams({ query: params.query });
  if (params.top) query.set('top', String(params.top));

  const res = await fetch(`${endpoint}?${query.toString()}`, {
    signal,
    headers: { Authorization: `Bearer ${params.token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`search-knowledge ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as KnowledgeSearchResponse;
}
