import { Pool } from "pg";

export const pool = new Pool({
  host: "localhost",
  port: 5434,
  user: "post",
  password: "2",
  database: "a",
  max: 10
});
