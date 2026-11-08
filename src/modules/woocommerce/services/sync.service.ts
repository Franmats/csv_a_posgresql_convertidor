import fs from 'fs';
import { pool } from '../../../config/db';
import { Tienda } from '../../../types/tienda';
import {
  getCategoryByName,
  createCategory,
  createSimpleProduct,
  updateSimpleProduct,
  activateProduct,
  deactivateProduct,
  getProductBySku,
} from './woocommerce.service';

interface ProductoRow {
  id: number;
  tienda_id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  rubro: string | null;
  precio: number;
  precio_descuento: number | null;
  stock: number;
  codigo_barras: string | null;
  activo: boolean;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000];

async function withRetry<T>(fn: () => Promise<T>, context: string, tienda: Tienda): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (lastError.message.includes('404')) {
        console.warn(`[WCSync][${tienda.nombre}] 404 Detectado en context "${context}". Omitiendo retries.`);
        throw lastError;
      }

      if (lastError.message.includes('429')) {
        const delay = RETRY_DELAYS[attempt] ?? 30000;
        console.warn(`[WCSync][${tienda.nombre}] Rate limit (429) en ${context}. Intento ${attempt + 1}/${MAX_RETRIES}. Reintentando en ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[WCSync][${tienda.nombre}] Error en ${context} (Intento ${attempt + 1}/${MAX_RETRIES}): "${lastError.message}". Reintentando en ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

async function resolveCategoryId(tienda: Tienda, rubro: string): Promise<number | null> {
  if (!rubro) {
    console.log(`[WCSync][${tienda.nombre}] Producto sin rubro/categoría asignada.`);
    return null;
  }

  console.log(`[WCSync][${tienda.nombre}] [Rubro] Resolviendo categoría para "${rubro}"...`);

  // 1. Verificar cache en DB local
  const { rows } = await pool.query(
    'SELECT wc_category_id FROM woocommerce_categories WHERE tienda_id = $1 AND nombre = $2',
    [tienda.id, rubro]
  );

  if (rows.length > 0) {
    console.log(`[WCSync][${tienda.nombre}] [Rubro] "${rubro}" encontrado en cache local -> WC Category ID: ${rows[0].wc_category_id}`);
    return rows[0].wc_category_id;
  }

  // 2. Buscar en WC
  console.log(`[WCSync][${tienda.nombre}] [Rubro] "${rubro}" no está en cache local. Consultando API de WooCommerce...`);
  let wc_category_id = await getCategoryByName(tienda, rubro);

  // 3. Crear en WC si no existe
  if (!wc_category_id) {
    console.log(`[WCSync][${tienda.nombre}] [Rubro] "${rubro}" no existe en WC. Creando categoría en la API...`);
    wc_category_id = await createCategory(tienda, rubro);
    console.log(`[WCSync][${tienda.nombre}] [Rubro] Categoría "${rubro}" creada exitosamente en WC -> ID: ${wc_category_id}`);
  } else {
    console.log(`[WCSync][${tienda.nombre}] [Rubro] Categoría "${rubro}" encontrada en WC -> ID: ${wc_category_id}`);
  }

  // 4. Guardar en BD local
  await pool.query(
    `INSERT INTO woocommerce_categories (tienda_id, nombre, wc_category_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (tienda_id, nombre) DO NOTHING`,
    [tienda.id, rubro, wc_category_id]
  );
  console.log(`[WCSync][${tienda.nombre}] [Rubro] Mapeo de categoría "${rubro}" -> ${wc_category_id} guardado en BD local.`);

  return wc_category_id;
}

export async function syncPendingProducts(tienda: Tienda): Promise<void> {
  console.log(`\n======================================================`);
  console.log(`[WCSync][${tienda.nombre}] Iniciando proceso de sincronización...`);
  console.log(`======================================================`);

  // Toma los datos del producto y su variante (precio, stock, barras).
  // Evalúa el estado activo general combinando el producto y la variante.
  const { rows } = await pool.query<ProductoRow>(`
    SELECT DISTINCT ON (p.codigo)
      p.id,
      p.tienda_id,
      p.codigo,
      p.nombre,
      p.descripcion,
      p.rubro,
      (p.activo AND pv.activo) AS activo,
      pv.precio,
      pv.precio_descuento,
      pv.stock,
      pv.codigo_barras
    FROM productos p
    INNER JOIN producto_variantes pv ON pv.producto_codigo = p.codigo 
      AND pv.tienda_id = p.tienda_id
    LEFT JOIN woocommerce_products wp ON wp.producto_codigo = p.codigo
      AND wp.tienda_id = p.tienda_id
      AND wp.variante_id IS NULL
    WHERE p.tienda_id = $1
      AND (
        wp.producto_codigo IS NULL
        OR p.updated_at > wp.last_synced_at
        OR pv.updated_at > wp.last_synced_at
        OR wp.sync_status = 'error'
      )
    ORDER BY p.codigo, pv.updated_at DESC
    LIMIT 50
  `, [tienda.id]);

  console.log(`[WCSync][${tienda.nombre}] Productos simples pendientes encontrados: ${rows.length}`);

  if (rows.length === 0) {
    console.log(`[WCSync][${tienda.nombre}] No hay productos pendientes de sincronización.`);
    return;
  }

  let procesados = 0;
  let exitosos = 0;
  let conError = 0;

  for (const producto of rows) {
    procesados++;
    console.log(`\n--- [${procesados}/${rows.length}] Procesando Producto: ${producto.codigo} ("${producto.nombre}") ---`);

    try {
      await syncProducto(tienda, producto);
      exitosos++;
    } catch {
      conError++;
    }
  }

  console.log(`\n======================================================`);
  console.log(`[WCSync][${tienda.nombre}] Resumen de ejecucion:`);
  console.log(` Total procesados : ${procesados}`);
  console.log(` Exitosos         : ${exitosos}`);
  console.log(` Con Error        : ${conError}`);
  console.log(`======================================================\n`);
}

async function syncProducto(tienda: Tienda, producto: ProductoRow): Promise<void> {
  try {
    await syncSimple(tienda, producto);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error(`[WCSync][${tienda.nombre}][${producto.codigo}] Falla en syncProducto:`, message);

    console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] Registrando estado 'error' en woocommerce_products...`);
    await pool.query(`
      INSERT INTO woocommerce_products
        (tienda_id, producto_codigo, variante_id, woocommerce_id, sync_status, error_message)
      VALUES ($1, $2, NULL, 0, 'error', $3)
      ON CONFLICT (tienda_id, producto_codigo, variante_id) DO UPDATE
      SET sync_status = 'error', error_message = $3, updated_at = NOW()
    `, [tienda.id, producto.codigo, message]);

    throw err;
  }
}

