import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { config } from "./config.js";
import { checkDb } from "./db.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.env === "production" ? "info" : "debug",
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    trustProxy: config.env === "production",
    bodyLimit: 1_000_000,
  });

  await app.register(helmet);
  await app.register(cors, { origin: config.corsOrigins, credentials: true });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    reply.status(status).send({ error: status >= 500 ? "Erro interno" : err.message });
  });

  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: "Não encontrado" }));

  app.get("/api/v1/health", async (_req, reply) => {
    const db = await checkDb();
    const ok = db.status === "ok";
    return reply.status(ok ? 200 : 503).send({
      status: ok ? "ok" : "degraded",
      db,
      time: new Date().toISOString(),
    });
  });

  return app;
}
