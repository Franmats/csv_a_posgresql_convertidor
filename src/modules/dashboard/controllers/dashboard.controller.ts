import { Request, Response } from 'express';
import { pool } from '../../../config/db';

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    const { rows: tiendas } = await pool.query(`
      SELECT
        t.id,
        t.nombre,
        t.activo,
        COUNT(DISTINCT p.id) FILTER (WHERE p.activo = TRUE) as productos_activos,
        COUNT(DISTINCT wp.id) FILTER (WHERE wp.sync_status = 'error') as productos_error,
        COUNT(DISTINCT wp.id) FILTER (WHERE wp.sync_status = 'pending') as productos_pending,
        COUNT(DISTINCT wo.id) as total_pedidos,
        COUNT(DISTINCT wo.id) FILTER (WHERE wo.invoiced = FALSE) as pedidos_sin_facturar,
        MAX(wp.last_synced_at) as ultimo_sync
      FROM tiendas t
      LEFT JOIN productos p ON p.tienda_id = t.id
      LEFT JOIN woocommerce_products wp ON wp.tienda_id = t.id
      LEFT JOIN woocommerce_orders wo ON wo.tienda_id = t.id
      GROUP BY t.id, t.nombre, t.activo
      ORDER BY t.id
    `);

    res.json({ tiendas });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estado' });
  }
}

export async function getErrores(req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.nombre as tienda,
        wp.producto_codigo,
        wp.sync_status,
        wp.error_message,
        wp.updated_at,
        p.tipo,
        pv.sku
      FROM woocommerce_products wp
      JOIN tiendas t ON t.id = wp.tienda_id
      JOIN productos p ON p.codigo = wp.producto_codigo AND p.tienda_id = wp.tienda_id
      LEFT JOIN producto_variantes pv ON pv.id = wp.variante_id
      WHERE wp.sync_status = 'error'
      ORDER BY wp.updated_at DESC
      LIMIT 50
    `);

    res.json({ errores: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener errores' });
  }
}

export async function getPedidos(req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.nombre as tienda,
        wo.woocommerce_id,
        wo.customer_email,
        wo.customer_dni,
        wo.total,
        wo.status,
        wo.payment_method,
        wo.invoiced,
        wo.created_at
      FROM woocommerce_orders wo
      JOIN tiendas t ON t.id = wo.tienda_id
      ORDER BY wo.created_at DESC
      LIMIT 50
    `);

    res.json({ pedidos: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
}

export async function getProductosError(req: Request, res: Response): Promise<void> {
  const { tienda_id } = req.params;

  try {
    const { rows } = await pool.query(`
      SELECT
        wp.producto_codigo,
        p.nombre,
        p.tipo,
        pv.sku,
        wp.error_message,
        wp.updated_at
      FROM woocommerce_products wp
      JOIN productos p ON p.codigo = wp.producto_codigo AND p.tienda_id = wp.tienda_id
      LEFT JOIN producto_variantes pv ON pv.id = wp.variante_id
      WHERE wp.tienda_id = $1
        AND wp.sync_status = 'error'
      ORDER BY wp.updated_at DESC
    `, [tienda_id]);

    res.json({ productos: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
}