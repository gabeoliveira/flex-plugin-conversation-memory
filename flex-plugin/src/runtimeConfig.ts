/**
 * Runtime configuration from Flex `ui_attributes` (Workstream D3).
 *
 * Customers set these in their Flex Configuration `ui_attributes` (via the Flex
 * Configuration REST API) under a `conversation_memory` namespace — so they can
 * change locale, toggle features, and tune the trait display **without
 * rebuilding the plugin**. Build-time `FLEX_APP_*` env stays as the fallback
 * layer (see config.ts / i18n), so runtime config overrides env when present.
 *
 * Example ui_attributes:
 *   {
 *     "conversation_memory": {
 *       "locale": "pt-BR",
 *       "enableSummarize": false,
 *       "enableCapture": true,
 *       "traitGroups": {
 *         "order":  ["Contact", "DasaClient"],
 *         "hidden": ["Internal"],
 *         "labels": { "DasaClient": "Cliente Dasa" }
 *       }
 *     }
 *   }
 */
import * as Flex from '@twilio/flex-ui';

export interface TraitGroupConfig {
  /** Preferred display order of trait-group names; unlisted groups follow, in place. */
  order?: string[];
  /** Trait-group names to hide entirely. */
  hidden?: string[];
  /** Trait-group name → display label override. */
  labels?: Record<string, string>;
}

export interface RuntimeConfig {
  locale?: string;
  enableSummarize?: boolean;
  enableCapture?: boolean;
  /** Show the opt-in Communications tab (default off). */
  enableCommunications?: boolean;
  traitGroups?: TraitGroupConfig;
}

const NAMESPACE = 'conversation_memory';

let cached: RuntimeConfig | null = null;

/**
 * Our namespaced runtime config, read once from Flex's merged configuration
 * (with the raw `serviceConfiguration.ui_attributes` as a fallback location).
 * Returns `{}` when Flex or the key is unavailable (e.g. tests) so callers can
 * always fall back to their build-time defaults.
 */
export function getRuntimeConfig(): RuntimeConfig {
  if (cached) return cached;
  cached = read();
  return cached;
}

function read(): RuntimeConfig {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m: any = Flex.Manager.getInstance();
    const raw = m?.configuration?.[NAMESPACE] ?? m?.serviceConfiguration?.ui_attributes?.[NAMESPACE];
    return raw && typeof raw === 'object' ? (raw as RuntimeConfig) : {};
  } catch {
    return {};
  }
}

/** Test seam — drop the memoized config so a fresh Flex mock is read. */
export function __resetRuntimeConfigCache(): void {
  cached = null;
}
