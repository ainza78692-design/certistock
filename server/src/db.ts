import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
type QueryResultRow = pg.QueryResultRow;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DB_POOL_SIZE ?? 10),
});

export type DbClient = pg.PoolClient;

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
