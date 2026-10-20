import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { checkDb } from "./db.js";
import { registerProductRoutes } from "./products.js";
import { AppError, mapOracleError, oracleInfo } from "./errors.js";
import { registerAdminProductRoutes, type AdminRouteOptions } from "./adminProducts.js";

export type BuildOptions = {
  /** Sem isso, as rotas administrativas novas não são registradas (comportamento atual preservado). */
  admin?: AdminRouteOptions;
  /** Destino dos logs (testes capturam para verificar que não vazam dados sensíveis). */
  logStream?: NodeJS.WritableStream;
};

export async function buildApp(opts: BuildOptions = {}) {
  const app = Fastify({
    logger: {
      level: config.env === "production" ? "info" : "debug",
      redact: ["req.headers.authorization", "req.headers.cookie"],
      ...(opts.logStream && { stream: opts.logStream }),
    },
    trustProxy: config.env === "production",
    bodyLimit: 1_000_000,
    genReqId: () => randomUUID(),
  });

  await app.register(helmet);
  await app.register(cors, { origin: config.corsOrigins, credentials: true, exposedHeaders: ["x-request-id"] });

  app.addHook("onSend", async (req, reply) => { reply.header("x-request-id", req.id); });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const mapped = mapOracleError(err);
    let status: number, code: string, message: string, fields: Record<string, string> | undefined;
    if (mapped) ({ status, code, message, fields } = mapped);
    else if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      status = err.statusCode; code = status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" : "VALIDATION"; message = err.message;
    } else { status = 500; code = "INTERNAL"; message = "Erro interno"; }
    // Log seguro: sem body, token, preços ou SQL; só códigos.
    const log = { requestId: req.id, route: req.routeOptions?.url, method: req.method, adminId: req.adminId, status, code, ...oracleInfo(err) };
    if (status >= 500) req.log.error(log, "request failed");
    else req.log.info(log, "request rejected");
    reply.status(status).send({ error: message, code, requestId: req.id, ...(fields && { fields }) });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: "Não encontrado", code: "NOT_FOUND", requestId: req.id }));

  app.get("/api/v1/health", async (_req, reply) => {
    const db = await checkDb();
    const ok = db.status === "ok";
    return reply.status(ok ? 200 : 503).send({ status: ok ? "ok" : "degraded", db, time: new Date().toISOString() });
  });

  await registerProductRoutes(app);
  if (opts.admin) await registerAdminProductRoutes(app, opts.admin);

  return app;
}

export { AppError };
