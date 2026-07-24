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

## Phase 5 — Unified Memory + Knowledge Search (prioritized next)

Turn the panel from a static viewer into a **search tool**. One search box queries
the customer's memory *and* the org knowledge base in parallel and renders two
clearly-labeled sections — "This customer" (personal) vs "Knowledge base" (org-wide).
Both are the same Function-proxy pattern we already use; feasibility confirmed
against the Twilio Customer Memory and Enterprise Knowledge skills.

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
- Both new/extended endpoints go **behind the Flex Token Validator** (see Phase 6 P1) —
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

## Phase 6 — Hardening & Improvements (roadmap)

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
