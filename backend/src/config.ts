import "dotenv/config";
import { z } from "zod";

const optional = z.string().trim().min(1).optional().catch(undefined);

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z.string().default(""),
  DB_USER: optional,
  DB_PASSWORD: optional,
  DB_CONNECT_STRING: optional,
  DB_WALLET_DIR: optional,
  DB_WALLET_PASSWORD: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Só nomes de campos são exibidos, nunca valores.
  console.error("Configuração inválida:", Object.keys(parsed.error.flatten().fieldErrors));
  process.exit(1);
}

const d = parsed.data;
const corsOrigins = d.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

if (d.NODE_ENV === "production" && corsOrigins.length === 0) {
  console.error("CORS_ORIGINS é obrigatório em produção.");
  process.exit(1);
}

export const config = {
  env: d.NODE_ENV,
  port: d.PORT,
  host: d.HOST,
  corsOrigins,
  db:
    d.DB_USER && d.DB_PASSWORD && d.DB_CONNECT_STRING
      ? {
          user: d.DB_USER,
          password: d.DB_PASSWORD,
          connectString: d.DB_CONNECT_STRING,
          walletDir: d.DB_WALLET_DIR,
          walletPassword: d.DB_WALLET_PASSWORD,
        }
      : null,
};
