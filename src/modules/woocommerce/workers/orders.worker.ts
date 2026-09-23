import { pool } from '../../../config/db';
import { Tienda } from '../../../types/tienda';
import { fetchOrders } from '../services/orders.service';
import { fetchOrdersByIds } from '../services/orders.service';
import { generateOrderCsvs } from '../services/csv.service';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const runningMap = new Map<number, boolean>();

async function tick(tienda: Tienda): Promise<void> {
  if (runningMap.get(tienda.id)) return;
  runningMap.set(tienda.id, true);

  try {
    const { rows } = await pool.query(
      'SELECT orders_last_check FROM tiendas WHERE id = $1',
      [tienda.id]
    );
    const lastCheck = rows[0]?.orders_last_check?.toISOString() ?? null;

    // 1. Traer pedidos nuevos desde WC
    const newOrders = await fetchOrders(tienda, lastCheck);

    // 2. Traer pedidos existentes en DB que no están completados ni cancelados
    // para verificar si cambiaron de estado
    const { rows: pendingOrders } = await pool.query(`
      SELECT woocommerce_id, status
      FROM woocommerce_orders
      WHERE tienda_id = $1
        AND status NOT IN ('completed', 'cancelled', 'refunded')
      ORDER BY created_at DESC
      LIMIT 100
    `, [tienda.id]);

    // Combinar IDs a consultar — nuevos + pendientes
    const pendingIds = pendingOrders.map(o => o.woocommerce_id);
    const newIds = newOrders.map(o => o.id);
    const allIds = [...new Set([...newIds, ...pendingIds])];

    if (allIds.length === 0) return;

    // 3. Traer datos actualizados de WC para todos
    const allOrders = await fetchOrdersByIds(tienda, pendingIds);

    // Combinar nuevos con actualizados
    const ordersToProcess = [
      ...newOrders,
      ...allOrders.filter(o => !newIds.includes(o.id))
    ];

    if (ordersToProcess.length === 0) return;

    console.log(`[OrdersWorker][${tienda.nombre}] ${ordersToProcess.length} pedidos a procesar.`);

    for (const order of ordersToProcess) {
      const { rows: existing } = await pool.query(
        'SELECT id, status FROM woocommerce_orders WHERE tienda_id = $1 AND woocommerce_id = $2',
        [tienda.id, order.id]
      );

      if (existing.length > 0) {
        const estadoAnterior = existing[0].status;

        await pool.query(`
          UPDATE woocommerce_orders
          SET status = $1, raw_payload = $2, updated_at = NOW()
          WHERE tienda_id = $3 AND woocommerce_id = $4
        `, [order.status, JSON.stringify(order), tienda.id, order.id]);

        if (estadoAnterior !== order.status) {
          generateOrderCsvs(order, tienda, order.status);
          console.log(`[OrdersWorker][${tienda.nombre}] Pedido ${order.number} cambió de ${estadoAnterior} a ${order.status}.`);
        }
      } else {
        const dni = order.meta_data?.find(m => m.key === 'billing_dni')?.value ?? null;

        await pool.query(`
          INSERT INTO woocommerce_orders
            (tienda_id, woocommerce_id, customer_email, customer_dni, total, status, payment_method, raw_payload)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          tienda.id, order.id,
          order.billing?.email ?? null,
          dni,
          parseFloat(order.total),
          order.status,
          order.payment_method,
          JSON.stringify(order),
        ]);

        generateOrderCsvs(order, tienda);
        console.log(`[OrdersWorker][${tienda.nombre}] Pedido ${order.number} guardado. Estado: ${order.status}`);
      }
    }

    if (newOrders.length > 0) {
      const lastOrder = newOrders[newOrders.length - 1];
      await pool.query(
        'UPDATE tiendas SET orders_last_check = $1 WHERE id = $2',
        [new Date(lastOrder.date_created), tienda.id]
      );
    }

  } catch (err) {
  const message = err instanceof Error ? err.message : 'Error desconocido';

  // 401 — credenciales inválidas o sin permisos
  if (message.includes('401')) {
    console.warn(`[OrdersWorker][${tienda.nombre}] Sin acceso a pedidos — verificar credenciales WC.`);
    return;
  }

  // 404 — tienda no encontrada
  if (message.includes('404')) {
    console.warn(`[OrdersWorker][${tienda.nombre}] Tienda no encontrada en WC.`);
    return;
  }

  console.error(`[OrdersWorker][${tienda.nombre}] Error:`, message);
} finally {
  runningMap.set(tienda.id, false);
}
}

export async function startOrdersWorkers(): Promise<void> {
  const { rows: tiendas } = await pool.query<Tienda>(
    'SELECT * FROM tiendas WHERE activo = TRUE'
  );

  for (const tienda of tiendas) {
    tick(tienda);
    setInterval(() => tick(tienda), INTERVAL_MS);
  }

  console.log(`[Sistema] Orders Worker iniciado en ${tiendas.length} tiendas.`);
}