import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "public/oz-workspace.js"), "utf8");

function element() {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Map();
  return {
    listeners, attributes, dataset: {}, disabled: false, checked: false, value: "", innerHTML: "", textContent: "",
    classList: {
      add(...values) { values.forEach((value) => classes.add(value)); },
      remove(...values) { values.forEach((value) => classes.delete(value)); },
      toggle(value, force) { if (force ?? !classes.has(value)) classes.add(value); else classes.delete(value); },
      contains(value) { return classes.has(value); },
    },
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
    dispatch(type, event={}) { for (const listener of listeners.get(type) ?? []) listener({ preventDefault() {}, currentTarget:this, target:this, ...event }); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };
}

function runtime(executeTool, options={}) {
  const defaultCandidate = {
    key: "sns-business", name: "SNS事業", purpose: "Safe purpose", status: "ACTIVE",
    importance: 5, targetDate: "2028-03-31", note: "Merge legacy source",
  };
  const candidates = options.candidates ?? [defaultCandidate];
  const taskCandidates = options.taskCandidates ?? (options.taskCandidate ? [options.taskCandidate] : []);
  const form = element();
  const button = element();
  const candidateList = element();
  const candidateDrawer = element();
  const projectCheckboxes = candidates.map((candidate, index) => {
    const checkbox = element();
    checkbox.checked = Array.isArray(options.projectChecked) ? Boolean(options.projectChecked[index]) : (options.projectChecked ?? true);
    checkbox.value = candidate.key;
    return checkbox;
  });
  const taskCheckboxes = taskCandidates.map((task, index) => {
    const checkbox = element();
    checkbox.checked = Array.isArray(options.taskChecked) ? Boolean(options.taskChecked[index]) : (options.taskChecked ?? false);
    checkbox.value = task.key;
    return checkbox;
  });
  const initialTaskSelectAllBtn = element();
  const initialTaskClearSelectionBtn = element();
  const initialTaskSelectionCount = element();
  const initialTaskSubmitBtn = element();
  const initialTaskConfirmDialog = element(); initialTaskConfirmDialog.classList.add("hidden");
  const initialTaskConfirmCount = element();
  const initialTaskConfirmList = element();
  const initialTaskConfirmFeedback = element();
  const initialTaskConfirmCancelBtn = element();
  const initialTaskConfirmSubmitBtn = element();
  form.querySelector = (selector) => selector === 'button[type="submit"]' ? button : null;
  form.querySelectorAll = (selector) => {
    if (selector.includes('name="project-candidate"')) return selector.includes(":checked") ? projectCheckboxes.filter((item) => item.checked) : projectCheckboxes;
    if (selector.includes('name="task-candidate"')) return selector.includes(":checked") ? taskCheckboxes.filter((item) => item.checked) : taskCheckboxes;
    if (selector === 'input[type="checkbox"]') return [...projectCheckboxes, ...taskCheckboxes];
    return [];
  };
  candidateList.querySelectorAll = (selector) => selector.includes('name="task-candidate"') ? taskCheckboxes : [];
  const ids = new Map([
    ["initialCandidateForm", form],
    ["initialCandidateFeedback", element()],
    ["initialCandidateList", candidateList],
    ["candidateDrawer", candidateDrawer],
    ["initialTaskSelectAllBtn", initialTaskSelectAllBtn],
    ["initialTaskClearSelectionBtn", initialTaskClearSelectionBtn],
    ["initialTaskSelectionCount", initialTaskSelectionCount],
    ["initialTaskSubmitBtn", initialTaskSubmitBtn],
    ["initialTaskConfirmDialog", initialTaskConfirmDialog],
    ["initialTaskConfirmCount", initialTaskConfirmCount],
    ["initialTaskConfirmList", initialTaskConfirmList],
    ["initialTaskConfirmFeedback", initialTaskConfirmFeedback],
    ["initialTaskConfirmCancelBtn", initialTaskConfirmCancelBtn],
    ["initialTaskConfirmSubmitBtn", initialTaskConfirmSubmitBtn],
  ]);
  const listeners = new Map();
  const window = {
    location: { hostname: "127.0.0.1", pathname: "/" },
    OZ_NETWORK: { executeTool, requestJson: async () => ({}) },
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) ?? []) listener(event); },
  };
  const context = vm.createContext({
    window,
    document: {
      body: { dataset: {} }, documentElement: {}, fullscreenElement: null,
      getElementById(id) { return ids.get(id) ?? null; },
      querySelectorAll() { return []; }, addEventListener() {},
    },
    crypto, console: { error() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout() { return 0; }, clearTimeout() {}, FormData,
  });
  vm.runInContext(source, context);
  window.OZ_WORKSPACE.getState().initialCandidates.push(...candidates);
  window.OZ_WORKSPACE.getState().initialTaskCandidates.push(...taskCandidates);
  const update = (detail) => window.dispatchEvent({ type: "oz:network-updated", detail });
  return {
    button, candidateDrawer, candidateList, projectCheckbox:projectCheckboxes[0], projectCheckboxes,
    taskCheckbox:taskCheckboxes[0], taskCheckboxes, form, update, window,
    initialTaskSelectAllBtn, initialTaskClearSelectionBtn, initialTaskSelectionCount, initialTaskSubmitBtn,
    initialTaskConfirmDialog, initialTaskConfirmCount, initialTaskConfirmList,
    initialTaskConfirmCancelBtn, initialTaskConfirmSubmitBtn,
  };
}

