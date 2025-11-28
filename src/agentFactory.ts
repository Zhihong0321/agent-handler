import { AgentConfig, AgentType, QueryMode } from "./types";
import { perplexityClient, QueryParams } from "./perplexityClient";
import { geminiClient, GeminiQueryParams, GeminiChatResponse } from "./geminiClient";
import { Readable } from "node:stream";

export interface UnifiedQueryParams {
  message: string;
  customerId: string;
  sessionId?: string | null;
  parseActions?: boolean;
}

export interface UnifiedResponse {
  reply: string;
  sessionId?: string | null;
  raw: any;
  backendUuid?: string | null;
  frontendContextUuid?: string | null;
}

export class AgentFactory {
  static getClient(agentType: AgentType) {
    return agentType === "gemini" ? geminiClient : perplexityClient;
  }

  static mapToPerplexityParams(agent: AgentConfig, params: UnifiedQueryParams): QueryParams {
    const query = params.parseActions ? this.buildActionPrompt(params.message) : params.message;
    
    return {
      q: query,
      accountName: agent.accountName,
      collectionUuid: agent.collectionUuid ?? null,
      frontendContextUuid: params.sessionId ?? null,
      answerOnly: agent.answerOnly ?? true,
      mode: agent.mode || "auto",
      model: agent.model || null,
      sources: agent.sources || "web",
      language: agent.language || "en-US",
      incognito: agent.incognito ?? false,
    };
  }

  static mapToGeminiParams(agent: AgentConfig, params: UnifiedQueryParams): GeminiQueryParams {
    const message = params.parseActions ? this.buildActionPrompt(params.message) : params.message;
    
    // Convert perplexity mode/system to Gemini system prompt
    let systemPrompt = "";
    if (agent.mode === "writing") {
      systemPrompt = "You are in writing mode. Focus on well-structured, coherent writing.";
    } else if (agent.mode === "coding") {
      systemPrompt = "You are in coding mode. Provide code examples and technical solutions.";
    } else if (agent.mode === "research") {
      systemPrompt = "You are in research mode. Provide detailed, factual information with sources.";
    }
    
    // Note: For custom GEMS, systemPrompt should be passed directly from agent config
    // Check if agent has custom GEMS (stored in agent's systemPrompt or mode field)
    if (agent.mode && agent.mode.startsWith('gem://')) {
      systemPrompt = agent.mode; // Use GEMS URL directly
    }

    return {
      message,
      accountId: agent.accountName,
      sessionId: params.sessionId || null, // Explicitly pass null for new sessions
      model: agent.model || "gemini-2.5-flash",
      systemPrompt: systemPrompt || null,
    };
  }

  static extractGeminiAnswer(response: GeminiChatResponse): string {
    return response.response || "";
  }

  static mapGeminiResponse(response: GeminiChatResponse): UnifiedResponse {
    return {
      reply: this.extractGeminiAnswer(response),
      sessionId: response.session_id || null,
      raw: response,
      backendUuid: null, // Gemini doesn't use this concept
      frontendContextUuid: response.session_id || null,
    };
  }

  static mapPerplexityResponse(response: any): UnifiedResponse {
    let answer = null;
    if (typeof response === "string") {
      answer = response;
    } else if (typeof response === "object") {
      const data = response as Record<string, unknown>;
      if (typeof data.answer === "string") {
        answer = data.answer;
      } else if (typeof data.output_text === "string") {
        answer = data.output_text;
      } else if (typeof data.content === "object" && data.content && "answer" in (data.content as any)) {
        const nested = (data.content as Record<string, unknown>).answer;
        if (typeof nested === "string") answer = nested;
      } else if (typeof data.data === "object" && data.data && "answer" in (data.data as any)) {
        const nested = (data.data as Record<string, unknown>).answer;
        if (typeof nested === "string") answer = nested;
      }
    }

    return {
      reply: answer || "(no answer text returned)",
      sessionId: (response as any).frontend_context_uuid || null,
      raw: response,
      backendUuid: (response as any).backend_uuid || null,
      frontendContextUuid: (response as any).frontend_context_uuid || null,
    };
  }

  static async executeQuery(agent: AgentConfig, params: UnifiedQueryParams): Promise<UnifiedResponse> {
    const client = this.getClient(agent.agentType);
    
    if (agent.agentType === "gemini") {
      const geminiParams = this.mapToGeminiParams(agent, params);
      const response = await client.querySync(geminiParams);
      return this.mapGeminiResponse(response);
    } else {
      const perplexityParams = this.mapToPerplexityParams(agent, params);
      const response = await client.querySync(perplexityParams);
      return this.mapPerplexityResponse(response);
    }
  }

  static async executeQueryAsync(agent: AgentConfig, params: UnifiedQueryParams): Promise<Readable> {
    const client = this.getClient(agent.agentType);
    
    if (agent.agentType === "gemini") {
      const geminiParams = this.mapToGeminiParams(agent, params);
      return await client.queryAsync(geminiParams);
    } else {
      const perplexityParams = this.mapToPerplexityParams(agent, params);
      return await client.queryAsync(perplexityParams);
    }
  }

  static async testAgent(agent: AgentConfig, testMessage: string = "Hello from agent test"): Promise<any> {
    const client = this.getClient(agent.agentType);
    
    if (agent.agentType === "gemini") {
      const result = await client.testAccount(agent.accountName);
      return { result };
    } else {
      const result = await client.testAccount(agent.accountName);
      return { result };
    }
  }

  static async listAgentAccounts(agentType: AgentType): Promise<any> {
    const client = this.getClient(agentType);
    return await client.listAccounts();
  }

  private static buildActionPrompt(message: string): string {
    // This should match the existing buildActionPrompt from prompt.ts
    // For now, keeping it simple - you may want to import the actual function
    return `You are an AI assistant that can perform actions. When responding to user requests, if you need to perform an action, format it as JSON:
    
    {
      "action": "action_name",
      "reason": "why this action is needed",
      "metadata": {}
    }
    
    User message: ${message}`;
  }
}
