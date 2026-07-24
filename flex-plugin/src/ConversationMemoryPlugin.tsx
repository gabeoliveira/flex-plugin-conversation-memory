import React from 'react';
import * as Flex from '@twilio/flex-ui';
import { FlexPlugin } from '@twilio/flex-plugin';
import { Theme } from '@twilio-paste/core/theme';

import { MemoryPanel } from './components/MemoryPanel/MemoryPanel';

const PLUGIN_NAME = 'ConversationMemoryPlugin';

/**
 * How the Memora panel occupies the CRM container. This is a per-integration
 * architectural choice that's the same across every environment, so it lives
 * here as a typed constant rather than in `.env` (which is reserved for
 * environment-specific values like the functions URL and credentials).
 *
 *  - 'add'     → append the panel above any customer CRM iframe (they coexist;
 *                the container is a vertical stack). This is the safe default.
 *  - 'replace' → the panel takes over the entire CRM container, dropping the
 *                default CRM iframe. Use when memory is the only CRM surface.
 *
 * Flip this constant once at integration time, then rebuild.
 */
const CRM_MODE: 'add' | 'replace' = 'replace';

export default class ConversationMemoryPlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  async init(flex: typeof Flex, _manager: Flex.Manager): Promise<void> {
    const panel = (
      <Theme.Provider key="conversation-memory" theme="default">
        <MemoryPanel />
      </Theme.Provider>
    );

    if (CRM_MODE === 'replace') {
      flex.CRMContainer.Content.replace(panel);
    } else {
      // sortOrder -1 places the memory panel above the default CRM iframe.
      flex.CRMContainer.Content.add(panel, { sortOrder: -1 });
    }
  }
}
