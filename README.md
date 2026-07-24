# Conversation Memory — Flex Plugin

A reusable Twilio Flex plugin that surfaces **Twilio Memora** (customer memory) to agents inside the **CRM container**. For the active task's customer it shows three tabs:

1. **Traits** — grouped by Trait Group
2. **Observations** — newest first, with source + timestamp
3. **Summaries** — conversation summaries, newest first

Data is fetched **live** through a Twilio Serverless proxy on every task open — nothing is snapshotted into task attributes.

```
solutions/flex-plugin-conversation-memory/
├── flex-plugin/    # the Flex UI plugin (Twilio Paste)
└── serverless/     # Twilio Function proxy that holds the Memora credentials
```

## How it works

```
Flex task ──▶ MemoryPanel builds channel-aware identifier candidates
                  │  (knows channelType + identifier attrs on the task)
                  │  e.g. [{whatsapp, "whatsapp:+55…"}, {phone, "+55…"}]
                  ▼
        GET /get-memory?identifiers=<url-encoded JSON array>
                  │
                  ▼  (Serverless — holds API key/secret)
        for each candidate → Profiles/Lookup { idType, value }
                            first profile that matches wins
                  │  profileId
                  ▼
        getProfile (traits)  +  Recall (observations, summaries)   ──▶ JSON ──▶ 3 tabs
```

### Why live fetch (not a task-attribute snapshot)

- **Freshness** — Conversation Intelligence writes new observations/summaries *during and after* the conversation; a handoff-time snapshot is stale immediately.
- **Size** — a full profile + traits + observations + summaries blows the task-attribute budget and can fail task creation.
- **PII** — keeps customer memory out of broadly-readable, logged, retained task attributes. The Memora credentials can't live in the browser anyway, so a proxy is required regardless.

### Identifiers — decided client-side

The plugin knows the task's channel, so it builds the ordered list of identifier candidates itself ([`utils/identifiers.ts`](flex-plugin/src/utils/identifiers.ts)) and the proxy stays generic — it just tries each `{ idType, value }` against Memora's `Lookup` in order, first match wins. This mirrors Memora's flexible identifiers (phone, email, whatsapp, custom ids): **adding a new id type is a client-only change, no proxy redeploy.**

**WhatsApp identity transition:** Meta is moving WhatsApp identification toward a username, and Memora now exposes a `whatsapp` identifier. For a WhatsApp task the plugin emits `{idType:'whatsapp', value:'whatsapp:…'}` (raw, prefix preserved) **first**, then a `{idType:'phone', value:'+E164'}` fallback — where the phone can come from a *different* task attribute, so resolution still works when the address is a username with no embedded phone.

## CRM container placement

`Flex.CRMContainer` is a **vertical** programmable container, so the panel can coexist with a customer's embedded CRM iframe. Control this with the `CRM_MODE` constant at the top of [`ConversationMemoryPlugin.tsx`](flex-plugin/src/ConversationMemoryPlugin.tsx) — a per-integration choice set once at integration time:

- `'add'` (default) — append the panel **above** any customer CRM iframe (both render).
- `'replace'` — the panel takes over the **entire** CRM container.

## Setup

### 1. Serverless proxy
```bash
cd serverless
npm install
cp .env.example .env   # fill in TWILIO_API_KEY, TWILIO_API_SECRET, MEMORY_STORE_ID, trait groups
npm start              # twilio-run on http://localhost:3001
```
`MEMORY_STORE_ID` is the value used in the API path (`mem_store_*` / `mem_service_*`), **not** an `IS…`/`GA…` SID. Auth uses an **API Key/Secret** pair, not the account auth token.

### 2. Flex plugin
```bash
cd flex-plugin
npm install
cp .env.example .env                       # FLEX_APP_FUNCTIONS_BASE_URL=http://localhost:3001
# set your real Account SID in public/appConfig.js
npm start                                  # Flex local shell on http://localhost:3000
```

## Deploy
```bash
cd serverless && npm run deploy            # note the deployed https://…twil.io domain
cd ../flex-plugin
# set FLEX_APP_FUNCTIONS_BASE_URL to the deployed domain in .env
npm run deploy
```
In production, restrict `ALLOWED_ORIGINS` to your Flex domain.

## Data contract

`GET /get-memory` returns:

```ts
interface MemoryResponse {
  identifier: string;                  // the candidate value that matched
  matchedBy: string | null;            // the idType that matched (e.g. 'whatsapp', 'phone', 'email')
  profileId: string | null;            // null = no profile matched
  profileCreatedAt: string | null;
  traits: Record<string, Record<string, unknown>>;  // keyed by Trait Group
  observations: { id; content; createdAt; occurredAt?; conversationIds?; source? }[];
  summaries:    { id; content; createdAt; conversationIds? }[];
  partial?: boolean;                   // one upstream call failed
}
```

## Out of scope (v1)

Read-only display. No agent write-back of observations, no `communications` tab — both are natural follow-ups.

See [flex-plugin/EXECUTION_PLAN.md](flex-plugin/EXECUTION_PLAN.md) for the phased build/verify/deploy checklist.
