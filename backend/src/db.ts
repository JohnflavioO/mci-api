import oracledb from "oracledb";
import { config } from "./config.js";

export type DbStatus = "ok" | "not_configured" | "unavailable";

let pool: oracledb.Pool | undefined;
let creating: Promise<oracledb.Pool> | undefined;

/** Cria o pool sob demanda; falhas não derrubam a API e são tentadas de novo na próxima chamada. */
async function getPool(): Promise<oracledb.Pool> {
  if (pool) return pool;
  const db = config.db;
  if (!db) throw new Error("DB_NOT_CONFIGURED");
  creating ??= oracledb
    .createPool({
      user: db.user,
      password: db.password,
      connectString: db.connectString,
      ...(db.walletDir && {
        configDir: db.walletDir,
        walletLocation: db.walletDir,
        walletPassword: db.walletPassword,
      }),
      poolMin: 0,
      poolMax: 5,
      connectTimeout: 10,
    })
    .then((p) => (pool = p))
    .finally(() => (creating = undefined));
  return creating;
}

export async function withConnection<T>(fn: (c: oracledb.Connection) => Promise<T>): Promise<T> {
  const conn = await (await getPool()).getConnection();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

export async function checkDb(): Promise<{ status: DbStatus; code?: string }> {
  if (!config.db) return { status: "not_configured" };
  try {
    await withConnection((c) => c.execute("SELECT 1 FROM DUAL"));
    return { status: "ok" };
  } catch (e) {
    // Retorna só o código Oracle (ex.: ORA-12541), nunca a mensagem completa.
    const code = (e as { code?: string }).code;
    return { status: "unavailable", ...(code && { code }) };
  }
}

export async function closeDb() {
  const p = pool;
  pool = undefined;
  await p?.close(10);
}
