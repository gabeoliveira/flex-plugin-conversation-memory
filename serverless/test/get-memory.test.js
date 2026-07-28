/* eslint-disable @typescript-eslint/no-var-requires */

// Mock the Flex token validator: resolves (valid) unless a test overrides it.
jest.mock('twilio-flex-token-validator', () => ({ validator: jest.fn().mockResolvedValue({}) }));
const { validator } = require('twilio-flex-token-validator');

class FakeResponse {
  constructor() {
    this.statusCode = 200;
    this.body = undefined;
    this.headers = {};
  }
  setStatusCode(code) {
    this.statusCode = code;
  }
  setBody(body) {
    this.body = body;
  }
  appendHeader(key, value) {
    this.headers[key] = value;
  }
}

global.Twilio = { Response: FakeResponse };

const { handler } = require('../functions/get-memory.js');

const CONTEXT = {
  TWILIO_API_KEY: 'SKxxx',
  TWILIO_API_SECRET: 'secret',
  MEMORY_STORE_ID: 'mem_store_abc',
  MEMORY_API_URL: 'https://memory.twilio.com',
  TWILIO_MEMORY_PROFILE_TRAIT_GROUPS: 'Contact,Preferences',
  ALLOWED_ORIGINS: '*',
  ACCOUNT_SID: 'ACxxx',
  AUTH_TOKEN: 'authtok',
};

