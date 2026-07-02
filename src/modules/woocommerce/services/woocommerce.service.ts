import { Tienda } from '../../../types/tienda';
import { WCProduct, WCVariation, WCOrder } from '../types/woocommerce';

const getBaseUrl = (tienda: Tienda) => `${tienda.wc_url}/wp-json/wc/v3`;

const getHeaders = (tienda: Tienda) => ({
  'Content-Type': 'application/json',
  'Authorization': 'Basic ' + Buffer.from(
    `${tienda.wc_consumer_key}:${tienda.wc_consumer_secret}`
  ).toString('base64'),
});

// ─── Productos simples ────────────────────────────────────────

export async function createSimpleProduct(tienda: Tienda, data: {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  imagen: string | null;
  precio: number;
  precio_descuento: number | null;
  stock: number;
  sku: string | null;
  codigo_barras: string | null;
  category_id: number | null;
}): Promise<{ woocommerce_id: number }> {
  const res = await fetch(`${getBaseUrl(tienda)}/products`, {
    method: 'POST',
    headers: getHeaders(tienda),
    body: JSON.stringify({
      name: data.nombre,
      type: 'simple',
      status: 'publish',
      description: data.descripcion ?? '',
      sku: data.sku ?? data.codigo,
      regular_price: data.precio.toString(),
      sale_price: data.precio_descuento?.toString() ?? '',
      manage_stock: true,
      stock_quantity: data.stock,
      ...(data.category_id ? { categories: [{ id: data.category_id }] } : {}),
      ...(data.imagen ? { images: [{ src: data.imagen }] } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();

    // SKU duplicado — el producto ya existe, recuperar su ID
    if (res.status === 400) {
      try {
        const errJson = JSON.parse(errText);
        if (errJson.code === 'product_invalid_sku' && errJson.data?.resource_id) {
          console.log(`[WC] Producto ${data.codigo} ya existe en WC con ID ${errJson.data.resource_id}, recuperando mapeo...`);
          return { woocommerce_id: errJson.data.resource_id };
        }
      } catch {}
    }

    throw new Error(`WC createSimpleProduct error: ${res.status} - ${errText}`);
  }

  const product: WCProduct = await res.json();
  return { woocommerce_id: product.id };
}
export async function updateSimpleProduct(tienda: Tienda,
  woocommerce_id: number,
  data: {
    precio: number;
    precio_descuento: number | null;
    stock: number;
    category_id: number | null;  // ← nuevo
  }
): Promise<void> {
  const res = await fetch(`${getBaseUrl(tienda)}/products/${woocommerce_id}`, {
    method: 'PUT',
    headers: getHeaders(tienda),
    body: JSON.stringify({
      regular_price: data.precio.toString(),
      sale_price: data.precio_descuento?.toString() ?? '',
      stock_quantity: data.stock,
      ...(data.category_id ? { categories: [{ id: data.category_id }] } : {}),  // ← nuevo
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WC updateSimpleProduct error: ${res.status} - ${err}`);
  }
}

// ─── Productos variables ──────────────────────────────────────

export async function createVariableProduct(tienda: Tienda, data: {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  imagen: string | null;
  atributos: Record<string, string[]>;
  category_id: number | null;
}): Promise<{ woocommerce_id: number }> {
  const attributes = Object.entries(data.atributos).map(([name, options]) => ({
    name, options, variation: true, visible: true,
  }));

  const res = await fetch(`${getBaseUrl(tienda)}/products`, {
    method: 'POST',
    headers: getHeaders(tienda),
    body: JSON.stringify({
      name: data.nombre,
      type: 'variable',
      status: 'publish',
      description: data.descripcion ?? '',
      sku: data.codigo,
      attributes,
      ...(data.category_id ? { categories: [{ id: data.category_id }] } : {}),
      ...(data.imagen ? { images: [{ src: data.imagen }] } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();

    // SKU duplicado — recuperar ID existente
    if (res.status === 400) {
      try {
        const errJson = JSON.parse(errText);
        if (errJson.code === 'product_invalid_sku' && errJson.data?.resource_id) {
          console.log(`[WC] Producto variable ${data.codigo} ya existe en WC con ID ${errJson.data.resource_id}, recuperando mapeo...`);
          return { woocommerce_id: errJson.data.resource_id };
        }
      } catch {}
    }

    throw new Error(`WC createVariableProduct error: ${res.status} - ${errText}`);
  }

  const product: WCProduct = await res.json();
  return { woocommerce_id: product.id };
}

export async function createVariation(tienda: Tienda,
  woocommerce_id: number,
  data: {
    sku: string | null;
    atributos: Record<string, string>;
    precio: number;
    precio_descuento: number | null;
    stock: number;
  }
): Promise<{ wc_variation_id: number }> {
  const attributes = Object.entries(data.atributos).map(([name, option]) => ({
    name,
    option,
  }));

  const res = await fetch(`${getBaseUrl(tienda)}/products/${woocommerce_id}/variations`, {
    method: 'POST',
    headers: getHeaders(tienda),
    body: JSON.stringify({
      sku: data.sku ?? '',
      regular_price: data.precio.toString(),
      sale_price: data.precio_descuento?.toString() ?? '',
      manage_stock: true,
      stock_quantity: data.stock,
      attributes,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WC createVariation error: ${res.status} - ${err}`);
  }

  const variation: WCVariation = await res.json();
  return { wc_variation_id: variation.id };
}

export async function updateVariation(tienda: Tienda,
  woocommerce_id: number,
  wc_variation_id: number,
  data: {
    precio: number;
    precio_descuento: number | null;
    stock: number;
  }
): Promise<void> {
  const res = await fetch(
    `${getBaseUrl(tienda)}/products/${woocommerce_id}/variations/${wc_variation_id}`,
    {
      method: 'PUT',
      headers: getHeaders(tienda),
      body: JSON.stringify({
        regular_price: data.precio.toString(),
        sale_price: data.precio_descuento?.toString() ?? '',
        stock_quantity: data.stock,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WC updateVariation error: ${res.status} - ${err}`);
  }
}

export async function activateProduct(tienda: Tienda, woocommerce_id: number): Promise<void> {
  const res = await fetch(`${getBaseUrl(tienda)}/products/${woocommerce_id}`, {
    method: 'PUT',
    headers: getHeaders(tienda),
    body: JSON.stringify({ status: 'publish' }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WC activateProduct error: ${res.status} - ${err}`);
  }
}

export async function deactivateProduct(tienda: Tienda, woocommerce_id: number): Promise<void> {
  const res = await fetch(`${getBaseUrl(tienda)}/products/${woocommerce_id}`, {
    method: 'PUT',
    headers: getHeaders(tienda),
    body: JSON.stringify({ status: 'draft' }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WC deactivateProduct error: ${res.status} - ${err}`);
  }
}

export async function getOrder(tienda: Tienda, order_id: number): Promise<WCOrder> {
  const res = await fetch(`${getBaseUrl(tienda)}/orders/${order_id}`, {
    headers: getHeaders(tienda),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WC getOrder error: ${res.status} - ${err}`);
  }

  return res.json();
}

// ─── Categorías ───────────────────────────────────────────────

export async function getCategoryByName(tienda: Tienda, nombre: string): Promise<number | null> {
  const res = await fetch(
    `${getBaseUrl(tienda)}/products/categories?search=${encodeURIComponent(nombre)}&per_page=10`,
    { headers: getHeaders(tienda) }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WC getCategoryByName error: ${res.status} - ${err}`);
  }

  const categories = await res.json();
  const match = categories.find((c: any) => c.name.toLowerCase() === nombre.toLowerCase());
  return match ? match.id : null;
}

export async function createCategory(tienda: Tienda, nombre: string): Promise<number> {
  const res = await fetch(`${getBaseUrl(tienda)}/products/categories`, {
    method: 'POST',
    headers: getHeaders(tienda),
    body: JSON.stringify({ name: nombre }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WC createCategory error: ${res.status} - ${err}`);
  }

  const category = await res.json();
  return category.id;
}