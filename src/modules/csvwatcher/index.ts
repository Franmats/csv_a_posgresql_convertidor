import chokidar from 'chokidar';
import { pool } from '../../config/db';
import { Tienda } from '../../types/tienda';
import { enqueueFile } from './fileQueue';

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

    console.log(`[CsvWatcher][${tienda.nombre}] Watching: ${tienda.csv_watch_dir}`);
  }
}