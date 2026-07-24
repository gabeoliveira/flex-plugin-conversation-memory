/* eslint-disable @typescript-eslint/no-var-requires */

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

const { handler } = require('../functions/search-knowledge.js');

const CONTEXT = {
  TWILIO_API_KEY: 'SKxxx',
  TWILIO_API_SECRET: 'secret',
  KNOWLEDGE_BASE_ID: 'kb_123',
  KNOWLEDGE_API_URL: 'https://knowledge.twilio.com',
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

function makeRes(data, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) };
}

function setupFetch(res) {
  global.fetch = jest.fn(async () => res ?? makeRes({ chunks: [] }));
  return global.fetch;
}

const searchBody = () => JSON.parse(global.fetch.mock.calls[0][1].body);
const searchUrl = () => global.fetch.mock.calls[0][0];

beforeEach(() => {
  validator.mockReset().mockResolvedValue({});
});
afterEach(() => {
  jest.resetAllMocks();
});

describe('search-knowledge', () => {
  it('401 when no Flex token', async () => {
    setupFetch();
    const res = await invoke({ query: 'refunds' }, { token: null });
    expect(res.statusCode).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('401 when the token is invalid', async () => {
    setupFetch();
    validator.mockRejectedValue(new Error('bad'));
    const res = await invoke({ query: 'refunds' });
    expect(res.statusCode).toBe(401);
  });

  it('204 on CORS preflight without a token', async () => {
    setupFetch();
    const res = await invoke({}, { token: null, method: 'OPTIONS' });
    expect(res.statusCode).toBe(204);
  });

  it('400 when query is missing/empty', async () => {
    setupFetch();
    const res = await invoke({ query: '   ' });
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('500 when KNOWLEDGE_BASE_ID is missing', async () => {
    setupFetch();
    const res = await invoke({ query: 'refunds' }, { context: { ...CONTEXT, KNOWLEDGE_BASE_ID: '' } });
    expect(res.statusCode).toBe(500);
  });

  it('returns mapped chunks and defaults top=5', async () => {
    setupFetch(
      makeRes({
        chunks: [
          { content: 'Refund policy: 30 days', score: 0.9, knowledgeId: 'k1' },
          { content: 'Expedite shipping SOP' },
        ],
      }),
    );
    const res = await invoke({ query: 'refunds' });
    expect(res.statusCode).toBe(200);
    expect(res.body.query).toBe('refunds');
    expect(res.body.chunks).toHaveLength(2);
    expect(res.body.chunks[0]).toEqual({ content: 'Refund policy: 30 days', score: 0.9, knowledgeId: 'k1' });
    expect(searchBody()).toMatchObject({ query: 'refunds', top: 5 });
    expect(searchUrl()).toContain('/v2/KnowledgeBases/kb_123/Search');
  });

  it('clamps top to [1,20] and forwards knowledgeIds when configured', async () => {
    setupFetch(makeRes({ chunks: [] }));
    await invoke({ query: 'x', top: '99' }, { context: { ...CONTEXT, KNOWLEDGE_IDS: 'k1, k2' } });
    expect(searchBody().top).toBe(20);
    expect(searchBody().knowledgeIds).toEqual(['k1', 'k2']);
  });

  it('502 on an upstream error', async () => {
    setupFetch(makeRes({ error: 'boom' }, false, 500));
    const res = await invoke({ query: 'x' });
    expect(res.statusCode).toBe(502);
  });
});
