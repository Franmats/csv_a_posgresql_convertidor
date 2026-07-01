import { pool } from '../../../config/db';
import { Tienda } from '../../../types/tienda';
import { syncPendingProducts } from '../services/sync.service';

const runningMap = new Map<number, boolean>();

async function tick(tienda: Tienda): Promise<void> {
  if (runningMap.get(tienda.id)) {
    console.log(`[WCWorker][${tienda.nombre}] Sync anterior corriendo, saltando...`);
    return;
  }

  runningMap.set(tienda.id, true);

  try {
    console.log(`[WCWorker][${tienda.nombre}] ${new Date().toISOString()} - Iniciando sync...`);
    await syncPendingProducts(tienda);
    console.log(`[WCWorker][${tienda.nombre}] Sync completado.`);
  } catch (err) {
    console.error(`[WCWorker][${tienda.nombre}] Error inesperado:`, err);
  } finally {
    runningMap.set(tienda.id, false);
  }
}

export async function startWCWorkers(): Promise<void> {
  const { rows: tiendas } = await pool.query<Tienda>(
    'SELECT * FROM tiendas WHERE activo = TRUE'
  );

  console.log(`[WCWorker] ${tiendas.length} tiendas activas encontradas.`);

  for (const tienda of tiendas) {
    tick(tienda);
    setInterval(() => tick(tienda), 60_000);
    console.log(`[WCWorker][${tienda.nombre}] Worker iniciado.`);
  }
}