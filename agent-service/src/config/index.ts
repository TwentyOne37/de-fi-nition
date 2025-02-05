import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

export const DEFAULT_EXPIRATION_DAYS = 30;

const configSchema = z.object({
  PORT: z.string().default("3000"),
  MONGODB_URI: z.string(),
  COVALENT_API_KEY: z.string(),
  CRYPTOPANIC_API_KEY: z.string(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

export type Config = z.infer<typeof configSchema>;

let config: Config;
try {
  config = configSchema.parse(process.env);
} catch (error) {
  console.error("Configuration validation failed:", error);
  process.exit(1);
}

export default config;
