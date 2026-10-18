import { config } from "./config.js";
import { buildApp } from "./app.js";
import { closeDb } from "./db.js";

const app = await buildApp();

if (!config.db) app.log.warn("Oracle não configurado; /api/v1/health retornará 503");

let closing = false;
const shutdown = async (signal: string) => {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, "Encerrando");
  await app.close();
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.port, host: config.host });
