# Execution Plan — Conversation Memory Flex Plugin

Phased checklist to build, verify, and ship the plugin. Status reflects the
scaffold committed in this folder.

## Phase 0 — Scaffold (✅ done)

| Item | File | Status |
|---|---|---|
| Plugin loader | `src/index.ts` | ✅ |
| Plugin entry + `CRM_MODE` (add/replace) | `src/ConversationMemoryPlugin.tsx` | ✅ |
| Identifier candidate builder (channel-aware) | `src/utils/identifiers.ts` | ✅ |
| Timestamp / conversation-id formatters | `src/utils/format.ts` | ✅ |
| Browser fetch wrapper + TS contract | `src/api/fetchMemory.ts` | ✅ |
| Panel root (withTaskContext, state machine, refresh) | `src/components/MemoryPanel/MemoryPanel.tsx` | ✅ |
| Tabs shell (3 tabs + count badges) | `src/components/MemoryPanel/MemoryTabs.tsx` | ✅ |
| Traits / Observations / Summaries tabs | `.../TraitsTab.tsx`, `ObservationsTab.tsx`, `SummariesTab.tsx` | ✅ |
| Shared loading/empty/error/partial states | `.../states.tsx` | ✅ |
| Serverless proxy (generic candidate-loop) | `../serverless/functions/get-memory.js` | ✅ |
| Config (`package.json`, `tsconfig`, `.env.example`, `appConfig.js`) | — | ✅ |
| `tsc --noEmit` clean | — | ✅ |
| Focused test suite (29 tests, all green) | see below | ✅ |

> Paste note: this Paste core (15.3.1) does not ship `description-list` or a
> refresh icon as deep imports, so Traits uses manual label/value rows and the
> refresh control is a text button. Revisit if Paste is upgraded.

## Tests (focused suite)

Proportionate coverage on the two logic-dense units, plus light panel smoke
tests. Pure rendering of the tabs is intentionally not exhaustively tested.

| Suite | Where | Run | What it covers |
|---|---|---|---|
| `identifiers` (13) | `flex-plugin` (jsdom) | `cd flex-plugin && npm test` | channel→idType mapping, whatsapp-first ordering, username + separate phone, email channel, prefix inference, non-string skip, dedupe, `describeIdentifier` |
| `MemoryPanel` (4) | `flex-plugin` (jsdom) | `cd flex-plugin && npm test` | no-identifier empty state, fetch→tabs success, channel-aware candidate-list passthrough, error state + Refresh |
| `get-memory` (12) | `serverless` (node) | `cd serverless && npm test` | 400/500/502, candidate order + first-match, fallthrough, arbitrary idType passthrough, malformed-skip, no-match empty 200, `partial`, `normalizeTraits`, CORS preflight |

Run both: `(cd flex-plugin && npm test) && (cd serverless && npm test)`.

Notes:
- The serverless test mocks `global.fetch` and stubs `Twilio.Response`; tests
  live in `serverless/test/` (NOT `functions/`) so `twilio-run` never deploys them.
- `MemoryPanel` tests mock `@twilio/flex-ui` (`withTaskContext` → pass-through),
  the `fetchMemory` module, and stub `MemoryTabs` to keep the smoke tests light.

## Phase 1 — Local serverless

1. `cd serverless && npm install`
2. `cp .env.example .env`; fill `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `MEMORY_STORE_ID`, `TWILIO_MEMORY_PROFILE_TRAIT_GROUPS`.
3. `npm start` (twilio-run → `http://localhost:3001`).
4. Smoke test (use `-G --data-urlencode` so curl encodes the JSON for you):
   - Phone: `curl -G 'http://localhost:3001/get-memory' --data-urlencode 'identifiers=[{"idType":"phone","value":"+5511999999999"}]'`
   - WhatsApp (whatsapp-first, phone fallback): `curl -G 'http://localhost:3001/get-memory' --data-urlencode 'identifiers=[{"idType":"whatsapp","value":"whatsapp:+5511999999999"},{"idType":"phone","value":"+5511999999999"}]'`
   - Unknown identifier → `200` with `profileId:null` and empty arrays.
   - Missing/empty `identifiers` → `400`.

## Phase 2 — Local plugin

1. `cd flex-plugin && npm install`
2. `.env`: `FLEX_APP_FUNCTIONS_BASE_URL=http://localhost:3001`.
3. Put a **real Account SID** in `public/appConfig.js`.
4. `npm start` → Flex shell at `http://localhost:3000`.
5. `npm run typecheck` and `npm test` stay green.

## Phase 3 — In-Flex verification

1. Route a test task whose attributes carry `channelType` plus
   `customerAddress`/`from` set to an identifier present in your Memora store
   (test both an SMS phone task and a `whatsapp:`-prefixed WhatsApp task).
