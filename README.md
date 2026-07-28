# Conversation Memory — Flex Plugin

A reusable Twilio Flex plugin that surfaces **Twilio Memora** (customer memory) and **Enterprise Knowledge** to agents inside the **CRM container**. For the active task's customer it shows four tabs:

1. **Traits** — grouped by Trait Group
2. **Observations** — newest first, with `source` + timestamp
3. **Summaries** — conversation summaries, newest first, with `source` + timestamp
4. **Search** — one box that semantically searches **this customer's memory** (Memora Recall) *and* your **org knowledge base** (Enterprise Knowledge) in parallel, in two labeled sections. Each result shows its `source` and a `% match` (relevance score). An **optional "Summarize"** action then produces a grounded, cited OpenAI answer over exactly those results.

> The four tabs and search work with **no OpenAI dependency**. Summarize (OpenAI) and the Phase 6 analytics capture are each independently optional — see [What's required vs. optional](#whats-required-vs-optional).

Data is fetched **live** through Twilio Serverless proxies on every task open — nothing is snapshotted into task attributes. Every proxy call is authenticated: the plugin sends the agent's Flex token as `Authorization: Bearer …` and the Functions validate it server-side (`twilio-flex-token-validator`), so the endpoints aren't open.

```
solutions/flex-plugin-conversation-memory/
├── flex-plugin/    # the Flex UI plugin (Twilio Paste, React 17)
├── serverless/     # Twilio Function proxies (Memora + Knowledge + OpenAI + capture; hold the credentials)
└── infra/          # provisioning scripts (agent-productivity: store/operator/intel/CO)
```

## How it works

**Panel load** (Traits / Observations / Summaries):
```
Flex task ─▶ MemoryPanel builds channel-aware identifier candidates
                │  e.g. [{whatsapp, "whatsapp:+55…"}, {phone, "+55…"}]
                ▼
      GET /get-memory?identifiers=<JSON>            (Bearer: agent Flex token)
                ▼  (Serverless — holds API key/secret; validates the token)
      for each candidate → Profiles/Lookup {idType,value}, first match wins
                ▼  profileId
      getProfile (traits) + Recall (observations, summaries) ─▶ JSON ─▶ 3 tabs
```

**Search + Summarize** (4th tab):
```
agent query ─▶ in parallel:
   GET /get-memory?…&query=…&profileId=…   → Recall(query) → top-5 obs + top-3 summaries
   GET /search-knowledge?query=…           → Knowledge v2 Search → top chunks
                ▼  (each result carries a relevance `score`; memory list merged + sorted by score)
      rendered as two sections, cards numbered [M#]/[K#]
                ▼  "Summarize" (agent opts in)
   POST /summarize {query, memory[], knowledge[]}  → OpenAI, grounded + cited → answer
```

## Key design decisions

**Live fetch, not a task-attribute snapshot.** Freshness (CI writes new observations mid/post-conversation), task-attribute size limits, and PII (keeps memory out of broadly-readable task attributes). Credentials can't live in the browser anyway, so a proxy is required regardless.

**Identifiers decided client-side.** The plugin knows the task's channel, so it builds the ordered `{idType, value}` candidate list ([`utils/identifiers.ts`](flex-plugin/src/utils/identifiers.ts)); the proxy stays generic and tries each against Memora's `Lookup`, first match wins. Adding a new id type (email, custom id) is a client-only change. **WhatsApp transition:** for a WhatsApp task it tries the `whatsapp` idType (raw `whatsapp:` address) first, then a `phone` fallback that can come from a *different* attribute — so resolution works even when the address is a Meta username with no embedded phone.

**Grounded summarize (no TAC / no Langflow).** Synthesis is one LLM call: the plugin passes the results it's *already showing* (no re-retrieval), so citations `[M#]`/`[K#]` map to the numbered cards; the prompt forbids invention, requires citations, and short-circuits with no LLM call when there are no sources. (TAC is a channel bridge — there's no channel here — so it'd be a mismatch; Langflow only earns its keep if this becomes a conversational/SE-editable assistant. See the Phase 6 roadmap.)

> **Gotcha baked in:** Memora **Recall honors only camelCase limit params** (`observationsLimit`/`summariesLimit`). snake_case is silently ignored and Recall returns its large default (~25). The TAC SDK's `MemoryClient` has this bug; this proxy uses camelCase.

## Auth

All endpoints validate the agent's Flex token server-side before any upstream call:
- Plugin reads `Flex.Manager.getInstance().user.token` ([`utils/flexToken.ts`](flex-plugin/src/utils/flexToken.ts)) and sends `Authorization: Bearer …`.
- Each Function handles the CORS `OPTIONS` preflight first, then validates with `twilio-flex-token-validator` and 401s anything unauthenticated. (Manual validation, not `functionValidator`, because the latter would 401 the browser preflight.) The token never rides in a URL.

**CORS lock (Phase 7 · A1).** `ALLOWED_ORIGINS` must be your Flex domain(s), not `*` — the proxy returns customer PII. After deploy, `GET /health` should report `{ corsLocked: true }`. Note: Twilio's platform auto-answers the OPTIONS **preflight** with wildcard CORS (so an OPTIONS probe shows `*`), but that carries no data — enforcement is on the actual GET/POST response, where a disallowed origin gets a non-matching `Access-Control-Allow-Origin` and the browser blocks the read. Verify against a GET/POST, not an OPTIONS.

## CRM container placement

`Flex.CRMContainer` is a **vertical** programmable container, so the panel can coexist with a customer's embedded CRM iframe. Control this with the `CRM_MODE` constant at the top of [`ConversationMemoryPlugin.tsx`](flex-plugin/src/ConversationMemoryPlugin.tsx):
- `'add'` (default) — append the panel **above** any customer CRM iframe (both render).
- `'replace'` — the panel takes over the **entire** CRM container.

## Setup

### 1. Serverless proxy
```bash
cd serverless
npm install
cp .env.example .env   # fill the vars below
npm start              # twilio-run on http://localhost:3001
```
Serverless env vars:
- `TWILIO_API_KEY` / `TWILIO_API_SECRET` — API Key/Secret pair (not the account auth token) for Memora + Knowledge REST calls.
- `MEMORY_STORE_ID` — the value used in the API path (`mem_store_*` / `mem_service_*`), **not** an `IS…`/`GA…` SID.
- `TWILIO_MEMORY_PROFILE_TRAIT_GROUPS` — comma-separated trait groups (blank = all).
- `ACCOUNT_SID` / `AUTH_TOKEN` — validate the agent's Flex token (auto-injected when deployed; set locally for `twilio-run`).
- `KNOWLEDGE_BASE_ID` (+ optional `KNOWLEDGE_IDS`) — the Enterprise Knowledge base the Search tab queries. Find it via `GET https://memory.twilio.com/v1/ControlPlane/KnowledgeBases`.
- `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`, default `gpt-4o-mini`) — for the grounded **"Summarize"** action.
- `ALLOWED_ORIGINS` — `*` locally; restrict to your Flex domain in production.

