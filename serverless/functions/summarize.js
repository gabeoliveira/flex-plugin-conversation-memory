/**
 * POST /summarize
 *   Authorization: Bearer <agent Flex token>   (required)
 *   body: { query, memory: [{content, source?, score?}], knowledge: [{content, score?}] }
 *
 * Grounded synthesis for the Search tab: takes the results the plugin is already
 * showing and asks OpenAI to answer the agent's question using ONLY those
 * sources, citing them inline ([M1], [K2]). We pass the displayed results in
 * (rather than re-retrieving) so the summary always matches what the agent sees.
 *
 * Design notes:
 *  - Grounded + cited: the prompt forbids invention and requires citations, so
 *    an agent can trace every claim to a source card.
 *  - Short-circuits with no LLM call when there are no sources (saves cost).
 *  - Emits the same {query, sources, answer} shape a future agent-productivity
 *    side-write (Phase 6) will push into a CO conversation.
 *
 * Auth + secrets stay server-side (Flex token validated; OpenAI key never in the
 * browser bundle).
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

  const query = typeof event.query === 'string' ? event.query.trim() : '';
  if (!query) {
    response.setStatusCode(400);
    response.setBody({ error: "missing 'query'" });
    return callback(null, response);
  }

  const memory = parseItems(event.memory);
  const knowledge = parseItems(event.knowledge);

  // No sources → answer without spending an LLM call.
  if (memory.length === 0 && knowledge.length === 0) {
    response.setStatusCode(200);
    response.setBody({
      answer: 'No relevant customer memory or knowledge was found for that query.',
      model: null,
      grounded: false,
    });
    return callback(null, response);
  }

  const apiKey = context.OPENAI_API_KEY;
  if (!apiKey) {
    response.setStatusCode(500);
    response.setBody({ error: 'server is missing OPENAI_API_KEY' });
    return callback(null, response);
  }
  const model = context.OPENAI_MODEL || 'gpt-4o-mini';
  const baseUrl = (context.OPENAI_API_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  const sourceLines = [];
  memory.forEach((m, i) => sourceLines.push(`[M${i + 1}] ${m.content}`));
  knowledge.forEach((k, i) => sourceLines.push(`[K${i + 1}] ${k.content}`));

  const system =
    'You are a concise assistant for a contact-center agent. Answer the agent\'s ' +
    'question using ONLY the numbered sources below — customer memory ([M#]) and ' +
    'knowledge base ([K#]). The sources are ordered most-relevant first; lead with and ' +
    'weight the earlier sources. Do not invent facts. Cite the sources you use inline ' +
    'like [M1] or [K2]. If the sources do not answer the question, say so plainly. ' +
    'Keep it to 2-4 sentences.';
  const user = `Agent question: ${query}\n\nSources:\n${sourceLines.join('\n')}`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      response.setStatusCode(502);
      response.setBody({ error: `openai ${res.status}`, detail: text });
      return callback(null, response);
    }
    const data = await res.json();
    const answer =
      (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
        ? data.choices[0].message.content
        : ''
      ).trim();

    response.setStatusCode(200);
    response.setBody({ answer, model, grounded: true });
    return callback(null, response);
  } catch (err) {
    response.setStatusCode(502);
    response.setBody({ error: 'summarize failed', detail: String((err && err.message) || err) });
    return callback(null, response);
  }
};

// --- helpers ----------------------------------------------------------------

/** Parse an items array (JSON string or array) down to [{content, source?, score?}]. */
function parseItems(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((c) => c && typeof c.content === 'string' && c.content.trim())
    .map((c) => ({ content: c.content.trim(), source: c.source, score: c.score }));
}

async function validateFlexToken(context, event) {
  const token = bearerToken(event) || event.Token || null;
  if (!token) return { valid: false };
  try {
    const { validator } = require('twilio-flex-token-validator');
    await validator(token, context.ACCOUNT_SID, context.AUTH_TOKEN);
    return { valid: true };
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