2. Accept the task, open the CRM panel. Confirm:
   - Panel renders (above the CRM iframe in `add` mode).
   - Three tabs populate; label counts match.
   - Traits grouped by Trait Group; Observations/Summaries show timestamps and source badges.
3. State coverage:
   - Unknown identifier → empty states.
   - Kill the serverless process mid-load → error state, then **Refresh** retries.
   - Rapidly switch between two tasks → no stale render (AbortController).
4. Set `CRM_MODE = 'replace'` in `ConversationMemoryPlugin.tsx`, rebuild, and confirm the panel takes the whole container.

## Phase 4 — Deploy (✅ done)

1. `cd serverless && npm run deploy`; note the `https://…twil.io` domain. → `conversation-memory-serverless-6026-dev.twil.io`.
2. `flex-plugin/.env`: set `FLEX_APP_FUNCTIONS_BASE_URL` to that domain. ✅
3. `cd flex-plugin && npm run deploy` (used `--bypass-validation` for the non-blocking `channelType` warning). → `plugin-conversation-memory@0.0.1` deployed.
4. `twilio flex:plugins:release --plugin plugin-conversation-memory@0.0.1 …` → config `FJ1acb929b5756396fb60d2134268c4cad` enabled. ✅
5. Set the serverless env vars on the deployed service (`TWILIO_API_KEY` / `TWILIO_API_SECRET` / `MEMORY_STORE_ID` / trait groups).
6. Restrict `ALLOWED_ORIGINS` (see Phase 5).

> Subsequent deploys must bump the version: `npm run deploy -- --patch|--minor|--major` (0.0.1 is taken).

## Phase 5 — Unified Memory + Knowledge Search (✅ built; token validation included)

Turn the panel from a static viewer into a **search tool**. A 4th "Search" tab has one
box that queries the customer's memory *and* the org knowledge base in parallel and
renders two labeled sections — "This customer" (personal) vs "Knowledge base" (org-wide).
The Flex **token validator** was wired into *all* Function endpoints in the same pass
(they were open before). A **grounded "Summarize" action** was then added (see below).
Tests: 55 total (32 serverless + 23 plugin), all green. Knowledge search uses the
**v2** endpoint (`/v2/KnowledgeBases/{kb}/Search`); memory search returns the top-5
matches (not all); every result shows `source` + a `% match` (Recall/Search `score`).

**Grounded summarize (`summarize.js`, OpenAI):** a "Summarize results" button asks OpenAI
to answer the query using ONLY the displayed results — the plugin passes them in (no
re-retrieval), so citations `[M#]`/`[K#]` map to the numbered result cards. Grounded +
cited prompt, short-circuits with no LLM call when there are no sources. Config:
`OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`). This is the retrieval→one-LLM-call
path (no TAC, no Langflow) — see the Phase 6 note on why.

Remaining to go live: fill `KNOWLEDGE_BASE_ID` (done) + `OPENAI_API_KEY` on the serverless
service, redeploy serverless + plugin, tighten `ALLOWED_ORIGINS`.

**Token flow:** the plugin reads `Flex.Manager.getInstance().user.token` and sends it as
`Authorization: Bearer …`; each Function validates it with `twilio-flex-token-validator`
(after the CORS `OPTIONS` preflight) and 401s anything unauthenticated. GET semantics kept;
token never in a URL.

**Two searches, different scope:**
- **Memory (per-customer)** — needs the resolved profile. Recall already does hybrid
  lexical+semantic search; just pass a `query`.
- **Knowledge (org-wide)** — independent of the customer; needs a Knowledge Base id.
  Works even when no customer profile matched.

### Serverless
- **Extend `get-memory.js`**: accept optional `query`; when present, add it to the Recall
  body (semantic search) and raise `observationsLimit` (≤ 20). Optimization: accept an
  optional `profileId` so a search skips the Lookup step (the initial `MemoryResponse`
  already returns `profileId` — pass it back).
  `POST /v1/Stores/{store}/Profiles/{profileId}/Recall` `{ query, observationsLimit, summariesLimit }`.
