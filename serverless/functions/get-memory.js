/**
 * GET /get-memory?identifiers=<url-encoded JSON array>
 *
 * Example identifiers value (before encoding):
 *   [{"idType":"whatsapp","value":"whatsapp:+5511976932682"},
 *    {"idType":"phone","value":"+5511976932682"}]
 *
 * Returns the Twilio Memora profile (traits), observations, and summaries for
 * the customer, used by the Conversation Memory Flex plugin to populate the
 * agent's CRM panel.
 *
 * The CLIENT decides which identifiers to try (it knows the task's channel and
 * has every identifier attribute). This proxy stays generic: it tries each
 * `{ idType, value }` candidate against Memora's Lookup in order, takes the
 * first profile that matches, then fetches the profile traits + Recall. Adding
 * a new identifier type (email, a custom id, …) is a client-only change.
 *
 * Why a Function and not a direct Memora call from the plugin: the Memora API
 * key/secret are privileged. Keeping them server-side prevents them from
 * shipping in the Flex bundle, keeps customer memory (PII) out of task
 * attributes, and lets the agent always see the freshest data.
 *
 * Auth: optional. The Twilio Function URL alone is the secret here. For
 * production, restrict ALLOWED_ORIGINS and add a shared header check — this
 * proxy returns customer memory.
 */

exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  applyCors(response, context, event);

  if (event.request && event.request.method === 'OPTIONS') {
    response.setStatusCode(204);
    return callback(null, response);
  }

  // --- Parse the ordered identifier candidates -------------------------------
  const identifiers = parseIdentifiers(event.identifiers);
  if (identifiers.length === 0) {
    response.setStatusCode(400);
    response.setBody({
      error: "missing or invalid 'identifiers' query parameter (JSON array of {idType, value})",
    });
    return callback(null, response);
  }

  // --- Config ----------------------------------------------------------------
  const apiKey = context.TWILIO_API_KEY;
  const apiSecret = context.TWILIO_API_SECRET;
  const storeId = context.MEMORY_STORE_ID;
  const baseUrl = (context.MEMORY_API_URL || 'https://memory.twilio.com').replace(/\/$/, '');
  const traitGroups = (context.TWILIO_MEMORY_PROFILE_TRAIT_GROUPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!apiKey || !apiSecret || !storeId) {
    response.setStatusCode(500);
    response.setBody({
      error: 'server is missing TWILIO_API_KEY / TWILIO_API_SECRET / MEMORY_STORE_ID',
    });
    return callback(null, response);
  }

  const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const storeBase = `${baseUrl}/v1/Stores/${encodeURIComponent(storeId)}`;

  try {
    // --- Resolve a profile by trying each candidate in order -----------------
    let profileId = null;
    let matchedBy = null;
    let matchedIdentifier = identifiers[0].value;

    for (const { idType, value } of identifiers) {
      const result = await lookupProfile(storeBase, authHeader, idType, value);
      if (result.profiles && result.profiles.length > 0) {
        profileId = result.profiles[0];
        matchedBy = idType;
        matchedIdentifier = value;
        break;
      }
    }

    if (!profileId) {
      // No candidate matched — return a clean empty payload so the UI shows
      // empty states rather than an error.
      response.setStatusCode(200);
      response.setBody({
        identifier: matchedIdentifier,
        matchedBy: null,
        profileId: null,
        profileCreatedAt: null,
        traits: {},
        observations: [],
        summaries: [],
      });
      return callback(null, response);
    }

    // --- Fetch profile traits + recall memories in parallel -----------------
    const traitQuery = traitGroups.length ? `?traitGroups=${traitGroups.join(',')}` : '';
    const [profileResult, recallResult] = await Promise.allSettled([
      getJson(`${storeBase}/Profiles/${profileId}${traitQuery}`, {
        method: 'GET',
        headers: { Authorization: authHeader },
      }),
      getJson(`${storeBase}/Profiles/${profileId}/Recall`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ observation_limit: 10, summary_limit: 5, session_limit: 3 }),
      }),
    ]);

    const profileOk = profileResult.status === 'fulfilled';
    const recallOk = recallResult.status === 'fulfilled';

    if (!profileOk && !recallOk) {
      response.setStatusCode(502);
      response.setBody({
        error: 'memora fetch failed',
        detail: String(
          (profileResult.reason && profileResult.reason.message) || profileResult.reason,
        ),
      });
      return callback(null, response);
    }

    const profile = profileOk ? profileResult.value : {};
    const recall = recallOk ? recallResult.value : {};

    response.setStatusCode(200);
    response.setBody({
      identifier: matchedIdentifier,
      matchedBy,
      profileId,
      profileCreatedAt: profile.createdAt || null,
      traits: normalizeTraits(profile.traits),
      observations: Array.isArray(recall.observations) ? recall.observations : [],
      summaries: Array.isArray(recall.summaries) ? recall.summaries : [],
      partial: !profileOk || !recallOk,
    });
    return callback(null, response);
  } catch (err) {
    response.setStatusCode(502);
    response.setBody({ error: 'memora fetch failed', detail: String((err && err.message) || err) });
    return callback(null, response);
  }
};

// --- helpers ----------------------------------------------------------------

/** Parse + validate the identifiers param into a clean [{idType, value}] list. */
function parseIdentifiers(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (c) =>
        c &&
        typeof c.idType === 'string' &&
        c.idType.trim() &&
        typeof c.value === 'string' &&
        c.value.trim(),
    )
    .map((c) => ({ idType: c.idType.trim(), value: c.value.trim() }));
}

async function lookupProfile(storeBase, authHeader, idType, value) {
  const data = await getJson(`${storeBase}/Profiles/Lookup`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idType, value }),
  });
  return { normalizedValue: data.normalizedValue, profiles: data.profiles || [] };
}

async function getJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`${options.method} ${url} → ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Traits arrive keyed by Trait Group name, each group a key→value record.
 * Drop any group whose value isn't a plain object so the UI can assume the shape.
 */
function normalizeTraits(traits) {
  if (!traits || typeof traits !== 'object') return {};
  const out = {};
  for (const [group, fields] of Object.entries(traits)) {
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      out[group] = fields;
    }
  }
  return out;
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
