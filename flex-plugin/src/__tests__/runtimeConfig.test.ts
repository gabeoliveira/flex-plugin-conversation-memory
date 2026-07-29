// Control what Flex's Manager returns per test.
const getInstance = jest.fn();
jest.mock('@twilio/flex-ui', () => ({ Manager: { getInstance: () => getInstance() } }));

import { getRuntimeConfig, __resetRuntimeConfigCache } from '../runtimeConfig';

const CFG = { locale: 'pt-BR', enableSummarize: false, traitGroups: { hidden: ['Internal'] } };

beforeEach(() => {
  __resetRuntimeConfigCache();
  getInstance.mockReset();
});

describe('getRuntimeConfig', () => {
  it('reads the namespaced object from the merged configuration', () => {
    getInstance.mockReturnValue({ configuration: { conversation_memory: CFG } });
    expect(getRuntimeConfig()).toEqual(CFG);
  });

  it('falls back to serviceConfiguration.ui_attributes', () => {
    getInstance.mockReturnValue({
      serviceConfiguration: { ui_attributes: { conversation_memory: CFG } },
    });
    expect(getRuntimeConfig()).toEqual(CFG);
  });

  it('returns {} when the namespace is absent', () => {
    getInstance.mockReturnValue({ configuration: {}, serviceConfiguration: { ui_attributes: {} } });
    expect(getRuntimeConfig()).toEqual({});
  });

  it('returns {} (never throws) when Flex is unavailable', () => {
    getInstance.mockImplementation(() => {
      throw new Error('Manager not created');
    });
    expect(getRuntimeConfig()).toEqual({});
  });

  it('memoizes — reads Flex once, then serves the cache', () => {
    getInstance.mockReturnValue({ configuration: { conversation_memory: CFG } });
    getRuntimeConfig();
    getRuntimeConfig();
    expect(getInstance).toHaveBeenCalledTimes(1);
  });
});
