/* eslint-disable @typescript-eslint/no-var-requires */

// --- Test doubles for the Twilio Functions runtime ------------------------

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
};

// identifiers is passed as a JS array and JSON-encoded into the query param,
// exactly as the plugin sends it. Pass `undefined` to omit it entirely.
function invoke(identifiers, context = CONTEXT, extra = {}) {
  const event = {
    request: { method: 'GET', headers: {} },
    ...(identifiers === undefined ? {} : { identifiers: JSON.stringify(identifiers) }),
    ...extra,
  };
  return new Promise((resolve, reject) => {
    handler(context, event, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

function makeRes(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

// Routes Lookup calls by idType (cfg.lookups[idType]); profile + recall by URL.
function setupFetch(cfg = {}) {
  global.fetch = jest.fn(async (url, options) => {
    if (url.endsWith('/Profiles/Lookup')) {
      const { idType } = JSON.parse(options.body);
      return (cfg.lookups && cfg.lookups[idType]) ?? makeRes({ profiles: [] });
    }
    if (url.includes('/Recall')) {
      return cfg.recall ?? makeRes({ observations: [], summaries: [] });
    }
    if (url.includes('/Profiles/')) {
      return cfg.profile ?? makeRes({ id: 'p', createdAt: 't', traits: {} });
    }
    throw new Error(`unexpected url: ${url}`);
  });
  return global.fetch;
}

function lookupCalls() {
  return global.fetch.mock.calls
    .filter(([url]) => url.endsWith('/Profiles/Lookup'))
    .map(([, options]) => JSON.parse(options.body));
}

const WA = { idType: 'whatsapp', value: 'whatsapp:+5511976932682' };
const PHONE = { idType: 'phone', value: '+5511976932682' };

afterEach(() => {
  jest.resetAllMocks();
});

describe('get-memory handler', () => {
  it('returns 400 when the identifiers param is missing', async () => {
    setupFetch();
    const res = await invoke(undefined);
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 400 when identifiers is an empty array', async () => {
    setupFetch();
    const res = await invoke([]);
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 500 when required config is missing', async () => {
    setupFetch();
    const res = await invoke([PHONE], { ...CONTEXT, TWILIO_API_KEY: '' });
    expect(res.statusCode).toBe(500);
  });

  it('tries candidates in order and stops at the first match', async () => {
    setupFetch({
      lookups: { whatsapp: makeRes({ profiles: ['mem_profile_1'] }) },
      profile: makeRes({
        id: 'mem_profile_1',
        createdAt: '2026-01-01T00:00:00Z',
        traits: { Contact: { firstName: 'Rafaela' } },
      }),
      recall: makeRes({
        observations: [{ id: 'o1', content: 'c', createdAt: '2026-01-02T00:00:00Z' }],
        summaries: [],
      }),
    });

    const res = await invoke([WA, PHONE]);

    expect(res.statusCode).toBe(200);
    expect(res.body.matchedBy).toBe('whatsapp');
    expect(res.body.identifier).toBe(WA.value);
    expect(res.body.profileId).toBe('mem_profile_1');
    expect(res.body.traits.Contact.firstName).toBe('Rafaela');
    expect(res.body.observations).toHaveLength(1);
    expect(res.body.partial).toBe(false);

    // Only the first (whatsapp) candidate was looked up.
    expect(lookupCalls()).toEqual([{ idType: 'whatsapp', value: WA.value }]);
  });

  it('falls through to the next candidate when the first does not match', async () => {
    setupFetch({
      lookups: {
        whatsapp: makeRes({ profiles: [] }),
        phone: makeRes({ profiles: ['mem_profile_2'] }),
      },
      profile: makeRes({ id: 'mem_profile_2', createdAt: 't', traits: {} }),
    });

    const res = await invoke([WA, PHONE]);

    expect(res.statusCode).toBe(200);
    expect(res.body.matchedBy).toBe('phone');
    expect(res.body.identifier).toBe(PHONE.value);
    expect(lookupCalls()).toEqual([
      { idType: 'whatsapp', value: WA.value },
      { idType: 'phone', value: PHONE.value },
    ]);
  });

  it('passes an arbitrary idType straight through to Lookup (flexible identifiers)', async () => {
    setupFetch({
      lookups: { email: makeRes({ profiles: ['mem_profile_e'] }) },
      profile: makeRes({ id: 'mem_profile_e', createdAt: 't', traits: {} }),
    });

    const res = await invoke([{ idType: 'email', value: 'rafaela@example.com' }]);

    expect(res.statusCode).toBe(200);
    expect(res.body.matchedBy).toBe('email');
    expect(lookupCalls()).toEqual([{ idType: 'email', value: 'rafaela@example.com' }]);
  });

  it('returns a clean empty 200 payload when no candidate matches', async () => {
    setupFetch({ lookups: { whatsapp: makeRes({ profiles: [] }), phone: makeRes({ profiles: [] }) } });

    const res = await invoke([WA, PHONE]);

    expect(res.statusCode).toBe(200);
    expect(res.body.profileId).toBeNull();
    expect(res.body.matchedBy).toBeNull();
    expect(res.body.traits).toEqual({});
    expect(res.body.observations).toEqual([]);
    expect(res.body.summaries).toEqual([]);
  });

  it('skips malformed candidates and uses the valid ones', async () => {
    setupFetch({
      lookups: { phone: makeRes({ profiles: ['mem_profile_3'] }) },
      profile: makeRes({ id: 'mem_profile_3', createdAt: 't', traits: {} }),
    });

    const res = await invoke([{ idType: 'phone' }, { value: 'x' }, PHONE]);

    expect(res.statusCode).toBe(200);
    expect(lookupCalls()).toEqual([{ idType: 'phone', value: PHONE.value }]);
  });

  it('returns partial:true when recall fails but the profile loads', async () => {
    setupFetch({
      lookups: { phone: makeRes({ profiles: ['mem_profile_4'] }) },
      profile: makeRes({ id: 'mem_profile_4', createdAt: 't', traits: { Contact: { a: 1 } } }),
      recall: makeRes({ error: 'down' }, false, 500),
    });

    const res = await invoke([PHONE]);

    expect(res.statusCode).toBe(200);
    expect(res.body.partial).toBe(true);
    expect(res.body.traits.Contact).toEqual({ a: 1 });
    expect(res.body.observations).toEqual([]);
  });

  it('returns 502 when both profile and recall fail', async () => {
    setupFetch({
      lookups: { phone: makeRes({ profiles: ['mem_profile_5'] }) },
      profile: makeRes({ error: 'down' }, false, 500),
      recall: makeRes({ error: 'down' }, false, 500),
    });

    const res = await invoke([PHONE]);
    expect(res.statusCode).toBe(502);
  });

  it('normalizeTraits drops trait groups that are not plain objects', async () => {
    setupFetch({
      lookups: { phone: makeRes({ profiles: ['mem_profile_6'] }) },
      profile: makeRes({
        id: 'mem_profile_6',
        createdAt: 't',
        traits: { Contact: { firstName: 'R' }, Junk: 'string', Arr: [1, 2] },
      }),
      recall: makeRes({ observations: [], summaries: [] }),
    });

    const res = await invoke([PHONE]);
    expect(Object.keys(res.body.traits)).toEqual(['Contact']);
  });

  it('responds to a CORS preflight with 204', async () => {
    setupFetch();
    const res = await invoke(undefined, CONTEXT, { request: { method: 'OPTIONS', headers: {} } });
    expect(res.statusCode).toBe(204);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