### 2. Flex plugin
```bash
cd flex-plugin
npm install
cp .env.example .env    # FLEX_APP_FUNCTIONS_BASE_URL=http://localhost:3001 (or the deployed domain)
cp public/appConfig.example.js public/appConfig.js   # then set your real Account SID (gitignored)
npm start               # Flex local shell on http://localhost:3000
```
`FLEX_APP_FUNCTIONS_BASE_URL` is build-time inlined — restart `npm start` if you change it. A local plugin can point at the **deployed** serverless too (CORS `*` allows it).

### What's required vs. optional

The **core** panel — Traits, Observations, Summaries, and Search (memory + knowledge) — needs only the Memora + Knowledge vars above. Two pieces are **independently optional**, for customers who want "just search and traits":

- **Summarize (OpenAI).** The grounded "Summarize" action is the *only* OpenAI dependency. Leave `OPENAI_API_KEY` unset and everything else is unaffected — `/summarize` just refuses that one action. A build-time flag (`FLEX_APP_ENABLE_SUMMARIZE`) that hides the button entirely for OpenAI-averse customers is a small, isolated add — see [Roadmap](#roadmap).
- **Agent-productivity capture (Phase 6).** Entirely fire-and-forget and best-effort: if `infra/agent-productivity/` isn't provisioned (or the `AGENT_*` serverless vars are unset), captures simply no-op and the agent experience is unchanged. No CO/CI infra, no OpenAI — pure observability, off by default until you provision it.

## Endpoints & data contracts

All require `Authorization: Bearer <agent Flex token>`.

**`GET /get-memory?identifiers=<JSON>[&query=…][&profileId=…]`** — panel load + semantic memory search. `query` runs Recall semantically (top 5 obs / 3 summaries) and skips traits; `profileId` skips the identifier Lookup.
```ts
interface MemoryResponse {
  identifier: string;                  // candidate value that matched
  matchedBy: string | null;            // idType that matched ('whatsapp' | 'phone' | 'email' | …)
  profileId: string | null;            // null = no profile matched
  profileCreatedAt: string | null;
  traits: Record<string, Record<string, unknown>>;                 // keyed by Trait Group
  observations: { id; content; createdAt; occurredAt?; conversationIds?; source?; score? }[];
  summaries:    { id; content; createdAt; occurredAt?; conversationIds?; source?; score? }[];
  partial?: boolean;                   // one upstream call failed
}
```

**`GET /search-knowledge?query=…[&top=5]`** — Enterprise Knowledge **v2** search.
```ts
interface KnowledgeSearchResponse {
  query: string;
  chunks: { content: string; score?: number; knowledgeId?: string }[];
}
```

**`POST /summarize`** — grounded OpenAI synthesis over the results the plugin passes in.
```ts
// body: { query, memory: [{content, source?, score?}], knowledge: [{content, score?}] }
interface SummarizeResponse { answer: string; model: string | null; grounded: boolean }
```

**`POST /capture-turn`** — agent-productivity side-channel (Phase 6). Fire-and-forget from the browser after each search/summarize; records the agent↔assistant turn into a **dedicated, isolated** CO conversation so a CI operator can score it. The agent is the **CUSTOMER** participant (CHAT address = Worker SID, keyed by a **custom `workerSid` identifier**), so a `GROUP_BY_PROFILE` config enforces **one open conversation per agent** — sessions are CO-native (a duplicate create 409s with the open id; no Sync), and the CO CHAT `closed` timeout ends the session. See [Agent productivity](#agent-productivity-phase-6).

## Agent productivity (Phase 6)

An **observability side-channel**: every search and summarize is captured into an **agent-dedicated** CO configuration + Memory Store (fully isolated from customer memory and the AI agent's webhook), grouped into per-agent **sessions**, and scored by a **Custom GenAI operator** ("Agent Assist Session Insights": topics, answered/unanswered counts, knowledge gaps, quality). Those operator results flow to **CIRL** — treated as a black box (CIRL keys on the operator's **displayName**, so keep it stable).

**Sessions are CO-native — no Sync.** The agent is a `CUSTOMER` participant (CHAT address = Worker SID), so a `GROUP_BY_PROFILE` config resolves it to the agent profile and enforces one open conversation per agent: capture-turn POSTs a conversation and, if one is already open, CO **409s with that conversation's id** (`"Address mapping already exists on conversation conv_conversation_…"`) — that's the find; the POST is the create. The CHAT `closed` timeout (`SESSION_IDLE_MINUTES`) ends the session → `CONVERSATION_END` fires the operator **once per session**. When the session times out the mapping frees and the next POST starts a fresh one.

Provision the Twilio side (once) from [`infra/agent-productivity/`](infra/agent-productivity/) — `npm install` then `npm run create:all` (store → operator → intel config → CO config); paste the printed ids into `serverless/.env`. See [`infra/agent-productivity/agent-assist-operators.md`](infra/agent-productivity/agent-assist-operators.md) for the operator spec. The capture is entirely fire-and-forget: if the endpoint or provisioning isn't set up, the agent's search/summarize experience is unaffected.

## Deploy
```bash
cd serverless && npm run deploy            # note the deployed https://…twil.io domain
cd ../flex-plugin
# set FLEX_APP_FUNCTIONS_BASE_URL to the deployed domain in .env
npm run deploy -- --patch --bypass-validation --changelog "…"   # version bump; bypasses the channelType warning
twilio flex:plugins:release --plugin plugin-conversation-memory@<version> --name "…" --description "…"
```
Set the serverless env vars on the deployed service; restrict `ALLOWED_ORIGINS` to your Flex domain.

## Tests
85 total, all green.
```bash
(cd flex-plugin && npm test)   # 33 — identifiers, MemoryPanel, SearchTab, captureTurn, feature flags (jsdom + RTL)
(cd serverless && npm test)    # 52 — get-memory, search-knowledge, summarize, capture-turn, health, CORS + role gating (node; fetch + token-validator mocked)
```
Serverless tests live in `serverless/test/` (not `functions/`) so `twilio-run` never deploys them.

## Roadmap

See [flex-plugin/EXECUTION_PLAN.md](flex-plugin/EXECUTION_PLAN.md) for the full phased plan. Highlights:
- **Phase 6 — Agent Productivity analytics:** ✅ built, deployed, and verified end-to-end. Captures agent↔assistant turns into a *dedicated* CO configuration + CI operator → CIRL dashboard (adoption/effectiveness), CO-native sessions (no Sync), isolated from customer profiles.
- **Feature flags:** `FLEX_APP_ENABLE_SUMMARIZE` (hide the OpenAI Summarize button for customers who want search + traits only) and `FLEX_APP_ENABLE_CAPTURE` (turn Phase 6 capture on/off) — both small, isolated build-time toggles. See [What's required vs. optional](#whats-required-vs-optional).
- **Phase 7 — Hardening:** lock `ALLOWED_ORIGINS`, request timeouts, client-side cache, i18n, `channelType`→`conversationType`.

Out of scope today: agent write-back of observations, a `communications` tab.
