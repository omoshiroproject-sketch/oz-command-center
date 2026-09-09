import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, timeoutMs) {
  const child = spawn(command, args, {
    cwd: projectRoot, stdio: "inherit",
    env: { ...process.env, WRANGLER_LOG_PATH: path.join(projectRoot, ".wrangler", "wrangler.log") },
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
  return new Promise((resolve, reject) => child.on("exit", (code, signal) => {
    clearTimeout(timer);
    if (code === 0) resolve(); else reject(new Error(`${command} failed (${signal ?? code})`));
  }));
}

await run(path.join(projectRoot, "node_modules", ".bin", "vinext"), ["build"], 3 * 60 * 1000);
await run(process.execPath, [path.join(projectRoot, "scripts", "validate-artifact.mjs")], 30_000);
