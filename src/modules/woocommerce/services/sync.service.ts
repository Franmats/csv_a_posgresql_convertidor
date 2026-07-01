import fs from 'fs';
import { pool } from '../../../config/db';
import { Tienda } from '../../../types/tienda';
import {
  createSimpleProduct,
  updateSimpleProduct,
  createVariableProduct,
  createVariation,
  updateVariation,
  activateProduct,
  deactivateProduct,
} from './woocommerce.service';

interface ProductoRow {
  id: number;
  tienda_id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  imagen: string | null;
  tipo: string;
  activo: boolean;
}

interface VarianteRow {
  id: number;
  tienda_id: number;
  producto_codigo: string;
  sku: string | null;
  codigo_barras: string | null;
  atributos: Record<string, string>;
  precio: number;
  precio_descuento: number | null;
  stock: number;
  activo: boolean;
}
// Agregar al inicio del archivo
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000]; // backoff exponencial en ms

async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  tienda: Tienda
): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 404 — recurso no existe en WC, no reintentar
      if (lastError.message.includes('404')) {
        throw lastError;
      }

      // 429 — rate limit, esperar con backoff exponencial
      if (lastError.message.includes('429')) {
        const delay = RETRY_DELAYS[attempt] ?? 30000;
        console.warn(`[WCSync][${tienda.nombre}] Rate limit en ${context}, esperando ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Otros errores — reintentar con backoff
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[WCSync][${tienda.nombre}] Error en ${context}, reintentando en ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
export async function syncPendingProducts(tienda: Tienda): Promise<void> {
const { rows } = await pool.query<ProductoRow>(`
  SELECT DISTINCT p.*
  FROM productos p
  LEFT JOIN woocommerce_products wp ON wp.producto_codigo = p.codigo
    AND wp.tienda_id = p.tienda_id
    AND wp.variante_id IS NULL
  LEFT JOIN producto_variantes pv ON pv.producto_codigo = p.codigo
    AND pv.tienda_id = p.tienda_id
    AND p.tipo = 'variable'    -- ← solo variantes de productos variables
  LEFT JOIN woocommerce_products wpv ON wpv.variante_id = pv.id
    AND wpv.tienda_id = p.tienda_id
  WHERE p.tienda_id = $1
    AND (
      wp.producto_codigo IS NULL
      OR p.updated_at > wp.last_synced_at
      OR wp.sync_status = 'error'
      OR (pv.id IS NOT NULL AND wpv.variante_id IS NULL)
      OR (pv.id IS NOT NULL AND pv.updated_at > wpv.last_synced_at)
      OR wpv.sync_status = 'error'
    )
  LIMIT 50
`, [tienda.id]);

  console.log(`[WCSync][${tienda.nombre}] ${rows.length} productos pendientes.`);

  for (const producto of rows) {
    await syncProducto(tienda, producto);
  }
}

async function syncProducto(tienda: Tienda, producto: ProductoRow): Promise<void> {
  try {
    if (producto.tipo === 'simple') {
      await syncSimple(tienda, producto);
    } else if (producto.tipo === 'variable') {
      await syncVariable(tienda, producto);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error(`[WCSync][${tienda.nombre}] Error en producto ${producto.codigo}:`, message);

    await pool.query(`
      INSERT INTO woocommerce_products
        (tienda_id, producto_codigo, variante_id, woocommerce_id, sync_status, error_message)
      VALUES ($1, $2, NULL, 0, 'error', $3)
      ON CONFLICT (tienda_id, producto_codigo, variante_id) DO UPDATE
      SET sync_status = 'error', error_message = $3, updated_at = NOW()
    `, [tienda.id, producto.codigo, message]);
  }
}

async function syncSimple(tienda: Tienda, producto: ProductoRow): Promise<void> {
  const { rows: variantes } = await pool.query<VarianteRow>(`
    SELECT * FROM producto_variantes
    WHERE tienda_id = $1 AND producto_codigo = $2 AND activo = TRUE
    LIMIT 1
  `, [tienda.id, producto.codigo]);

  if (variantes.length === 0) {
    console.log(`[WCSync][${tienda.nombre}] Producto ${producto.codigo} sin variante, ignorando.`);
    return;
  }

  const variante = variantes[0];
  const { rows: existing } = await pool.query(`
    SELECT * FROM woocommerce_products
    WHERE tienda_id = $1 AND producto_codigo = $2 AND variante_id IS NULL
  `, [tienda.id, producto.codigo]);

  const imagePath = `${tienda.images_dir}/${producto.codigo}.jpg`;
  const imagen = fs.existsSync(imagePath)
    ? `${process.env.API_URL}/api/imagenes/${tienda.id}/${producto.codigo}.jpg`
    : null;

  try {
    if (!existing[0] || existing[0].woocommerce_id === 0) {
      if (!producto.activo) return;

      const { woocommerce_id } = await withRetry(
        () => createSimpleProduct(tienda, {
          codigo: producto.codigo,
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          imagen,
          precio: variante.precio,
          precio_descuento: variante.precio_descuento,
          stock: variante.stock,
          sku: variante.sku,
          codigo_barras: variante.codigo_barras,
        }),
        `createSimpleProduct ${producto.codigo}`,
        tienda
      );

      await pool.query(`
        INSERT INTO woocommerce_products
          (tienda_id, producto_codigo, variante_id, woocommerce_id, sync_status, last_synced_at)
        VALUES ($1, $2, NULL, $3, 'ok', NOW())
      `, [tienda.id, producto.codigo, woocommerce_id]);

      console.log(`[WCSync][${tienda.nombre}] Producto simple ${producto.codigo} creado en WC.`);

    } else {
      try {
        if (!producto.activo) {
          await withRetry(
            () => deactivateProduct(tienda, existing[0].woocommerce_id),
            `deactivateProduct ${producto.codigo}`,
            tienda
          );
        } else {
          await withRetry(
            () => activateProduct(tienda, existing[0].woocommerce_id),
            `activateProduct ${producto.codigo}`,
            tienda
          );
          await withRetry(
            () => updateSimpleProduct(tienda, existing[0].woocommerce_id, {
              precio: variante.precio,
              precio_descuento: variante.precio_descuento,
              stock: variante.stock,
            }),
            `updateSimpleProduct ${producto.codigo}`,
            tienda
          );
        }

        await pool.query(`
          UPDATE woocommerce_products
          SET sync_status = 'ok', error_message = NULL,
              last_synced_at = NOW(), updated_at = NOW()
          WHERE tienda_id = $1 AND producto_codigo = $2 AND variante_id IS NULL
        `, [tienda.id, producto.codigo]);

        console.log(`[WCSync][${tienda.nombre}] Producto simple ${producto.codigo} actualizado en WC.`);

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';

        // 404 — producto borrado manualmente en WC, limpiar mapeo para recrear
        if (message.includes('404')) {
          console.warn(`[WCSync][${tienda.nombre}] Producto ${producto.codigo} no encontrado en WC, limpiando mapeo para recrear...`);
          await pool.query(`
            DELETE FROM woocommerce_products
            WHERE tienda_id = $1 AND producto_codigo = $2
          `, [tienda.id, producto.codigo]);
          return;
        }

        throw err;
      }
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error(`[WCSync][${tienda.nombre}] Error en producto ${producto.codigo}:`, message);

    await pool.query(`
      INSERT INTO woocommerce_products
        (tienda_id, producto_codigo, variante_id, woocommerce_id, sync_status, error_message)
      VALUES ($1, $2, NULL, 0, 'error', $3)
      ON CONFLICT (tienda_id, producto_codigo, variante_id) DO UPDATE
      SET sync_status = 'error', error_message = $3, updated_at = NOW()
    `, [tienda.id, producto.codigo, message]);
  }
}

async function syncVariable(tienda: Tienda, producto: ProductoRow): Promise<void> {
  const { rows: variantes } = await pool.query<VarianteRow>(`
    SELECT * FROM producto_variantes
    WHERE tienda_id = $1 AND producto_codigo = $2
  `, [tienda.id, producto.codigo]);

  if (variantes.length === 0) {
    console.log(`[WCSync][${tienda.nombre}] Producto variable ${producto.codigo} sin variantes, ignorando.`);
    return;
  }

  // Ver si el producto base ya existe en WC
  const { rows: existing } = await pool.query(`
    SELECT * FROM woocommerce_products
    WHERE tienda_id = $1 AND producto_codigo = $2 AND variante_id IS NULL
  `, [tienda.id, producto.codigo]);

  const imagePath = `${tienda.images_dir}/${producto.codigo}.jpg`;
  const imagen = fs.existsSync(imagePath)
    ? `${process.env.API_URL}/api/imagenes/${tienda.id}/${producto.codigo}.jpg`
    : null;

  let woocommerce_id: number;

  if (!existing[0] || existing[0].woocommerce_id === 0) {
    // Construir atributos únicos de todas las variantes
    const atributosMap: Record<string, Set<string>> = {};
    for (const v of variantes) {
      for (const [key, value] of Object.entries(v.atributos)) {
        if (!atributosMap[key]) atributosMap[key] = new Set();
        atributosMap[key].add(value as string);
      }
    }
    const atributos = Object.fromEntries(
      Object.entries(atributosMap).map(([k, v]) => [k, Array.from(v)])
    );

    const result = await createVariableProduct(tienda, {
      codigo: producto.codigo,
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      imagen,
      atributos,
    });

    woocommerce_id = result.woocommerce_id;

    await pool.query(`
      INSERT INTO woocommerce_products
        (tienda_id, producto_codigo, variante_id, woocommerce_id, sync_status, last_synced_at)
      VALUES ($1, $2, NULL, $3, 'ok', NOW())
    `, [tienda.id, producto.codigo, woocommerce_id]);

    console.log(`[WCSync][${tienda.nombre}] Producto variable ${producto.codigo} creado en WC.`);
  } else {
    woocommerce_id = existing[0].woocommerce_id;

    if (!producto.activo) {
      await deactivateProduct(tienda, woocommerce_id);
      await pool.query(`
        UPDATE woocommerce_products
        SET sync_status = 'ok', last_synced_at = NOW(), updated_at = NOW()
        WHERE tienda_id = $1 AND producto_codigo = $2 AND variante_id IS NULL
      `, [tienda.id, producto.codigo]);
      return;
    }

    await activateProduct(tienda, woocommerce_id);
  }

  // Sincronizar cada variante
  for (const variante of variantes) {
    await syncVariante(tienda, producto.codigo, woocommerce_id, variante);
  }
}

async function syncVariante(
  tienda: Tienda,
  producto_codigo: string,
  woocommerce_id: number,
  variante: VarianteRow
): Promise<void> {
  const { rows: existing } = await pool.query(`
    SELECT * FROM woocommerce_products
    WHERE tienda_id = $1 AND producto_codigo = $2 AND variante_id = $3
  `, [tienda.id, producto_codigo, variante.id]);

  try {
    if (!existing[0] || existing[0].woocommerce_id === 0) {
      if (!variante.activo) return;

      const { wc_variation_id } = await withRetry(
        () => createVariation(tienda, woocommerce_id, {
          sku: variante.sku,
          atributos: variante.atributos,
          precio: variante.precio,
          precio_descuento: variante.precio_descuento,
          stock: variante.stock,
        }),
        `createVariation ${variante.sku}`,
        tienda
      );

      await pool.query(`
        INSERT INTO woocommerce_products
          (tienda_id, producto_codigo, variante_id, woocommerce_id, wc_variation_id, sync_status, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, 'ok', NOW())
      `, [tienda.id, producto_codigo, variante.id, woocommerce_id, wc_variation_id]);

      console.log(`[WCSync][${tienda.nombre}] Variante ${variante.sku ?? variante.id} creada en WC.`);

    } else {
      try {
        await withRetry(
          () => updateVariation(tienda, woocommerce_id, existing[0].wc_variation_id, {
            precio: variante.precio,
            precio_descuento: variante.precio_descuento,
            stock: variante.stock,
          }),
          `updateVariation ${variante.sku}`,
          tienda
        );

        await pool.query(`
          UPDATE woocommerce_products
          SET sync_status = 'ok', error_message = NULL,
              last_synced_at = NOW(), updated_at = NOW()
          WHERE tienda_id = $1 AND producto_codigo = $2 AND variante_id = $3
        `, [tienda.id, producto_codigo, variante.id]);

        console.log(`[WCSync][${tienda.nombre}] Variante ${variante.sku ?? variante.id} actualizada en WC.`);

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';

        // 404 — variante borrada manualmente en WC, limpiar mapeo para recrear
        if (message.includes('404')) {
          console.warn(`[WCSync][${tienda.nombre}] Variante ${variante.sku} no encontrada en WC, limpiando mapeo para recrear...`);
          await pool.query(`
            DELETE FROM woocommerce_products
            WHERE tienda_id = $1 AND producto_codigo = $2 AND variante_id = $3
          `, [tienda.id, producto_codigo, variante.id]);
          return;
        }

        throw err;
      }
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error(`[WCSync][${tienda.nombre}] Error en variante ${variante.id}:`, message);

    await pool.query(`
      INSERT INTO woocommerce_products
        (tienda_id, producto_codigo, variante_id, woocommerce_id, sync_status, error_message)
      VALUES ($1, $2, $3, 0, 'error', $4)
      ON CONFLICT (tienda_id, producto_codigo, variante_id) DO UPDATE
      SET sync_status = 'error', error_message = $4, updated_at = NOW()
    `, [tienda.id, producto_codigo, variante.id, message]);
  }
}