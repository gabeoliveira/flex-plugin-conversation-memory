/**
 * Create the dedicated AGENT memory store (isolated from customer memory).
 *
 *   npm run create:store
 *
 * Agents are keyed by a CUSTOM `workerSid` identifier. Memora's default idTypes
 * are [chat, email, phone, pushUserID, whatsapp], but custom ones are added via
 * the store's Identity Resolution Settings (normalization: 'trim' keeps the raw
 * WK… value intact). The `Agent` trait group promotes two traits to identifiers:
 *   - `workerSid` → the custom `workerSid` idType (canonical agent key)
 *   - `chatId`    → the built-in `chat` idType, same value — so the agent's
 *                   CUSTOMER CHAT participant (address = Worker SID) resolves to
 *                   this same profile. Both identifiers live on one agent profile.
 *                   (The agent is modeled as CUSTOMER, not HUMAN_AGENT: only
 *                   CUSTOMER participants resolve to a profile, which is what
 *                   GROUP_BY_PROFILE keys the per-agent session on.)
 *
 * Prints AGENT_MEMORY_STORE_ID — paste it into .env and serverless/.env.
 */
import { authHeader, optional, pollUntilComplete, required } from './_env.js';

const MEMORY = (optional('MEMORY_API_URL') ?? 'https://memory.twilio.com').replace(/\/$/, '');

async function main(): Promise<void> {
  const existing = optional('AGENT_MEMORY_STORE_ID');
  if (existing) {
    console.log(`AGENT_MEMORY_STORE_ID already set (${existing}) — skipping create.`);
    return;
  }

  const res = await fetch(`${MEMORY}/v1/ControlPlane/Stores`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'agent-productivity',
      description: 'Agent-assistant interactions for productivity analytics. Isolated from customer memory.',
    }),
  });
  if (!res.ok) throw new Error(`Create store failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { sid?: string; id?: string; statusUrl?: string };
  let storeId = data.sid ?? data.id;
  if (!storeId && data.statusUrl) {
    // Async: the created store id is in the completed operation's result.id.
    const op = (await pollUntilComplete(data.statusUrl)) as { result?: { id?: string } };
    storeId = op.result?.id;
  }
  if (!storeId) throw new Error(`No store id in response: ${JSON.stringify(data)}`);

  await registerWorkerSidIdentifier(storeId);

  // Agent trait group. `workerSid` promotes to the custom idType (the key);
  // `chatId` promotes to the built-in chat idType (so the CHAT participant
  // resolves to the same profile). email/fullName/team are display enrichment.
  const tg = await fetch(`${MEMORY}/v1/ControlPlane/Stores/${storeId}/TraitGroups`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Agent',
      description: 'Contact-center agent identity/enrichment.',
      traits: {
        workerSid: { dataType: 'STRING', description: 'TaskRouter Worker SID', idTypePromotion: 'workerSid' },
        chatId: { dataType: 'STRING', description: 'Chat identifier (= Worker SID)', idTypePromotion: 'chat' },
        email: { dataType: 'STRING', description: 'Agent email' },
        fullName: { dataType: 'STRING', description: 'Agent full name' },
        team: { dataType: 'STRING', description: 'Agent team' },
      },
    }),
  });
  if (!tg.ok) console.warn(`(non-fatal) Agent trait group create returned ${tg.status}: ${await tg.text()}`);

  console.log('Agent memory store created.');
  console.log(`  AGENT_MEMORY_STORE_ID=${storeId}`);
  console.log('  Registered custom identifier: workerSid (normalization: trim)');
  console.log('  TRAIT_GROUPS=Agent');
}

/**
 * Add a custom `workerSid` identifier to the store's Identity Resolution
 * Settings. PUT replaces the whole config, so we GET the (auto-provisioned)
 * defaults and append — never drop the reserved defaults.
 */
async function registerWorkerSidIdentifier(storeId: string): Promise<void> {
  const url = `${MEMORY}/v1/ControlPlane/Stores/${storeId}/IdentityResolutionSettings`;
  const cur = (await (
    await fetch(url, { headers: { Authorization: authHeader() } })
  ).json()) as { identifierConfigs?: any[]; matchingRules?: string[] };

  const configs = cur.identifierConfigs ?? [];
  const rules = cur.matchingRules ?? [];
  if (configs.some((c) => c.idType === 'workerSid')) {
    console.log('  workerSid identifier already registered — skipping.');
    return;
  }
  configs.push({
    idType: 'workerSid',
    matchingAlgo: 'exact',
    matchingThreshold: 75,
    limit: 100,
    limitPolicy: 'fifo',
    enforceUnique: true,
    normalization: 'trim',
  });
  if (!rules.includes('workerSid')) rules.push('workerSid');

  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifierConfigs: configs, matchingRules: rules }),
  });
  if (!res.ok) throw new Error(`Register workerSid identifier failed (${res.status}): ${await res.text()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
