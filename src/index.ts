import Fastify from "fastify";
import formbody from "@fastify/formbody";
import { createParser, EventSourceMessage } from "eventsource-parser";
import { readFile } from "fs/promises";
import path from "path";
import { config } from "./config";
import { ISessionStore, sessionStorePromise } from "./sessionStore";
import { perplexityClient } from "./perplexityClient";
import {
  MessageRequest,
  QueryResponsePayload,
  WhatsAppWebhookPayload,
  SessionState,
} from "./types";
import { RateLimiter } from "./rateLimiter";
import { getPool } from "./db";
import { actionStorePromise } from "./actionStore";
import { ActionProcessor } from "./actionProcessor";
import { collectDbMetrics } from "./metrics";
import { logMessage, MessageRole } from "./messageLog";
import { buildActionPrompt } from "./prompt";
import { agentStorePromise } from "./agentStore";

const rateLimiter = new RateLimiter(config.rateLimit.max, config.rateLimit.windowMs);

async function buildServer() {
  const fastify = Fastify({
    logger: true,
  });

  const sessionStore = await sessionStorePromise;
  const actionStore = await actionStorePromise;
  const actionProcessor = new ActionProcessor(actionStore);
  const agentStore = await agentStorePromise;

  await fastify.register(formbody);

  fastify.get("/health", async () => {
    const dbStatus = await checkDatabase();
    const status = dbStatus.status === "ok" ? "ok" : "degraded";
    return {
      status,
      db: dbStatus,
      store: sessionStore.kind,
      actions: actionStore.kind,
      agents: agentStore.kind,
    };
  });

  fastify.get("/metrics", async () => {
    const sessions = await Promise.resolve(sessionStore.all());
    const dbCounts = await collectDbMetrics();
    return {
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      store: sessionStore.kind,
      sessions: Array.isArray(sessions) ? sessions.length : 0,
      rateLimit: config.rateLimit,
      streaming: config.streaming,
      db: await checkDatabase(),
      actionsStore: actionStore.kind,
      agentsStore: agentStore.kind,
      dbCounts,
    };
  });

  fastify.get("/playground", async (_, reply) => {
    const playgroundPath = path.join(__dirname, "..", "public", "index.html");
    const html = await readFile(playgroundPath, "utf8");
    reply.type("text/html").send(html);
  });

  fastify.get("/agents", async (_, reply) => {
    const agentsPath = path.join(__dirname, "..", "public", "agents.html");
    const html = await readFile(agentsPath, "utf8");
    reply.type("text/html").send(html);
  });

  fastify.get("/api/agents", async () => {
    const agents = await Promise.resolve(agentStore.list());
    return { agents };
  });

  fastify.get("/api/wrapper/accounts", async (request, reply) => {
    try {
      const accounts = await perplexityClient.listAccounts();
      return { accounts };
    } catch (err) {
      request.log.error({ err }, "failed to list accounts");
      reply.code(500);
      return { error: "failed to list accounts", detail: (err as Error).message };
    }
  });

  fastify.post("/api/wrapper/accounts/:name/test", async (request, reply) => {
    const name = (request.params as { name: string }).name;
    if (!name) {
      reply.code(400);
      return { error: "account name is required" };
    }
    try {
      const result = await perplexityClient.testAccount(name);
      return { result };
    } catch (err) {
      request.log.error({ err }, "failed to test account");
      reply.code(500);
      return { error: "failed to test account", detail: (err as Error).message };
    }
  });

  fastify.get("/api/wrapper/spaces", async (request, reply) => {
    const accountName = (request.query as { accountName?: string }).accountName;
    try {
      const spaces = await perplexityClient.listCollections(accountName);
      return { spaces };
    } catch (err) {
      request.log.error({ err }, "failed to list spaces");
      reply.code(500);
      return { error: "failed to list spaces", detail: (err as Error).message };
    }
  });

  fastify.post("/api/agents", async (request, reply) => {
    const body = (request.body || {}) as {
      name?: string;
      accountName?: string;
      collectionUuid?: string;
      model?: string;
      mode?: string;
      sources?: string;
      language?: string;
      answerOnly?: boolean;
      incognito?: boolean;
    };
    if (!body.name || !body.accountName) {
      reply.code(400);
      return { error: "name and accountName are required" };
    }
    try {
      const agent = await Promise.resolve(
        agentStore.create({
          name: body.name,
          accountName: body.accountName,
          collectionUuid: body.collectionUuid,
          model: body.model,
          mode: (body.mode as any) || undefined,
          sources: body.sources,
          language: body.language,
          answerOnly: body.answerOnly,
          incognito: body.incognito,
        }),
      );
      return { agent };
    } catch (err) {
      request.log.error({ err }, "failed to create agent");
      reply.code(500);
      return { error: "failed to create agent", detail: (err as Error).message };
    }
  });

  fastify.get("/api/agents/:agentId/test", async (request, reply) => {
    const agentId = (request.params as { agentId: string }).agentId;
    const message = (request.query as { message?: string }).message || "Hello from agent test";
    const agent = await agentStore.get(agentId);
    if (!agent) {
      reply.code(404);
      return { error: "agent not found" };
    }
    try {
      const response = await perplexityClient.querySync({
        q: message,
        accountName: agent.accountName,
        collectionUuid: agent.collectionUuid ?? undefined,
        mode: agent.mode,
        sources: agent.sources,
        language: agent.language,
        answerOnly: agent.answerOnly ?? config.answerOnly,
        model: agent.model,
      });
      return { reply: extractAnswer(response), raw: response };
    } catch (err) {
      request.log.error({ err, agentId }, "agent test failed");
      reply.code(500);
      return { error: "agent test failed", detail: (err as Error).message };
    }
  });

  fastify.get("/api/session/:customerId", async (request) => {
    const customerId = (request.params as { customerId: string }).customerId;
    const session = await sessionStore.get(customerId);
    if (!session) {
      return { error: "session not found" };
    }
    return { session };
  });

  fastify.post("/api/session/:customerId/state", async (request, reply) => {
    const customerId = (request.params as { customerId: string }).customerId;
    const body = request.body as { state?: SessionState["state"] };
    const nextState = body?.state;
    if (!nextState || !["bot", "human_handoff", "ticket_open"].includes(nextState)) {
      reply.code(400);
      return { error: "state must be one of bot|human_handoff|ticket_open" };
    }
    const existing = await sessionStore.get(customerId);
    if (!existing) {
      reply.code(404);
      return { error: "session not found" };
    }
    await sessionStore.upsert(customerId, { state: nextState });
    return { session: await sessionStore.get(customerId) };
  });

  fastify.post<{ Body: MessageRequest }>("/api/message", async (request, reply) => {
    const body = request.body;
    if (!body || !body.customerId || !body.message) {
      reply.code(400);
      return { error: "customerId and message are required" };
    }

    if (!ensureRateLimit(body.customerId, reply, request)) return;

    try {
      const result = await handleSyncQuery(body, request, reply, sessionStore, actionProcessor);
      return result;
    } catch (err) {
      const message = (err as Error).message;
      const status = message.includes("account_name is required") ? 400 : 500;
      request.log.error({ err }, "query failed");
      reply.code(status);
      return { error: status === 400 ? message : "query failed", detail: message };
    }
  });

  fastify.get("/api/query_async", async (request, reply) => {
    const query = request.query as Partial<MessageRequest> & { q?: string };
    const customerId = query.customerId;
    const message = query.message || query.q;

    if (!customerId || !message) {
      reply.code(400);
      return { error: "customerId and message/q are required" };
    }

    if (!ensureRateLimit(customerId, reply, request)) return;

    try {
      await handleAsyncQuery(
        {
          ...query,
          customerId,
          message,
        } as MessageRequest,
        request,
        reply,
        sessionStore,
        actionProcessor,
      );
      return reply;
    } catch (err) {
      const message = (err as Error).message;
      const status = message.includes("account_name is required") ? 400 : 500;
      request.log.error({ err }, "async query failed");
      reply.code(status);
      return { error: status === 400 ? message : "async query failed", detail: message };
    }
  });

  fastify.get("/api/threads", async (request, reply) => {
    const accountName = (request.query as { accountName?: string }).accountName;
    if (!accountName) {
      reply.code(400);
      return { error: "accountName is required" };
    }
    try {
      const threads = await perplexityClient.listThreads(accountName);
      return { threads };
    } catch (err) {
      request.log.error({ err }, "failed to list threads");
      reply.code(500);
      return { error: "failed to list threads", detail: (err as Error).message };
    }
  });

  fastify.get("/api/threads/:slug", async (request, reply) => {
    const accountName = (request.query as { accountName?: string }).accountName;
    const slug = (request.params as { slug: string }).slug;
    if (!accountName || !slug) {
      reply.code(400);
      return { error: "accountName and slug are required" };
    }
    try {
      const thread = await perplexityClient.getThread(accountName, slug);
      return { thread };
    } catch (err) {
      request.log.error({ err }, "failed to fetch thread");
      reply.code(500);
      return { error: "failed to fetch thread", detail: (err as Error).message };
    }
  });

  fastify.post("/api/session/:customerId/thread", async (request, reply) => {
    const customerId = (request.params as { customerId: string }).customerId;
    const body = request.body as {
      frontendContextUuid?: string | null;
      backendUuid?: string | null;
      state?: SessionState["state"];
    };
    const session = await sessionStore.get(customerId);
    if (!session) {
      reply.code(404);
      return { error: "session not found" };
    }
    const next = await sessionStore.upsert(customerId, {
      frontendContextUuid: body.frontendContextUuid ?? null,
      backendUuid: body.backendUuid ?? null,
      state: body.state,
    });
    return { session: next };
  });

  fastify.post("/api/webhooks/whatsapp", async (request, reply) => {
    const payload = (request.body || {}) as WhatsAppWebhookPayload;
    const customerId = payload.WaId || payload.From;
    const message = payload.Body;

    if (!customerId || !message) {
      reply.code(400);
      return { error: "WaId/From and Body are required" };
    }

    if (!ensureRateLimit(customerId, reply, request)) return;

    try {
      const result = await handleSyncQuery(
        {
          customerId,
          message,
          accountName: payload.accountName,
          collectionUuid: payload.collectionUuid,
          mode: payload.mode,
          language: payload.language,
          sources: payload.sources,
          resetSession: payload.resetSession,
        },
        request,
        reply,
        sessionStore,
        actionProcessor,
      );
      return {
        reply: result.reply,
        session: result.session,
        raw: result.raw,
        customerId,
        profileName: payload.ProfileName,
      };
    } catch (err) {
      const message = (err as Error).message;
      const status = message.includes("account_name is required") ? 400 : 500;
      request.log.error({ err }, "whatsapp webhook failed");
      reply.code(status);
      return { error: status === 400 ? message : "query failed", detail: message };
    }
  });

  fastify.post("/api/actions/simulate", async (request, reply) => {
    const body = request.body as { customerId?: string; output?: string };
    if (!body?.customerId || !body?.output) {
      reply.code(400);
      return { error: "customerId and output are required" };
    }
    if (!ensureRateLimit(body.customerId, reply, request)) return;
    const result = await actionProcessor.process(body.output, body.customerId);
    return { result };
  });

  return fastify;
}

