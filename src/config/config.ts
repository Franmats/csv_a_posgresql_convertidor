import dotenv from "dotenv";
import path from "path";

const env = process.env.NODE_ENV || "development";

if (env !== "production") {
  dotenv.config({
    path: path.resolve(process.cwd(), `.env.${env}`),
  });
}

export interface Config {
  port: string;
  db_name: string;
  db_port: string;
  db_host: string;
  db_pass: string;
  db_user: string;
  privatekey: string;
  api_url: string;
  dashboard_password: string;
  dashboard_secret: string;
  wc_webhook_secret: string;
}

const config: Config = {
  port: process.env.PORT ?? '8000',
  db_name: process.env.DB_NAME ?? '',
  db_port: process.env.DB_PORT ?? '5432',
  db_host: process.env.DB_HOST ?? 'localhost',
  db_pass: process.env.DB_PASS ?? '',
  db_user: process.env.DB_USER ?? '',
  privatekey: process.env.PRIVATE_KEY ?? '',
  api_url: process.env.API_URL ?? '',
  dashboard_password: process.env.DASHBOARD_PASSWORD ?? 'admin',
dashboard_secret: process.env.DASHBOARD_SECRET ?? 'dashboard_secret',
wc_webhook_secret: process.env.WC_WEBHOOK_SECRET ?? ''
};

export default config;