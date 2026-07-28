# Agent Assist - CIntel Operator Configuration

The Conversation Intelligence layer for **agent productivity analytics**. One Custom GenAI operator scores each agent↔assistant **session** (multiple turns per conversation) at `CONVERSATION_END`. Provision it programmatically with `npm run create:operator`, or paste the spec below into the Console.

> Configure via **Console**, not an API PATCH on the rules array (rules-array overwrite risk). This config is **separate** from any customer-facing Intelligence configuration — it runs only on the agent-dedicated CO configuration.

## Setup order

1. **Operators** → **Create Custom Operator** → paste §1 → Save → note the `intelligence_operator_…` id.
2. **Configurations** → **Create Configuration** "Agent Assist Insights" → add the operator with a `CONVERSATION_END` rule → add a **Webhook action** pointing at your CIRL `/webhook/ci` ingest URL.
3. Attach the configuration to the **agent** Conversation Orchestrator configuration (not the customer one).

## 1. Custom GenAI operator - "Agent Assist Session Insights"

- **Display name:** `Agent Assist Session Insights` (CIRL matches operators by displayName — keep it exact; the API also rejects names with em-dashes, so no punctuation)
- **Author:** SELF (Custom)
- **Output format:** JSON
- **Trigger:** `CONVERSATION_END`
- **Context:** `{ "memory": { "enabled": true }, "knowledge": { "enabled": false } }`

### Output schema (paste-ready)

```json
{
  "type": "object",
  "properties": {
    "turn_count": { "type": "integer", "description": "Number of agent questions in the session." },
    "dominant_topic": { "type": "string", "enum": ["billing","results","scheduling","account","policy","technical","other","unknown"], "description": "Most frequent topic asked about." },
    "topics": { "type": "array", "items": { "type": "object", "properties": {
      "topic": { "type": "string", "description": "Short topic label." },
      "intent": { "type": "string", "enum": ["search","summarize","unknown"], "description": "Search vs synthesized answer." }
    } } },
    "answered_count": { "type": "integer", "description": "Turns answered from memory/knowledge." },
    "unanswered_count": { "type": "integer", "description": "Turns with no relevant memory/KB (gaps)." },
    "gap_topics": { "type": "array", "items": { "type": "object", "properties": { "topic": { "type": "string", "description": "Gap topic label." } } } },
    "overall_assist_quality": { "type": "string", "enum": ["strong","mixed","weak","n/a"], "description": "Usefulness across the session." },
    "session_summary": { "type": "string", "description": "1-2 sentence recap; 'none' if trivial." }
  }
}
```

### Schema-constraint checklist (verified)

- Root `type` = `"object"` ✓
- Only supported types (`string`, `integer`, `boolean`, `object`, `array`, `enum`) ✓
- **No `required` array** — Twilio auto-marks all fields required, which is why every enum has an escape value (`unknown`/`n/a`) ✓
- No unsupported keywords (`minLength`, `pattern`, `uniqueItems`, `additionalProperties`, …) ✓
- Flattened, well under the 8,800-char output cap ✓

### Prompt

See `create-agent-operator.ts` (`PROMPT`) for the exact text — analyzes an alternating AGENT/ASSISTANT session transcript and emits the schema above. Do not invent; use escape values when a field can't be determined.

## Notes

- **PII redaction** also masks Custom GenAI results — fetch `?Redacted=false` on the Transcript OperatorResults endpoint to see the raw JSON in Console.
- CIRL onboarding is out of scope here: CIRL adds the operator to its `config/operator-metrics.json` (keyed by the displayName above) and aggregates — integers→avg, enums→distribution, `gap_topics`→category_array.
