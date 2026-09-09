import { access, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = path.join(projectRoot, "dist", "server", "index.js");
const hostingPath = path.join(projectRoot, "dist", ".openai", "hosting.json");
await Promise.all([access(workerPath), access(hostingPath)]);
JSON.parse(await readFile(hostingPath, "utf8"));
const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must export default.fetch");
}
console.log("Validated Sites artifact without saving or deploying it.");