test("initial project submit suppresses rapid duplicates and uses a stable idempotency key", async () => {
  const calls = [];
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const app = runtime(async (...args) => { calls.push(args); await pending; return { data: { requiresApproval: true, formalProjectCreated: false } }; });
  const submit = app.form.listeners.get("submit")[0];
  const event = { preventDefault() {} };
  const first = submit(event);
  const duplicate = submit(event);
  await duplicate;
  assert.equal(calls.length, 1);
  assert.equal(app.button.disabled, true);
  assert.equal(calls[0][0], "oz_create_project_candidate");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), {
    name: "SNS事業", description: "Safe purpose", status: "ACTIVE", importance: 5, targetDate: "2028-03-31",
  });
  assert.equal(calls[0][2].idempotencyKey, "initial-project:sns-business:20260825-v1");
  release();
  await first;
  assert.equal(app.window.OZ_WORKSPACE.getState().context.projects.length, 0);
});

test("pending candidate and formal project both prevent a rerun", async () => {
  let calls = 0;
  const app = runtime(async () => { calls += 1; return {}; });
  const submit = app.form.listeners.get("submit")[0];
  const event = { preventDefault() {} };

  app.update({ reviews: [{ kind: "PROJECT_CREATE", status: "PENDING", candidate_data: { name: "SNS事業", slug: "sns事業" } }] });
  await submit(event);
  assert.equal(calls, 0);

  app.update({ reviews: [], projects: [{ name: "ＳＮＳ事業", slug: "sns事業", formalStatus: "ACTIVE" }] });
  app.projectCheckbox.checked = true;
  await submit(event);
  assert.equal(calls, 0);
});

test("client task candidates stay unavailable until the matching formal project exists", async () => {
  const calls = [];
  const taskCandidate = {
    key: "aichi-fire-brigade-proposal", projectKey: "sns-business", projectName: "SNS事業",
    title: "確認用の初期タスク", status: "UNSTARTED", importance: 3, dueDate: null, assignee: null,
    source: "USER_CONFIRMED_INITIAL_CANDIDATE",
  };
  const app = runtime(async (...args) => { calls.push(args); return {}; }, { projectChecked:false, taskChecked:true, taskCandidate });
  const submit = app.form.listeners.get("submit")[0];
  app.candidateDrawer.classList.add("open");
  app.update({ projects:[], tasks:[], reviews:[] });
  assert.match(app.candidateList.innerHTML, /確認用の初期タスク/);
  assert.match(app.candidateList.innerHTML, /未着手 \/ 重要度 3 \/ 期限 未設定 \/ 担当者 未設定/);
  assert.match(app.candidateList.innerHTML, /プロジェクト承認後にタスク候補を作成できます/);
  await submit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  assert.match(app.window.OZ_WORKSPACE.getState().initialTaskCandidates[0].title, /初期タスク/);
});

