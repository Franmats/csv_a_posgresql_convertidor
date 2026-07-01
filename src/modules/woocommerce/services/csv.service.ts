import fs from 'fs';
import path from 'path';
import { WCOrder } from '../types/woocommerce';
import { Tienda } from '../../../types/tienda';

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = value.toString();
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toRow(values: (string | number | null | undefined)[]): string {
  return values.map(escapeCsv).join(',');
}

export function generateOrderCsvs(order: WCOrder, tienda: Tienda): void {
  const dir = tienda.pedidos_dir;
  ensureDir(dir);

  const dni = order.meta_data?.find(m => m.key === 'billing_dni')?.value ?? '';

  // ── Pedido principal ──────────────────────────────────────
  const pedidoPath = path.join(dir, `pedido_${order.number}.csv`);
  const pedidoHeaders = [
    'numero_pedido', 'estado', 'medio_pago', 'nombre', 'email',
    'dni', 'telefono', 'direccion', 'ciudad', 'provincia',
    'codigo_postal', 'descuento', 'total',
  ];

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
  ]);

  fs.writeFileSync(pedidoPath, [pedidoHeaders.join(','), pedidoRow].join('\n'), 'utf8');

  // ── Items ─────────────────────────────────────────────────
  const itemsPath = path.join(dir, `pedido_${order.number}_items.csv`);
  const itemsHeaders = ['numero_pedido', 'sku', 'nombre', 'cantidad', 'precio_unitario', 'subtotal'];

  const itemsRows = order.line_items.map(item =>
    toRow([order.number, item.sku, item.name, item.quantity, item.price, item.total])
  );

  fs.writeFileSync(itemsPath, [itemsHeaders.join(','), ...itemsRows].join('\n'), 'utf8');
  console.log(`[CSV][${tienda.nombre}] Pedido ${order.number} generado.`);
}