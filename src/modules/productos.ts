import fs from 'fs';
import { pool } from '../config/db';
import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'stream/promises';
import iconv from 'iconv-lite';
import { Tienda } from '../types/tienda';

// ─── BULK ARTICULOS ───────────────────────────────────────────

export async function bulkArticulos(filePath: string, tienda: Tienda): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TEMP TABLE tmp_articulos (
        tipo             TEXT,
        codigo           TEXT,
        nombre           TEXT,
        descripcion      TEXT,
        imagen           TEXT,
        sku              TEXT,
        codigo_barras    TEXT,
        precio           TEXT,
        precio_descuento TEXT,
        stock            TEXT
      ) ON COMMIT DROP
    `);

    const copyStream = client.query(
      copyFrom(`COPY tmp_articulos FROM STDIN WITH (FORMAT csv, HEADER true)`)
    );

    const fileStream = fs.createReadStream(filePath);
    const convertStream = fileStream
      .pipe(iconv.decodeStream('win1252'))
      .pipe(iconv.encodeStream('utf8'));

    await pipeline(convertStream, copyStream);

    // 1. Upsert productos base
    await client.query(`
      INSERT INTO productos (tienda_id, codigo, nombre, descripcion, imagen, tipo, activo)
      SELECT $1, codigo, nombre,
        NULLIF(descripcion, ''),
        NULLIF(imagen, ''),
        tipo, TRUE
      FROM tmp_articulos
      WHERE tipo IN ('simple', 'variable')
      ON CONFLICT (tienda_id, codigo) DO UPDATE SET
        nombre      = EXCLUDED.nombre,
        descripcion = EXCLUDED.descripcion,
        imagen      = EXCLUDED.imagen,
        tipo        = EXCLUDED.tipo,
        activo      = TRUE,
        updated_at  = CASE
          WHEN
            productos.nombre        IS DISTINCT FROM EXCLUDED.nombre OR
            productos.descripcion   IS DISTINCT FROM EXCLUDED.descripcion OR
            productos.imagen        IS DISTINCT FROM EXCLUDED.imagen OR
            productos.tipo          IS DISTINCT FROM EXCLUDED.tipo OR
            productos.activo        IS DISTINCT FROM TRUE
          THEN NOW()
          ELSE productos.updated_at
        END
    `, [tienda.id]);

    // 2. Desactivar productos que ya no están en el CSV
    await client.query(`
      UPDATE productos SET activo = FALSE, updated_at = NOW()
      WHERE tienda_id = $1
        AND codigo NOT IN (
          SELECT codigo FROM tmp_articulos
          WHERE tipo IN ('simple', 'variable')
        )
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

    // 4. Upsert variantes de productos simples
    await client.query(`
      INSERT INTO producto_variantes
        (tienda_id, producto_codigo, sku, codigo_barras, atributos, precio, precio_descuento, stock, activo)
      SELECT
        $1,
        codigo,
        NULLIF(sku, ''),
        NULLIF(codigo_barras, ''),
        '{}'::jsonb,
        precio::numeric,
        NULLIF(precio_descuento, '')::numeric,
        stock::integer,
        TRUE
      FROM tmp_articulos
      WHERE tipo = 'simple'
        AND precio != ''
        AND stock != ''
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

// ─── BULK VARIANTES ───────────────────────────────────────────

export async function bulkVariantes(filePath: string, tienda: Tienda): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TEMP TABLE tmp_variantes (
        producto_codigo  TEXT,
        sku              TEXT,
        codigo_barras    TEXT,
        atributos        TEXT,
        precio           TEXT,
        precio_descuento TEXT,
        stock            TEXT
      ) ON COMMIT DROP
    `);

    const copyStream = client.query(
      copyFrom(`COPY tmp_variantes FROM STDIN WITH (FORMAT csv, HEADER true)`)
    );

    const fileStream = fs.createReadStream(filePath);
    const convertStream = fileStream
      .pipe(iconv.decodeStream('win1252'))
      .pipe(iconv.encodeStream('utf8'));

    await pipeline(convertStream, copyStream);

    // Upsert variantes — solo si el producto padre existe
    await client.query(`
      INSERT INTO producto_variantes
        (tienda_id, producto_codigo, sku, codigo_barras, atributos, precio, precio_descuento, stock, activo)
      SELECT
        $1,
        tv.producto_codigo,
        NULLIF(tv.sku, ''),
        NULLIF(tv.codigo_barras, ''),
        tv.atributos::jsonb,
        tv.precio::numeric,
        NULLIF(tv.precio_descuento, '')::numeric,
        tv.stock::integer,
        TRUE
      FROM tmp_variantes tv
      INNER JOIN productos p ON p.tienda_id = $1 AND p.codigo = tv.producto_codigo
      WHERE tv.precio != '' AND tv.stock != ''
      ON CONFLICT (tienda_id, producto_codigo, sku) WHERE sku IS NOT NULL DO UPDATE SET
        codigo_barras    = EXCLUDED.codigo_barras,
        atributos        = EXCLUDED.atributos,
        precio           = EXCLUDED.precio,
        precio_descuento = EXCLUDED.precio_descuento,
        stock            = EXCLUDED.stock,
        activo           = TRUE,
        updated_at       = CASE
          WHEN
            producto_variantes.precio           IS DISTINCT FROM EXCLUDED.precio OR
            producto_variantes.precio_descuento IS DISTINCT FROM EXCLUDED.precio_descuento OR
            producto_variantes.stock            IS DISTINCT FROM EXCLUDED.stock OR
            producto_variantes.atributos        IS DISTINCT FROM EXCLUDED.atributos OR
            producto_variantes.codigo_barras    IS DISTINCT FROM EXCLUDED.codigo_barras OR
            producto_variantes.activo           IS DISTINCT FROM TRUE
          THEN NOW()
          ELSE producto_variantes.updated_at
        END
    `, [tienda.id]);

    // Log variantes ignoradas por falta de producto padre
    const { rows: ignoradas } = await client.query(`
      SELECT tv.producto_codigo, tv.sku
      FROM tmp_variantes tv
      LEFT JOIN productos p ON p.tienda_id = $1 AND p.codigo = tv.producto_codigo
      WHERE p.id IS NULL
    `, [tienda.id]);

    if (ignoradas.length > 0) {
      console.warn(`[CsvWatcher][${tienda.nombre}] ${ignoradas.length} variantes ignoradas por falta de producto padre:`);
      ignoradas.forEach(v => console.warn(`  → ${v.producto_codigo} / ${v.sku}`));
    }

    // Desactivar variantes que ya no están en el CSV
    await client.query(`
      UPDATE producto_variantes SET activo = FALSE, updated_at = NOW()
      WHERE tienda_id = $1
        AND sku IS NOT NULL
        AND sku NOT IN (SELECT sku FROM tmp_variantes WHERE sku != '')
        AND activo = TRUE
    `, [tienda.id]);

    await client.query('COMMIT');
    console.log(`[CsvWatcher][${tienda.nombre}] Bulk variantes completado.`);

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

  if (lines.length < 2) throw new Error('CSV vacío');

  const headers = lines[0].split(',').map(h => h.trim());
  const values = lines[1].split(',').map(v => v.trim());
  const row = headers.reduce((obj, h, i) => {
    obj[h] = values[i] ?? '';
    return obj;
  }, {} as Record<string, string>);

  const tipo = row['tipo']?.toLowerCase();

  await pool.query(`
    INSERT INTO productos (tienda_id, codigo, nombre, descripcion, imagen, tipo, activo)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE)
    ON CONFLICT (tienda_id, codigo) DO UPDATE SET
      nombre      = EXCLUDED.nombre,
      descripcion = EXCLUDED.descripcion,
      imagen      = EXCLUDED.imagen,
      tipo        = EXCLUDED.tipo,
      activo      = TRUE,
      updated_at  = CASE
        WHEN
          productos.nombre        IS DISTINCT FROM EXCLUDED.nombre OR
          productos.descripcion   IS DISTINCT FROM EXCLUDED.descripcion OR
          productos.imagen        IS DISTINCT FROM EXCLUDED.imagen OR
          productos.tipo          IS DISTINCT FROM EXCLUDED.tipo OR
          productos.activo        IS DISTINCT FROM TRUE
        THEN NOW()
        ELSE productos.updated_at
      END
  `, [
    tienda.id, codigo,
    row['nombre'],
    row['descripcion'] || null,
    row['imagen'] || null,
    tipo === 'variable' ? 'variable' : 'simple',
  ]);

  if (tipo === 'simple') {
    await pool.query(`
      INSERT INTO producto_variantes
        (tienda_id, producto_codigo, sku, codigo_barras, atributos, precio, precio_descuento, stock, activo)
      VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, $6, $7, TRUE)
      ON CONFLICT (tienda_id, producto_codigo, sku) WHERE sku IS NOT NULL DO UPDATE SET
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
      tienda.id, codigo,
      row['sku'] || null,
      row['codigo_barras'] || null,
      parseFloat(row['precio']) || 0,
      row['precio_descuento'] ? parseFloat(row['precio_descuento']) : null,
      parseInt(row['stock']) || 0,
    ]);
  }

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