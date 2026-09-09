import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_CLIENT_TASK_CANDIDATES, INITIAL_PROJECT_CANDIDATES, LEGACY_D1_CANDIDATES } from "../packages/application/src/project-candidates";
import { handleOzApi } from "../worker/oz-data";

test("initial project candidates contain the nine business definitions and eight separate clients", () => {
  assert.equal(INITIAL_PROJECT_CANDIDATES.length, 17);
  assert.deepEqual(INITIAL_PROJECT_CANDIDATES.map(({ name, status, importance, targetDate }) => ({ name, status, importance, targetDate })), [
    { name: "OZ COMMAND CENTER開発", status: "ACTIVE", importance: 5, targetDate: null },
    { name: "SNS事業", status: "ACTIVE", importance: 5, targetDate: "2028-03-31" },
    { name: "SNS運用業務システム構築", status: "ACTIVE", importance: 5, targetDate: null },
    { name: "愛知県消防団", status: "PLANNED", importance: 3, targetDate: null },
    { name: "京都労働局", status: "PLANNED", importance: 3, targetDate: null },
    { name: "和歌山県", status: "PLANNED", importance: 3, targetDate: null },
    { name: "コナミスポーツ", status: "PLANNED", importance: 3, targetDate: null },
    { name: "Vivelea", status: "PLANNED", importance: 3, targetDate: null },
    { name: "ミスターマックス", status: "PLANNED", importance: 3, targetDate: null },
    { name: "スマレジ", status: "PLANNED", importance: 3, targetDate: null },
    { name: "AND SECURITY", status: "PLANNED", importance: 3, targetDate: null },
    { name: "Your Song", status: "ACTIVE", importance: 4, targetDate: null },
    { name: "YUTOLU", status: "ACTIVE", importance: 4, targetDate: null },
    { name: "THE PRIVATE FILM JAPAN", status: "ACTIVE", importance: 4, targetDate: null },
    { name: "OMOSHIRO AKINDO CLUB", status: "ACTIVE", importance: 4, targetDate: null },
    { name: "三方良し／店舗集客・紹介プラットフォーム", status: "PLANNED", importance: 3, targetDate: null },
    { name: "飲食店仕入れコスト最適化AI", status: "PLANNED", importance: 3, targetDate: null },
  ]);
  assert.equal(new Set(INITIAL_PROJECT_CANDIDATES.map((candidate) => candidate.key)).size, 17);
  assert.ok(INITIAL_PROJECT_CANDIDATES.every((candidate) => candidate.purpose.length > 0));
  const clients = INITIAL_PROJECT_CANDIDATES.filter((candidate) => candidate.note === "現在の進捗・重要度・期限は正式承認前に確認する");
  assert.equal(clients.length, 8);
  assert.ok(clients.every((candidate) => candidate.purpose === "該当クライアントの提案・資料作成・対応進行を管理する"));
});

test("the eight client task definitions stay review-only and map one-to-one to client projects", () => {
  assert.equal(INITIAL_CLIENT_TASK_CANDIDATES.length, 8);
  assert.equal(new Set(INITIAL_CLIENT_TASK_CANDIDATES.map((candidate) => candidate.projectKey)).size, 8);
  assert.deepEqual(INITIAL_CLIENT_TASK_CANDIDATES.map(({ projectName, title }) => ({ projectName, title })), [
    { projectName: "愛知県消防団", title: "愛知県消防団向け提案・見積資料を作成" },
    { projectName: "京都労働局", title: "京都労働局向け提案書・企画・絵コンテを作成" },
    { projectName: "和歌山県", title: "和歌山県向け候補団体選定・提案資料を作成" },
    { projectName: "コナミスポーツ", title: "コナミスポーツ向けInstagram運用代行オプション提案・見積を作成" },
    { projectName: "Vivelea", title: "Vivelea向けSNS運用提案資料を作成・更新" },
    { projectName: "ミスターマックス", title: "ミスターマックス向け採用SNS・動画コンテンツ戦略提案資料を作成" },
    { projectName: "スマレジ", title: "スマレジ向け提案資料を作成" },
    { projectName: "AND SECURITY", title: "AND SECURITY向けSNS採用提案資料を作成" },
  ]);
  assert.ok(INITIAL_CLIENT_TASK_CANDIDATES.every((candidate) => candidate.status === "UNSTARTED"
    && candidate.importance === 3 && candidate.dueDate === null && candidate.assignee === null
    && candidate.source === "USER_CONFIRMED_INITIAL_CANDIDATE"));
});

test("legacy D1 inventory and demo actions remain outside selectable initial candidates", () => {
  assert.equal(LEGACY_D1_CANDIDATES.projectCount, 1);
  assert.equal(LEGACY_D1_CANDIDATES.taskCount, 8);
  assert.ok(LEGACY_D1_CANDIDATES.items.every((item) => item.selectable === false));
  const serialized = JSON.stringify(INITIAL_PROJECT_CANDIDATES);
  for (const excluded of ["D1タスク移行候補", "クライアント案件", "くら寿司", "クライアントワーク", "βテスト設計を固める", "次回SNS撮影企画を決める"]) {
    assert.equal(serialized.includes(excluded), false);
  }
  assert.equal(INITIAL_PROJECT_CANDIDATES.filter((candidate) => candidate.name === "SNS事業").length, 1);
});

test("owner-scoped initial candidate endpoint is read-only and returns the confirmed metadata", async () => {
  const response = await handleOzApi(
    new Request("http://127.0.0.1:5173/api/oz/projects/initial-candidates"),
    {},
    { userId: "00000000-0000-4000-8000-000000000001", email: "owner@example.invalid", accessToken: "test-token" },
    "/api/oz/projects/initial-candidates",
  );
  assert.equal(response.status, 200);
  const payload = await response.json() as { candidates: typeof INITIAL_PROJECT_CANDIDATES; taskCandidates: typeof INITIAL_CLIENT_TASK_CANDIDATES };
  assert.equal(payload.candidates.length, 17);
  assert.equal(payload.taskCandidates.length, 8);
  assert.equal(payload.candidates[1].targetDate, "2028-03-31");
  assert.equal(payload.candidates[1].note, "旧D1と別プロジェクトにせず、この1件へ統合する");
});
