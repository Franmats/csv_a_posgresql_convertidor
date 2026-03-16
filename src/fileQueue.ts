import fs from "fs";
import path from "path";
import { processFile } from "./fileProcessor";

let queue: string[] = [];
let processing = false;

export function enqueueFile(filePath: string) {
  queue.push(filePath);
  sortQueue();
  processQueue();
}

function sortQueue() {
  queue.sort((a, b) => {
    const aName = path.basename(a);
    const bName = path.basename(b);

    const timeA = extractTime(aName);
    const timeB = extractTime(bName);

    return timeA - timeB;
  });
}

function extractTime(name: string): number {
  const match = name.match(/_(\d{6})\.csv$/);
  return match ? parseInt(match[1]) : 0;
}

async function processQueue() {
  if (processing) return;
  if (queue.length === 0) return;

  processing = true;

  const file = queue.shift()!;
  try {
    await processFile(file);
  } catch (err) {
    console.error("Error procesando:", err);
  }

  processing = false;
  processQueue();
}