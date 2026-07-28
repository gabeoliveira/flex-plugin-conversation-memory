// errors → i18n → @twilio/flex-ui; stub Flex so getStrings resolves to a locale
// (its real bundle can't load under jsdom).
jest.mock('@twilio/flex-ui', () => ({
  Manager: { getInstance: () => ({ localization: { localeTag: 'en-US' } }) },
}));

import { ApiError, friendlyError } from '../errors';

describe('friendlyError (B3 auth-vs-upstream UX)', () => {
  it('401 → reload-session guidance', () => {
    expect(friendlyError(new ApiError(401, 'get-memory 401'))).toMatch(/session expired/i);
  });

  it('403 → permission guidance', () => {
    expect(friendlyError(new ApiError(403, 'forbidden'))).toMatch(/permission/i);
  });

  it('every 5xx (incl. 504 timeout) → service-unavailable guidance', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(friendlyError(new ApiError(status, 'x'))).toMatch(/unavailable/i);
    }
  });

  it('AbortError → empty string (superseded request; caller ignores)', () => {
    expect(friendlyError(new DOMException('aborted', 'AbortError'))).toBe('');
  });

  it('a plain Error → its own message', () => {
    expect(friendlyError(new Error('boom'))).toBe('boom');
  });

  it('ApiError carries the status', () => {
    const e = new ApiError(502, 'get-memory 502', 'detail');
    expect(e.status).toBe(502);
    expect(e.detail).toBe('detail');
  });
});
