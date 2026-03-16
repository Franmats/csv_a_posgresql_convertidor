import chokidar from "chokidar";
import { enqueueFile } from "./fileQueue";

const BASE_PATH = "./productos";

const watcher = chokidar.watch(BASE_PATH, {
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100
  }
});

watcher.on("add", (filePath) => {
  enqueueFile(filePath);
});

console.log("Watcher iniciado...");