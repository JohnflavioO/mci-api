import oracledb from "oracledb";
import { config } from "./config.js";

let pool: oracledb.Pool | undefined;

export async function initDb() {
  pool = await oracledb.createPool({
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    connectString: config.DB_CONNECT_STRING,
    ...(config.DB_WALLET_DIR && {
      configDir: config.DB_WALLET_DIR,
      walletLocation: config.DB_WALLET_DIR,
      walletPassword: config.DB_WALLET_PASSWORD,
    }),
    poolMin: 1,
    poolMax: 5,
  });
}

export async function pingDb(): Promise<boolean> {
  if (!pool) return false;
  const conn = await pool.getConnection();
  try {
    await conn.execute("SELECT 1 FROM DUAL");
    return true;
  } finally {
    await conn.close();
  }
}

export async function closeDb() {
  await pool?.close(10);
}
