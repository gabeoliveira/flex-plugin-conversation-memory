import { loadPlugin } from '@twilio/flex-plugin';

import ConversationMemoryPlugin from './ConversationMemoryPlugin';

// The Flex Plugin CLI text-scans this file (regex on the dotted invocation
// form) to verify exactly one plugin is registered. The named export must be
// invoked through an object reference, not as a bare function call, for the
// scan to match. Do not write that pattern anywhere else in this file —
// neither in code nor in comments — or the CLI will overcount.
const Loader = { loadPlugin };
Loader.loadPlugin(ConversationMemoryPlugin);
