/**
 * Create the "Agent Assist Session Insights" Custom GenAI operator.
 * (Name has no em-dash — the API rejects it, and CIRL matches on this exact
 * displayName, so keep it stable.)
 *
 *   npm run create:operator
 *
 * Session-level: the conversation holds N agent↔assistant turns; the operator
 * scores the whole session at CONVERSATION_END.
 *
 * Schema rules (TAC guide §7/§10.10): root type object; Twilio auto-sets
 * additionalProperties:false and marks ALL fields required — so every enum
 * carries an escape value ('unknown'/'n/a'); no unsupported keywords; ≤8800 chars.
 * Do NOT send a `required` array.
 *
 * Prints AGENT_OPERATOR_ID.
 */
import { authHeader, optional } from './_env.js';

const INTEL = (optional('INTELLIGENCE_API_URL') ?? 'https://intelligence.twilio.com').replace(/\/$/, '');

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    turn_count: { type: 'integer', description: 'Number of agent questions in the session.' },
    dominant_topic: {
      type: 'string',
      enum: ['billing', 'results', 'scheduling', 'account', 'policy', 'technical', 'other', 'unknown'],
      description: 'The most frequent topic the agent asked about.',
    },
    topics: {
      type: 'array',
      description: 'One entry per distinct topic the agent asked about.',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Short topic label.' },
          intent: {
            type: 'string',
            enum: ['search', 'summarize', 'unknown'],
            description: 'Whether the agent searched or asked for a synthesized answer.',
          },
        },
      },
    },
    answered_count: {
      type: 'integer',
      description: 'Turns where the assistant found a relevant answer in memory or knowledge.',
    },
    unanswered_count: {
      type: 'integer',
      description: 'Turns with no relevant memory/knowledge (knowledge gaps).',
    },
    gap_topics: {
      type: 'array',
      description: 'Topics the assistant could not answer (empty if none).',
      items: { type: 'object', properties: { topic: { type: 'string', description: 'Gap topic label.' } } },
    },
    overall_assist_quality: {
      type: 'string',
      enum: ['strong', 'mixed', 'weak', 'n/a'],
      description: 'How useful the assistant was across the session.',
    },
    session_summary: { type: 'string', description: '1-2 sentence recap; "none" if trivial.' },
  },
};

const PROMPT = `You are analyzing a SESSION in which a contact-center AGENT used an AI assistant to look up a customer's memory and the org knowledge base. The transcript alternates between the AGENT (their question / search) and the ASSISTANT (results found, or a grounded answer).

Extract session-level productivity insights as JSON in the given schema, for reporting on how agents use the assistant.

RULES:
- turn_count: count the AGENT's questions.
- dominant_topic / topics: classify what the agent asked about. "intent" is "summarize" when the assistant produced a synthesized answer, otherwise "search".
- answered_count: turns where the assistant surfaced relevant memory/knowledge. unanswered_count: turns where it found nothing relevant (a knowledge gap). They should sum to about turn_count.
- gap_topics: list topics with no coverage (empty array if none).
- overall_assist_quality: strong (mostly answered, grounded), mixed, or weak (mostly gaps).
- session_summary: one or two sentences. Use "none" if there is nothing notable.
- Do NOT invent. Use the escape values ("unknown", "n/a", "none", empty array) when a field cannot be determined.`;

async function main(): Promise<void> {
  const existing = optional('AGENT_OPERATOR_ID');
  if (existing) {
    console.log(`AGENT_OPERATOR_ID already set (${existing}) — skipping create.`);
    return;
  }

  const res = await fetch(`${INTEL}/v3/ControlPlane/Operators`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Agent Assist Session Insights',
      description: 'Session-level productivity insights for how agents use the memory/knowledge assistant.',
      outputFormat: 'JSON',
      outputSchema: OUTPUT_SCHEMA,
      prompt: PROMPT,
      context: { memory: { enabled: true }, knowledge: { enabled: false } },
    }),
  });
  if (!res.ok) throw new Error(`Create operator failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { sid?: string; id?: string };
  const operatorId = data.sid ?? data.id;
  console.log('Custom GenAI operator created.');
  console.log(`  AGENT_OPERATOR_ID=${operatorId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