test("approved project enables one task review with the formal project ID and stable idempotency", async () => {
  const calls = [];
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const taskCandidate = {
    key: "aichi-fire-brigade-proposal", projectKey: "sns-business", projectName: "SNS事業",
    title: "確認用の初期タスク", status: "UNSTARTED", importance: 3, dueDate: null, assignee: null,
    source: "USER_CONFIRMED_INITIAL_CANDIDATE",
  };
  const app = runtime(async (...args) => { calls.push(args); await pending; return {}; }, { projectChecked:false, taskChecked:true, taskCandidate });
  app.candidateDrawer.classList.add("open");
  app.update({ projects: [{ id:"00000000-0000-4000-8000-000000000030", name:"SNS事業", slug:"sns事業", formalStatus:"ACTIVE" }], tasks:[], reviews:[] });
  const submit = app.form.listeners.get("submit")[0];
  await submit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  assert.equal(app.initialTaskConfirmDialog.classList.contains("hidden"), false);
  assert.equal(app.initialTaskConfirmCount.textContent, "1件");
  assert.match(app.initialTaskConfirmList.innerHTML, /確認用の初期タスク/);
  assert.match(app.initialTaskConfirmList.innerHTML, /SNS事業/);
  const first = app.window.OZ_WORKSPACE.confirmInitialTaskBatch();
  await app.window.OZ_WORKSPACE.confirmInitialTaskBatch();
  assert.equal(calls.length, 1);
  assert.equal(app.initialTaskConfirmSubmitBtn.disabled, true);
  assert.equal(calls[0][0], "oz_create_task_candidate");
  assert.equal(calls[0][1].projectId, "00000000-0000-4000-8000-000000000030");
  assert.equal(calls[0][1].projectCandidate, "SNS事業");
  assert.equal(calls[0][1].source, "USER_CONFIRMED_INITIAL_CANDIDATE");
  assert.equal(calls[0][2].idempotencyKey, "initial-task:aichi-fire-brigade-proposal:00000000-0000-4000-8000-000000000030:20260825-v1");
  release();
  await first;
});

test("formal and pending task matches prevent duplicate initial task reviews", async () => {
  let calls = 0;
  const taskCandidate = {
    key: "aichi-fire-brigade-proposal", projectKey: "sns-business", projectName: "SNS事業",
    title: "確認用の初期タスク", status: "UNSTARTED", importance: 3, dueDate: null, assignee: null,
    source: "USER_CONFIRMED_INITIAL_CANDIDATE",
  };
  const app = runtime(async () => { calls += 1; return {}; }, { projectChecked:false, taskChecked:true, taskCandidate });
  const project = { id:"00000000-0000-4000-8000-000000000030", name:"SNS事業", slug:"sns事業", formalStatus:"ACTIVE" };
  const submit = app.form.listeners.get("submit")[0];

  app.update({ projects:[project], tasks:[{ projectId:project.id, title:"確認用の初期タスク" }], reviews:[] });
  await submit({ preventDefault() {} });
  assert.equal(calls, 0);

  app.taskCheckbox.checked = true;
  app.update({ projects:[project], tasks:[], reviews:[{ kind:"TASK_CREATE", status:"PENDING", candidate_data:{ projectId:project.id, title:"確認用の初期タスク" } }] });
  await submit({ preventDefault() {} });
  assert.equal(calls, 0);
});

