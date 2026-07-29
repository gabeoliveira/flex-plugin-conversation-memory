// config → runtimeConfig → @twilio/flex-ui; mock runtimeConfig so we can drive the
// runtime-override layer directly (and avoid loading the Flex bundle under jsdom).
jest.mock('../runtimeConfig', () => ({ getRuntimeConfig: jest.fn(() => ({})) }));

import { flag, summarizeEnabled, captureEnabled } from '../config';
import { getRuntimeConfig } from '../runtimeConfig';

const mockRuntime = getRuntimeConfig as jest.MockedFunction<typeof getRuntimeConfig>;

describe('feature flags', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    mockRuntime.mockReturnValue({});
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

  it('runtime config (ui_attributes) overrides the build-time env flag', () => {
    // env says OFF, runtime says ON → runtime wins
    process.env.FLEX_APP_ENABLE_SUMMARIZE = 'false';
    process.env.FLEX_APP_ENABLE_CAPTURE = 'false';
    mockRuntime.mockReturnValue({ enableSummarize: true, enableCapture: true });
    expect(summarizeEnabled()).toBe(true);
    expect(captureEnabled()).toBe(true);

    // env says ON (unset), runtime says OFF → runtime wins
    delete process.env.FLEX_APP_ENABLE_SUMMARIZE;
    mockRuntime.mockReturnValue({ enableSummarize: false });
    expect(summarizeEnabled()).toBe(false);
  });

  it('falls back to env when the runtime flag is absent', () => {
    delete process.env.FLEX_APP_ENABLE_SUMMARIZE;
    mockRuntime.mockReturnValue({}); // no runtime override
    expect(summarizeEnabled()).toBe(true); // env default ON
  });
});
