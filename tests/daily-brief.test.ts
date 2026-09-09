import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyBrief } from "../packages/application/src/daily-brief";
import { filterTasks } from "../packages/application/src/oz-tool-service";

const now = new Date("2026-08-23T00:00:00.000Z");

test("daily brief ranks overdue, today, quick wins, blocked work, reviews, and unavailable sources", () => {
  const brief = buildDailyBrief({
    now,
    timezone: "Asia/Tokyo",
    projects: [
      { id: "project-a", name: "A", formalStatus: "ACTIVE" },
      { id: "project-hold", name: "Hold", formalStatus: "ON_HOLD" },
    ],
    tasks: [
      { id: "overdue", projectId: "project-a", title: "Overdue", formalStatus: "UNSTARTED", importance: 5, dueAt: "2026-08-21T03:00:00.000Z", estimatedMinutes: 60 },
      { id: "today", projectId: "project-a", title: "Today", formalStatus: "UNSTARTED", importance: 4, dueAt: "2026-08-23T03:00:00.000Z", estimatedMinutes: 25 },
      { id: "dependency", projectId: "project-a", title: "Dependency", formalStatus: "UNSTARTED", importance: 3 },
      { id: "blocked", projectId: "project-a", title: "Blocked", formalStatus: "UNSTARTED", importance: 5, dependencyIds: ["dependency"] },
      { id: "project-hold-task", projectId: "project-hold", title: "On hold", formalStatus: "UNSTARTED", importance: 5 },
    ],
    reviews: [{ status: "PENDING" }, { status: "NEEDS_EDIT" }, { status: "APPROVED" }],
    connectors: [
      { id: "project-database", label: "Database", connected: true },
      { id: "calendar", label: "Calendar", connected: false },
    ],
  });

  assert.equal(brief.topPriorities[0].id, "overdue");
  assert.deepEqual(brief.overdue.map((task) => task.id), ["overdue"]);
  assert.deepEqual(brief.today.map((task) => task.id), ["today"]);
  assert.ok(brief.quickWins.some((task) => task.id === "today"));
  assert.ok(brief.blocked.some((task) => task.id === "blocked"));
  assert.ok(brief.blocked.some((task) => task.id === "project-hold-task"));
  assert.equal(brief.reviewCount, 2);
  assert.deepEqual(brief.unavailableSources, ["Calendar"]);
  assert.match(brief.summary, /期限超過1件、確認待ち2件/);
});

test("completed tasks and tasks in archived projects are excluded", () => {
  const brief = buildDailyBrief({
    now,
    projects: [{ id: "archived", formalStatus: "ARCHIVED" }],
    tasks: [
      { id: "done", title: "Done", formalStatus: "COMPLETED" },
      { id: "archived-task", projectId: "archived", title: "Archived", formalStatus: "UNSTARTED" },
    ],
    reviews: [], connectors: [],
  });
  assert.deepEqual(brief.topPriorities, []);
});

const operatingProjects = [
  ["aichi", "愛知県消防団"],
  ["kyoto", "京都労働局"],
  ["wakayama", "和歌山県"],
  ["konami", "コナミスポーツ"],
  ["vivelea", "Vivelea"],
  ["mrmax", "ミスターマックス"],
  ["smaregi", "スマレジ"],
  ["and", "AND SECURITY"],
].map(([id, name]) => ({ id, name, formalStatus: "PLANNED" }));

const operatingTasks = [
  ["aichi", "愛知県消防団向け提案・見積資料を作成", "WAITING", "2026-09-15T23:59:00+09:00"],
  ["kyoto", "京都労働局向け提案書・企画・絵コンテを作成", "IN_PROGRESS", "2026-09-06T23:59:00+09:00"],
  ["wakayama", "和歌山県向け候補団体選定・提案資料を作成", "WAITING", "2026-08-28T23:59:00+09:00"],
  ["konami", "コナミスポーツ向けInstagram運用代行オプション提案・見積を作成", "WAITING", "2026-09-30T23:59:00+09:00"],
  ["vivelea", "Vivelea向けSNS運用提案資料を作成・更新", "WAITING", "2026-09-30T23:59:00+09:00"],
  ["mrmax", "ミスターマックス向け採用SNS・動画コンテンツ戦略提案資料を作成", "IN_PROGRESS", "2026-08-31T23:59:00+09:00"],
  ["smaregi", "スマレジ向け提案資料を作成", "IN_PROGRESS", "2026-08-31T23:59:00+09:00"],
  ["and", "AND SECURITY向けSNS採用提案資料を作成", "IN_PROGRESS", "2026-08-28T23:59:00+09:00"],
].map(([projectId, title, formalStatus, dueAt], index) => ({
  id: `task-${index}`,
  projectId,
  projectName: operatingProjects.find((project) => project.id === projectId)?.name,
  title,
  formalStatus,
  importance: 3,
  dueAt,
  timeLane: "SOMEDAY",
}));

