/**
 * Grounded summarize of the current Search results via the Twilio Function proxy.
 *
 * We send the results the panel is already showing (not a re-retrieval), so the
 * synthesized answer cites exactly what the agent sees ([M#] memory, [K#]
 * knowledge). The OpenAI key stays server-side; the agent's Flex token is
 * validated server-side.
 */

export interface SummarizeSource {
  content: string;
  source?: string;
  score?: number;
}

export interface SummarizeParams {
  query: string;
  memory: SummarizeSource[];
  knowledge: SummarizeSource[];
  token: string;
}

export interface SummarizeResponse {
  answer: string;
  model: string | null;
  /** false when there were no sources (answered without an LLM call). */
  grounded: boolean;
}

const BASE = (process.env.FLEX_APP_FUNCTIONS_BASE_URL || '').replace(/\/$/, '');

export async function summarize(
  params: SummarizeParams,
  signal?: AbortSignal,
): Promise<SummarizeResponse> {
  if (!BASE) {
    throw new Error('FLEX_APP_FUNCTIONS_BASE_URL not configured');
  }
  const endpoint = BASE.endsWith('/summarize') ? BASE : `${BASE}/summarize`;

  const res = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      query: params.query,
      memory: params.memory,
      knowledge: params.knowledge,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`summarize ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as SummarizeResponse;
}
