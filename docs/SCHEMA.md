# Persistence & Schema (Phase 2 draft)

Status: Postgres optional. If `POSTGRES_URL` is unset or unavailable, the server falls back to in-memory session storage. Tables below are created on boot when Postgres is available.

## Tables
- `customers`
  - `customer_id` (pk)
  - `profile_name`
  - `created_at`
- `sessions`
  - `customer_id` (pk, fk -> customers)
  - `account_name`
  - `collection_uuid`
  - `backend_uuid`
  - `frontend_context_uuid`
  - `language`
  - `mode`
  - `sources`
  - `last_query`
  - `handoff_state` (`bot|human_handoff|ticket_open`)
  - `updated_at`
- `messages` (initial history capture; not yet wired in handlers)
  - `id` (pk)
  - `customer_id` (fk -> customers)
  - `role` (`user|assistant|system|action`)
  - `content`
  - `created_at`
- `actions`
  - `id` (pk)
  - `customer_id` (fk -> customers)
  - `action`
  - `reason`
  - `metadata` (jsonb)
  - `hash` (unique idempotency key)
  - `status` (`pending|completed|failed|duplicate`)
  - `result` (jsonb)
  - `created_at`
  - `updated_at`

### Upcoming tables (for tools/actions)
- `actions` - `{ id, customer_id, session_id?, action, reason, metadata, hash, status, created_at }`
- `tickets` - `{ id, customer_id, ticket_id, status, payload, created_at }`
- `handoffs` - `{ id, customer_id, state (bot|human_handoff|ticket_open), channel, created_at }`
- `configs` - per-account/space overrides, rate limits, handler toggles.

## Runtime notes
- On startup, the app attempts to create `customers`, `sessions`, and `messages` tables (no-op if they exist).
- Session store uses Postgres when reachable, otherwise memory only; `/health` reports `db.status`.
- Thread continuity fields (`backend_uuid`, `frontend_context_uuid`) are persisted and reused automatically.