async function handleSyncQuery(
  body: MessageRequest,
  request: any,
  reply: any,
  sessionStore: ISessionStore,
  actionProcessor: ActionProcessor,
) {
  if (body.resetSession) {
    await sessionStore.reset(body.customerId);
  }

  const { session, merged } = await prepareSession(body, sessionStore);
  if (!enforceStateGate(session, request, reply, "sync")) {
    return { error: "session is handed off; reset to resume bot" };
  }

  await safeLogMessage(body.customerId, "user", body.message);

  request.log.info(
    {
      event: "query.sync.start",
      customerId: body.customerId,
      accountName: session.accountName,
      collectionUuid: session.collectionUuid,
      mode: session.mode,
      sources: session.sources,
      language: session.language,
    },
    "processing sync query",
  );

  const query = body.parseActions ? buildActionPrompt(body.message) : body.message;

  const response = await perplexityClient.querySync({
    q: query,
    accountName: merged.accountName,
    backendUuid: merged.backendUuid,
    collectionUuid: merged.collectionUuid ?? undefined,
    frontendContextUuid: merged.frontendContextUuid ?? undefined,
    mode: merged.mode,
    sources: merged.sources,
    language: merged.language,
    answerOnly: merged.answerOnly,
    model: merged.model,
  });

  const answer = extractAnswer(response);

  let actionResult = null;
  if (body.parseActions && answer) {
    actionResult = await actionProcessor.process(answer, body.customerId);
    try {
      await applyActionSideEffects(actionResult, sessionStore, body.customerId);
    } catch (err) {
      request.log.error(
        { err, customerId: body.customerId },
        "failed to apply action side-effects (sync)",
      );
    }
    request.log.info(
      {
        event: "action.process",
        customerId: body.customerId,
        status: actionResult.status,
        action: actionResult.action,
        error: actionResult.error,
      },
      "processed action output",
    );
    if (actionResult.action) {
      await safeLogMessage(body.customerId, "action", JSON.stringify(actionResult.action));
    }
  }

  await sessionStore.updateThreadIdentifiers(
    body.customerId,
    (response as QueryResponsePayload).backend_uuid as string | undefined,
    (response as QueryResponsePayload).frontend_context_uuid as string | undefined,
  );

  request.log.info(
    {
      event: "perplexity.response.sync",
      customerId: body.customerId,
      backendUuid: (response as QueryResponsePayload).backend_uuid,
      frontendContextUuid: (response as QueryResponsePayload).frontend_context_uuid,
      raw: response,
      validation: { status: "not_validated" },
    },
    "perplexity sync response",
  );

  if (answer) {
    await safeLogMessage(body.customerId, "assistant", answer);
  }

  return {
    reply: answer ?? "(no answer text returned)",
    session: await sessionStore.get(body.customerId),
    raw: response,
    action: actionResult,
  };
}

