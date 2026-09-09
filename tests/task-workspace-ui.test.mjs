import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = await readFile(path.join(root, "app/page.tsx"), "utf8");
const workspace = await readFile(path.join(root, "public/oz-workspace.js"), "utf8");
const network = await readFile(path.join(root, "public/oz-network.js"), "utf8");
const liveOz = await readFile(path.join(root, "public/live-oz.js"), "utf8");
const latency = await readFile(path.join(root, "public/oz-latency-metrics.js"), "utf8");
const runtimeScripts = await readFile(path.join(root, "app/oz-scripts.tsx"), "utf8");
const demo = await readFile(path.join(root, "public/app.js"), "utf8");
const css = await readFile(path.join(root, "app/globals.css"), "utf8");
const candidates = await readFile(path.join(root, "packages/application/src/project-candidates.ts"), "utf8");
const migration = await readFile(path.join(root, "supabase/migrations/202608230003_phase1b_review_mutations.sql"), "utf8");
const targetDateMigration = await readFile(path.join(root, "supabase/migrations/202608250001_phase1b_project_target_date.sql"), "utf8");
const demoRoute = await readFile(path.join(root, "app/demo/page.tsx"), "utf8");

test("formal task screen exposes project, time, status, and importance filters with an empty state", () => {
  for (const id of ["projectList", "formalTaskList", "taskProjectFilter", "taskStatusFilter", "taskImportanceFilter", "taskDrawer", "dailyBrief"]) {
    assert.match(page, new RegExp(`id=\\"${id}\\"`));
  }
  for (const view of ["TODAY", "OVERDUE", "WEEK", "ALL", "COMPLETED"]) assert.match(page, new RegExp(`data-task-view=\\"${view}\\"`));
  assert.match(workspace, /該当する正式タスクはありません/);
  assert.match(workspace, /state\.selectedProjectId/);
  assert.match(workspace, /elements\.statusFilter/);
  assert.match(workspace, /elements\.importanceFilter/);
});

test("formal mutations use candidate tools and reviews rather than direct writes", () => {
  for (const tool of ["oz_create_task_candidate", "oz_propose_task_update", "oz_propose_task_status_change"]) assert.match(workspace, new RegExp(tool));
  assert.match(workspace, /executeReviewResolution/);
  assert.match(network, /REVIEW_RESOLVED/);
  assert.doesNotMatch(workspace, /insert\s+into|update\s+public\.tasks/i);
  assert.match(network, /x-oz-explicit-approval/);
});

test("demo fixture is isolated behind an owner-gated local-only route while the default is formal tasks", () => {
  assert.match(workspace, /mode: 'tasks'/);
  assert.match(workspace, /document\.body\.dataset\.ozMode = 'tasks'/);
  assert.match(page, /includeLocalDemo \? <button id="demoModeBtn"[^>]*hidden/);
  assert.match(demoRoute, /<OzCommandCenter includeLocalDemo \/>/);
  assert.match(workspace, /path === '\/demo'/);
  assert.match(workspace, /\['localhost','127\.0\.0\.1'\]/);
  assert.match(workspace, /requestJson\('\/api\/oz\/context'\)/);
  assert.match(workspace, /demoAuthorized/);
  assert.match(workspace, /OZ_DEMO_APP\?\.start/);
  assert.match(demo, /window\.OZ_DEMO_APP/);
  assert.match(css, /body\[data-oz-mode="demo"\] \.task-workspace\{display:none\}/);
  assert.match(css, /body\[data-oz-mode="demo"\] \.conversation-focus\{display:block\}/);
});

test("task cards and drawer cover the formal Phase 1B fields and due warnings", () => {
  for (const field of ["formalStatus", "importance", "dueAt", "estimatedMinutes", "actualMinutes", "assigneeLabel", "delegateLabel", "dependencyIds", "executionEnvironment", "sources", "updatedAt"]) assert.match(workspace, new RegExp(field));
  assert.match(workspace, /OVERDUE/);
  assert.match(workspace, /due-soon/);
});

