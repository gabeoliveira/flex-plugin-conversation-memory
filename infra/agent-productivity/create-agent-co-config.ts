/**
 * Create the agent-dedicated Conversation Orchestrator configuration.
 *
 *   npm run create:co
 *
 * Key choices:
 *  - memoryStoreId = the AGENT store (isolated from customer memory).
 *  - intelligenceConfigurationIds = the agent Intelligence config.
 *  - channelSettings.CHAT.statusTimeouts.closed = SESSION_IDLE_MINUTES — THIS is
 *    the session boundary; after this many MINUTES of inactivity the conversation
 *    CLOSES and CONVERSATION_END fires the CI operator once for the whole session.
 *    (CO timeouts are in MINUTES, not seconds.)
 *  - conversationsV1Bridge OFF (avoids a shadow AI_AGENT participant).
 *  - GROUP_BY_PROFILE + agent-as-CUSTOMER = one open conversation per agent
 *    profile, so capture-turn finds-or-creates the session natively (a duplicate
 *    create 409s with the open conversation id) — no Sync needed.
 *  - memoryExtractionEnabled so per-agent observations accumulate (keyed by the
 *    agent's CUSTOMER participant chat address = Worker SID).
 *
 * Prereq: AGENT_MEMORY_STORE_ID + AGENT_INTELLIGENCE_CONFIGURATION_ID.
 * Prints AGENT_CONVERSATION_CONFIGURATION_ID.
 */
import { authHeader, isRealId, optional, required } from './_env.js';

const CONV = (optional('CONVERSATIONS_API_URL') ?? 'https://conversations.twilio.com').replace(/\/$/, '');

async function main(): Promise<void> {
  const existing = optional('AGENT_CONVERSATION_CONFIGURATION_ID');
  if (existing) {
    console.log(`AGENT_CONVERSATION_CONFIGURATION_ID already set (${existing}) — skipping.`);
    return;
  }

  const memoryStoreId = required('AGENT_MEMORY_STORE_ID');
  if (!isRealId(memoryStoreId, 'mem_store')) {
    throw new Error(`AGENT_MEMORY_STORE_ID looks invalid (${memoryStoreId}). Run create:store first.`);
  }
  const intelId = optional('AGENT_INTELLIGENCE_CONFIGURATION_ID');
  const idleMinutes = parseInt(optional('SESSION_IDLE_MINUTES') ?? '5', 10);

  const body: Record<string, unknown> = {
    displayName: 'Agent Assist Sessions',
    description: 'Agent-assistant sessions for productivity analytics (isolated from customer conversations).',
    conversationGroupingType: 'GROUP_BY_PROFILE',
    memoryStoreId,
    memoryExtractionEnabled: true,
    channelSettings: {
      CHAT: { statusTimeouts: { closed: idleMinutes, inactive: null }, captureRules: [] },
    },
  };
  if (intelId) body.intelligenceConfigurationIds = [intelId];

  const res = await fetch(`${CONV}/v2/ControlPlane/Configurations`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Create CO config failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as {
    related?: { configurationId?: string };
    statusUrl?: string;
    id?: string;
    sid?: string;
  };
  const id = data.related?.configurationId ?? data.id ?? data.sid;
  console.log('Agent CO configuration created.');
  console.log(`  AGENT_CONVERSATION_CONFIGURATION_ID=${id}`);
  console.log(`  SESSION_IDLE_MINUTES=${idleMinutes}   (CHAT closed timeout, in MINUTES)`);
  if (!intelId) console.log('  (no intelligence config linked yet — set AGENT_INTELLIGENCE_CONFIGURATION_ID and re-run, or link in Console)');
  if (data.statusUrl) console.log(`  (status: ${data.statusUrl})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
