# Perplexity Wrapper API (quick reference for agents)

Base URL: `https://ee-perplexity-wrapper-production.up.railway.app`

Key endpoints:
- `GET /health` — health check.
- `GET /api/query_sync` — JSON reply (non-streaming).
- `GET /api/query_async` — SSE streaming reply.
- `GET /api/threads` — list threads (`account_name` required).
- `GET /api/threads/{slug}` — get thread by slug.
- `GET /api/collections` — list collections (Spaces).
- `GET /api/collections/{collection_slug}` — collection details.
- `GET /api/collections/{collection_slug}/threads` — collection threads.
- Accounts: `POST /api/account/add`, `POST /api/account/update/{account_name}`, `GET /api/account/list`, `POST /api/account/test/{account_name}`, `DELETE /api/account/{account_name}`.

Query parameters (sync/async):
- Required: `q` (query), `account_name`.
- Thread continuity: `backend_uuid` (prior response), `frontend_context_uuid` (thread id), optional `frontend_uuid`.
- Spaces: `collection_uuid` (to target a Custom Space/Collection).
- Output shaping: `answer_only` (default true in our app config).
- Mode: `mode` (`auto|writing|coding|research`), `model` (string, optional).
- Sources: `sources` (`web`, `scholar`, `social`, comma-separated).
- Locale/privacy: `language` (default `en-US`), `incognito` (bool).

Notes for agents:
- Always preserve and resend both `backend_uuid` and `frontend_context_uuid` when continuing a conversation; otherwise threads break.
- Wrapper has no native function-calling; emulate tools via model JSON output + validator on our side (see PLAN.md).
- Treat model outputs as fallible: log raw responses, validate, retry with backoff within rate limits; do not assume code bugs when schema drifts—adjust Perplexity instructions instead.
- Use sync (`/api/query_sync`) for simple requests; use async (`/api/query_async`) for streaming/long answers and buffer for downstream channel limits.

Sample sync call:
`GET /api/query_sync?q=Hello&account_name=acct1&collection_uuid=space123&backend_uuid=prev123&frontend_context_uuid=thread456&mode=auto&sources=web&language=en-US&answer_only=true`

## Action layer (function-calling mimic)
- Optional request flag: `parseActions=true` on `/api/message` or `/api/query_async` to attempt JSON action parsing from the model answer.
- Optional: `answerOnly=true|false` to override global config for a call.
- Action schema: `{ "action": "handoff_sales|create_ticket|api_call", "reason": "...", "metadata": { ... } }`
- Idempotency: actions are hashed; duplicates return the prior record.
- Test locally: `POST /api/actions/simulate` with body `{ "customerId": "cust1", "output": "<model text containing JSON>" }` to validate/execute without calling the model.
- Handoff state gates: once an action sets state to `human_handoff` or `ticket_open`, bot replies are blocked until you reset. Use `POST /api/session/{customerId}/state` with body `{ "state": "bot" }` to release.

## Threads
- `GET /api/threads?accountName=...` - list threads from Perplexity wrapper.
- `GET /api/threads/{slug}?accountName=...` - fetch thread detail.
- `POST /api/session/{customerId}/thread` - set/override `frontendContextUuid` (thread id) and `backendUuid` for the active session; clears backend_uuid when you provide `null`.