test("daily priority UI separates active work and waiting tasks in Japanese", () => {
  for (const copy of ["最優先の作業対象", "次の作業対象", "返事待ち・期限接近アラート", "今後の返事待ち"]) {
    assert.match(workspace, new RegExp(copy));
  }
  assert.match(workspace, /WAITING:'返事待ち'/);
  assert.match(page, /value="WAITING">返事待ち/);
  assert.match(workspace, /taskStatus === 'IN_PROGRESS'/);
  assert.match(css, /\.daily-brief-groups\{display:grid/);
  assert.match(css, /\.daily-brief-group\.waiting-alert/);
});

test("LIVE OZ keeps right-panel reviews operable without disconnecting the current mode", () => {
  assert.doesNotMatch(workspace, /state\.mode === 'live' \|\| state\.mode === 'demo'/);
  assert.match(workspace, /state\.mode === 'live' && state\.rightView === 'oz'/);
  assert.match(workspace, /function setRightView\(view\)/);
  assert.match(workspace, /document\.body\.dataset\.ozRightView = view/);
  assert.match(workspace, /window\.OZ_LIVE\?\.renderChat\?\.\(\)/);
});

test("right-panel project reviews expose bulk selection through the shared two-step resolver", () => {
  for (const control of ["data-side-select-all", "data-side-clear-selection", "data-side-review-select", "data-side-batch-decision"]) {
    assert.match(workspace, new RegExp(control));
  }
  assert.match(workspace, /item\.kind === 'PROJECT_CREATE' && item\.status === 'PENDING'/);
  assert.match(workspace, /OZ_NETWORK\?\.toggleReviewSelection/);
  assert.match(workspace, /OZ_NETWORK\?\.openBatchConfirmation/);
  assert.match(workspace, /class="side-review-layout"/);
  assert.match(workspace, /class="side-review-scroll" tabindex="0" role="region"/);
  assert.match(workspace, /\$\{projectPending\.length\}件すべて選択/);
  assert.match(workspace, /oz:review-selection-changed/);
  assert.match(page, /id="reviewBatchDialog"[\s\S]*aria-modal="true"/);
  assert.match(page, /初期タスク候補8件は自動作成されません/);
});

test("right-panel and NETWORK reviews use fixed controls with independent keyboard-scroll regions", () => {
  assert.match(page, /className="task-review-layout"[\s\S]*className="network-review-sticky"[\s\S]*className="task-review-scroll" tabIndex=\{0\}/);
  assert.match(css, /\.chat-log \{[^}]*overflow-y:auto[^}]*scrollbar-gutter:stable/);
  assert.match(css, /\.chat-log\.reviews-view \{[^}]*overflow:hidden/);
  assert.match(css, /\.side-review-layout \{[^}]*grid-template-rows:auto minmax\(0,1fr\)/);
  assert.match(css, /\.side-review-bulk \{[^}]*position:sticky[^}]*top:0/);
  assert.match(css, /\.side-review-scroll \{[^}]*overflow-y:auto[^}]*padding:[^;]*64px/);
  assert.match(css, /\.network-review-sticky \{[^}]*position:sticky[^}]*top:0/);
  assert.match(css, /\.task-review-scroll \{[^}]*overflow-y:auto[^}]*scroll-padding-block/);
  assert.match(css, /scrollbar-color:#77b7d2/);
  assert.match(css, /::-webkit-scrollbar-thumb/);
  assert.match(workspace, /function bindReviewScrollKeyboard\(container\)/);
  assert.match(workspace, /event\.key === 'PageDown'/);
  assert.match(workspace, /event\.key === 'End'/);
});

