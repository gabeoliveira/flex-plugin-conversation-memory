/**
 * POST /capture-turn
 *   Authorization: Bearer <agent Flex token>   (required)
 *   body: { query, answer, kind:'search'|'summarize', meta?:{...}, agent?:{fullName,email,team} }
 *
 * Agent-productivity side-channel (Phase 6). Records the agent↔assistant turn
 * into a dedicated, isolated CO conversation for CI analysis. The plugin calls
 * this fire-and-forget from the browser (keepalive) after a search/summarize, so
 * the awaited CO writes never touch the agent's perceived latency.
 *
 * Session model — CO-native, no Sync:
 *   The agent is the CUSTOMER participant (CHAT address = Worker SID). Under a
 *   GROUP_BY_PROFILE config, CO resolves that address to the agent's profile and
 *   enforces one open conversation per profile: POSTing a second conversation
 *   with the same participant returns 409 *carrying the open conversation's id*
 *   ("Address mapping already exists on conversation conv_conversation_…"). So:
 *     - 201  → new session (participant ids come back inline)
 *     - 409  → reuse the open session (id parsed from the error; fetch its pids)
 *   We never force-close. The agent CO config's CHAT `closed` timeout fires
 *   CONVERSATION_END once per session, so CI runs per-session, not per-turn. When
 *   the session times out the address mapping frees and the next POST creates a
 *   fresh conversation — that same freeing is why the race guard (retry once on
 *   insert failure) recovers a session that closed mid-turn.
 *
 * Isolation: everything targets the AGENT store/config; nothing here writes to
 * the customer store or the AI agent's CO webhook.
 */

exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  applyCors(response, context, event);

  if (event.request && event.request.method === 'OPTIONS') {
    response.setStatusCode(204);
    return callback(null, response);
  }

  const auth = await validateFlexToken(context, event);
  if (!auth.valid) {
    response.setStatusCode(401);
    response.setBody({ error: 'missing or invalid Flex token' });
    return callback(null, response);
  }
  if (roleForbidden(context, auth)) {
    response.setStatusCode(403);
    response.setBody({ error: `forbidden: requires role '${context.REQUIRED_ROLE.trim()}'` });
    return callback(null, response);
  }
  // Trusted agent key from the token (never the client) — the CHAT address that
  // resolves to the agent's profile under GROUP_BY_PROFILE.
  const agentKey = auth.workerSid || auth.identity;
  if (!agentKey) {
    response.setStatusCode(422);
    response.setBody({ error: 'token did not yield a worker identity' });
    return callback(null, response);
  }

  const query = typeof event.query === 'string' ? event.query.trim() : '';
  const answer = typeof event.answer === 'string' ? event.answer.trim() : '';
  if (!query || !answer) {
    response.setStatusCode(400);
    response.setBody({ error: "missing 'query' or 'answer'" });
    return callback(null, response);
  }

  const cfg = readConfig(context);
  if (cfg.missing) {
    response.setStatusCode(500);
    response.setBody({ error: `server is missing ${cfg.missing}` });
    return callback(null, response);
  }

  const agentTraits = event.agent && typeof event.agent === 'object' ? event.agent : {};

  try {
    // Pre-create the agent profile with enrichment + identifiers (best-effort).
    // If skipped/failed, CO still auto-creates a bare profile from the CHAT
    // address, so grouping works either way — this just adds email/name/team.
    await ensureAgentProfile(cfg, agentKey, agentTraits);

    // Get-or-create the agent's open session, insert the turn, retrying once if
    // the reused conversation closed (idle timeout fired between find and insert).
    let session;
    for (let attempt = 0; attempt < 2; attempt++) {
      session = await getOrCreateSession(cfg, agentKey);
      try {
        await insertTurn(cfg, session, agentKey, query, answer);
        break;
      } catch (err) {
        // Reused conversation likely CLOSED between find and insert; on the first
        // failure retry — getOrCreateSession now creates a fresh conversation
        // (the closed session's address mapping has been freed).
        if (attempt === 0) continue;
        throw err;
      }
    }

    response.setStatusCode(200);
    response.setBody({ ok: true, conversationId: session.conversationId });
    return callback(null, response);
  } catch (err) {
    response.setStatusCode(502);
    response.setBody({ error: 'capture failed', detail: String((err && err.message) || err) });
    return callback(null, response);
  }
};

