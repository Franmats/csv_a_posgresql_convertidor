                                                                                    
import fs from "fs";
import path from "path";
import { bulkArticulos, processProductoFile, deleteProducto } from "./modules/productos";
import { processUserFile } from "./modules/users";

export async function processFile(filePath: string) {

  const fileName = path.basename(filePath);

  if (!fs.existsSync(filePath)) return;

  if (fileName === "articulos.csv") {
    await bulkArticulos(filePath);

  } else if (fileName.startsWith("update_")) {
    await processProductoFile(filePath);

  } else if (fileName.startsWith("delete_")) {
    await deleteProducto(filePath);

  } else if (
    fileName.startsWith("alta-") ||
    fileName.startsWith("baja-")
  ) {
    await processUserFile(filePath);
  }

  fs.unlinkSync(filePath);
  console.log(`✔ ${fileName} procesado y eliminado`);
}