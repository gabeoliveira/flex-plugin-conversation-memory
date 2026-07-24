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