// --- config -----------------------------------------------------------------

function readConfig(context) {
  const apiKey = context.TWILIO_API_KEY;
  const apiSecret = context.TWILIO_API_SECRET;
  const coConfigId = context.AGENT_CONVERSATION_CONFIGURATION_ID;
  const memoryStoreId = context.AGENT_MEMORY_STORE_ID;
  const missing = !apiKey
    ? 'TWILIO_API_KEY'
    : !apiSecret
    ? 'TWILIO_API_SECRET'
    : !coConfigId
    ? 'AGENT_CONVERSATION_CONFIGURATION_ID'
    : !memoryStoreId
    ? 'AGENT_MEMORY_STORE_ID'
    : null;
  return {
    missing,
    authHeader: 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64'),
    coConfigId,
    memoryStoreId,
    idType: context.AGENT_MEMORY_ID_TYPE || 'workerSid',
    convBase: (context.CONVERSATIONS_API_URL || 'https://conversations.twilio.com').replace(/\/$/, ''),
    memoryBase: (context.MEMORY_API_URL || 'https://memory.twilio.com').replace(/\/$/, ''),
    assistantAddress: 'conversation-memory-assistant',
  };
}

// --- CO session (find-or-create, no Sync) -----------------------------------

/**
 * Return the agent's open session, creating one if none is open. The agent is a
 * CUSTOMER participant so CO resolves it to the agent profile and enforces one
 * open conversation per profile — a duplicate POST 409s with the open id.
 */
async function getOrCreateSession(cfg, agentKey) {
  const res = await fetch(`${cfg.convBase}/v2/Conversations`, {
    method: 'POST',
    headers: { Authorization: cfg.authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      configurationId: cfg.coConfigId,
      participants: [
        // The agent is the CUSTOMER — only CUSTOMER participants resolve to a
        // profile, which is what GROUP_BY_PROFILE keys the session on.
        { type: 'CUSTOMER', addresses: [{ channel: 'CHAT', address: agentKey, channelId: agentKey }] },
        {
          type: 'AI_AGENT',
          addresses: [{ channel: 'CHAT', address: cfg.assistantAddress, channelId: cfg.assistantAddress }],
        },
      ],
    }),
  });

  if (res.ok) {
    const conv = await res.json();
    return sessionFromParticipants(conv.id || conv.sid, conv.participants || []);
  }

  // A session is already open — CO's 409 message carries its conversation id.
  const text = await res.text();
  const existingId = parseExistingConversationId(text);
  if (!existingId) throw new Error(`getOrCreateSession ${res.status}: ${text}`);
  const participants = await fetchParticipants(cfg, existingId);
  return sessionFromParticipants(existingId, participants);
}

/** Pick the CUSTOMER (agent) and AI_AGENT (assistant) participant ids. */
function sessionFromParticipants(conversationId, participants) {
  const session = { conversationId, agentPid: null, assistantPid: null };
  for (const p of participants || []) {
    const pid = p.id || p.sid;
    if (p.type === 'CUSTOMER') session.agentPid = pid;
    else if (p.type === 'AI_AGENT') session.assistantPid = pid;
  }
  return session;
}

/** Extract the open conversation id from CO's "Address mapping already exists" 409. */
function parseExistingConversationId(text) {
  const m = /(conv_conversation_[A-Za-z0-9]+)/.exec(text || '');
  return m ? m[1] : null;
}

