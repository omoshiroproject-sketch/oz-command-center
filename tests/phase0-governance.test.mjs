import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

test("authoritative v2.0 specification is preserved byte-for-byte", async () => {
  const specification = await read(
    "docs/OZ_COMMAND_CENTER_開発仕様書_v2.0_20260823.md",
  );
  assert.equal(
    sha256(specification),
    "f0a00a7ad7f9d4c0af116e648d4bdf8c6a7f35dec17ca7eafcb9eddc1a3927d5",
  );
});

test("Phase 0 contract contains every confirmed enum value", async () => {
  const contract = String(await read("packages/contracts/src/index.ts"));
  const required = [
    "UNSTARTED", "IN_PROGRESS", "WAITING", "ON_HOLD", "COMPLETED",
    "PENDING", "APPROVED", "REJECTED", "NEEDS_EDIT",
    "PROPOSED", "EXECUTING", "SUCCEEDED", "FAILED", "CANCELLED",
    "IDEA", "PLANNED", "ACTIVE", "ARCHIVED",
    "DRAFT", "SENT", "WON", "LOST",
    "MEETING", "WORK", "TRAVEL", "FOCUS", "PERSONAL",
    "ANY", "MOBILE", "PC", "TRAVEL_OK", "CALL", "IN_PERSON",
    "RUNNING", "RETRYABLE",
  ];
  required.forEach((value) => assert.match(contract, new RegExp(`"${value}"`)));
  assert.match(contract, /executeApprovedAction\?\(approvalId: string\)/);
});

test("Phase 1B preserves the three-column and orb contract while separating formal and demo data", async () => {
  const page = String(await read("app/page.tsx"));
  assert.match(page, /className="dashboard-grid"/);
  assert.match(page, /projects-panel/);
  assert.match(page, /oz-panel/);
  assert.match(page, /chat-panel/);
  assert.match(page, /className="orb idle"/);
  assert.match(page, /id="reviewList"/);
  assert.match(page, /id="taskWorkspace"/);
  assert.match(page, /id="formalTaskList"/);
  assert.match(page, /includeLocalDemo \? <button id="demoModeBtn"[^>]*hidden/);
  const app = String(await read("public/app.js"));
  assert.match(app, /window\.OZ_DEMO_APP/);
  assert.doesNotMatch(app, /\n\s*renderProjects\(\);\s*\n\s*reset\(\);\s*\n\s*updateClock/);
  const fixture = String(await read("public/fixtures/oz-demo-v1.js"));
  assert.match(fixture, /Demo-only fixture/);
  assert.match(fixture, /window\.OZ_DATA/);
});

async function sourceFiles(directory) {
  const absolute = path.join(root, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(relative));
    else if (/\.(?:js|ts|tsx|css)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

test("OZ product source enforces the first person as 私", async () => {
  const files = (await Promise.all([
    sourceFiles("app"), sourceFiles("public"), sourceFiles("worker"),
  ])).flat();
  for (const relative of files) {
    assert.doesNotMatch(String(await read(relative)), /俺|僕|ぼく|オレ|わたくし/, relative);
  }
  assert.match(
    String(await read("worker/oz-system-prompt.ts")),
    /first-person pronoun is always「私」/,
  );
});
