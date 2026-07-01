import fs from 'fs';
import path from 'path';
import { Tienda } from '../../types/tienda';
import { bulkArticulos, bulkVariantes, processProductoFile, deleteProducto } from '../productos';

export async function processFile(filePath: string, tienda: Tienda): Promise<void> {
  const fileName = path.basename(filePath);

  if (!fs.existsSync(filePath)) return;

  if (fileName === 'articulos.csv') {
    await bulkArticulos(filePath, tienda);
  } else if (fileName === 'variantes.csv') {
    await bulkVariantes(filePath, tienda);
  } else if (fileName.startsWith('update_')) {
    await processProductoFile(filePath, tienda);
  } else if (fileName.startsWith('delete_')) {
    await deleteProducto(filePath, tienda);
  }

  fs.unlinkSync(filePath);
  console.log(`[CsvWatcher][${tienda.nombre}] ✔ ${fileName} procesado y eliminado`);
}