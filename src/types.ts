export type QueryMode = "auto" | "writing" | "coding" | "research";
export type AgentType = "perplexity" | "gemini";

export interface SessionState {
  customerId: string;
  accountName: string;
  collectionUuid?: string | null;
  backendUuid?: string | null;
  frontendContextUuid?: string | null;
  language: string;
  mode: QueryMode;
  sources: string;
  lastQuery?: string;
  state: SessionStatus;
  updatedAt: number;
}

export type SessionStatus = "bot" | "human_handoff" | "ticket_open";

export interface AgentConfig {
  id: string;
  name: string;
  agentType: AgentType;
  accountName: string;
  collectionUuid?: string | null;
  model?: string | null;
  mode?: QueryMode;
  sources?: string;
  language?: string;
  answerOnly?: boolean;
  incognito?: boolean;
  systemPrompt?: string | null; // For custom GEMS
}

export interface MessageRequest {
  customerId: string;
  message: string;
  accountName?: string;
  collectionUuid?: string;
  frontendContextUuid?: string;
  backendUuid?: string;
  mode?: QueryMode;
  language?: string;
  sources?: string;
  model?: string;
  resetSession?: boolean;
  parseActions?: boolean;
  answerOnly?: boolean;
  agentId?: string;
}

export interface QueryResponsePayload {
  answer?: string;
  backend_uuid?: string;
  frontend_context_uuid?: string;
  [key: string]: unknown;
}

export interface WhatsAppWebhookPayload {
  WaId?: string;
  From?: string;
  Body?: string;
  ProfileName?: string;
  accountName?: string;
  collectionUuid?: string;
  mode?: QueryMode;
  language?: string;
  sources?: string;
  resetSession?: boolean;
}

export interface ActionPayload {
  action: string;
  reason: string;
  metadata?: Record<string, unknown>;
}
