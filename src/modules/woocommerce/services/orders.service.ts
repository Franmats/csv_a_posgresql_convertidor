import { Tienda } from '../../../types/tienda';
import { WCOrder } from '../types/woocommerce';

const getBaseUrl = (tienda: Tienda) => `${tienda.wc_url}/wp-json/wc/v3`;

const getHeaders = (tienda: Tienda) => ({
  'Content-Type': 'application/json',
  'Authorization': 'Basic ' + Buffer.from(
    `${tienda.wc_consumer_key}:${tienda.wc_consumer_secret}`
  ).toString('base64'),
});
export async function fetchOrdersByIds(tienda: Tienda, ids: number[]): Promise<WCOrder[]> {
  if (ids.length === 0) return [];

  const params = new URLSearchParams({
    include: ids.join(','),
    per_page: '100',
  });

  const res = await fetch(`${getBaseUrl(tienda)}/orders?${params.toString()}`, {
    headers: getHeaders(tienda),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WC fetchOrdersByIds error: ${res.status} - ${err}`);
  }

  return res.json();
}
export async function fetchOrders(tienda: Tienda, after: string | null): Promise<WCOrder[]> {
  const params = new URLSearchParams({
    per_page: '100',
    orderby: 'date',
    order: 'asc',
  });

  if (after) {
    params.append('after', after);
  } else {
    // Primera vez — últimos 30 días
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    params.append('after', thirtyDaysAgo.toISOString());
  }

  const res = await fetch(`${getBaseUrl(tienda)}/orders?${params.toString()}`, {
    headers: getHeaders(tienda),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WC fetchOrders error: ${res.status} - ${err}`);
  }

  return res.json();
}