export interface Tienda {
  id: number;
  nombre: string;
  wc_url: string;
  wc_consumer_key: string;
  wc_consumer_secret: string;
  wc_webhook_secret: string;
  csv_watch_dir: string;
  pedidos_dir: string;
  images_dir: string;
  activo: boolean;
  rubro: string | null;
}