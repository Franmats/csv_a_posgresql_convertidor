import { Request, Response } from 'express';
import { pool } from '../../../config/db';

export async function getProductoByCodigo(req: Request, res: Response): Promise<void> {
  const tienda_id = (req as any).tienda_id;
  const { codigo } = req.params;
 

  try {
    const { rows } = await pool.query(`
      SELECT
        p.codigo,
        p.nombre,
        p.descripcion,
        p.rubro,
        p.tiene_imagen,
        p.activo,
        pv.precio,
        pv.precio_descuento,
        pv.stock,
        pv.codigo_barras
      FROM productos p
      LEFT JOIN producto_variantes pv ON pv.producto_codigo = p.codigo
        AND pv.tienda_id = p.tienda_id
        AND pv.activo = TRUE
      WHERE p.tienda_id = $1
        AND p.codigo = $2
      LIMIT 1
    `, [tienda_id, codigo]);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }

    res.json({ producto: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}

export async function getProductoByCodigoBarras(req: Request, res: Response): Promise<void> {
  const tienda_id = (req as any).tienda_id;

  const { codigo_barras } = req.params;

  try {
    const { rows } = await pool.query(`
      SELECT
        p.codigo,
        p.nombre,
        p.descripcion,
        p.rubro,
        p.tiene_imagen,
        p.activo,
        pv.precio,
        pv.precio_descuento,
        pv.stock,
        pv.codigo_barras
      FROM productos p
      LEFT JOIN producto_variantes pv ON pv.producto_codigo = p.codigo
        AND pv.tienda_id = p.tienda_id
        AND pv.activo = TRUE
      WHERE p.tienda_id = $1
        AND p.codigo = $2
      LIMIT 1
    `, [tienda_id, codigo_barras]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }
//BUsca por codigo 
    res.json({ producto: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}

export async function getProductos(req: Request, res: Response): Promise<void> {
  const tienda_id = (req as any).tienda_id;
  const { page = '1', limit = '50', rubro } = req.query;

  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
  try {
    const { rows } = await pool.query(`
      SELECT
        p.codigo,
        p.nombre,
        p.descripcion,
        p.rubro,
        p.tiene_imagen,
        p.activo,
        pv.precio,
        pv.precio_descuento,
        pv.stock,
        pv.codigo_barras
      FROM productos p
      LEFT JOIN producto_variantes pv ON pv.producto_codigo = p.codigo
        AND pv.tienda_id = p.tienda_id
        AND pv.activo = TRUE
      WHERE p.tienda_id = $1
        AND p.activo = TRUE
        ${rubro ? 'AND p.rubro = $4' : ''}
      ORDER BY p.nombre ASC
      LIMIT $2 OFFSET $3
    `, rubro ? [tienda_id, limit, offset, rubro] : [tienda_id, limit, offset]);

    const { rows: total } = await pool.query(`
      SELECT COUNT(*) as total
      FROM productos
      WHERE tienda_id = $1 AND activo = TRUE
      ${rubro ? 'AND rubro = $2' : ''}
    `, rubro ? [tienda_id, rubro] : [tienda_id]);

    res.json({
      productos: rows,
      total: parseInt(total[0].total),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
}