import * as Flex from '@twilio/flex-ui';

/**
 * The current agent's Flex (SSO) token. Sent as `Authorization: Bearer <token>`
 * to the Function proxies, which validate it server-side before returning any
 * customer memory or knowledge. Returns '' if unavailable (the proxy then 401s).
 */
export function getFlexToken(): string {
  try {
    return Flex.Manager.getInstance().user.token || '';
  } catch {
    return '';
  }
}

/**
 * Display-only agent traits for first-time agent-profile enrichment (Phase 6).
 * The identity *key* is derived server-side from the validated token, not these.
 */
export function getAgentTraits(): { fullName?: string; email?: string; team?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attrs = (Flex.Manager.getInstance().workerClient as any)?.attributes || {};
    return {
      fullName: attrs.full_name || attrs.fullName,
      email: attrs.email,
      team: attrs.team || attrs.team_name,
    };
  } catch {
    return {};
  }
}
