import { Pool } from "pg";
import { ensureTables, getPool } from "./db";
import { AgentConfig } from "./types";
import crypto from "crypto";

export interface IAgentStore {
  kind: "postgres" | "memory";
  list(): Promise<AgentConfig[]> | AgentConfig[];
  get(id: string): Promise<AgentConfig | null> | AgentConfig | null;
  create(agent: Omit<AgentConfig, "id"> & { id?: string }): Promise<AgentConfig> | AgentConfig;
}

class MemoryAgentStore implements IAgentStore {
  kind: "memory" = "memory";
  private store = new Map<string, AgentConfig>();

  list() {
    return Array.from(this.store.values());
  }

  get(id: string) {
    return this.store.get(id) || null;
  }

  create(agent: Omit<AgentConfig, "id"> & { id?: string }) {
    const id = agent.id || crypto.randomUUID();
    const toSave: AgentConfig = { 
      ...agent, 
      id,
      agentType: agent.agentType || "perplexity" // Default to perplexity for backward compatibility
    };
    this.store.set(id, toSave);
    return toSave;
  }
}

class PostgresAgentStore implements IAgentStore {
  kind: "postgres" = "postgres";
  constructor(private pool: Pool) {}

  async list() {
    const res = await this.pool.query("SELECT * FROM agents ORDER BY updated_at DESC");
    return res.rows.map(mapRow);
  }

  async get(id: string) {
    const res = await this.pool.query("SELECT * FROM agents WHERE id = $1 LIMIT 1", [id]);
    const row = res.rows[0];
    return row ? mapRow(row) : null;
  }

  async create(agent: Omit<AgentConfig, "id"> & { id?: string }) {
    const id = agent.id || crypto.randomUUID();
    const res = await this.pool.query(
      `
        INSERT INTO agents (
          id, name, agent_type, account_name, collection_uuid, model, mode, sources, language, answer_only, incognito, system_prompt, description,
          created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          agent_type = EXCLUDED.agent_type,
          account_name = EXCLUDED.account_name,
          collection_uuid = EXCLUDED.collection_uuid,
          model = EXCLUDED.model,
          mode = EXCLUDED.mode,
          sources = EXCLUDED.sources,
          language = EXCLUDED.language,
          answer_only = EXCLUDED.answer_only,
          incognito = EXCLUDED.incognito,
          system_prompt = EXCLUDED.system_prompt,
          description = EXCLUDED.description,
          updated_at = NOW()
        RETURNING *;
      `,
      [
        id,
        agent.name,
        agent.agentType || "perplexity", // Default to perplexity for backward compatibility
        agent.accountName,
        agent.collectionUuid ?? null,
        agent.model ?? null,
        agent.mode ?? null,
        agent.sources ?? null,
        agent.language ?? null,
        agent.answerOnly ?? null,
        agent.incognito ?? null,
        agent.systemPrompt ?? null, // For custom GEMS
        agent.description ?? null,
      ],
    );
    return mapRow(res.rows[0]);
  }
}

function mapRow(row: any): AgentConfig {
  return {
    id: row.id,
    name: row.name,
    agentType: row.agent_type || "perplexity", // Default to perplexity for backward compatibility
    accountName: row.account_name,
    collectionUuid: row.collection_uuid,
    model: row.model,
    mode: row.mode,
    sources: row.sources,
    language: row.language,
    answerOnly: row.answer_only ?? undefined,
    incognito: row.incognito ?? undefined,
    systemPrompt: row.system_prompt, // For custom GEMS
    description: row.description,
  };
}

async function createAgentStore(): Promise<IAgentStore> {
  const pool = getPool();
  if (pool) {
    try {
        await ensureTables();
      return new PostgresAgentStore(pool);
    } catch (err) {
      console.error("FATAL: Agent store init failed (Postgres configured but failed to connect/init)", err);
      // We throw to prevent silent fallback to memory in production, which causes data loss.
      // Check POSTGRES_URL and connectivity.
      throw err;
    }
  }
  console.warn("WARN: POSTGRES_URL not set. Using In-Memory Agent Store. DATA WILL BE LOST on restart.");
  return new MemoryAgentStore();
}

export const agentStorePromise = createAgentStore();
