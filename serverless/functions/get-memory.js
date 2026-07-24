/**
 * GET /get-memory?identifiers=<url-encoded JSON array>[&query=…][&profileId=…]
 *   Authorization: Bearer <agent Flex token>   (required)
 *
 * Returns the Twilio Memora profile (traits), observations, and summaries for
 * a customer — used by the Conversation Memory Flex plugin's panel and search.
 *
 * Modes:
 *   - No `query`  → panel load: resolve profile, return traits + recent
 *                   observations/summaries (chronological).
 *   - With `query`→ semantic search: skip traits, run Recall with the query and
 *                   return the most relevant observations/summaries.
 *   - `profileId` → skip identifier Lookup and use the given profile directly
 *                   (the panel already resolved it; search reuses it).
 *
 * The CLIENT decides which identifiers to try (it knows the task's channel).
 * This proxy stays generic: it tries each `{ idType, value }` candidate against
 * Memora's Lookup in order, first match wins, then getProfile + Recall.
 *
 * Auth: the agent's Flex token is validated server-side (twilio-flex-token-
 * validator) before any Memora call — the function is not open. The Memora API
 * key/secret stay server-side so they never ship in the Flex bundle.
 */

exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  applyCors(response, context, event);

  if (event.request && event.request.method === 'OPTIONS') {
    response.setStatusCode(204);
    return callback(null, response);
  }

  // --- Authenticate the agent (Flex token) ---------------------------------
  const auth = await validateFlexToken(context, event);
  if (!auth.valid) {
    response.setStatusCode(401);
    response.setBody({ error: 'missing or invalid Flex token' });
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

  const query = typeof event.query === 'string' && event.query.trim() ? event.query.trim() : null;
  const givenProfileId =
    typeof event.profileId === 'string' && event.profileId.trim() ? event.profileId.trim() : null;

  try {
    // --- Resolve a profile ---------------------------------------------------
    let profileId = givenProfileId;
    let matchedBy = null;
    let matchedIdentifier = '';

    if (!profileId) {
      const identifiers = parseIdentifiers(event.identifiers);
      if (identifiers.length === 0) {
        response.setStatusCode(400);
        response.setBody({
          error: "missing 'profileId' or valid 'identifiers' (JSON array of {idType, value})",
        });
        return callback(null, response);
      }
      matchedIdentifier = identifiers[0].value;
      for (const { idType, value } of identifiers) {
        const result = await lookupProfile(storeBase, authHeader, idType, value);
        if (result.profiles && result.profiles.length > 0) {
          profileId = result.profiles[0];
          matchedBy = idType;
          matchedIdentifier = value;
          break;
        }
      }
    }

    if (!profileId) {
      // No candidate matched — clean empty payload so the UI shows empty states.
      response.setStatusCode(200);
      response.setBody(emptyPayload(matchedIdentifier));
      return callback(null, response);
    }

    // --- Recall (always) + profile traits (panel load only) -----------------
    // Search mode returns only the top-ranked matches (Recall reorders by
    // relevance but still returns up to the limit — a high limit = "everything").
    // NOTE: Recall honors ONLY camelCase limit params; snake_case is silently
    // ignored and it returns its (large) default set.
    const recallBody = {
      observationsLimit: query ? 5 : 10,
      summariesLimit: query ? 3 : 5,
    };
    if (query) recallBody.query = query;

    const recall = await getJson(`${storeBase}/Profiles/${profileId}/Recall`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(recallBody),
    }).catch((err) => ({ __error: err }));

    // Traits are only needed for the panel (non-search) view.
    let traits = {};
    let profileCreatedAt = null;
    let profileError = null;
    if (!query) {
      const traitQuery = traitGroups.length ? `?traitGroups=${traitGroups.join(',')}` : '';
      const profile = await getJson(`${storeBase}/Profiles/${profileId}${traitQuery}`, {
        method: 'GET',
        headers: { Authorization: authHeader },
      }).catch((err) => ({ __error: err }));
      if (profile && profile.__error) {
        profileError = profile.__error;
      } else if (profile) {
        traits = normalizeTraits(profile.traits);
        profileCreatedAt = profile.createdAt || null;
      }
    }

    const recallFailed = recall && recall.__error;

    // Search mode: Recall is the whole result — its failure is fatal.
    if (query && recallFailed) {
      response.setStatusCode(502);
      response.setBody({ error: 'memora recall failed', detail: errString(recall.__error) });
      return callback(null, response);
    }
    // Panel mode: fatal only if BOTH traits and recall failed.
    if (!query && recallFailed && profileError) {
      response.setStatusCode(502);
      response.setBody({ error: 'memora fetch failed', detail: errString(profileError) });
      return callback(null, response);
    }

    response.setStatusCode(200);
    response.setBody({
      identifier: matchedIdentifier,
      matchedBy,
      profileId,
      profileCreatedAt,
      traits,
      observations: !recallFailed && Array.isArray(recall.observations) ? recall.observations : [],
      summaries: !recallFailed && Array.isArray(recall.summaries) ? recall.summaries : [],
      partial: Boolean(recallFailed || profileError),
    });
    return callback(null, response);
  } catch (err) {
    response.setStatusCode(502);
    response.setBody({ error: 'memora fetch failed', detail: errString(err) });
    return callback(null, response);
  }
};

// --- helpers ----------------------------------------------------------------

function emptyPayload(identifier) {
  return {
    identifier: identifier || '',
    matchedBy: null,
    profileId: null,
    profileCreatedAt: null,
    traits: {},
    observations: [],
    summaries: [],
  };
}

/** Validate the agent's Flex token (from an Authorization: Bearer header, or event.Token). */
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

function errString(err) {
  return String((err && err.message) || err);
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
