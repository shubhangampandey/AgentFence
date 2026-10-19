import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  OPA_URL: z.url().default("http://127.0.0.1:8181"),
  SESSION_SECRET: z.string().min(32),
  AUDIT_SIGNING_KEY: z.string().min(32),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  API_PORT: z.coerce.number().int().default(4000),
  GEMINI_ENABLED: z.enum(["true", "false"]).default("false"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  DEMO_ENABLED: z.enum(["true", "false"]).default("false"),
});
export const config = schema.parse(process.env);
if (
  config.NODE_ENV === "production" &&
  (!config.WEB_ORIGIN.startsWith("https://") || config.DEMO_ENABLED === "true")
)
  throw new Error("Production requires HTTPS and DEMO_ENABLED=false");
if (
  config.GEMINI_ENABLED === "true" &&
  (!config.GEMINI_API_KEY || !config.GEMINI_MODEL)
)
  throw new Error("Enabled Gemini requires API key and explicit model");
