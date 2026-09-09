import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "public/oz-workspace.js"), "utf8");

function runtime(executeTool = async () => ({ data: { requiresApproval: true, taskChanged: false } })) {
  const listeners = new Map();
  const window = {
    location: { hostname: "127.0.0.1", pathname: "/" },
    OZ_NETWORK: { executeTool, requestJson: async () => ({}) },
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
    },
  };
  const context = vm.createContext({
    window,
    document: {
      body: { dataset: {} },
      getElementById() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    crypto,
    console: { error() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout() { return 0; },
    clearTimeout() {},
    FormData,
  });
  vm.runInContext(source, context);
  const update = (detail) => window.dispatchEvent({ type: "oz:network-updated", detail });
  return { window, update };
}

function task(status) {
  return {
    id: "task-one", title: "Safe fixture", formalStatus: status,
    timeLane: "TODAY_IF_POSSIBLE", importance: 3,
  };
}

test("status control mirrors the existing state-machine transition contract", () => {
  const app = runtime();
  assert.deepEqual(Array.from(app.window.OZ_WORKSPACE.allowedTaskStatuses("UNSTARTED")), ["IN_PROGRESS", "WAITING", "ON_HOLD", "COMPLETED"]);
  assert.deepEqual(Array.from(app.window.OZ_WORKSPACE.allowedTaskStatuses("IN_PROGRESS")), ["WAITING", "ON_HOLD", "COMPLETED"]);
  assert.deepEqual(Array.from(app.window.OZ_WORKSPACE.allowedTaskStatuses("COMPLETED")), ["IN_PROGRESS"]);
});

test("status selection creates one review, leaves the formal task unchanged, and suppresses duplicates", async () => {
  let calls = 0;
  let release;
  const deferred = new Promise((resolve) => { release = resolve; });
  const app = runtime(async () => {
    calls += 1;
    await deferred;
    return { data: { requiresApproval: true, taskChanged: false } };
  });
  app.update({ tasks: [task("COMPLETED")], reviews: [] });

  assert.equal(await app.window.OZ_WORKSPACE.proposeTaskStatusChange("task-one", "UNSTARTED"), false);
  assert.equal(await app.window.OZ_WORKSPACE.proposeTaskStatusChange("task-one", "COMPLETED"), false);
  assert.equal(calls, 0);

  const first = app.window.OZ_WORKSPACE.proposeTaskStatusChange("task-one", "IN_PROGRESS");
  const duplicate = app.window.OZ_WORKSPACE.proposeTaskStatusChange("task-one", "IN_PROGRESS");
  assert.equal(await duplicate, false);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, true);
  assert.equal(app.window.OZ_WORKSPACE.getState().context.tasks[0].formalStatus, "COMPLETED");
  assert.equal(app.window.OZ_WORKSPACE.getState().statusNotice.message, "ステータス変更を確認待ちへ追加しました");

  app.update({
    tasks: [task("COMPLETED")],
    reviews: [{ kind: "TASK_STATUS_CHANGE", status: "PENDING", target_id: "task-one", candidate_data: { taskId: "task-one", status: "IN_PROGRESS" } }],
  });
  assert.equal(await app.window.OZ_WORKSPACE.proposeTaskStatusChange("task-one", "IN_PROGRESS"), false);
  assert.equal(calls, 1);
});

test("refetched task context updates open counts and TODAY/COMPLETED filters", () => {
  const app = runtime();
  app.update({ tasks: [task("COMPLETED")], reviews: [] });
  app.window.OZ_WORKSPACE.setTaskView("TODAY");
  assert.equal(app.window.OZ_WORKSPACE.getVisibleTaskCount(), 0);
  assert.equal(app.window.OZ_WORKSPACE.getOpenTaskCount(), 0);
  app.window.OZ_WORKSPACE.setTaskView("COMPLETED");
  assert.equal(app.window.OZ_WORKSPACE.getVisibleTaskCount(), 1);

  app.update({ tasks: [task("IN_PROGRESS")], reviews: [] });
  app.window.OZ_WORKSPACE.setTaskView("TODAY");
  assert.equal(app.window.OZ_WORKSPACE.getVisibleTaskCount(), 1);
  assert.equal(app.window.OZ_WORKSPACE.getOpenTaskCount(), 1);
  app.window.OZ_WORKSPACE.setTaskView("COMPLETED");
  assert.equal(app.window.OZ_WORKSPACE.getVisibleTaskCount(), 0);
  app.window.OZ_WORKSPACE.setTaskView("ALL");
  assert.equal(app.window.OZ_WORKSPACE.getVisibleTaskCount(), 1);
});

test("task-row markup exposes an accessible review-only status selector and review shortcut", () => {
  assert.match(source, /data-task-status=/);
  assert.match(source, /aria-label="\$\{escapeHtml\(task\.title\)\}のステータスを変更"/);
  assert.match(source, /data-open-status-review/);
  assert.match(source, /setRightView\('reviews'\)/);
  assert.doesNotMatch(source, /update\s+public\.tasks/i);
});
