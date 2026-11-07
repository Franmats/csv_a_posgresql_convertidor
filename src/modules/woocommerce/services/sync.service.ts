
import { pool } from '../../../config/db';
import { Tienda } from '../../../types/tienda';
import {
  getCategoryByName,
  createCategory,
  createSimpleProduct,
  updateSimpleProduct,
  activateProduct,
  deactivateProduct,
} from './woocommerce.service';

interface ProductoRow {
  id: number;
  tienda_id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  rubro: string | null;
  activo: boolean;
  tipo: 'simple' | 'variable';
  precio: number;
  stock: number;
  updated_at?: Date;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000];

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

      if (lastError.message.includes('404')) throw lastError;

      if (lastError.message.includes('429')) {
        const delay = RETRY_DELAYS[attempt] ?? 30000;

        console.warn(
          `[WCSync][${tienda.nombre}] Rate limit en ${context}, esperando ${delay}ms...`
        );

        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt];

        console.warn(
          `[WCSync][${tienda.nombre}] Error en ${context}, reintentando en ${delay}ms...`,
          lastError.message
        );

        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

// =====================================================
// RESOLVER CATEGORÍA
// =====================================================

async function resolveCategoryId(
  tienda: Tienda,
  rubro: string
): Promise<number | null> {
  if (!rubro) return null;

  const { rows } = await pool.query(
    `SELECT wc_category_id
     FROM woocommerce_categories
     WHERE tienda_id = $1 AND nombre = $2`,
    [tienda.id, rubro]
  );

  if (rows.length > 0) return rows[0].wc_category_id;

  let wc_category_id = await getCategoryByName(tienda, rubro);

  if (!wc_category_id) {
    wc_category_id = await createCategory(tienda, rubro);

    console.log(
      `[WCSync][${tienda.nombre}] Categoría "${rubro}" creada en WC.`
    );
  }

  await pool.query(
    `INSERT INTO woocommerce_categories
      (tienda_id, nombre, wc_category_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (tienda_id, nombre) DO NOTHING`,
    [tienda.id, rubro, wc_category_id]
  );

  return wc_category_id;
}

// =====================================================
// OBTENER PRODUCTOS PENDIENTES
// =====================================================

export async function syncPendingProducts(
  tienda: Tienda
): Promise<void> {

  const { rows } = await pool.query<ProductoRow>(`
    SELECT DISTINCT p.*
    FROM productos p

    LEFT JOIN woocommerce_products wp
      ON wp.producto_codigo = p.codigo
      AND wp.tienda_id = p.tienda_id
      AND wp.variante_id IS NULL

    LEFT JOIN producto_variantes pv
      ON pv.producto_codigo = p.codigo
      AND pv.tienda_id = p.tienda_id

    LEFT JOIN woocommerce_products wpv
      ON wpv.variante_id = pv.id
      AND wpv.tienda_id = p.tienda_id

    WHERE p.tienda_id = $1
      AND (
        -- PRODUCTOS SIMPLES
        (
          p.tipo = 'simple'
          AND (
            wp.producto_codigo IS NULL
            OR p.updated_at > wp.last_synced_at
            OR wp.sync_status = 'error'
          )
        )

        OR

        -- PRODUCTOS VARIABLES
        (
          p.tipo = 'variable'
          AND (
            wp.producto_codigo IS NULL
            OR p.updated_at > wp.last_synced_at
            OR wp.sync_status = 'error'
            OR (pv.id IS NOT NULL AND wpv.variante_id IS NULL)
            OR (pv.id IS NOT NULL AND pv.updated_at > wpv.last_synced_at)
            OR wpv.sync_status = 'error'
          )
        )
      )

    LIMIT 50
  `, [tienda.id]);

  console.log(
    `[WCSync][${tienda.nombre}] ${rows.length} productos pendientes.`
  );

  for (const producto of rows) {
    console.log(
      `[WCSync][${tienda.nombre}] Procesando ${producto.tipo}: ${producto.codigo}`
    );

    await syncProducto(tienda, producto);
  }
}

// =====================================================
// DISTRIBUIR SINCRONIZACIÓN
// =====================================================

async function syncProducto(
  tienda: Tienda,
  producto: ProductoRow
): Promise<void> {

  try {

    if (producto.tipo === 'simple') {
      await syncSimple(tienda, producto);
      return;
    }

    console.log(
      `[WCSync][${tienda.nombre}] Producto variable ${producto.codigo}: requiere sincronizador de variables.`
    );

    // Aquí se conecta el sincronizador de productos variables.
    // Ejemplo: await syncVariable(tienda, producto);

  } catch (err) {

    const message =
      err instanceof Error ? err.message : 'Error desconocido';

    console.error(
      `[WCSync][${tienda.nombre}] Error en producto ${producto.codigo}:`,
      err
    );

    await pool.query(`
      INSERT INTO woocommerce_products
        (tienda_id, producto_codigo, variante_id, woocommerce_id, sync_status, error_message)
      VALUES ($1, $2, NULL, 0, 'error', $3)
      ON CONFLICT (tienda_id, producto_codigo, variante_id) DO UPDATE
      SET sync_status = 'error',
          error_message = $3,
          updated_at = NOW()
    `, [tienda.id, producto.codigo, message]);
  }
}

// =====================================================
// SINCRONIZAR PRODUCTO SIMPLE
// =====================================================

