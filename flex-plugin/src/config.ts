/**
 * Build-time feature flags. `FLEX_APP_*` env vars are inlined at build, so these
 * are decided when the plugin is built for a given customer — no runtime config.
 *
 * Both default ON. Set the env var to `false` / `0` / `off` / `no` to disable.
 *
 *   FLEX_APP_ENABLE_SUMMARIZE=false   # hide the OpenAI "Summarize" button
 *                                     # (the panel becomes memory + knowledge +
 *                                     #  search only — no OpenAI dependency)
 *   FLEX_APP_ENABLE_CAPTURE=false     # don't fire the Phase 6 productivity capture
 */

/** True unless the env var is explicitly a falsy word. Read at call time so tests
 *  (and any late env setup) see the current value. */
export function flag(name: string, def = true): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return def;
  return !/^(false|0|off|no)$/i.test(raw.trim());
}

/** Whether the grounded OpenAI "Summarize" action is available. */
export function summarizeEnabled(): boolean {
  return flag('FLEX_APP_ENABLE_SUMMARIZE');
}

/** Whether agent↔assistant turns are captured for productivity analytics (Phase 6). */
export function captureEnabled(): boolean {
  return flag('FLEX_APP_ENABLE_CAPTURE');
}