async function syncSimple(tienda: Tienda, producto: ProductoRow): Promise<void> {
  console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] Datos cargados (Productos + Variante):`, {
    nombre: producto.nombre,
    precio: producto.precio,
    stock: producto.stock,
    activo: producto.activo,
    rubro: producto.rubro,
  });

  // 1. Buscar relacion en BD local woocommerce_products
  console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] PASO 1: Consultando tabla woocommerce_products local...`);
  const { rows: existing } = await pool.query(`
    SELECT * FROM woocommerce_products
    WHERE tienda_id = $1 AND producto_codigo = $2 AND variante_id IS NULL
  `, [tienda.id, producto.codigo]);

  let woocommerceId: number | null = existing[0]?.woocommerce_id || null;

  if (existing.length > 0) {
    console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] Mapeo local ENCONTRADO -> WC ID: ${woocommerceId}, Status previo: ${existing[0].sync_status}`);
  } else {
    console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] Mapeo local NO encontrado.`);
  }

  // Resolucion de Categoria
  const categoryId = producto.rubro
    ? await resolveCategoryId(tienda, producto.rubro)
    : null;

  try {
    // 2. Si no hay mapeo local o el ID guardado es 0, consultar WooCommerce por SKU o Crear
    if (!woocommerceId || woocommerceId === 0) {
      console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] PASO 2: Sin WC ID local. Buscando en WooCommerce API por SKU: "${producto.codigo}"...`);

      const wcProduct = await withRetry(
        () => getProductBySku(tienda, producto.codigo),
        `getProductBySku ${producto.codigo}`,
        tienda
      );

      const existingWcProduct = Array.isArray(wcProduct) ? wcProduct[0] : wcProduct;

      if (existingWcProduct && existingWcProduct.id) {
        woocommerceId = existingWcProduct.id;
        console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] ✅ Producto ENCONTRADO en WC mediante SKU -> ID asignado: ${woocommerceId}`);
      } else {
        console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] ❌ Producto no existe en WooCommerce.`);

        if (!producto.activo) {
          console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] 🛑 Producto inactivo localmente y no existe en WC. Omitiendo creación.`);
          return;
        }

        console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] 🚀 CREANDO nuevo producto simple en WooCommerce...`);

        const created = await withRetry(
          () => createSimpleProduct(tienda, {
            codigo: producto.codigo,
            nombre: producto.nombre,
            descripcion: producto.descripcion,
            imagen: null,
            precio: producto.precio,
            precio_descuento: producto.precio_descuento,
            stock: producto.stock,
            sku: producto.codigo,
            codigo_barras: producto.codigo_barras,
            category_id: categoryId,
          }),
          `createSimpleProduct ${producto.codigo}`,
          tienda
        );

        woocommerceId = created.woocommerce_id;
        console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] ✅ Producto CREADO exitosamente en WC -> ID asignado: ${woocommerceId}`);
      }

      // 3. Guardar relacion en woocommerce_products local
      console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] PASO 3: Guardando vinculación (local <-> WC ID ${woocommerceId}) en DB local...`);
      await pool.query(`
        INSERT INTO woocommerce_products
          (tienda_id, producto_codigo, variante_id, woocommerce_id, sync_status, last_synced_at)
        VALUES ($1, $2, NULL, $3, 'ok', NOW())
        ON CONFLICT (tienda_id, producto_codigo, variante_id) DO UPDATE
        SET woocommerce_id = $3, sync_status = 'ok', last_synced_at = NOW(), updated_at = NOW()
      `, [tienda.id, producto.codigo, woocommerceId]);
      console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] Mapeo local guardado/actualizado.`);
    }

    // 4. Sincronizar estado y datos en WooCommerce
    console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] PASO 4: Actualizando datos en WooCommerce (WC ID: ${woocommerceId})...`);

    if (!producto.activo) {
      console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] 🔴 Cambiando estado a INACTIVO (draft) en WC...`);
      await withRetry(
        () => deactivateProduct(tienda, woocommerceId!),
        `deactivateProduct ${producto.codigo}`,
        tienda
      );
      console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] Estado inactivo (draft) aplicado.`);
    } else {
      console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] 🟢 Asegurando estado ACTIVO (publish) en WC...`);
      await withRetry(
        () => activateProduct(tienda, woocommerceId!),
        `activateProduct ${producto.codigo}`,
        tienda
      );

      console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] 🔄 Enviando update con datos frescos (Precio: ${producto.precio}, Stock: ${producto.stock}, CatID: ${categoryId})...`);
      await withRetry(
        () => updateSimpleProduct(tienda, woocommerceId!, {
          precio: producto.precio,
          precio_descuento: producto.precio_descuento,
          stock: producto.stock,
          category_id: categoryId,
          nombre: producto.nombre,
          descripcion: producto.descripcion,
        }),
        `updateSimpleProduct ${producto.codigo}`,
        tienda
      );
      console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] Datos actualizados correctamente en WC.`);
    }

    // 5. Confirmar sincronización OK en BD local
    console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] PASO 5: Actualizando last_synced_at y status 'ok' en BD local...`);
    await pool.query(`
      UPDATE woocommerce_products
      SET sync_status = 'ok', error_message = NULL,
          last_synced_at = NOW(), updated_at = NOW()
      WHERE tienda_id = $1 AND producto_codigo = $2 AND variante_id IS NULL
    `, [tienda.id, producto.codigo]);

    console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] ✨ Sincronización finalizada CON ÉXITO.`);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';

    if (message.includes('404')) {
      console.warn(`[WCSync][${tienda.nombre}][${producto.codigo}] ⚠️ El producto devolvió 404 Not Found en WC. Eliminando mapeo obsoleto de BD local...`);

      await pool.query(`
        DELETE FROM woocommerce_products
        WHERE tienda_id = $1 AND producto_codigo = $2
      `, [tienda.id, producto.codigo]);

      console.log(`[WCSync][${tienda.nombre}][${producto.codigo}] Mapeo eliminado.`);
      return;
    }

    throw err;
  }
}