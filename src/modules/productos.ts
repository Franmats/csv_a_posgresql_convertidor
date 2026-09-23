import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';
import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'stream/promises';
import iconv from 'iconv-lite';
import { Tienda } from '../types/tienda';
import { updateOrderStatus } from './woocommerce/services/woocommerce.service';

// ─── BULK ARTICULOS ───────────────────────────────────────────

export async function bulkArticulos(filePath: string, tienda: Tienda): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TEMP TABLE tmp_articulos (
        codigo           TEXT,
        nombre           TEXT,
        descripcion      TEXT,
        codigo_barras    TEXT,
        precio           TEXT,
        precio_descuento TEXT,
        stock            TEXT,
        rubro            TEXT
      ) ON COMMIT DROP
    `);

    const copyStream = client.query(
      copyFrom(`COPY tmp_articulos FROM STDIN WITH (FORMAT csv)`)
    );

    const fileStream = fs.createReadStream(filePath);
    const convertStream = fileStream
      .pipe(iconv.decodeStream('win1252'))
      .pipe(iconv.encodeStream('utf8'));

    await pipeline(convertStream, copyStream);

    // 1. Upsert productos base — todos simple
    await client.query(`
      INSERT INTO productos (tienda_id, codigo, nombre, descripcion, tipo, rubro, activo)
      SELECT $1, codigo, nombre,
        NULLIF(descripcion, ''),
        'simple',
        NULLIF(rubro, ''),
        TRUE
      FROM tmp_articulos
      ON CONFLICT (tienda_id, codigo) DO UPDATE SET
        nombre      = EXCLUDED.nombre,
        descripcion = EXCLUDED.descripcion,
        rubro       = EXCLUDED.rubro,
        activo      = TRUE,
        updated_at  = CASE
          WHEN
            productos.nombre        IS DISTINCT FROM EXCLUDED.nombre OR
            productos.descripcion   IS DISTINCT FROM EXCLUDED.descripcion OR
            productos.rubro         IS DISTINCT FROM EXCLUDED.rubro OR
            productos.activo        IS DISTINCT FROM TRUE
          THEN NOW()
          ELSE productos.updated_at
        END
    `, [tienda.id]);

    // 2. Desactivar productos que ya no están en el CSV
    await client.query(`
      UPDATE productos SET activo = FALSE, updated_at = NOW()
      WHERE tienda_id = $1
        AND codigo NOT IN (SELECT codigo FROM tmp_articulos)
        AND activo = TRUE
    `, [tienda.id]);

    // 3. Desactivar variantes de productos desactivados
    await client.query(`
      UPDATE producto_variantes SET activo = FALSE, updated_at = NOW()
      WHERE tienda_id = $1
        AND producto_codigo IN (
          SELECT codigo FROM productos
          WHERE tienda_id = $1 AND activo = FALSE
        )
        AND activo = TRUE
    `, [tienda.id]);

    // 4. Upsert variante única por producto
    await client.query(`
      INSERT INTO producto_variantes
        (tienda_id, producto_codigo, sku, codigo_barras, atributos, precio, precio_descuento, stock, activo)
      SELECT
        $1,
        codigo,
        codigo,                                    -- sku = codigo
        NULLIF(codigo_barras, ''),
        '{}'::jsonb,
        precio::numeric,
        CASE WHEN precio_descuento = precio THEN NULL
             ELSE NULLIF(precio_descuento, '')::numeric
        END,
        stock::integer,
        TRUE
      FROM tmp_articulos
      WHERE precio != '' AND stock != ''
      ON CONFLICT (tienda_id, producto_codigo, sku) WHERE sku IS NOT NULL DO UPDATE SET
        codigo_barras    = EXCLUDED.codigo_barras,
        precio           = EXCLUDED.precio,
        precio_descuento = EXCLUDED.precio_descuento,
        stock            = EXCLUDED.stock,
        activo           = TRUE,
        updated_at       = CASE
          WHEN
            producto_variantes.precio           IS DISTINCT FROM EXCLUDED.precio OR
            producto_variantes.precio_descuento IS DISTINCT FROM EXCLUDED.precio_descuento OR
            producto_variantes.stock            IS DISTINCT FROM EXCLUDED.stock OR
            producto_variantes.codigo_barras    IS DISTINCT FROM EXCLUDED.codigo_barras OR
            producto_variantes.activo           IS DISTINCT FROM TRUE
          THEN NOW()
          ELSE producto_variantes.updated_at
        END
    `, [tienda.id]);

    await client.query('COMMIT');
    console.log(`[CsvWatcher][${tienda.nombre}] Bulk articulos completado.`);

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── UPDATE INDIVIDUAL ────────────────────────────────────────

export async function processProductoFile(filePath: string, tienda: Tienda): Promise<void> {
  const fileName = filePath.split('/').pop()!;
  const match = fileName.match(/^update_(.+)_(\d{6})\.csv$/);

  if (!match) throw new Error('Formato inválido');

  const codigo = match[1];
  const buffer = fs.readFileSync(filePath);
  const content = iconv.decode(buffer, 'win1252').trim();
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length < 1) throw new Error('CSV vacío');

  const values = lines[0].split(',').map(v => v.trim());
  const [nombre, descripcion, codigo_barras, precio, precio_descuento, stock, rubro] = values;

  await pool.query(`
    INSERT INTO productos (tienda_id, codigo, nombre, descripcion, tipo, rubro, activo)
    VALUES ($1, $2, $3, $4, 'simple', $5, TRUE)
    ON CONFLICT (tienda_id, codigo) DO UPDATE SET
      nombre      = EXCLUDED.nombre,
      descripcion = EXCLUDED.descripcion,
      rubro       = EXCLUDED.rubro,
      activo      = TRUE,
      updated_at  = CASE
        WHEN
          productos.nombre        IS DISTINCT FROM EXCLUDED.nombre OR
          productos.descripcion   IS DISTINCT FROM EXCLUDED.descripcion OR
          productos.rubro         IS DISTINCT FROM EXCLUDED.rubro OR
          productos.activo        IS DISTINCT FROM TRUE
        THEN NOW()
        ELSE productos.updated_at
      END
  `, [tienda.id, codigo, nombre, descripcion || null, rubro || null]);

  await pool.query(`
    INSERT INTO producto_variantes
      (tienda_id, producto_codigo, sku, codigo_barras, atributos, precio, precio_descuento, stock, activo)
    VALUES ($1, $2, $2, $3, '{}'::jsonb, $4, $5, $6, TRUE)
    ON CONFLICT (tienda_id, producto_codigo, sku) WHERE sku IS NOT NULL DO UPDATE SET
      codigo_barras    = EXCLUDED.codigo_barras,
      precio           = EXCLUDED.precio,
      precio_descuento = EXCLUDED.precio_descuento,
      stock            = EXCLUDED.stock,
      activo           = TRUE,
      updated_at       = CASE
        WHEN
          producto_variantes.precio           IS DISTINCT FROM EXCLUDED.precio OR
          producto_variantes.precio_descuento IS DISTINCT FROM EXCLUDED.precio_descuento OR
          producto_variantes.stock            IS DISTINCT FROM EXCLUDED.stock OR
          producto_variantes.activo           IS DISTINCT FROM TRUE
        THEN NOW()
        ELSE producto_variantes.updated_at
      END
  `, [
    tienda.id,
    codigo,
    codigo_barras || null,
    parseFloat(precio) || 0,
    precio_descuento && precio_descuento !== precio ? parseFloat(precio_descuento) : null,
    parseInt(stock) || 0,
  ]);

  console.log(`[CsvWatcher][${tienda.nombre}] Producto ${codigo} actualizado.`);
}

// ─── DELETE ───────────────────────────────────────────────────

export async function deleteProducto(filePath: string, tienda: Tienda): Promise<void> {
  const fileName = filePath.split('/').pop()!;
  const match = fileName.match(/^delete_(.+)\.csv$/);

  if (!match) throw new Error('Formato inválido');

  const codigo = match[1];

  await pool.query(`
    UPDATE productos SET activo = FALSE, updated_at = NOW()
    WHERE tienda_id = $1 AND codigo = $2
  `, [tienda.id, codigo]);

  await pool.query(`
    UPDATE producto_variantes SET activo = FALSE, updated_at = NOW()
    WHERE tienda_id = $1 AND producto_codigo = $2
  `, [tienda.id, codigo]);

  console.log(`[CsvWatcher][${tienda.nombre}] Producto ${codigo} desactivado.`);
}

// ─── INVOICED ─────────────────────────────────────────────────

export async function markAsInvoiced(filePath: string, tienda: Tienda): Promise<void> {
  const fileName = path.basename(filePath);
  const match = fileName.match(/^invoiced_(\d+)\.txt$/);

  if (!match) throw new Error('Formato inválido');

  const woocommerce_id = parseInt(match[1]);

  const content = fs.readFileSync(filePath, 'utf8').trim().toLowerCase();
  const estadosValidos = ['completed', 'cancelled', 'refunded'];
  const nuevoEstado = estadosValidos.includes(content) ? content : 'completed';

  const { rowCount } = await pool.query(
    `UPDATE woocommerce_orders
     SET invoiced = TRUE, status = $1
     WHERE tienda_id = $2 AND woocommerce_id = $3`,
    [nuevoEstado, tienda.id, woocommerce_id]
  );

  if (rowCount === 0) {
    console.warn(`[CsvWatcher][${tienda.nombre}] Pedido ${woocommerce_id} no encontrado en la DB.`);
    return;
  }

  await updateOrderStatus(tienda, woocommerce_id, nuevoEstado);

  console.log(`[CsvWatcher][${tienda.nombre}] Pedido ${woocommerce_id} facturado → estado en WC: ${nuevoEstado}.`);
}