async function fetchParticipants(cfg, conversationId) {
  const res = await fetch(`${cfg.convBase}/v2/Conversations/${conversationId}/Participants`, {
    headers: { Authorization: cfg.authHeader },
  });
  if (!res.ok) throw new Error(`fetchParticipants ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.participants || [];
}

/**
 * Ensure an agent profile exists in the agent store, keyed by the custom
 * `workerSid` identifier. Creating with the `Agent` group's promoted traits
 * (workerSid + chatId, both = the Worker SID) attaches both identifiers, so this
 * profile is (a) findable by workerSid and (b) the one the CHAT participant
 * resolves to. Best-effort — a failure here shouldn't sink the capture.
 */
async function ensureAgentProfile(cfg, agentKey, agentTraits) {
  const storeBase = `${cfg.memoryBase}/v1/Stores/${encodeURIComponent(cfg.memoryStoreId)}`;
  try {
    const found = await fetch(`${storeBase}/Profiles/Lookup`, {
      method: 'POST',
      headers: { Authorization: cfg.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ idType: cfg.idType, value: agentKey }),
    });
    if (found.ok) {
      const data = await found.json();
      if (data && Array.isArray(data.profiles) && data.profiles.length > 0) return;
    }
    // Not found → create. idTypePromotion on the traits attaches the identifiers.
    await fetch(`${storeBase}/Profiles`, {
      method: 'POST',
      headers: { Authorization: cfg.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        traits: {
          Agent: {
            workerSid: agentKey,
            chatId: agentKey,
            email: agentTraits.email,
            fullName: agentTraits.fullName,
            team: agentTraits.team,
          },
        },
      }),
    });
  } catch {
    /* best-effort: the CHAT participant will still resolve/create a profile */
  }
}

// --- CO communications ------------------------------------------------------

async function insertTurn(cfg, session, agentKey, query, answer) {
  // CHAT is a threaded channel — each communication needs a top-level channelId
  // (threadId). The Worker SID keeps every turn in the agent's one session thread.
  const threadId = agentKey;
  const agentRef = { channel: 'CHAT', address: agentKey, participantId: session.agentPid };
  const assistantRef = { channel: 'CHAT', address: cfg.assistantAddress, participantId: session.assistantPid };
  // Agent question, then assistant answer. content.type:'TEXT' + participantId on
  // author AND recipients are both required by the runtime.
  await insertCommunication(cfg, session.conversationId, threadId, agentRef, [assistantRef], query);
  await insertCommunication(cfg, session.conversationId, threadId, assistantRef, [agentRef], answer);
}

async function insertCommunication(cfg, conversationId, threadId, author, recipients, text) {
  const res = await fetch(`${cfg.convBase}/v2/Conversations/${conversationId}/Communications`, {
    method: 'POST',
    headers: { Authorization: cfg.authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId: threadId, author, recipients, content: { type: 'TEXT', text } }),
  });
  if (!res.ok) {
    const err = new Error(`insertCommunication ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
}

// --- auth (returns the agent identity, unlike get-memory/summarize) ---------

/**
 * Optional role gate (off by default). When REQUIRED_ROLE is set, the validated
 * token must carry that role (Flex token `roles`), else the request is forbidden.
 */
function roleForbidden(context, auth) {
  const requiredRole = (context.REQUIRED_ROLE || '').trim();
  return requiredRole !== '' && !(auth.roles || []).includes(requiredRole);
}

async function validateFlexToken(context, event) {
  const token = bearerToken(event) || event.Token || null;
  if (!token) return { valid: false };
  try {
    const { validator } = require('twilio-flex-token-validator');
    const r = await validator(token, context.ACCOUNT_SID, context.AUTH_TOKEN);
    return {
      valid: true,
      identity: r && r.identity,
      workerSid: r && (r.worker_sid || r.workerSid),
      roles: (r && r.roles) || [],
    };
  } catch (err) {
    return { valid: false, error: err };
  }
}

function bearerToken(event) {
  const headers = (event.request && event.request.headers) || {};
  const raw = headers.authorization || headers.Authorization || '';
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : null;
}

function applyCors(response, context, event) {
  const allowed = (context.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = (event.request && event.request.headers && event.request.headers.origin) || '';
  const allow = allowed.includes('*') || allowed.includes(origin) ? origin || '*' : allowed[0];
  response.appendHeader('Access-Control-Allow-Origin', allow);
  response.appendHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.appendHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.appendHeader('Vary', 'Origin');
  response.appendHeader('Content-Type', 'application/json');
}
