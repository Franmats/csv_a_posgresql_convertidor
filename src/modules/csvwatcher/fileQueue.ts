import path from 'path';
import { Tienda } from '../../types/tienda';
import { processFile } from './fileProcessor';

interface QueueItem {
  filePath: string;
  tienda: Tienda;
}

let queue: QueueItem[] = [];
let processing = false;

export function enqueueFile(filePath: string, tienda: Tienda): void {
  queue.push({ filePath, tienda });
  sortQueue();
  processQueue();
}

function sortQueue(): void {
  queue.sort((a, b) => {
    const aName = path.basename(a.filePath);
    const bName = path.basename(b.filePath);
    return extractTime(aName) - extractTime(bName);
  });
}

function extractTime(name: string): number {
  const match = name.match(/_(\d{6})\.csv$/);
  return match ? parseInt(match[1]) : 0;
}

async function processQueue(): Promise<void> {
  if (processing) return;
  if (queue.length === 0) return;

  processing = true;

  const item = queue.shift()!;
  try {
    await processFile(item.filePath, item.tienda);
  } catch (err) {
    console.error(`[CsvWatcher][${item.tienda.nombre}] Error procesando:`, err);
  }

  processing = false;
  processQueue();
}