async function handleAsyncQuery(
  body: MessageRequest,
  request: any,
  reply: any,
  sessionStore: ISessionStore,
  actionProcessor: ActionProcessor,
) {
  if (body.resetSession) {
    await sessionStore.reset(body.customerId);
  }

  const { session, merged } = await prepareSession(body, sessionStore);
  if (!enforceStateGate(session, request, reply, "async")) {
    return;
  }

  const query = body.parseActions ? buildActionPrompt(body.message) : body.message;

  await safeLogMessage(body.customerId, "user", body.message);

  request.log.info(
    {
      event: "query.async.start",
      customerId: body.customerId,
      accountName: session.accountName,
      collectionUuid: session.collectionUuid,
      mode: session.mode,
      sources: session.sources,
      language: session.language,
    },
    "processing async query",
  );

  const upstream = await perplexityClient.queryAsync({
    q: query,
    accountName: merged.accountName,
    backendUuid: merged.backendUuid,
    collectionUuid: merged.collectionUuid ?? undefined,
    frontendContextUuid: merged.frontendContextUuid ?? undefined,
    mode: merged.mode,
    sources: merged.sources,
    language: merged.language,
    answerOnly: merged.answerOnly,
    model: merged.model,
  });

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  reply.raw.flushHeaders?.();
  reply.hijack();

  const sendEvent = (eventName: string, payload: unknown) => {
    reply.raw.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  let collected = "";
  const chunker = createChunker(config.streaming.chunkSize, (text) => {
    collected = (collected + text).slice(-20000); // cap buffer to last 20k chars
    sendEvent("chunk", { text });
  });

  let completed = false;
  let lastPayload: Record<string, unknown> | null = null;

  const finalize = async (status: "done" | "error", detail?: string) => {
    if (completed) return;
    completed = true;
    chunker.flush();
    let actionResult = null;
    if (status === "done" && body.parseActions && collected) {
      actionResult = await actionProcessor.process(collected, body.customerId);
      try {
        await applyActionSideEffects(actionResult, sessionStore, body.customerId);
      } catch (err) {
        request.log.error(
          { err, customerId: body.customerId },
          "failed to apply action side-effects (async)",
        );
      }
      request.log.info(
        {
          event: "action.process",
          customerId: body.customerId,
          status: actionResult.status,
          action: actionResult.action,
          error: actionResult.error,
        },
        "processed action output (async)",
      );
    }
    if (status === "done") {
      const sessionState = await sessionStore.get(body.customerId);
      sendEvent("done", { session: sessionState, action: actionResult });
    } else {
      sendEvent("error", { message: detail || "stream error" });
    }
    reply.raw.end();

    if (status === "done") {
      const backendUuid =
        (lastPayload as QueryResponsePayload | null)?.backend_uuid || session.backendUuid;
      const frontendContextUuid =
        (lastPayload as QueryResponsePayload | null)?.frontend_context_uuid ||
        session.frontendContextUuid;
      request.log.info(
        {
          event: "perplexity.response.async",
          customerId: body.customerId,
          backendUuid,
          frontendContextUuid,
          raw: lastPayload,
          action: actionResult,
          validation: { status: "not_validated" },
        },
        "perplexity async response complete",
      );
      if (collected) {
        await safeLogMessage(body.customerId, "assistant", collected);
      }
    } else {
      request.log.error(
        { event: "perplexity.response.async", customerId: body.customerId, detail },
        "perplexity async stream error",
      );
    }
  };

  const parser = createParser({
    onEvent(event: EventSourceMessage) {
      const dataStr = event.data ?? "";
      if (dataStr === "[DONE]") {
        void finalize("done");
        return;
      }

      sendEvent("upstream", { data: dataStr });

      try {
        const parsed = JSON.parse(dataStr) as Record<string, unknown>;
        lastPayload = parsed;

        const text = extractAnswer(parsed);
        if (text) {
          chunker.push(text);
        }

        const backendUuid = parsed.backend_uuid as string | undefined;
        const frontendContextUuid = parsed.frontend_context_uuid as string | undefined;
        if (backendUuid || frontendContextUuid) {
          void Promise.resolve(
            sessionStore.updateThreadIdentifiers(body.customerId, backendUuid, frontendContextUuid),
          ).catch((err) => {
            request.log.error({ err, customerId: body.customerId }, "failed to persist thread IDs");
          });
        }
      } catch {
        if (dataStr) {
          chunker.push(dataStr);
        }
      }
    },
  });

  upstream.on("data", (chunk: Buffer) => {
    parser.feed(chunk.toString());
  });

  upstream.on("error", (err: Error) => {
    void finalize("error", err.message);
  });

  upstream.on("end", () => {
    void finalize("done");
  });

  reply.raw.on("close", () => {
    void finalize("error", "client closed connection");
    upstream.destroy();
  });
}

function ensureRateLimit(customerId: string, reply: any, request: any) {
  const result = rateLimiter.check(customerId);
  if (result.allowed) return true;
  const retryAfter = Math.ceil((result.retryAfterMs || 0) / 1000);
  reply.code(429);
  if (retryAfter) {
    reply.header("Retry-After", retryAfter);
  }
  reply.send({ error: "rate limit exceeded", retryAfterMs: result.retryAfterMs });
  request.log.warn(
    { event: "rate.limit", customerId, retryAfterMs: result.retryAfterMs },
    "rate limit hit",
  );
  return false;
}

async function safeLogMessage(customerId: string, role: MessageRole, content: string) {
  try {
    await logMessage({ customerId, role, content });
  } catch (err) {
    console.warn("failed to log message", err);
  }
}

function enforceStateGate(
  session: SessionState,
  request: any,
  reply: any,
  channel: "sync" | "async",
) {
  if (session.state && session.state !== "bot") {
    reply.code(409);
    reply.send({
      error: "session is handed off; reset to resume bot",
      state: session.state,
      channel,
    });
    request.log.warn(
      { event: "state.gate", state: session.state, customerId: session.customerId, channel },
      "blocked request due to handoff state",
    );
    return false;
  }
  return true;
}

async function applyActionSideEffects(
  result: any,
  sessionStore: ISessionStore,
  customerId: string,
) {
  if (!result || result.status !== "success" || !result.action) return;
  const actionName = result.action.action;
  let nextState: SessionState["state"] | null = null;
  if (actionName === "handoff_sales") {
    nextState = "human_handoff";
  } else if (actionName === "create_ticket") {
    nextState = "ticket_open";
  }
  if (nextState) {
    await sessionStore.upsert(customerId, { state: nextState });
  }
}

async function prepareSession(body: MessageRequest, sessionStore: ISessionStore) {
  const existing = await sessionStore.get(body.customerId);
  const agentStore = await agentStorePromise;
  const agent = body.agentId ? await agentStore.get(body.agentId) : null;
  const accountName =
    body.accountName || agent?.accountName || existing?.accountName || config.defaultAccount;
  if (!accountName) {
    throw new Error(
      "account_name is required (provide per request or set DEFAULT_ACCOUNT_NAME)",
    );
  }

  const merged = {
    accountName,
    collectionUuid: body.collectionUuid ?? agent?.collectionUuid ?? null,
    frontendContextUuid: body.frontendContextUuid ?? existing?.frontendContextUuid ?? null,
    backendUuid: body.backendUuid ?? existing?.backendUuid ?? null,
    language: body.language || agent?.language || existing?.language || "en-US",
    mode: body.mode || agent?.mode || existing?.mode || "auto",
    sources: body.sources || agent?.sources || existing?.sources || "web",
    answerOnly: body.answerOnly ?? agent?.answerOnly ?? true,
    model: body.model || agent?.model || null,
  };

  const session = await sessionStore.upsert(body.customerId, {
    accountName,
    collectionUuid: merged.collectionUuid,
    frontendContextUuid: merged.frontendContextUuid,
    backendUuid: merged.backendUuid,
    language: merged.language,
    mode: merged.mode,
    sources: merged.sources,
    lastQuery: body.message,
  });

  return { session, merged };
}

function extractAnswer(payload: unknown) {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const data = payload as Record<string, unknown>;
    if (typeof data.answer === "string") return data.answer;
    if (typeof data.output_text === "string") return data.output_text;
    if (typeof data.data === "object" && data.data && "answer" in (data.data as any)) {
      const nested = (data.data as Record<string, unknown>).answer;
      if (typeof nested === "string") return nested;
    }
  }
  return null;
}

function createChunker(maxSize: number, onChunk: (text: string) => void) {
  let buffer = "";

  const flush = () => {
    if (buffer.length) {
      onChunk(buffer);
      buffer = "";
    }
  };

  return {
    push(text: string) {
      buffer += text;
      while (buffer.length >= maxSize) {
        const chunk = buffer.slice(0, maxSize);
        buffer = buffer.slice(maxSize);
        onChunk(chunk);
      }
    },
    flush,
  };
}

async function start() {
  const server = await buildServer();
  server.listen({ host: config.host, port: config.port }, (err, address) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
    server.log.info(`Server listening at ${address}`);
  });
}

start();

async function checkDatabase() {
  const pool = getPool();
  if (!pool) {
    return { status: "disabled", message: "POSTGRES_URL not configured" };
  }
  try {
    await pool.query("SELECT 1");
    return { status: "ok" };
  } catch (err) {
    return { status: "error", message: (err as Error).message };
  }
}
