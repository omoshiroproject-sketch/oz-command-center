import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.join(projectRoot, ".sites-runtime");
const lockDirectory = path.join(runtimeRoot, "install.lock.d");
const cacheDirectory = path.join(runtimeRoot, "npm-cache");
await mkdir(runtimeRoot, { recursive: true });
await mkdir(cacheDirectory, { recursive: true });
try { await mkdir(lockDirectory); }
catch { throw new Error("Another dependency installation is already running for this project."); }

function runInstall() {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run this script through npm run install:ci.");
  const child = spawn(process.execPath, [npmCli, "ci", `--cache=${cacheDirectory}`, "--no-fund"], {
    cwd: projectRoot, stdio: "inherit", env: { ...process.env, npm_config_update_notifier: "false" },
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), 8 * 60 * 1000);
  return new Promise((resolve, reject) => child.on("exit", (code, signal) => {
    clearTimeout(timer);
    if (code === 0) resolve(); else reject(new Error(`npm ci failed (${signal ?? code})`));
  }));
}

try { await runInstall(); }
finally { await rm(lockDirectory, { recursive: true, force: true }); }