- **New `search-knowledge.js`**: `POST https://knowledge.twilio.com/v1/KnowledgeBases/{KB_ID}/Search`
  `{ query, top: ≤20, knowledgeIds?: [...] }` → returns ranked `chunks[]` (`{ content, … }`).
  Basic auth, same credentials. Config: `KNOWLEDGE_BASE_ID` (+ optional `KNOWLEDGE_IDS`),
  host `knowledge.twilio.com` (management/search host differs from memory's).
- Both new/extended endpoints go **behind the Flex Token Validator** (see Phase 7 P1) —
  they return PII / proprietary content.

### Plugin
- **New api client**: `searchMemory({ identifiers | profileId, query })` (reuse `fetchMemory`
  with a `query`) and `searchKnowledge({ query })`.
- **New `SearchTab.tsx`** (4th tab, e.g. "Search"): a Paste `Input` + submit; on submit fire
  both searches in parallel (AbortController, debounce). Render two labeled sections —
  memory results reuse the observation/summary card; knowledge results use a new chunk card.
- **Empty/degraded states**: no profile → memory section shows "no customer profile", knowledge
  section still works; no results → per-section empty; error isolates to its own section.

### Tests
- Serverless: `search-knowledge` (query→chunks, empty, upstream error, missing `KNOWLEDGE_BASE_ID`);
  `get-memory` query + `profileId`-skip-lookup passthrough.
- Plugin: `SearchTab` (submit fires both, two sections render, per-section empty/error).

### Prereqs
- `KNOWLEDGE_BASE_ID` (KB exists with indexed content — confirmed). List KBs to grab the id:
  `GET https://memory.twilio.com/v1/ControlPlane/KnowledgeBases`.

## Phase 6 — Agent Productivity analytics (CO + CI) — ✅ built

An **observability side-channel** on top of the assist: capture how agents use the
assistant, run Conversation Intelligence on it, report via CIRL (black box).

**What shipped:**
- **`infra/agent-productivity/`** — provisioning scripts (`npm run create:all`): dedicated
  Memory Store, Custom GenAI operator "Agent Assist Session Insights", Intelligence config
  (webhook → CIRL), agent CO config (`GROUP_BY_PROFILE`, CHAT `closed` timeout = session boundary,
  `conversationsV1Bridge` off, `memoryExtractionEnabled`) — plus the operator spec doc. **No Sync.**
- **`serverless/functions/capture-turn.js`** — token-validated; **CO-native session model, no Sync**:
  the agent is a **`CUSTOMER`** participant (CHAT address = Worker SID), so `GROUP_BY_PROFILE` enforces
  one open conversation per agent profile. capture-turn POSTs a conversation with the agent (CUSTOMER)
  + assistant (AI_AGENT) inline; on **201** it's a new session (participant ids inline), on **409** CO
  hands back the open conversation's id in the error (`"Address mapping already exists on conversation
  conv_conversation_…"`) → fetch its participants and insert there. Each turn = two threaded
  communications (CUSTOMER query + AI_AGENT answer, top-level `channelId` = Worker SID). **Never
  closes** — the CO idle timeout fires `CONVERSATION_END` → one CI run per session. Race guard: an
  insert failure (reused conv closed mid-turn) retries once; the freed mapping makes the next POST 201 a
  fresh session. `ensureAgentProfile` still lookup-or-creates the agent profile by the custom `workerSid`
  idType for enrichment (email/name/team) + identifiers.
- **Plugin** — `api/captureTurn.ts` (browser fire-and-forget, `keepalive`, errors swallowed) fired from
  `SearchTab` on **every search** (compact results) and **every summarize** (the answer);
  `getAgentTraits()` sends display enrichment.
- **Tests:** +10 (9 serverless capture-turn + 1 plugin) → 65, then **+9 for the feature flags**
  (4 `config` + 4 `captureTurn` + 1 SearchTab hidden-button) → **74 total, all green.**
- **Optionality (build-time flags):** `FLEX_APP_ENABLE_SUMMARIZE=false` hides the OpenAI Summarize
  button (panel = memory + knowledge + search, no OpenAI dependency); `FLEX_APP_ENABLE_CAPTURE=false`
  turns off Phase 6 capture. `summarize.js` also degrades to `200 {disabled:true}` when
  `OPENAI_API_KEY` is unset (see [`src/config.ts`](src/config.ts)). Shipped in `@0.0.4`.

**Identity finding:** Memora's *default* idTypes are `chat, email, phone, pushUserID, whatsapp`, but
**custom idTypes are supported** via the store's **Identity Resolution Settings** (`PUT
/IdentityResolutionSettings`; `normalization: 'trim'` keeps a raw `WK…` intact). The agent is keyed by
a custom **`workerSid`** identifier: `create-agent-memory-store.ts` registers it and promotes an
`Agent.workerSid` trait to it (plus an `Agent.chatId` trait → the built-in `chat` idType, same value,
so the CHAT participant resolves to the same profile). `capture-turn` lookup-or-creates that profile.

Original design context (still accurate):

**Why this is *not* TAC or Langflow:** TAC is a channel bridge (voice/WhatsApp/SMS + CO
lifecycle); there is no channel here — a human agent queries a UI. So TAC is a mismatch,
and a plain LLM call (Phase 5's `summarize`) is simpler than a Langflow flow. Langflow
only earns its keep if this becomes an SE-editable or conversational assistant.

**How the capture works (design):**
- **Isolation is non-negotiable** — write to a **separate CO configuration + Memory Store**
  dedicated to agents, with memory extraction pointed away from customer profiles.
  Otherwise you poison customer profiles with "agent asked about X." Biggest risk.
- **API-injected, not a native channel** — CO has no plug-in for new channel adapters;
  push turns in via the Conversations API (`createConversation` + `POST /Communications`,
  the `insertCommunication` pattern), tagged channel `API`/`SYSTEM`/`CHAT`. Set that
  expectation — it's push-based injection, not capture rules.
- **Inversion — the agent IS the "customer":** model the human as a **`CUSTOMER`** participant
  (not `HUMAN_AGENT`) and the assistant as `AI_AGENT`, key the profile on **agent identity** →
  per-agent productivity profiles ("what does this agent lean on the assistant for; who's adopted
  it"). This inversion is load-bearing: only `CUSTOMER` participants resolve to a profile, so it's
  what makes `GROUP_BY_PROFILE` group an agent's turns into one session (and enables the 409-based
  find-or-create that replaced Sync).
- **Custom CI operators** (GenAI): question topic, "answerable from memory/KB?",
  knowledge-gap detection, assistant-helpfulness score. They run **async** on conversation
  close/inactive → near-real-time, not instant.
- **Closes the loop into CIRL** — operator results feed the Conversational Intelligence
  Reporting Layer → a dashboard of AI-assist adoption + effectiveness per agent/team.
- **Honest caveat:** CO+CI is heavier than logging to a table — justified only because you
  want Twilio CI doing the analysis + the native dashboard story (the wow). For raw logs
  alone, skip CO.

Where it plugs in: `summarize.js` (and optionally the search endpoints) fire the CO
side-write after responding to the agent.

## Phase 7 — Hardening & Improvements (roadmap)

### P1 — Security (do before wider rollout; the proxy returns customer PII)

- **Flex Token Validator on all Function endpoints** (`get-memory`, and `search-knowledge` once Phase 5 lands) — the functions are currently open (the URL is the only secret). Validate the agent's Flex token server-side with [`twilio-flex-token-validator`](https://www.npmjs.com/package/twilio-flex-token-validator):
  - Plugin sends the token (`Flex.Manager.getInstance().user.token`) with the request.
  - Function rejects missing/invalid tokens with 401 before any Memora call. Simplest: wrap the handler in `require('twilio-flex-token-validator').functionValidator` (reads `event.Token`, uses the auto-injected `ACCOUNT_SID`/`AUTH_TOKEN`). For manual control, call `TokenValidator(token, sid, authToken)` and read the token from a header.
  - **Token placement tradeoff:** `functionValidator` reads `event.Token` (query/body). To keep the token out of URLs/logs, switch `/get-memory` to **POST** (body) or do manual validation reading an `Authorization`/`Token` **header** (headers live in `event.request.headers`, not `event`). Update CORS allowed headers/methods accordingly.
  - Replaces the old "shared-secret header" idea and is the real fix for the PII-exposure note.
  - Add serverless tests for valid / invalid / missing token.
- **Lock `ALLOWED_ORIGINS`** to the Flex domain (e.g. `https://flex.twilio.com`); drop `*`.
- *(Optional)* **Role gating** — the validated token carries the worker identity/roles; gate memory access to specific roles if required.

### P2 — Robustness

- **Request timeouts** on the serverless `fetch` calls (AbortController + a few seconds) so a slow/hung Memora call returns a clean error instead of spinning the panel.
- **Multiple-profile handling** — `Lookup` can return several profileIds; today we take `[0]`. Decide: surface a "multiple matches" note, or merge; at minimum log it.
- **Auth vs upstream error UX** — distinguish 401 ("session expired — reload Flex") from 502 ("memory service unavailable") in the panel.

### P3 — Performance / UX

- **Client-side cache** (short TTL, keyed by the identifier candidate list) so rapid task-switching doesn't re-hit Memora; **Refresh** bypasses it.
- **"Load more"** for observations/summaries — Recall is capped at 10/5; fetch higher limits on demand.
- **Memory search** — Recall accepts a `query` param; add a search box for agents to semantically query the customer's memory.

### P4 — Product / reusability

- **Externalize UI strings (i18n)** — strings are hardcoded English; the repo ships non-English (pt-BR) demos, so a reusable asset should use a strings map / Flex localization.
- **Optional `communications` tab** — a 4th tab for recent cross-channel messages (dropped earlier for PII/size); make it opt-in.
- **Configurable trait-group display** — order / labels / visibility of trait groups via config.

### Forward-compat / ops

- **`channelType` → `conversationType`** — silences the deploy validator and guards against Flex deprecation. Not a 1:1 swap (`ConversationHelper.conversationType` ≠ raw channel); verify semantics in `identifiers.ts` before switching.
- **Attribute keys / channel map** — verify against real handoff tasks; the key lists + channel map in `identifiers.ts` are the single place to adjust.
