/**
 * Feature flags, layered: **Flex `ui_attributes` (runtime) overrides build-time
 * `FLEX_APP_*` env**. Runtime config lets a customer flip these without a rebuild
 * (Workstream D3); the env var is the fallback when the ui_attribute is absent.
 *
 * Env vars (inlined at build), both default ON — set to `false`/`0`/`off`/`no`:
 *   FLEX_APP_ENABLE_SUMMARIZE=false   # hide the OpenAI "Summarize" button
 *                                     # (memory + knowledge + search only — no OpenAI)
 *   FLEX_APP_ENABLE_CAPTURE=false     # don't fire the Phase 6 productivity capture
 * Runtime equivalents: ui_attributes.conversation_memory.enableSummarize / enableCapture.
 */
import { getRuntimeConfig } from './runtimeConfig';

/** True unless the env var is explicitly a falsy word. Read at call time so tests
 *  (and any late env setup) see the current value. */
export function flag(name: string, def = true): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return def;
  return !/^(false|0|off|no)$/i.test(raw.trim());
}

/** Whether the grounded OpenAI "Summarize" action is available. */
export function summarizeEnabled(): boolean {
  const rc = getRuntimeConfig().enableSummarize;
  return typeof rc === 'boolean' ? rc : flag('FLEX_APP_ENABLE_SUMMARIZE');
}

/** Whether agent↔assistant turns are captured for productivity analytics (Phase 6). */
export function captureEnabled(): boolean {
  const rc = getRuntimeConfig().enableCapture;
  return typeof rc === 'boolean' ? rc : flag('FLEX_APP_ENABLE_CAPTURE');
}
