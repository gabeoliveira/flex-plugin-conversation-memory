/**
 * GET /health — unauthenticated liveness + deploy-safety check.
 *
 * Reports whether CORS is locked. Twilio Functions have no startup hook, so this
 * is the pragmatic guard: after deploying, hit /health and confirm
 * `corsLocked: true` before wider rollout. A `*` ALLOWED_ORIGINS on a proxy that
 * returns customer PII is the exposure Workstream A closes.
 *
 * NOTE on the OPTIONS preflight: Twilio's platform auto-answers CORS preflight
 * (OPTIONS) with permissive wildcard headers, bypassing our handler — so an
 * OPTIONS probe always shows `*`. That's preflight only and carries no data;
 * enforcement is on the ACTUAL GET/POST response, where our applyCors echoes the
 * request origin only if it's allowed (else the first allowed origin, which the
 * browser then rejects as a mismatch). Verify the lock against a GET/POST, not
 * an OPTIONS. `corsLocked` here reflects the configured ALLOWED_ORIGINS.
 *
 * Intentionally leaks nothing sensitive — not the origins list, not any id.
 */

exports.handler = function (context, event, callback) {
  const response = new Twilio.Response();
  applyCors(response, context, event);

  if (event.request && event.request.method === 'OPTIONS') {
    response.setStatusCode(204);
    return callback(null, response);
  }

  const origins = (context.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const corsLocked = origins.length > 0 && !origins.includes('*');

  response.setStatusCode(200);
  response.setBody({
    ok: true,
    corsLocked,
    ...(corsLocked
      ? {}
      : { warning: 'ALLOWED_ORIGINS is "*" — lock it to your Flex domain(s) before rollout.' }),
  });
  return callback(null, response);
};

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
