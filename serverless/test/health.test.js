/* eslint-disable @typescript-eslint/no-var-requires */

class FakeResponse {
  constructor() {
    this.statusCode = 200;
    this.body = undefined;
    this.headers = {};
  }
  setStatusCode(c) {
    this.statusCode = c;
  }
  setBody(b) {
    this.body = b;
  }
  appendHeader(k, v) {
    this.headers[k] = v;
  }
}
global.Twilio = { Response: FakeResponse };

const { handler } = require('../functions/health.js');

function invoke({ allowed = 'https://flex.twilio.com', origin, method = 'GET' } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  const event = { request: { method, headers } };
  return new Promise((resolve, reject) => {
    handler({ ALLOWED_ORIGINS: allowed }, event, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

describe('health', () => {
  it('reports ok + corsLocked when ALLOWED_ORIGINS is a real domain', async () => {
    const r = await invoke({ allowed: 'https://flex.twilio.com' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ ok: true, corsLocked: true });
    expect(r.body.warning).toBeUndefined();
  });

  it('warns when ALLOWED_ORIGINS is still "*"', async () => {
    const r = await invoke({ allowed: '*' });
    expect(r.body.corsLocked).toBe(false);
    expect(r.body.warning).toMatch(/lock it/i);
  });

  it('204 on CORS preflight', async () => {
    const r = await invoke({ method: 'OPTIONS' });
    expect(r.statusCode).toBe(204);
  });
});

describe('CORS origin locking (representative)', () => {
  it('echoes an allowed origin', async () => {
    const r = await invoke({ allowed: 'https://flex.twilio.com', origin: 'https://flex.twilio.com' });
    expect(r.headers['Access-Control-Allow-Origin']).toBe('https://flex.twilio.com');
  });

  it('supports multiple comma-separated origins', async () => {
    const r = await invoke({
      allowed: 'https://flex.twilio.com, https://flex.example.com',
      origin: 'https://flex.example.com',
    });
    expect(r.headers['Access-Control-Allow-Origin']).toBe('https://flex.example.com');
  });

  it('does NOT echo a disallowed origin when locked (browser then blocks it)', async () => {
    const r = await invoke({ allowed: 'https://flex.twilio.com', origin: 'https://evil.example' });
    expect(r.headers['Access-Control-Allow-Origin']).not.toBe('https://evil.example');
  });
});
