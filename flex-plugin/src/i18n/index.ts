/**
 * Locale resolution for the plugin's own strings.
 *
 * Source of truth is Flex's current UI locale — `Manager.getInstance()
 * .localization.localeTag` (IETF tag, e.g. "pt-BR") — so the panel follows the
 * agent's language selection natively. A caller can pass an explicit override
 * (the runtime-config hook for D3) to force a language regardless of Flex.
 *
 * We keep a private per-locale map rather than writing into `manager.strings`,
 * so we never clobber Flex's built-in strings. Adding a locale = one new file
 * (the compiler enforces the shape via `Strings`).
 */
import * as Flex from '@twilio/flex-ui';

import type { Strings } from './types';
import { en } from './en';
import { ptBR } from './pt-BR';
import { getRuntimeConfig } from '../runtimeConfig';

export type { Strings } from './types';

const MAPS: Record<string, Strings> = {
  en,
  'pt-br': ptBR,
};

const DEFAULT_LOCALE = 'en';

/**
 * Resolve a supported locale key from a locale tag (+ optional override).
 * Tries the full tag ("pt-br"), then the primary subtag ("pt"), then default.
 * Pure + exported for testing.
 */
export function resolveLocale(localeTag?: string, override?: string): string {
  const raw = (override || localeTag || '').trim().toLowerCase();
  if (!raw) return DEFAULT_LOCALE;
  if (MAPS[raw]) return raw;
  const primary = raw.split('-')[0];
  if (MAPS[primary]) return primary; // e.g. "en-gb" → "en"
  if (primary === 'pt') return 'pt-br'; // any pt-* → Brazilian Portuguese
  return DEFAULT_LOCALE;
}

/** Flex's current locale tag, or undefined if Flex isn't available (e.g. tests). */
function currentLocaleTag(): string | undefined {
  try {
    return Flex.Manager.getInstance().localization?.localeTag;
  } catch {
    return undefined;
  }
}

/**
 * A forced-locale override, most-authoritative first: an explicit argument, then
 * Flex `ui_attributes` (runtime, D3), then `FLEX_APP_LOCALE` (build-time). When
 * none is set, `getStrings` follows Flex's own UI locale.
 */
function localeOverride(explicit?: string): string | undefined {
  return explicit || getRuntimeConfig().locale || process.env.FLEX_APP_LOCALE || undefined;
}

/** The active string map. Honors the locale override chain, else Flex's UI locale. */
export function getStrings(override?: string): Strings {
  return MAPS[resolveLocale(currentLocaleTag(), localeOverride(override))] ?? en;
}
