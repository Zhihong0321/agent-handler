import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  perplexityBaseUrl:
    process.env.PERPLEXITY_BASE_URL ||
    "https://ee-perplexity-wrapper-production.up.railway.app",
  defaultAccount: process.env.DEFAULT_ACCOUNT_NAME || null,
  defaultCollectionUuid: process.env.DEFAULT_COLLECTION_UUID || null,
  answerOnly: process.env.ANSWER_ONLY === "false" ? false : true,
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
    max: Number(process.env.RATE_LIMIT_MAX || 30),
  },
  streaming: {
    chunkSize: Number(process.env.STREAMING_CHUNK_SIZE || 800),
  },
  postgresUrl: process.env.POSTGRES_URL || process.env.DATABASE_URL || null,
  postgresMaxConnections: Number(process.env.POSTGRES_MAX_CONNECTIONS || 10),
};
