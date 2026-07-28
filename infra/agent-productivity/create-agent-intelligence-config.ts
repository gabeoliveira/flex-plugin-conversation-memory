/**
 * Create the agent Intelligence Configuration: runs the Session Insights
 * operator at CONVERSATION_END and (optionally) POSTs results to CIRL.
 *
 *   npm run create:intel
 *
 * Prereq: AGENT_OPERATOR_ID. Optional: CIRL_WEBHOOK_URL (the CIRL /webhook/ci
 * ingest URL — leave unset to wire the action later in Console).
 *
 * Prints AGENT_INTELLIGENCE_CONFIGURATION_ID.
 */
import { authHeader, isRealId, optional, required } from './_env.js';

const INTEL = (optional('INTELLIGENCE_API_URL') ?? 'https://intelligence.twilio.com').replace(/\/$/, '');

async function main(): Promise<void> {
  const existing = optional('AGENT_INTELLIGENCE_CONFIGURATION_ID');
  if (existing) {
    console.log(`AGENT_INTELLIGENCE_CONFIGURATION_ID already set (${existing}) — skipping.`);
    return;
  }
  const operatorId = required('AGENT_OPERATOR_ID');

  const cirlUrl = optional('CIRL_WEBHOOK_URL');
  const rule: Record<string, unknown> = {
    operators: [{ id: operatorId }],
    triggers: [{ on: 'CONVERSATION_END' }],
    // actions must be present (non-null) even with no webhook — empty means
    // "run the operator, take no downstream action". Wire CIRL later in Console.
    actions: cirlUrl ? [{ type: 'WEBHOOK', method: 'POST', url: cirlUrl }] : [],
  };
  if (!cirlUrl) {
    console.log('No CIRL_WEBHOOK_URL set — creating with empty actions; wire the CIRL webhook later in Console.');
  }

  const res = await fetch(`${INTEL}/v3/ControlPlane/Configurations`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Agent Assist Insights',
      description: 'Runs Agent Assist Session Insights on agent↔assistant conversations.',
      rules: [rule],
    }),
  });
  if (!res.ok) throw new Error(`Create intelligence config failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { sid?: string; id?: string };
  const id = data.sid ?? data.id;
  console.log('Intelligence configuration created.');
  console.log(`  AGENT_INTELLIGENCE_CONFIGURATION_ID=${id}`);
  if (!isRealId(id, 'intelligence_configuration')) {
    console.log('  (verify the id prefix; link it into the CO config next.)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
