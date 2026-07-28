/**
 * Typed proxy error + friendly-message mapper (Workstream B3).
 *
 * The Function proxies return different failure classes that call for different
 * agent guidance: a 401 means the Flex session lapsed (reload), a 5xx means the
 * upstream (Memora/Knowledge/OpenAI) is unavailable (retry). Carrying the status
 * on the error lets the panel say the right thing instead of dumping a raw
 * "get-memory 502: ..." string at the agent.
 */

export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** Build an ApiError from a non-ok Response (reads the body best-effort). */
export async function apiErrorFromResponse(res: Response, label: string): Promise<ApiError> {
  const body = await res.text().catch(() => '');
  return new ApiError(res.status, `${label} ${res.status}: ${body || res.statusText}`, body);
}

/**
 * Agent-facing message for a caught error, distinguishing auth from upstream.
 * AbortErrors (a superseded request when the task switches) return '' so callers
 * can choose to ignore them.
 */
export function friendlyError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return '';
  const status = err instanceof ApiError ? err.status : 0;
  if (status === 401) return 'Your Flex session expired. Reload Flex and try again.';
  if (status === 403) return 'You do not have permission to view customer memory.';
  if (status >= 500) return 'The memory service is unavailable right now. Try again in a moment.';
  return err instanceof Error ? err.message : String(err);
}
