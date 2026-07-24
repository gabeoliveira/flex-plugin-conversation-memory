# Conversation Memory — Flex Plugin

A reusable Twilio Flex plugin that surfaces **Twilio Memora** (customer memory) and **Enterprise Knowledge** to agents inside the **CRM container**. For the active task's customer it shows four tabs:

1. **Traits** — grouped by Trait Group
2. **Observations** — newest first, with `source` + timestamp
3. **Summaries** — conversation summaries, newest first, with `source` + timestamp
4. **Search** — one box that semantically searches **this customer's memory** (Memora Recall) *and* your **org knowledge base** (Enterprise Knowledge) in parallel, in two labeled sections. Each result shows its `source` and a `% match` (relevance score). A **"Summarize"** action then produces a grounded, cited OpenAI answer over exactly those results.

Data is fetched **live** through Twilio Serverless proxies on every task open — nothing is snapshotted into task attributes. Every proxy call is authenticated: the plugin sends the agent's Flex token as `Authorization: Bearer …` and the Functions validate it server-side (`twilio-flex-token-validator`), so the endpoints aren't open.

```
solutions/flex-plugin-conversation-memory/
├── flex-plugin/    # the Flex UI plugin (Twilio Paste, React 17)
└── serverless/     # Twilio Function proxies (Memora + Knowledge + OpenAI; hold the credentials)
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

All three endpoints validate the agent's Flex token server-side before any upstream call:
- Plugin reads `Flex.Manager.getInstance().user.token` ([`utils/flexToken.ts`](flex-plugin/src/utils/flexToken.ts)) and sends `Authorization: Bearer …`.
- Each Function handles the CORS `OPTIONS` preflight first, then validates with `twilio-flex-token-validator` and 401s anything unauthenticated. (Manual validation, not `functionValidator`, because the latter would 401 the browser preflight.) The token never rides in a URL.

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
55 total, all green.
```bash
(cd flex-plugin && npm test)   # 23 — identifiers, MemoryPanel, SearchTab (jsdom + RTL)
(cd serverless && npm test)    # 32 — get-memory, search-knowledge, summarize (node; fetch + token-validator mocked)
```
Serverless tests live in `serverless/test/` (not `functions/`) so `twilio-run` never deploys them.

## Roadmap

See [flex-plugin/EXECUTION_PLAN.md](flex-plugin/EXECUTION_PLAN.md) for the full phased plan. Highlights:
- **Phase 6 (fast follow) — Agent Productivity analytics:** capture agent↔assistant turns into a *dedicated* CO configuration + CI operators → CIRL dashboard (adoption/effectiveness). Isolated from customer profiles; the `summarize` turn already emits the shape it needs.
- **Phase 7 — Hardening:** lock `ALLOWED_ORIGINS`, request timeouts, client-side cache, i18n, `channelType`→`conversationType`.

Out of scope today: agent write-back of observations, a `communications` tab.
