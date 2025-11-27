# Deployment (Railway-friendly)

## Environment
Required:
- `PORT` (Railway sets this automatically)
- `PERPLEXITY_BASE_URL` (wrapper URL)
- `DEFAULT_ACCOUNT_NAME` (optional but recommended fallback)
- `POSTGRES_URL` (Railway attached Postgres)

Optional:
- `DEFAULT_COLLECTION_UUID`
- `ANSWER_ONLY`
- `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`
- `STREAMING_CHUNK_SIZE`
- `POSTGRES_MAX_CONNECTIONS`

## Railway with Docker
- This repo ships with a `Dockerfile` optimized for Railway:
  - Uses `node:20-slim`
  - Runs `npm ci`, `npm run build`, then prunes dev deps
  - Starts with `node dist/index.js` and exposes `3000`
- In Railway, choose “Deploy from repo” and “Dockerfile” as the deployment method. No custom commands needed.

## Railway without Docker (Nixpacks)
- Build command: `npm run build`
- Start command: `node dist/index.js`
- Ensure `PORT` and `PERPLEXITY_BASE_URL` are set; attach Postgres and Railway will inject `DATABASE_URL` (map that to `POSTGRES_URL`).

## Health/Monitoring
- Health endpoint: `GET /health`
- Metrics/status: `GET /metrics`

## Notes
- App binds to `0.0.0.0` and respects `PORT`.
- Postgres is optional; app will fall back to in-memory if `POSTGRES_URL` isn’t reachable, but Railway should provide it for persistence.