function bulkScenario(count) {
  const candidates = Array.from({ length:count }, (_, index) => ({
    key:`project-${index}`, name:`プロジェクト${index + 1}`, purpose:"確認用", status:"PLANNED",
    importance:3, targetDate:null, note:"",
  }));
  const taskCandidates = candidates.map((candidate, index) => ({
    key:`task-${index}`, projectKey:candidate.key, projectName:candidate.name,
    title:`初期タスク${index + 1}`, status:"UNSTARTED", importance:3, dueDate:null, assignee:null,
    source:"USER_CONFIRMED_INITIAL_CANDIDATE",
  }));
  const projects = candidates.map((candidate, index) => ({
    id:`formal-project-${index}`, name:candidate.name, formalStatus:"PLANNED",
  }));
  const app = runtime(async () => ({}), { candidates, taskCandidates, projectChecked:false, taskChecked:false });
  app.candidateDrawer.classList.add("open");
  app.update({ projects, tasks:[], reviews:[] });
  return { app, projects, taskCandidates };
}

for (const count of [0, 1, 8, 100]) {
  test(`task bulk selection synchronizes 0/${count}, select-all, and clear without touching project selection`, () => {
    const { app } = bulkScenario(count);
    const beforeProjects = app.projectCheckboxes.map((item) => item.checked);
    const initial = app.window.OZ_WORKSPACE.syncInitialTaskBulkControls();
    assert.equal(initial.total, count);
    assert.equal(initial.selected, 0);
    assert.equal(app.initialTaskSelectionCount.textContent, `選択中 0/${count}件`);
    const selected = app.window.OZ_WORKSPACE.selectAllAvailableInitialTasks();
    assert.equal(selected.selected, count);
    assert.equal(app.initialTaskSelectionCount.textContent, `選択中 ${count}/${count}件`);
    assert.deepEqual(app.projectCheckboxes.map((item) => item.checked), beforeProjects);
    const cleared = app.window.OZ_WORKSPACE.clearInitialTaskSelection();
    assert.equal(cleared.selected, 0);
    assert.equal(app.initialTaskSelectionCount.textContent, `選択中 0/${count}件`);
  });
}

test("individual task checks synchronize the count and final confirmation lists task/project pairs", () => {
  const { app } = bulkScenario(8);
  app.taskCheckboxes[2].checked = true;
  app.taskCheckboxes[2].dispatch("change");
  assert.equal(app.initialTaskSelectionCount.textContent, "選択中 1/8件");
  app.initialTaskSubmitBtn.dispatch("click");
  assert.equal(app.initialTaskConfirmDialog.classList.contains("hidden"), false);
  assert.equal(app.initialTaskConfirmCount.textContent, "1件");
  assert.match(app.initialTaskConfirmList.innerHTML, /初期タスク3/);
  assert.match(app.initialTaskConfirmList.innerHTML, /プロジェクト3/);
});

test("select-all excludes missing parents plus formal, pending, and needs-edit duplicates", () => {
  const { app, projects, taskCandidates } = bulkScenario(8);
  app.update({
    projects:projects.slice(1),
    tasks:[{ projectId:projects[1].id, title:taskCandidates[1].title }],
    reviews:[
      { kind:"TASK_CREATE", status:"PENDING", candidate_data:{ projectId:projects[2].id, title:taskCandidates[2].title } },
      { kind:"TASK_CREATE", status:"NEEDS_EDIT", candidate_data:{ projectId:projects[3].id, title:taskCandidates[3].title } },
    ],
  });
  const selected = app.window.OZ_WORKSPACE.selectAllAvailableInitialTasks();
  assert.equal(selected.total, 8);
  assert.equal(selected.available, 4);
  assert.equal(selected.selected, 4);
  assert.equal(app.initialTaskSelectionCount.textContent, "選択中 4/8件");
  assert.deepEqual(app.taskCheckboxes.map((item) => item.checked), [false, false, false, false, true, true, true, true]);
});

test("closing task confirmation makes no review mutation", () => {
  let calls = 0;
  const { app } = bulkScenario(8);
  app.window.OZ_NETWORK.executeTool = async () => { calls += 1; return {}; };
  app.window.OZ_WORKSPACE.selectAllAvailableInitialTasks();
  app.window.OZ_WORKSPACE.openInitialTaskConfirmation();
  app.initialTaskConfirmCancelBtn.dispatch("click");
  assert.equal(calls, 0);
  assert.equal(app.initialTaskConfirmDialog.classList.contains("hidden"), true);
});
