import axios, { AxiosInstance } from "axios";
import { config } from "./config";
import { Readable } from "node:stream";

export interface GeminiQueryParams {
  message: string;
  accountId?: string | null;
  sessionId?: string | null;
  model?: string | null;
  systemPrompt?: string | null;
  // Note: Custom GEMS should be passed as systemPrompt starting with "gem://"
}

export interface GeminiChatResponse {
  response: string;
  model: string;
  session_id?: string | null;
  candidates_count: number;
  thoughts?: string | null;
  images?: any[];
  metadata?: Record<string, any>;
  success: boolean;
}

export class GeminiClient {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: 45_000,
    });
  }

  async querySync(params: GeminiQueryParams): Promise<GeminiChatResponse> {
    // For new sessions, use /chat/new to ensure session is created
    const endpoint = params.sessionId ? `/chat/${params.sessionId}` : "/chat/new";
    const response = await this.client.post(endpoint, {
      message: params.message,
      account_id: params.accountId || config.defaultGeminiAccount || "primary",
      model: params.model || "gemini-2.5-flash",
      system_prompt: params.systemPrompt,
    });
    return response.data as GeminiChatResponse;
  }

  async queryAsync(params: GeminiQueryParams): Promise<Readable> {
    // For new sessions, use /chat/new to ensure session is created
    const endpoint = params.sessionId ? `/chat/${params.sessionId}` : "/chat/new";
    const response = await this.client.post(endpoint, {
      message: params.message,
      account_id: params.accountId || config.defaultGeminiAccount || "primary",
      model: params.model || "gemini-2.5-flash",
      system_prompt: params.systemPrompt,
    }, {
      responseType: "stream",
    });
    return response.data as Readable;
  }

  async createChatSession(): Promise<{ session_id: string }> {
    const response = await this.client.post("/chat/new");
    return response.data;
  }

  async deleteChatSession(sessionId: string): Promise<void> {
    await this.client.delete(`/chat/${sessionId}`);
  }

  async listAccounts() {
    const response = await this.client.get("/accounts");
    return response.data;
  }

  async testAccount(accountId: string) {
    try {
      const response = await this.client.post("/chat", {
        message: "Hello, this is a test message.",
        account_id: accountId,
      });
      return { status: "ok", response: response.data };
    } catch (err) {
      return { 
        status: "error", 
        error: (err as Error).message,
        details: (err as any)?.response?.data
      };
    }
  }

  async listModels() {
    const response = await this.client.get("/models");
    return response.data;
  }

  async getAccountStatus() {
    const response = await this.client.get("/status/accounts");
    return response.data;
  }
}

export const geminiClient = new GeminiClient(config.geminiBaseUrl);
