import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = await readFile(path.join(root, "app/page.tsx"), "utf8");
const scripts = await readFile(path.join(root, "app/oz-scripts.tsx"), "utf8");
const workspace = await readFile(path.join(root, "public/oz-workspace.js"), "utf8");
const network = await readFile(path.join(root, "public/oz-network.js"), "utf8");
const demo = await readFile(path.join(root, "public/app.js"), "utf8");

test("normal TASKS and LIVE OZ markup keeps only implemented footer operations", () => {
  assert.match(page, /id="networkBtn"/);
  assert.match(page, /id="fullscreenBtn"/);
  assert.match(page, /includeLocalDemo \? <span className="demo-control-group"/);
  assert.match(page, /includeLocalDemo\s+\? <div className="context-center" id="contextTags"/);
  assert.match(page, /: <div className="context-center" aria-hidden="true" \/>/);
  assert.doesNotMatch(page, /data-action="fullscreen"/);
  assert.match(workspace, /function fullscreenSupported\(\)/);
  assert.match(workspace, /elements\.fullscreenBtn\.hidden = !supported/);
  assert.match(workspace, /elements\.fullscreenBtn\?\.addEventListener\('click'/);
  assert.match(network, /els\.networkBtn\?\.addEventListener\('click', openDrawer\)/);
});

test("demo scripts and controls are restricted to the local owner-gated demo route", () => {
  assert.match(scripts, /const demoRuntimeScripts = \["\/fixtures\/oz-demo-v1\.js", "\/app\.js"\]/);
  assert.match(scripts, /\["localhost", "127\.0\.0\.1"\]\.includes\(window\.location\.hostname\)/);
  assert.match(scripts, /path === "\/demo"/);
  assert.match(scripts, /localDemoRoute \? demoRuntimeScripts : \[\]/);
  assert.match(workspace, /setDemoControlsVisible\(false\)/);
  assert.match(workspace, /\['localhost','127\.0\.0\.1'\]\.includes\(host\)/);
  assert.match(workspace, /path === '\/demo'/);
  assert.match(workspace, /requestJson\('\/api\/oz\/context'\)/);
  assert.match(workspace, /setDemoControlsVisible\(true\)/);
});

test("demo navigation disables actions that cannot change the current scene", () => {
  assert.match(demo, /prevButton\.disabled = !active \|\| index <= 0/);
  assert.match(demo, /nextButton\.disabled = !active \|\| \(!autoMode && index >= data\.scenes\.length - 1\)/);
  assert.match(demo, /autoButton\.setAttribute\('aria-pressed', String\(autoMode\)\)/);
  assert.doesNotMatch(demo, /requestFullscreen|exitFullscreen/);
  assert.doesNotMatch(demo, /function updateClock/);
});
