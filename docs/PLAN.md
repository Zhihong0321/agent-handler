# Perplexity Agent Plan (Supervisor View)

Guiding rules:
- Do not blame code for schema drift; fix Perplexity Space instructions first. Log raw output + validation status.
- Preserve thread IDs every turn (`backend_uuid`, `frontend_context_uuid`); never drop session continuity.
- Wrapper lacks native function-calling; emulate via validated JSON + allowlisted handlers.
- Prefer small, reviewable steps; checkpoint at each phase.

## Phase 0 — Baseline (done)
- [x] Fastify backend scaffold with `/api/message`, in-memory session store, Perplexity client (sync).
- [x] Playground UI at `/playground` for local testing.
- [x] Env config + defaults (`DEFAULT_ACCOUNT_NAME`, optional collection UUID).

## Phase 1 — Streaming & Channel Wiring
Pre-req: Baseline running locally.
- [ ] Add SSE handling for `/api/query_async`; buffer/chunk for channel limits.
- [ ] Expose WhatsApp-compatible webhook reusing message flow.
- [ ] Basic per-customer rate limiting and structured request logging.

## Phase 2 — Durable State & Observability
Pre-req: Phase 1 deployed or validated locally.
- [ ] Select Postgres (primary) and Redis (optional cache).
- [ ] Schema design checkpoint: customers, sessions, thread refs (backend/frontend UUIDs), actions, tickets, handoffs, configs (accounts/spaces).
- [ ] Migrate session/history storage to Postgres; keep in-memory as fallback for dev.
- [ ] Health/metrics endpoints; structured logs capturing raw model output + validation result per turn.

## Phase 3 — Tool/Action Layer (Function-Calling Mimic)
Pre-req: Phase 2 schema in place.
- [ ] Define JSON schema for actions `{ action: "...", reason, metadata }` (handoff_sales, create_ticket, api_call, etc.).
- [ ] Implement ajv validation + allowlisted handler registry.
- [ ] Idempotency: hash action params, prevent duplicate tickets/calls; store outcomes.
- [ ] State gates: bot vs human_handoff vs ticket_open; block Perplexity calls when handed off until released.
- [ ] Retry with backoff (respect rate limits) on validation failures; log raw outputs when still invalid.
- [ ] Prompt pack with schema + examples; enforce “JSON-only for actions, otherwise plain text.”

## Phase 4 — Human Handoff & Ticketing
Pre-req: Action layer present.
- [ ] Handoff handler to notify humans (Slack/WhatsApp group) and lock session.
- [ ] Ticket creation handler (external API), store `ticket_id`, confirm to user; retry/backoff on failure.
- [ ] Confirmation guard for critical/destructive actions; fall back to text if validation fails.

## Phase 5 — Dashboard / Frontend
Pre-req: Postgres schema live.
- [ ] Admin UI to view sessions, threads, actions, tickets, handoff status.
- [ ] Config management: account/space mapping, action schemas, handler toggles, rate limits.
- [ ] Auth + audit log for admin actions.
- [ ] Playground upgrades: toggle sync/streaming; show parsed action JSON + validation status; simulate handoff/tickets; inspect/reset session state.

## Operational Notes
- Log everything needed for drift debug: raw model reply, validation pass/fail, chosen handler, session IDs, thread IDs.
- Keep retries bounded; never spam the wrapper—respect rate limits.
- When model output is invalid: (1) retry once with backoff if allowed; (2) if still invalid, surface in logs and respond gracefully without breaking session.
- Keep changes minimal when issues arise; consult user to adjust Perplexity instructions before changing code.
