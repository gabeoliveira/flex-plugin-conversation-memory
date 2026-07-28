// getStrings reads @twilio/flex-ui's Manager; stub it (bundle can't load in jsdom).
// Manager.getInstance throws by default (no locale) so getStrings falls to the override/en.
jest.mock('@twilio/flex-ui', () => ({
  Manager: {
    getInstance: () => {
      throw new Error('no Flex in test');
    },
  },
}));

import { resolveLocale, getStrings } from '../index';
import { en } from '../en';
import { ptBR } from '../pt-BR';

describe('resolveLocale', () => {
  it('exact tag (case-insensitive)', () => {
    expect(resolveLocale('pt-BR')).toBe('pt-br');
    expect(resolveLocale('en-US')).toBe('en'); // en-us → primary en
  });

  it('primary-subtag fallback', () => {
    expect(resolveLocale('en-GB')).toBe('en');
    expect(resolveLocale('pt-PT')).toBe('pt-br'); // any pt-* → Brazilian Portuguese
  });

  it('unknown / empty → default en', () => {
    expect(resolveLocale('fr-FR')).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });

  it('override wins over the tag', () => {
    expect(resolveLocale('en-US', 'pt-BR')).toBe('pt-br');
  });
});

describe('getStrings', () => {
  it('defaults to en when Flex has no locale', () => {
    expect(getStrings()).toBe(en);
    expect(getStrings().refresh).toBe('Refresh');
  });

  it('honors an explicit override (D3 runtime-config hook)', () => {
    expect(getStrings('pt-BR')).toBe(ptBR);
    expect(getStrings('pt-BR').refresh).toBe('Atualizar');
    expect(getStrings('pt-BR').tabSummaries).toBe('Resumos');
  });

  it('every locale implements the full string set (no missing keys)', () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(ptBR[key]).toBeDefined();
    }
  });
});
