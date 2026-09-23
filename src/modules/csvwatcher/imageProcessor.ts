import fs from 'fs';
import path from 'path';
import { pool } from '../../config/db';
import { Tienda } from '../../types/tienda';
import { uploadProductImage } from '../woocommerce/services/woocommerce.service';

const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

export async function processImage(filePath: string, tienda: Tienda): Promise<void> {
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const codigo = path.basename(fileName, ext);

  // Verificar formato soportado
  if (!SUPPORTED_FORMATS.includes(ext)) {
    console.warn(`[ImageWatcher][${tienda.nombre}] Formato no soportado: ${fileName}`);
    return;
  }

  try {
    // Verificar que el producto existe en la DB
    const { rows: productos } = await pool.query(
      'SELECT id FROM productos WHERE tienda_id = $1 AND codigo = $2',
      [tienda.id, codigo]
    );

    if (productos.length === 0) {
      console.warn(`[ImageWatcher][${tienda.nombre}] Producto ${codigo} no encontrado en DB.`);
      fs.unlinkSync(filePath);
      return;
    }

    // Verificar que el producto existe en WooCommerce
    const { rows: wcProduct } = await pool.query(
      'SELECT woocommerce_id FROM woocommerce_products WHERE tienda_id = $1 AND producto_codigo = $2 AND variante_id IS NULL',
      [tienda.id, codigo]
    );

    if (wcProduct.length === 0 || wcProduct[0].woocommerce_id === 0) {
      console.warn(`[ImageWatcher][${tienda.nombre}] Producto ${codigo} no sincronizado en WC aún, reintentando luego.`);
      // No eliminamos el archivo — lo procesará en el próximo tick
      return;
    }

    // Convertir imagen a base64
    const imageBuffer = fs.readFileSync(filePath);
    const base64 = imageBuffer.toString('base64');
    const mimeType = getMimeType(ext);

    // Subir imagen a WooCommerce
    await uploadProductImage(tienda, wcProduct[0].woocommerce_id, base64, mimeType, fileName);

    // Actualizar tiene_imagen en la DB
    await pool.query(
      `UPDATE productos SET tiene_imagen = TRUE, updated_at = NOW()
       WHERE tienda_id = $1 AND codigo = $2`,
      [tienda.id, codigo]
    );

    // Eliminar archivo procesado
    fs.unlinkSync(filePath);

    console.log(`[ImageWatcher][${tienda.nombre}] Imagen ${fileName} subida a WC y eliminada.`);

  } catch (err) {
    console.error(`[ImageWatcher][${tienda.nombre}] Error procesando imagen ${fileName}:`, err);
  }
}

function getMimeType(ext: string): string {
  switch (ext) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png':  return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif':  return 'image/gif';
    default:      return 'image/jpeg';
  }
}