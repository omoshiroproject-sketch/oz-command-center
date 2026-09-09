import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = await readFile(path.join(root, "app/page.tsx"), "utf8");
const css = await readFile(path.join(root, "app/globals.css"), "utf8");
const live = await readFile(path.join(root, "public/live-oz.js"), "utf8");
const network = await readFile(path.join(root, "public/oz-network.js"), "utf8");
const workspace = await readFile(path.join(root, "public/oz-workspace.js"), "utf8");

test("primary controls are Japanese while OZ brand and internal values stay stable", () => {
  for (const brand of ["OZ", "COMMAND CENTER", "LIVE OZ", "OZ NETWORK"]) {
    assert.match(page, new RegExp(brand));
  }
  for (const copy of ["タスク", "デモ", "接続", "今日", "期限超過", "予定", "確認待ち", "承認する", "却下する", "送信", "追加", "更新", "事業一覧"]) {
    assert.match(`${page}\n${network}\n${workspace}`, new RegExp(copy));
  }
  for (const value of ["TODAY", "OVERDUE", "WEEK", "ALL", "COMPLETED", "APPROVED", "REJECTED", "NEEDS_EDIT"]) {
    assert.match(`${page}\n${network}\n${workspace}`, new RegExp(value));
  }
});

test("Realtime state and microphone copy are localized without changing event or tool contracts", () => {
  for (const copy of ["音声を開始", "音声を終了", "聞き取り中", "考え中", "応答中", "待機中"]) {
    assert.match(live, new RegExp(copy));
  }
  for (const contract of ["response.output_item.done", "oz_resolve_review", "idempotencyKey:`realtime:", "function_call_output"]) {
    assert.ok(live.includes(contract));
  }
});

test("contrast states, keyboard focus, and narrow viewport containment remain explicit", () => {
  assert.match(css, /button:focus-visible/);
  assert.match(css, /button:disabled/);
  assert.match(css, /\.task-view-tabs button\.active, \.right-panel-tabs button\.active, \.mode-btn\.active/);
  assert.match(css, /@media \(max-width:760px\)/);
  assert.match(css, /overflow-x:hidden/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/);
});
