/**
 * Fire-and-forget capture of an agent↔assistant turn to the /capture-turn proxy
 * (Phase 6 — agent productivity). This is a side-channel: it must NEVER affect
 * the agent's experience, so it doesn't await, doesn't surface errors, and uses
 * `keepalive` so it completes even if the panel unmounts / task switches.
 *
 * The identity KEY is derived server-side from the validated Flex token; the
 * `agent` traits here are display-only enrichment for first-time profiles.
 */

export interface CaptureTurnParams {
  query: string;
  /** For 'search': a compact rendering of results. For 'summarize': the answer. */
  answer: string;
  kind: 'search' | 'summarize';
  meta?: { memoryCount?: number; knowledgeCount?: number; grounded?: boolean };
  agent?: { fullName?: string; email?: string; team?: string };
  token: string;
}

const BASE = (process.env.FLEX_APP_FUNCTIONS_BASE_URL || '').replace(/\/$/, '');

export function captureTurn(params: CaptureTurnParams): void {
  if (!BASE || !params.token || !params.query || !params.answer) return;
  const endpoint = BASE.endsWith('/capture-turn') ? BASE : `${BASE}/capture-turn`;

  // Intentionally not awaited; errors swallowed.
  fetch(endpoint, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      query: params.query,
      answer: params.answer,
      kind: params.kind,
      meta: params.meta,
      agent: params.agent,
    }),
  }).catch(() => {
    /* side-channel: never surface */
  });
}
