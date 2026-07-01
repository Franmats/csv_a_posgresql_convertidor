import { Pool } from "pg";
import config from "./config";

export const pool = new Pool({
  user: config.db_user,
  host: config.db_host,
  database: config.db_name,
  password: config.db_pass,
  port: Number(config.db_port) || 5432,

  // ✅ Render Postgres requiere SSL
  ssl:
    process.env.NODE_ENV === "production"
      ? {  rejectUnauthorized: false }
      : undefined,
});

export async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("🟢 PostgreSQL conectado correctamente.");
  } catch (err) {
    console.error("🔴 Error conectando a PostgreSQL:", err);
  }
}