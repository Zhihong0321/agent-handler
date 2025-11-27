import axios, { AxiosInstance } from "axios";
import { config } from "./config";
import { QueryMode, QueryResponsePayload } from "./types";
import { Readable } from "stream";

export interface QueryParams {
  q: string;
  accountName: string;
  backendUuid?: string | null;
  collectionUuid?: string | null;
  frontendUuid?: string | null;
  frontendContextUuid?: string | null;
  answerOnly?: boolean;
  mode?: QueryMode;
  model?: string | null;
  sources?: string;
  language?: string;
  incognito?: boolean;
}

export class PerplexityClient {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: 45_000,
    });
  }

  async querySync(params: QueryParams): Promise<QueryResponsePayload> {
    const response = await this.client.get("/api/query_sync", {
      params: {
        q: params.q,
        account_name: params.accountName,
        backend_uuid: params.backendUuid || undefined,
        collection_uuid: params.collectionUuid || undefined,
        frontend_uuid: params.frontendUuid || undefined,
        frontend_context_uuid: params.frontendContextUuid || undefined,
        answer_only: params.answerOnly ?? config.answerOnly,
        mode: params.mode || "auto",
        model: params.model || undefined,
        sources: params.sources || "web",
        language: params.language || "en-US",
        incognito: params.incognito ?? false,
      },
    });
    return response.data as QueryResponsePayload;
  }

  async queryAsync(params: QueryParams): Promise<Readable> {
    const response = await this.client.get("/api/query_async", {
      params: {
        q: params.q,
        account_name: params.accountName,
        backend_uuid: params.backendUuid || undefined,
        collection_uuid: params.collectionUuid || undefined,
        frontend_uuid: params.frontendUuid || undefined,
        frontend_context_uuid: params.frontendContextUuid || undefined,
        answer_only: params.answerOnly ?? config.answerOnly,
        mode: params.mode || "auto",
        model: params.model || undefined,
        sources: params.sources || "web",
        language: params.language || "en-US",
        incognito: params.incognito ?? false,
      },
      responseType: "stream",
    });

    return response.data as Readable;
  }

  async listThreads(accountName: string) {
    const response = await this.client.get("/api/threads", {
      params: { account_name: accountName },
    });
    return response.data;
  }

  async getThread(accountName: string, slug: string) {
    const response = await this.client.get(`/api/threads/${encodeURIComponent(slug)}`, {
      params: { account_name: accountName },
    });
    return response.data;
  }

  async listAccounts() {
    const response = await this.client.get("/api/account/list");
    return response.data;
  }

  async testAccount(accountName: string) {
    const response = await this.client.post(`/api/account/test/${encodeURIComponent(accountName)}`);
    return response.data;
  }

  async listCollections(accountName?: string) {
    const response = await this.client.get("/api/collections", {
      params: {
        account_name: accountName || undefined,
      },
    });
    return response.data;
  }
}

export const perplexityClient = new PerplexityClient(config.perplexityBaseUrl);
