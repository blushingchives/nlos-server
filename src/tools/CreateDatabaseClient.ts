import { Pool } from "pg";

export async function CreateDatabaseClient(DATABASE_CONNECTION_STRING) {
  const client = new Pool({
    idleTimeoutMillis: 0,
    connectionTimeoutMillis: 0,
    connectionString: DATABASE_CONNECTION_STRING,
  });
  return await client.connect();
}
