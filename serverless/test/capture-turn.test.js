/* eslint-disable @typescript-eslint/no-var-requires */

jest.mock('twilio-flex-token-validator', () => ({ validator: jest.fn() }));
const { validator } = require('twilio-flex-token-validator');

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

const { handler } = require('../functions/capture-turn.js');

const CONTEXT = {
  TWILIO_API_KEY: 'SKx',
  TWILIO_API_SECRET: 'sec',
  AGENT_CONVERSATION_CONFIGURATION_ID: 'conv_configuration_x',
  AGENT_MEMORY_STORE_ID: 'mem_store_x',
  AGENT_MEMORY_ID_TYPE: 'workerSid',
  CONVERSATIONS_API_URL: 'https://conversations.twilio.com',
  MEMORY_API_URL: 'https://memory.twilio.com',
  ALLOWED_ORIGINS: '*',
  ACCOUNT_SID: 'ACx',
  AUTH_TOKEN: 'tok',
};

function invoke(body = {}, { context = CONTEXT, token = 'valid', method = 'POST' } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const event = { request: { method, headers }, ...body };
  return new Promise((resolve, reject) => {
    handler(context, event, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

function res(status, data, ok = status < 400) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) };
}

/** CO's 409 when a session is already open — carries the open conversation id. */
function conflict(existingId) {
  const data = {
    code: 400,
    status: 409,
    message:
      `Address mapping already exists on conversation ${existingId}. ` +
      'Close the existing conversation before creating a new one with the same participants.',
  };
  return { ok: false, status: 409, json: async () => data, text: async () => JSON.stringify(data) };
}

/** Two inline participants as CO returns them on a 201 create. */
const INLINE_PARTICIPANTS = [
  { type: 'CUSTOMER', id: 'pid_cust', profileId: 'mem_profile_agent' },
  { type: 'AI_AGENT', id: 'pid_ai', profileId: null },
];

let convCreateCalls;
let commCalls;
let profileCreateCalls;
let lookupCalls;
let participantFetches;

/**
 * @param convMode 'create' (201 new every POST) | 'reuse' (409→existing, GET pids)
 *                 | 'reuse-then-create' (first POST 409, subsequent POST 201 — the
 *                   stale session closed and its address mapping freed)
 */
function setupFetch({ convMode = 'create', insertFailFirstN = 0, agentProfileExists = false } = {}) {
  convCreateCalls = [];
  commCalls = [];
  profileCreateCalls = [];
  lookupCalls = [];
  participantFetches = [];
  let convPostCount = 0;
  global.fetch = jest.fn(async (url, options = {}) => {
    const method = options.method || 'GET';

    // Memora (agent profile enrichment)
    if (method === 'POST' && /\/Profiles\/Lookup$/.test(url)) {
      lookupCalls.push(JSON.parse(options.body));
      return res(200, { profiles: agentProfileExists ? [{ id: 'mem_profile_agent' }] : [] });
    }
    if (method === 'POST' && /\/Stores\/[^/]+\/Profiles$/.test(url)) {
      profileCreateCalls.push(JSON.parse(options.body));
      return res(201, { id: 'mem_profile_agent' });
    }

    // CO: create-or-find the session
    if (method === 'POST' && /\/v2\/Conversations$/.test(url)) {
      convCreateCalls.push(JSON.parse(options.body));
      convPostCount += 1;
      if (convMode === 'create') return res(201, { id: 'CH_new', participants: INLINE_PARTICIPANTS });
      if (convMode === 'reuse') return conflict('conv_conversation_open');
      // reuse-then-create
      return convPostCount === 1 ? conflict('conv_conversation_stale') : res(201, { id: 'CH_new', participants: INLINE_PARTICIPANTS });
    }
    // CO: fetch participants of the open (reused) conversation
    if (method === 'GET' && /\/v2\/Conversations\/[^/]+\/Participants$/.test(url)) {
      participantFetches.push(url);
      return res(200, {
        participants: [
          { type: 'CUSTOMER', id: 'A' },
          { type: 'AI_AGENT', id: 'B' },
        ],
      });
    }
    // CO: insert a communication
    if (method === 'POST' && /\/Communications$/.test(url)) {
      commCalls.push(JSON.parse(options.body));
      const fail = commCalls.length <= insertFailFirstN;
      return fail ? res(404, { error: 'closed' }, false) : res(201, { id: `comm_${commCalls.length}` });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });
  return global.fetch;
}

const TURN = { query: 'what is her plan?', answer: 'Premium tier [M1].', kind: 'summarize' };

beforeEach(() => {
  validator.mockReset().mockResolvedValue({ worker_sid: 'WK123', identity: 'agent@example.com' });
});
afterEach(() => jest.resetAllMocks());

describe('capture-turn — auth & validation', () => {
  it('401 without a token', async () => {
    setupFetch();
    const r = await invoke(TURN, { token: null });
    expect(r.statusCode).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('204 on CORS preflight', async () => {
    setupFetch();
    const r = await invoke({}, { token: null, method: 'OPTIONS' });
    expect(r.statusCode).toBe(204);
  });

  it('422 when the token has no worker identity', async () => {
    setupFetch();
    validator.mockResolvedValue({});
    const r = await invoke(TURN);
    expect(r.statusCode).toBe(422);
  });

  it('400 when query/answer missing', async () => {
    setupFetch();
    const r = await invoke({ kind: 'search', query: 'x' });
    expect(r.statusCode).toBe(400);
  });

  it('500 when the CO config is missing', async () => {
    setupFetch();
    const r = await invoke(TURN, { context: { ...CONTEXT, AGENT_CONVERSATION_CONFIGURATION_ID: '' } });
    expect(r.statusCode).toBe(500);
  });
});

describe('capture-turn — session lifecycle (CO-native find-or-create)', () => {
  it('new session: ensures the agent profile, POSTs one conversation with inline CUSTOMER+AI_AGENT, inserts 2 threaded communications, never closes', async () => {
    setupFetch({ convMode: 'create' });
    const r = await invoke({ ...TURN, agent: { email: 'a@b.com', fullName: 'A B', team: 'Care' } });
    expect(r.statusCode).toBe(200);
    expect(r.body.conversationId).toBe('CH_new');

    // agent profile: lookup by custom workerSid idType, then create with promoted traits
    expect(lookupCalls[0]).toEqual({ idType: 'workerSid', value: 'WK123' });
    expect(profileCreateCalls).toHaveLength(1);
    expect(profileCreateCalls[0].traits.Agent).toMatchObject({
      workerSid: 'WK123',
      chatId: 'WK123',
      email: 'a@b.com',
      team: 'Care',
    });

    // no standalone POST /Participants — the agent is a CUSTOMER, inline on create
    const created = convCreateCalls[0];
    expect(created.configurationId).toBe('conv_configuration_x');
    expect(created.participants.map((p) => p.type)).toEqual(['CUSTOMER', 'AI_AGENT']);
    expect(created.participants[0].addresses[0]).toEqual({ channel: 'CHAT', address: 'WK123', channelId: 'WK123' });

    // communications: query (author=CUSTOMER/agent pid) then answer (author=AI_AGENT pid),
    // each carrying the threadId (channelId) = the Worker SID
    expect(commCalls).toHaveLength(2);
    expect(commCalls[0].channelId).toBe('WK123');
    expect(commCalls[0].content).toEqual({ type: 'TEXT', text: TURN.query });
    expect(commCalls[0].author.participantId).toBe('pid_cust');
    expect(commCalls[0].recipients[0].participantId).toBe('pid_ai');
    expect(commCalls[1].content).toEqual({ type: 'TEXT', text: TURN.answer });
    expect(commCalls[1].author.participantId).toBe('pid_ai');

    // never force-closes the conversation
    const putClose = global.fetch.mock.calls.find(
      ([, o]) => o && o.method === 'PUT' && /status/i.test(o.body || ''),
    );
    expect(putClose).toBeUndefined();
  });

  it('new session: skips profile create when the agent profile already exists', async () => {
    setupFetch({ convMode: 'create', agentProfileExists: true });
    const r = await invoke(TURN);
    expect(r.statusCode).toBe(200);
    expect(lookupCalls).toHaveLength(1);
    expect(profileCreateCalls).toHaveLength(0); // found → no create
  });

  it('reuse: a duplicate POST 409s with the open conversation id → fetch its participants and insert there', async () => {
    setupFetch({ convMode: 'reuse', agentProfileExists: true });
    const r = await invoke(TURN);
    expect(r.statusCode).toBe(200);
    expect(r.body.conversationId).toBe('conv_conversation_open'); // parsed from the 409
    expect(participantFetches).toHaveLength(1); // fetched pids for the reused conv
    expect(commCalls[0].author.participantId).toBe('A'); // CUSTOMER
    expect(commCalls[1].author.participantId).toBe('B'); // AI_AGENT
  });

  it('race guard: reused conversation closed mid-turn → insert fails once → retry creates a fresh session', async () => {
    // First POST 409s to a stale open conv; its insert 404s (already closed);
    // retry: the mapping has freed, so the next POST 201s a fresh conversation.
    setupFetch({ convMode: 'reuse-then-create', insertFailFirstN: 1, agentProfileExists: true });
    const r = await invoke(TURN);
    expect(r.statusCode).toBe(200);
    expect(r.body.conversationId).toBe('CH_new'); // recreated
    expect(convCreateCalls).toHaveLength(2); // find (409) then create (201)
    expect(commCalls.length).toBeGreaterThanOrEqual(2); // 1 failed + 2 on retry
  });
});
