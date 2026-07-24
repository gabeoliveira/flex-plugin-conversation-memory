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

const { handler } = require('../functions/summarize.js');

const CONTEXT = {
  OPENAI_API_KEY: 'sk-test',
  OPENAI_MODEL: 'gpt-4o-mini',
  OPENAI_API_URL: 'https://api.openai.com/v1',
  ALLOWED_ORIGINS: '*',
  ACCOUNT_SID: 'ACxxx',
  AUTH_TOKEN: 'authtok',
};

function invoke(fields = {}, { context = CONTEXT, token = 'valid-token', method = 'POST' } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const event = { request: { method, headers }, ...fields };
  return new Promise((resolve, reject) => {
    handler(context, event, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

function mockOpenAI(content, ok = true, status = 200) {
  global.fetch = jest.fn(async () => ({
    ok,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => 'err',
  }));
}

const MEMORY = [{ content: 'Prefers WhatsApp for billing', source: 'ci', score: 0.7 }];
const KNOWLEDGE = [{ content: 'Refunds within 30 days', score: 0.6 }];

beforeEach(() => {
  validator.mockReset().mockResolvedValue({});
});
afterEach(() => jest.resetAllMocks());

describe('summarize', () => {
  it('401 without a Flex token', async () => {
    mockOpenAI('x');
    const res = await invoke({ query: 'q', memory: MEMORY }, { token: null });
    expect(res.statusCode).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('204 on CORS preflight', async () => {
    mockOpenAI('x');
    const res = await invoke({}, { token: null, method: 'OPTIONS' });
    expect(res.statusCode).toBe(204);
  });

  it('400 when query is missing', async () => {
    mockOpenAI('x');
    const res = await invoke({ memory: MEMORY });
    expect(res.statusCode).toBe(400);
  });

  it('short-circuits (no LLM call) when there are no sources', async () => {
    mockOpenAI('x');
    const res = await invoke({ query: 'q', memory: [], knowledge: [] });
    expect(res.statusCode).toBe(200);
    expect(res.body.grounded).toBe(false);
    expect(res.body.answer).toMatch(/No relevant/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('500 when OPENAI_API_KEY is missing', async () => {
    mockOpenAI('x');
    const res = await invoke(
      { query: 'q', memory: MEMORY },
      { context: { ...CONTEXT, OPENAI_API_KEY: '' } },
    );
    expect(res.statusCode).toBe(500);
  });

  it('returns a grounded answer and sends numbered sources to OpenAI', async () => {
    mockOpenAI('Customer prefers WhatsApp [M1]; refunds are 30 days [K1].');
    const res = await invoke({ query: 'refund preferences', memory: MEMORY, knowledge: KNOWLEDGE });
    expect(res.statusCode).toBe(200);
    expect(res.body.grounded).toBe(true);
    expect(res.body.answer).toContain('[M1]');
    expect(res.body.model).toBe('gpt-4o-mini');

    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    const userMsg = sent.messages.find((m) => m.role === 'user').content;
    expect(userMsg).toContain('[M1] Prefers WhatsApp for billing');
    expect(userMsg).toContain('[K1] Refunds within 30 days');
  });

  it('502 when OpenAI errors', async () => {
    mockOpenAI('', false, 500);
    const res = await invoke({ query: 'q', memory: MEMORY });
    expect(res.statusCode).toBe(502);
  });

  it('accepts JSON-string arrays for memory/knowledge', async () => {
    mockOpenAI('ok');
    const res = await invoke({
      query: 'q',
      memory: JSON.stringify(MEMORY),
      knowledge: JSON.stringify(KNOWLEDGE),
    });
    expect(res.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalled();
  });
});
