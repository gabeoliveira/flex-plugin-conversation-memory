import { flag, summarizeEnabled, captureEnabled } from '../config';

describe('feature flags', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to true when the var is unset or empty', () => {
    delete process.env.FLAG_X;
    expect(flag('FLAG_X')).toBe(true);
    process.env.FLAG_X = '';
    expect(flag('FLAG_X')).toBe(true);
  });

  it('is false for falsy words (case-insensitive, trimmed)', () => {
    for (const v of ['false', '0', 'off', 'no', 'FALSE', 'Off', '  no  ']) {
      process.env.FLAG_X = v;
      expect(flag('FLAG_X')).toBe(false);
    }
  });

  it('is true for anything else', () => {
    for (const v of ['true', '1', 'yes', 'on', 'enabled']) {
      process.env.FLAG_X = v;
      expect(flag('FLAG_X')).toBe(true);
    }
  });

  it('summarizeEnabled / captureEnabled read their own env vars, default ON', () => {
    delete process.env.FLEX_APP_ENABLE_SUMMARIZE;
    delete process.env.FLEX_APP_ENABLE_CAPTURE;
    expect(summarizeEnabled()).toBe(true);
    expect(captureEnabled()).toBe(true);

    process.env.FLEX_APP_ENABLE_SUMMARIZE = 'false';
    process.env.FLEX_APP_ENABLE_CAPTURE = 'off';
    expect(summarizeEnabled()).toBe(false);
    expect(captureEnabled()).toBe(false);
  });
});
