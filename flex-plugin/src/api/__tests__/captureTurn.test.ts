/**
 * captureTurn reads FLEX_APP_FUNCTIONS_BASE_URL at module load and the capture
 * flag at call time, so each case loads the module fresh via isolateModules
 * after setting env.
 */
export {}; // make this file a module under isolatedModules

const OLD_ENV = { ...process.env };
const PARAMS = { kind: 'search' as const, query: 'q', answer: 'a', token: 't' };

function loadCaptureTurn() {
  let mod: typeof import('../captureTurn');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('../captureTurn');
  });
  // @ts-expect-error assigned inside isolateModules
  return mod.captureTurn as typeof import('../captureTurn').captureTurn;
}

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});
afterEach(() => {
  process.env = { ...OLD_ENV };
  jest.resetModules();
});

describe('captureTurn', () => {
  it('POSTs to /capture-turn with a Bearer token + keepalive when enabled', () => {
    process.env.FLEX_APP_FUNCTIONS_BASE_URL = 'https://fns.example';
    delete process.env.FLEX_APP_ENABLE_CAPTURE;
    loadCaptureTurn()(PARAMS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://fns.example/capture-turn');
    expect(opts.method).toBe('POST');
    expect(opts.keepalive).toBe(true);
    expect(opts.headers.Authorization).toBe('Bearer t');
    expect(JSON.parse(opts.body)).toMatchObject({ kind: 'search', query: 'q', answer: 'a' });
  });

  it('no-ops when FLEX_APP_ENABLE_CAPTURE is off', () => {
    process.env.FLEX_APP_FUNCTIONS_BASE_URL = 'https://fns.example';
    process.env.FLEX_APP_ENABLE_CAPTURE = 'false';
    loadCaptureTurn()(PARAMS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no-ops when the functions base URL is unset', () => {
    delete process.env.FLEX_APP_FUNCTIONS_BASE_URL;
    delete process.env.FLEX_APP_ENABLE_CAPTURE;
    loadCaptureTurn()(PARAMS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no-ops when required fields are missing', () => {
    process.env.FLEX_APP_FUNCTIONS_BASE_URL = 'https://fns.example';
    loadCaptureTurn()({ ...PARAMS, answer: '' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
