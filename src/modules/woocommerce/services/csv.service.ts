import fs from 'fs';
import path from 'path';
import { WCOrder } from '../types/woocommerce';
import { Tienda } from '../../../types/tienda';

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  // Reemplaza comas por espacios y elimina comillas para asegurar una estructura fija por comas
  return value.toString().replace(/,/g, ' ').replace(/"/g, '').trim();
}

function toRow(values: (string | number | null | undefined)[]): string {
  return values.map(escapeCsv).join(',');
}

export function generateOrderCsvs(order: WCOrder, tienda: Tienda, suffix?: string): void {
  const dir = tienda.pedidos_dir;
  const envio = order.shipping_lines?.[0]?.method_title ?? '';
  const costo_envio = order.shipping_lines?.[0]?.total ?? '0';
  const lugar_retiro = order.shipping_lines?.[0]?.meta_data
    ?.find(m => m.key === 'pickup_location')?.value ?? '';
  ensureDir(dir);

  const dni = order.meta_data?.find(m => m.key === 'billing_dni')?.value ?? '';
  const fileSuffix = suffix ? `_${suffix}` : '';

  // ── Pedido principal ──────────────────────────────────────
  const pedidoPath = path.join(dir, `cabecera_${order.number}.csv`);

  const pedidoRow = toRow([
    order.number,
    order.status,
    order.payment_method_title,
    `${order.billing?.first_name} ${order.billing?.last_name}`,
    order.billing?.email,
    dni,
    order.billing?.phone,
    order.billing?.address_1,
    order.billing?.city,
    order.billing?.state,
    order.billing?.postcode,
    order.discount_total,
    order.total,
    envio,        
    costo_envio,   
    lugar_retiro,
  ]);

  fs.writeFileSync(pedidoPath, pedidoRow, 'utf8');

  // ── Items ─────────────────────────────────────────────────
  const itemsPath = path.join(dir, `articulos_${order.number}.csv`);

  const itemsRows = order.line_items.map(item =>
    toRow([order.number, item.sku, item.name, item.quantity, item.price, item.total])
  );

  fs.writeFileSync(itemsPath, itemsRows.join('\n'), 'utf8');
  console.log(`[CSV][${tienda.nombre}] Pedido ${order.number} generado.`);
}