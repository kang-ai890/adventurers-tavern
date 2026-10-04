import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z
    .string()
    // 默认指向本地 PGlite 数据库（npm run db:local），开箱即用
    .default("postgresql://postgres:postgres@127.0.0.1:5432/postgres?connection_limit=1&pgbouncer=true"),
  JWT_SECRET: z.string().default("dev-secret-change-me"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("*"),
});

export const env = envSchema.parse(process.env);
