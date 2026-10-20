import type oracledb from "oracledb";
import { withConnection } from "./db.js";

/** Tudo ou nada: commit só ao final; qualquer erro faz rollback antes de propagar. */
export async function withTransaction<T>(fn: (c: oracledb.Connection) => Promise<T>): Promise<T> {
  return withConnection(async (conn) => {
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback().catch(() => undefined);
      throw e;
    }
  });
}