test("2026-08-27 JST separates active work from waiting alerts with stable due ordering", () => {
  const brief = buildDailyBrief({
    now: new Date("2026-08-27T00:00:00+09:00"),
    timezone: "Asia/Tokyo",
    projects: operatingProjects,
    tasks: [...operatingTasks, { id: "done", title: "OZ動作確認", formalStatus: "COMPLETED", importance: 3 }],
    reviews: [],
    connectors: [],
  });

  assert.deepEqual(brief.topPriorities.map((task) => task.project), [
    "AND SECURITY",
    "ミスターマックス",
    "スマレジ",
    "京都労働局",
  ]);
  assert.deepEqual(brief.waitingAlerts.map((task) => task.project), ["和歌山県"]);
  assert.deepEqual(brief.waitingUpcoming.map((task) => task.project), ["愛知県消防団", "コナミスポーツ", "Vivelea"]);
  assert.ok(brief.topPriorities.every((task) => task.status === "IN_PROGRESS"));
  assert.ok(brief.waitingAlerts.concat(brief.waitingUpcoming).every((task) => task.status === "WAITING"));
  assert.ok(!brief.topPriorities.some((task) => task.title === "OZ動作確認"));
});

test("JST due date remains current through 23:59 and becomes overdue at midnight", () => {
  const task = operatingTasks.find((item) => item.projectId === "and");
  assert.ok(task);
  const input = { projects: operatingProjects, tasks: [task], reviews: [], connectors: [], timezone: "Asia/Tokyo" };
  const atDeadline = buildDailyBrief({ ...input, now: new Date("2026-08-28T23:59:00+09:00") });
  const afterDeadlineDay = buildDailyBrief({ ...input, now: new Date("2026-08-29T00:00:00+09:00") });
  assert.deepEqual(atDeadline.overdue, []);
  assert.deepEqual(afterDeadlineDay.overdue.map((item) => item.project), ["AND SECURITY"]);
});

test("TODAY task listing uses JST, excludes waiting and completed, and keeps equal ties stable", () => {
  const atStart = new Date("2026-08-27T00:00:00+09:00");
  const today = filterTasks([
    ...operatingTasks,
    { id: "jst-crossing", title: "JST crossing", formalStatus: "UNSTARTED", importance: 2, dueAt: "2026-08-28T00:30:00+09:00", timeLane: "SOMEDAY" },
    { id: "done", title: "OZ動作確認", formalStatus: "COMPLETED", importance: 3, timeLane: "TODAY_IF_POSSIBLE" },
  ], { view: "TODAY" }, atStart, "Asia/Tokyo");

  assert.deepEqual(today.map((task) => task.projectName), [
    "AND SECURITY",
    "ミスターマックス",
    "スマレジ",
    "京都労働局",
  ]);
  assert.ok(today.every((task) => task.formalStatus === "IN_PROGRESS"));

  const notYetOverdue = filterTasks(operatingTasks, { view: "OVERDUE" }, new Date("2026-08-28T23:59:00+09:00"), "Asia/Tokyo");
  const afterMidnight = filterTasks(operatingTasks, { view: "OVERDUE" }, new Date("2026-08-29T00:00:00+09:00"), "Asia/Tokyo");
  assert.deepEqual(notYetOverdue, []);
  assert.deepEqual(afterMidnight.map((task) => task.projectName), ["和歌山県", "AND SECURITY"]);
});
