/**
 * GET /search-knowledge?query=…[&top=5]
 *   Authorization: Bearer <agent Flex token>   (required)
 *
 * Semantic search over the org's Enterprise Knowledge base — used by the
 * Conversation Memory plugin's unified search ("Knowledge base" section).
 *
 * Unlike memory, Enterprise Knowledge is org-wide (not customer-scoped): it
 * answers "what does our policy say", independent of the active task. Search
 * host is knowledge.twilio.com (distinct from memory.twilio.com).
 *
 * Auth: the agent's Flex token is validated server-side before any call. The
 * Memora/Knowledge API key/secret stay server-side.
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

  const query = typeof event.query === 'string' ? event.query.trim() : '';
  if (!query) {
    response.setStatusCode(400);
    response.setBody({ error: "missing 'query' query parameter" });
    return callback(null, response);
  }

  const apiKey = context.TWILIO_API_KEY;
  const apiSecret = context.TWILIO_API_SECRET;
  const kbId = context.KNOWLEDGE_BASE_ID;
  const baseUrl = (context.KNOWLEDGE_API_URL || 'https://knowledge.twilio.com').replace(/\/$/, '');
  const knowledgeIds = (context.KNOWLEDGE_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!apiKey || !apiSecret || !kbId) {
    response.setStatusCode(500);
    response.setBody({
      error: 'server is missing TWILIO_API_KEY / TWILIO_API_SECRET / KNOWLEDGE_BASE_ID',
    });
    return callback(null, response);
  }

  const top = clampTop(event.top);
  const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const url = `${baseUrl}/v2/KnowledgeBases/${encodeURIComponent(kbId)}/Search`;

  const body = { query, top };
  if (knowledgeIds.length > 0) body.knowledgeIds = knowledgeIds;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      response.setStatusCode(502);
      response.setBody({ error: `knowledge search ${res.status}`, detail: text });
      return callback(null, response);
    }
    const data = await res.json();
    const chunks = Array.isArray(data.chunks)
      ? data.chunks.map((c) => ({
          content: typeof c.content === 'string' ? c.content : '',
          score: typeof c.score === 'number' ? c.score : undefined,
          knowledgeId: c.knowledgeId,
        }))
      : [];

    response.setStatusCode(200);
    response.setBody({ query, chunks });
    return callback(null, response);
  } catch (err) {
    response.setStatusCode(502);
    response.setBody({
      error: 'knowledge search failed',
      detail: String((err && err.message) || err),
    });
    return callback(null, response);
  }
};

// --- helpers ----------------------------------------------------------------

function clampTop(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return 5;
  return Math.max(1, Math.min(20, n));
}

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
    return { valid: true, roles: (r && r.roles) || [] };
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
  response.appendHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.appendHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.appendHeader('Vary', 'Origin');
  response.appendHeader('Content-Type', 'application/json');
}
