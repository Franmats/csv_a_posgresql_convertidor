import chokidar from 'chokidar';
import { pool } from '../../config/db';
import { Tienda } from '../../types/tienda';
import { enqueueFile } from './fileQueue';
import { processImage } from './imageProcessor';
import path from 'path/win32';
import fs from 'fs';
export async function startCsvWatchers(): Promise<void> {
  const { rows: tiendas } = await pool.query<Tienda>(
    'SELECT * FROM tiendas WHERE activo = TRUE'
  );

  console.log(`[CsvWatcher] ${tiendas.length} tiendas activas encontradas.`);

  for (const tienda of tiendas) {
    const watcher = chokidar.watch(tienda.csv_watch_dir, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    watcher.on('add', (filePath) => {
      enqueueFile(filePath, tienda);
    });

    // Watcher de imágenes
    const imageWatcher = chokidar.watch(tienda.images_dir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
    });
    imageWatcher.on('add', (filePath) => processImage(filePath, tienda));
    setInterval(async () => {
      try {
        const files = fs.readdirSync(tienda.images_dir);
        for (const file of files) {
          const filePath = path.join(tienda.images_dir, file);
          await processImage(filePath, tienda);
        }
      } catch {}
    }, 60_000);
   /*  console.log(`[CsvWatcher][${tienda.nombre}] Watching: ${tienda.csv_watch_dir}`); */
  }
}