async function syncSimple(
  tienda: Tienda,
  producto: ProductoRow
): Promise<void> {

  console.log(
    `[WCSync][${tienda.nombre}] Procesando SIMPLE ${producto.codigo}`,
    {
      nombre: producto.nombre,
      precio: producto.precio,
      stock: producto.stock,
      activo: producto.activo,
    }
  );

  // Buscar mapeo existente
  const { rows: existing } = await pool.query(`
    SELECT *
    FROM woocommerce_products
    WHERE tienda_id = $1
      AND producto_codigo = $2
      AND variante_id IS NULL
  `, [tienda.id, producto.codigo]);

  const categoryId = producto.rubro
    ? await resolveCategoryId(tienda, producto.rubro)
    : null;

  try {

    // =================================================
    // CREAR PRODUCTO
    // =================================================

    if (!existing[0] || existing[0].woocommerce_id === 0) {

      if (!producto.activo) {
        console.log(
          `[WCSync] Producto ${producto.codigo} inactivo. No se crea.`
        );
        return;
      }

      console.log(
        `[WCSync][${tienda.nombre}] CREANDO ${producto.codigo}`,
        {
          precio: producto.precio,
          stock: producto.stock,
          categoryId,
        }
      );

      const { woocommerce_id } = await withRetry(
        () => createSimpleProduct(tienda, {
          codigo: producto.codigo,
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          imagen: null,
          precio: producto.precio,
          precio_descuento: null,
          stock: producto.stock,
          sku: producto.codigo,
          codigo_barras: null,
          category_id: categoryId,
        }),
        `createSimpleProduct ${producto.codigo}`,
        tienda
      );

      await pool.query(`
        INSERT INTO woocommerce_products
          (tienda_id, producto_codigo, variante_id, woocommerce_id, sync_status, last_synced_at)
        VALUES ($1, $2, NULL, $3, 'ok', NOW())
      `, [tienda.id, producto.codigo, woocommerce_id]);

      console.log(
        `[WCSync][${tienda.nombre}] PRODUCTO CREADO ${producto.codigo}. WC ID: ${woocommerce_id}`
      );

      return;
    }

    // =================================================
    // ACTUALIZAR PRODUCTO EXISTENTE
    // =================================================

    const woocommerceId = existing[0].woocommerce_id;

    try {

      // DESACTIVAR
      if (!producto.activo) {

        console.log(
          `[WCSync][${tienda.nombre}] DESACTIVANDO ${producto.codigo}`
        );

        await withRetry(
          () => deactivateProduct(tienda, woocommerceId),
          `deactivateProduct ${producto.codigo}`,
          tienda
        );

      } else {

        // ACTIVAR
        await withRetry(
          () => activateProduct(tienda, woocommerceId),
          `activateProduct ${producto.codigo}`,
          tienda
        );

        // ACTUALIZAR DATOS
        console.log(
          `[WCSync][${tienda.nombre}] ACTUALIZANDO ${producto.codigo}`,
          {
            woocommerce_id: woocommerceId,
            precio: producto.precio,
            stock: producto.stock,
            categoryId,
            nombre: producto.nombre,
          }
        );

        await withRetry(
          () => updateSimpleProduct(tienda, woocommerceId, {
            precio: producto.precio,
            precio_descuento: null,
            stock: producto.stock,
            category_id: categoryId,
            nombre: producto.nombre,
            descripcion: producto.descripcion,
          }),
          `updateSimpleProduct ${producto.codigo}`,
          tienda
        );

        console.log(
          `[WCSync][${tienda.nombre}] PRODUCTO ACTUALIZADO ${producto.codigo} correctamente.`
        );
      }

      // MARCAR SINCRONIZACIÓN EXITOSA
      await pool.query(`
        UPDATE woocommerce_products
        SET sync_status = 'ok',
            error_message = NULL,
            last_synced_at = NOW(),
            updated_at = NOW()
        WHERE tienda_id = $1
          AND producto_codigo = $2
          AND variante_id IS NULL
      `, [tienda.id, producto.codigo]);

    } catch (err) {

      const message =
        err instanceof Error ? err.message : 'Error desconocido';

      // SI NO EXISTE EN WOOCOMMERCE
      if (message.includes('404')) {

        console.warn(
          `[WCSync][${tienda.nombre}] Producto ${producto.codigo} no encontrado en WC. Eliminando mapeo.`
        );

        await pool.query(`
          DELETE FROM woocommerce_products
          WHERE tienda_id = $1
            AND producto_codigo = $2
            AND variante_id IS NULL
        `, [tienda.id, producto.codigo]);

        return;
      }

      throw err;
    }

  } catch (err) {

    const message =
      err instanceof Error ? err.message : 'Error desconocido';

    console.error(
      `[WCSync][${tienda.nombre}] ERROR en producto ${producto.codigo}:`,
      err
    );

    await pool.query(`
      INSERT INTO woocommerce_products
        (tienda_id, producto_codigo, variante_id, woocommerce_id, sync_status, error_message)
      VALUES ($1, $2, NULL, 0, 'error', $3)
      ON CONFLICT (tienda_id, producto_codigo, variante_id) DO UPDATE
      SET sync_status = 'error',
          error_message = $3,
          updated_at = NOW()
    `, [tienda.id, producto.codigo, message]);
  }
}