test("browser runtime scripts start after hydration in order and carry a release cache key", () => {
  assert.match(runtimeScripts, /^"use client";/);
  assert.match(runtimeScripts, /useEffect\(\(\) =>/);
  assert.match(runtimeScripts, /runtimeVersion = "20260831-phase1c-audio-vad-diagnostics"/);
  assert.match(runtimeScripts, /const coreRuntimeScripts = \["\/oz-latency-metrics\.js", "\/oz-network\.js", "\/oz-workspace\.js", "\/live-oz\.js"\]/);
  assert.match(runtimeScripts, /`\$\{src\}\?v=\$\{runtimeVersion\}`/);
  assert.match(runtimeScripts, /for \(const src of runtimeScripts\)/);
  assert.match(runtimeScripts, /await loadRuntimeScript\(src\)/);
  assert.match(runtimeScripts, /runtimeLoads\.get\(versionedSrc\)/);
  assert.match(runtimeScripts, /script\.async = false/);
  assert.match(runtimeScripts, /catch \{[\s\S]*console\.error/);
  assert.match(runtimeScripts, /return null/);
  assert.doesNotMatch(runtimeScripts, /<script|suppressHydrationWarning/);
  for (const source of [latency, network, workspace, liveOz]) assert.match(source, /if \(window\.OZ_[A-Z_]+\?\.initialized\) return/);
});

test("initial and D1 candidates are review-only inventory and never migration seeds", () => {
  for (const name of ["OZ COMMAND CENTER開発", "SNS事業", "SNS運用業務システム構築", "愛知県消防団", "京都労働局", "和歌山県", "コナミスポーツ", "Vivelea", "ミスターマックス", "スマレジ", "AND SECURITY", "Your Song", "YUTOLU", "THE PRIVATE FILM JAPAN", "OMOSHIRO AKINDO CLUB", "三方良し／店舗集客・紹介プラットフォーム", "飲食店仕入れコスト最適化AI"]) assert.match(candidates, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(candidates, /name: "クライアント案件"|くら寿司/);
  assert.match(candidates, /INITIAL_CLIENT_TASK_CANDIDATES/);
  assert.match(candidates, /USER_CONFIRMED_INITIAL_CANDIDATE/);
  assert.match(candidates, /projectCount: 1/);
  assert.match(candidates, /taskCount: 8/);
  assert.match(candidates, /selectable: false/);
  assert.doesNotMatch(migration, /D1タスク移行候補|SNS事業|YUTOLU|Your Song/);
});

test("initial project and task submission stay review-only and duplicate guarded", () => {
  assert.match(workspace, /initialCandidateAvailability/);
  assert.match(workspace, /initialTaskAvailability/);
  assert.match(workspace, /PROJECT_CREATE/);
  assert.match(workspace, /for \(const candidate of selectedProjects\)/);
  assert.match(workspace, /function openInitialTaskConfirmation\(\)/);
  assert.match(workspace, /function confirmInitialTaskBatch\(\)/);
  assert.match(workspace, /state\.pendingInitialTaskBatch/);
  assert.match(workspace, /oz_create_project_candidate/);
  assert.match(workspace, /oz_create_task_candidate/);
  assert.match(workspace, /idempotencyKey:`initial-project:\$\{candidate\.key\}:20260825-v1`/);
  assert.match(workspace, /idempotencyKey:`initial-task:\$\{task\.key\}:\$\{availability\.formalProject\.id\}:20260825-v1`/);
  assert.match(workspace, /プロジェクト承認後にタスク候補を作成できます/);
  assert.match(workspace, /正式データは未作成です/);
  assert.doesNotMatch(workspace, /LEGACY_D1_CANDIDATES|OZ_DATA/);
});

test("initial task bulk controls and final confirmation are rendered independently from project selection", () => {
  assert.match(page, /id="initialTaskBulkToolbar"/);
  assert.match(page, /対象タスクをすべて選択/);
  assert.match(page, /選択中 0\/8件/);
  assert.match(page, /id="initialTaskConfirmDialog"/);
  assert.match(page, /タスク \/ プロジェクト/);
  assert.match(page, /id="initialTaskConfirmSubmitBtn"[^>]*>確認待ちへ追加/);
  assert.match(css, /\.initial-task-bulk-toolbar\{position:sticky/);
  assert.match(css, /\.initial-task-bulk-controls\{display:grid/);
  assert.match(css, /\.initial-task-confirm-targets li\{display:grid/);
});

test("project candidates and formal projects expose reviewed target dates", () => {
  assert.match(workspace, /targetDate:candidate\.targetDate/);
  assert.match(workspace, /目標日 \$\{escapeHtml\(targetDate\)\}/);
  assert.match(workspace, /project\.targetDate \|\| '未設定'/);
  assert.match(targetDateMigration, /insert into public\.projects\([^)]*target_date\)/i);
});
