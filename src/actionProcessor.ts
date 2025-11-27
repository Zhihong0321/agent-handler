import Ajv from "ajv";
import { ActionRecord, IActionStore, hashAction } from "./actionStore";
import { ActionPayload } from "./types";

const ajv = new Ajv({ allErrors: true, removeAdditional: "failing" });

const actionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "reason"],
  properties: {
    action: { type: "string", minLength: 1 },
    reason: { type: "string", minLength: 1 },
    metadata: { type: "object" },
  },
};

const validateAction = ajv.compile(actionSchema);

const allowedActions: Record<
  string,
  (payload: ActionPayload) => Promise<Record<string, unknown>> | Record<string, unknown>
> = {
  handoff_sales: async () => ({ status: "handoff_triggered" }),
  create_ticket: async (payload) => ({
    ticket_id: `TICKET-${Date.now()}`,
    metadata: payload.metadata || {},
  }),
  api_call: async (payload) => ({
    forwarded: true,
    metadata: payload.metadata || {},
  }),
};

export interface ActionProcessResult {
  status: "success" | "invalid" | "duplicate" | "not_allowed" | "error";
  action?: ActionPayload;
  record?: ActionRecord;
  error?: string;
  rawOutput: string;
}

export class ActionProcessor {
  constructor(private store: IActionStore, private maxRetries = 1, private backoffMs = 300) {}

  async process(rawOutput: string, customerId: string): Promise<ActionProcessResult> {
    let parsed: ActionPayload | null = null;
    let attempts = 0;
    let lastError: string | undefined;

    while (attempts <= this.maxRetries) {
      attempts += 1;
      try {
        parsed = this.parseRaw(rawOutput);
        break;
      } catch (err) {
        lastError = (err as Error).message;
        if (attempts <= this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, this.backoffMs));
        }
      }
    }

    if (!parsed) {
      return { status: "invalid", error: lastError, rawOutput };
    }

    if (!this.isAllowed(parsed.action)) {
      return { status: "not_allowed", action: parsed, error: "action not allowlisted", rawOutput };
    }

    const hash = hashAction(parsed);
    const existing = await this.store.findByHash(hash);
    if (existing) {
      return { status: "duplicate", action: parsed, record: existing, rawOutput };
    }

    try {
      const handler = allowedActions[parsed.action];
      const result = await handler(parsed);
      const record = await this.store.save({
        customerId,
        action: parsed.action,
        reason: parsed.reason,
        metadata: parsed.metadata,
        hash,
        status: "completed",
        result,
      });
      return { status: "success", action: parsed, record, rawOutput };
    } catch (err) {
      const record = await this.store.save({
        customerId,
        action: parsed.action,
        reason: parsed.reason,
        metadata: parsed.metadata,
        hash,
        status: "failed",
        result: { error: (err as Error).message },
      });
      return { status: "error", action: parsed, record, error: (err as Error).message, rawOutput };
    }
  }

  private parseRaw(raw: string): ActionPayload {
    const jsonStr = extractJson(raw);
    const candidate: unknown = JSON.parse(jsonStr);
    const valid = validateAction(candidate);
    if (!valid) {
      throw new Error(ajv.errorsText(validateAction.errors));
    }
    return candidate as unknown as ActionPayload;
  }

  private isAllowed(action: string) {
    return Boolean(allowedActions[action]);
  }
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  throw new Error("no JSON object found in output");
}
