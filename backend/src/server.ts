import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { config } from "./config.js";
import { initDb, pingDb, closeDb } from "./db.js";

const app = Fastify({ logger: { level: config.NODE_ENV === "production" ? "info" : "debug" } });

await app.register(helmet);
await app.register(cors, { origin: config.corsOrigins });

app.setErrorHandler((err, req, reply) => {
  req.log.error(err);
  const status = err.statusCode ?? 500;
  reply.status(status).send({ error: status >= 500 ? "Erro interno" : err.message });
});

app.get("/api/v1/health", async (_req, reply) => {
  let db = false;
  try {
    db = await pingDb();
  } catch (e) {
    app.log.warn({ err: e }, "Falha no ping do banco");
  }
  return reply.status(db ? 200 : 503).send({ status: db ? "ok" : "degraded", db, time: new Date().toISOString() });
});

try {
  await initDb();
} catch (e) {
  app.log.error({ err: e }, "Não foi possível conectar ao Oracle; API sobe em modo degradado");
}

const shutdown = async () => {
  await app.close();
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