function invoke(fields = {}, { context = CONTEXT, token = 'valid-token', method = 'GET' } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const event = { request: { method, headers }, ...fields };
  return new Promise((resolve, reject) => {
    handler(context, event, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

const ids = (list) => ({ identifiers: JSON.stringify(list) });

function makeRes(data, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) };
}

// Routes Lookup by idType (cfg.lookups[idType]); recall + profile GET by URL.
function setupFetch(cfg = {}) {
  global.fetch = jest.fn(async (url, options) => {
    if (url.endsWith('/Profiles/Lookup')) {
      const { idType } = JSON.parse(options.body);
      return (cfg.lookups && cfg.lookups[idType]) ?? makeRes({ profiles: [] });
    }
    if (url.includes('/Recall')) return cfg.recall ?? makeRes({ observations: [], summaries: [] });
    if (url.includes('/Profiles/')) return cfg.profile ?? makeRes({ id: 'p', createdAt: 't', traits: {} });
    throw new Error(`unexpected url: ${url}`);
  });
  return global.fetch;
}

const calls = (pred) => global.fetch.mock.calls.filter(pred);
const lookupCalls = () =>
  calls(([url]) => url.endsWith('/Profiles/Lookup')).map(([, o]) => JSON.parse(o.body));
const recallBodies = () =>
  calls(([url]) => url.includes('/Recall')).map(([, o]) => JSON.parse(o.body));
const profileGets = () =>
  calls(([url, o]) => url.includes('/Profiles/') && !url.includes('/Recall') && o.method === 'GET');

const WA = { idType: 'whatsapp', value: 'whatsapp:+5511976932682' };
const PHONE = { idType: 'phone', value: '+5511976932682' };

beforeEach(() => {
  validator.mockReset().mockResolvedValue({});
});
afterEach(() => {
  jest.resetAllMocks();
});

describe('get-memory — CORS origin locking', () => {
  // Unit-tests applyCors via an OPTIONS event (no token/fetch needed). NOTE: in
  // production Twilio's platform hijacks the OPTIONS preflight with wildcard CORS,
  // so real enforcement is on the GET/POST response — which runs this same
  // applyCors. So this validates the logic that actually gates data.
  function preflight(origin, allowed) {
    const event = { request: { method: 'OPTIONS', headers: { origin } } };
    return new Promise((resolve) =>
      handler({ ...CONTEXT, ALLOWED_ORIGINS: allowed }, event, (_e, r) => resolve(r)),
    );
  }
  it('echoes an allowed origin', async () => {
    const r = await preflight('https://flex.twilio.com', 'https://flex.twilio.com');
    expect(r.headers['Access-Control-Allow-Origin']).toBe('https://flex.twilio.com');
  });
  it('does NOT echo a disallowed origin when locked', async () => {
    const r = await preflight('https://evil.example', 'https://flex.twilio.com');
    expect(r.headers['Access-Control-Allow-Origin']).not.toBe('https://evil.example');
  });
});

describe('get-memory — optional role gating', () => {
  it('no gating by default (REQUIRED_ROLE unset), even with no roles on the token', async () => {
    setupFetch();
    validator.mockResolvedValue({}); // no roles
    const res = await invoke(ids([PHONE]));
    expect(res.statusCode).not.toBe(403);
  });

  it('403 when REQUIRED_ROLE is set and the token lacks it', async () => {
    setupFetch();
    validator.mockResolvedValue({ roles: ['agent'] });
    const res = await invoke(ids([PHONE]), { context: { ...CONTEXT, REQUIRED_ROLE: 'supervisor' } });
    expect(res.statusCode).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled(); // gated before any upstream call
  });

  it('proceeds when the token carries the required role', async () => {
    setupFetch();
    validator.mockResolvedValue({ roles: ['supervisor', 'agent'] });
    const res = await invoke(ids([PHONE]), { context: { ...CONTEXT, REQUIRED_ROLE: 'supervisor' } });
    expect(res.statusCode).not.toBe(403);
  });
});

describe('get-memory — auth', () => {
  it('401 when no Flex token is present', async () => {
    setupFetch();
    const res = await invoke(ids([PHONE]), { token: null });
    expect(res.statusCode).toBe(401);
    expect(validator).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('401 when the token is invalid (validator rejects)', async () => {
    setupFetch();
    validator.mockRejectedValue(new Error('invalid token'));
    const res = await invoke(ids([PHONE]));
    expect(res.statusCode).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('CORS preflight returns 204 without requiring a token', async () => {
    setupFetch();
    const res = await invoke({}, { token: null, method: 'OPTIONS' });
    expect(res.statusCode).toBe(204);
    expect(validator).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('get-memory — panel mode (no query)', () => {
  it('400 when neither profileId nor valid identifiers are provided', async () => {
    setupFetch();
    const res = await invoke(ids([]));
    expect(res.statusCode).toBe(400);
  });

  it('500 when required config is missing', async () => {
    setupFetch();
    const res = await invoke(ids([PHONE]), { context: { ...CONTEXT, TWILIO_API_KEY: '' } });
    expect(res.statusCode).toBe(500);
  });

  it('tries candidates in order, first match wins; returns traits + recall', async () => {
    setupFetch({
      lookups: { whatsapp: makeRes({ profiles: ['mem_profile_1'] }) },
      profile: makeRes({ id: 'mem_profile_1', createdAt: 't', traits: { Contact: { firstName: 'R' } } }),
      recall: makeRes({ observations: [{ id: 'o1', content: 'c', createdAt: 't' }], summaries: [] }),
    });
    const res = await invoke(ids([WA, PHONE]));
    expect(res.statusCode).toBe(200);
    expect(res.body.matchedBy).toBe('whatsapp');
    expect(res.body.traits.Contact.firstName).toBe('R');
    expect(res.body.observations).toHaveLength(1);
    expect(lookupCalls()).toEqual([{ idType: 'whatsapp', value: WA.value }]);
    // panel mode fetches traits and recall without a query
    expect(profileGets()).toHaveLength(1);
    expect(recallBodies()[0].query).toBeUndefined();
    expect(recallBodies()[0].observationsLimit).toBe(10);
  });

  it('falls through to the next candidate when the first is empty', async () => {
    setupFetch({
      lookups: { whatsapp: makeRes({ profiles: [] }), phone: makeRes({ profiles: ['p2'] }) },
      profile: makeRes({ id: 'p2', createdAt: 't', traits: {} }),
    });
    const res = await invoke(ids([WA, PHONE]));
    expect(res.body.matchedBy).toBe('phone');
    expect(lookupCalls().map((l) => l.idType)).toEqual(['whatsapp', 'phone']);
  });

  it('returns a clean empty 200 when no candidate matches', async () => {
    setupFetch({ lookups: { phone: makeRes({ profiles: [] }) } });
    const res = await invoke(ids([PHONE]));
    expect(res.statusCode).toBe(200);
    expect(res.body.profileId).toBeNull();
    expect(res.body.observations).toEqual([]);
  });

  it('partial:true when recall fails but traits load', async () => {
    setupFetch({
      lookups: { phone: makeRes({ profiles: ['p4'] }) },
      profile: makeRes({ id: 'p4', createdAt: 't', traits: { Contact: { a: 1 } } }),
      recall: makeRes({ error: 'down' }, false, 500),
    });
    const res = await invoke(ids([PHONE]));
    expect(res.statusCode).toBe(200);
    expect(res.body.partial).toBe(true);
    expect(res.body.traits.Contact).toEqual({ a: 1 });
  });

  it('502 when both traits and recall fail', async () => {
    setupFetch({
      lookups: { phone: makeRes({ profiles: ['p5'] }) },
      profile: makeRes({ error: 'x' }, false, 500),
      recall: makeRes({ error: 'x' }, false, 500),
    });
    const res = await invoke(ids([PHONE]));
    expect(res.statusCode).toBe(502);
  });

  it('normalizeTraits drops non-object trait groups', async () => {
    setupFetch({
      lookups: { phone: makeRes({ profiles: ['p6'] }) },
      profile: makeRes({ id: 'p6', createdAt: 't', traits: { Contact: { a: 1 }, Junk: 'x', Arr: [1] } }),
    });
    const res = await invoke(ids([PHONE]));
    expect(Object.keys(res.body.traits)).toEqual(['Contact']);
  });
});

describe('get-memory — search mode (query) & profileId', () => {
  it('passes query to Recall, raises the limit, and skips the traits fetch', async () => {
    setupFetch({
      lookups: { phone: makeRes({ profiles: ['p7'] }) },
      recall: makeRes({ observations: [{ id: 'o', content: 'match', createdAt: 't' }], summaries: [] }),
    });
    const res = await invoke({ ...ids([PHONE]), query: 'billing issue' });
    expect(res.statusCode).toBe(200);
    expect(res.body.observations).toHaveLength(1);
    expect(res.body.traits).toEqual({});
    expect(profileGets()).toHaveLength(0); // traits not fetched in search mode
    // search mode returns only the top-ranked matches, not everything
    // (camelCase — Recall silently ignores snake_case limits)
    expect(recallBodies()[0]).toMatchObject({ query: 'billing issue', observationsLimit: 5 });
  });

  it('search mode returns 502 when Recall fails (recall is the whole result)', async () => {
    setupFetch({
      lookups: { phone: makeRes({ profiles: ['p8'] }) },
      recall: makeRes({ error: 'down' }, false, 500),
    });
    const res = await invoke({ ...ids([PHONE]), query: 'x' });
    expect(res.statusCode).toBe(502);
  });

  it('uses a provided profileId and skips the Lookup step', async () => {
    setupFetch({ recall: makeRes({ observations: [], summaries: [] }) });
    const res = await invoke({ profileId: 'mem_profile_direct', query: 'x' });
    expect(res.statusCode).toBe(200);
    expect(res.body.profileId).toBe('mem_profile_direct');
    expect(lookupCalls()).toHaveLength(0);
  });

  it('passes an arbitrary idType straight through to Lookup', async () => {
    setupFetch({ lookups: { email: makeRes({ profiles: ['pe'] }) }, recall: makeRes({ observations: [], summaries: [] }) });
    const res = await invoke({ ...ids([{ idType: 'email', value: 'a@b.com' }]), query: 'x' });
    expect(res.statusCode).toBe(200);
    expect(lookupCalls()).toEqual([{ idType: 'email', value: 'a@b.com' }]);
  });

  it('skips malformed candidates', async () => {
    setupFetch({ lookups: { phone: makeRes({ profiles: ['p9'] }) } });
    const res = await invoke(ids([{ idType: 'phone' }, { value: 'x' }, PHONE]));
    expect(res.statusCode).toBe(200);
    expect(lookupCalls()).toEqual([{ idType: 'phone', value: PHONE.value }]);
  });
});
