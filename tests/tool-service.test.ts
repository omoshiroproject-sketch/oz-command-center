import assert from "node:assert/strict";
import test from "node:test";
import { OzToolError, OzToolService, type OzContext, type OzToolRepository } from "../packages/application/src/oz-tool-service";

const taskId = "00000000-0000-4000-8000-000000000010";
const reviewId = "00000000-0000-4000-8000-000000000020";
const projectId = "00000000-0000-4000-8000-000000000030";

function fixtureRepository(overrides: Partial<OzContext> = {}) {
  const calls: Array<{ kind: string; input: Record<string, unknown> }> = [];
  const repository: OzToolRepository = {
    async getContext() {
      return { projects: [], tasks: [{ id: taskId, title: "Formal", formalStatus: "UNSTARTED" }], reviews: [], auditLogs: [], integrations: [], externalActions: [], actionApprovals: [], legacyCandidates: { projectCount: 1, taskCount: 8, items: [] }, ...overrides };
    },
    async createReview(input) { calls.push({ kind: "review", input }); return { id: reviewId, status: "PENDING" }; },
    async resolveReview(input) { calls.push({ kind: "resolve", input }); return { reviewId, status: input.decision }; },
    async proposeExternalAction(input) { calls.push({ kind: "external", input }); return { id: reviewId, status: "PROPOSED" }; },
  };
  return { repository, calls };
}

test("candidate and edit tools only call review creation with idempotency", async () => {
  const { repository, calls } = fixtureRepository();
  const service = new OzToolService(repository);
  const context = { idempotencyKey: "tool-service-idempotency-0001", sourceType: "VOICE" as const };

  const create = await service.execute("oz_create_task_candidate", { title: "Candidate" }, context);
  const edit = await service.execute("oz_propose_task_update", { taskId, patch: { importance: 5 } }, context);
  const status = await service.execute("oz_propose_task_status_change", { taskId, status: "IN_PROGRESS" }, context);

  assert.equal((create.data as Record<string, unknown>).formalTaskCreated, false);
  assert.equal((edit.data as Record<string, unknown>).taskChanged, false);
  assert.equal((status.data as Record<string, unknown>).taskChanged, false);
  assert.equal(status.code, "TASK_STATUS_PROPOSED");
  assert.equal((status.data as Record<string, unknown>).requiresApproval, true);
  assert.deepEqual(calls.map((call) => call.input.kind), ["TASK_CREATE", "TASK_EDIT", "TASK_STATUS_CHANGE"]);
  assert.ok(calls.every((call) => call.input.idempotencyKey === context.idempotencyKey));
});

test("mutations reject missing idempotency and external action remains PROPOSED", async () => {
  const { repository, calls } = fixtureRepository();
  const service = new OzToolService(repository);
  await assert.rejects(() => service.execute("oz_create_project_candidate", { name: "Candidate" }),
    (error: unknown) => error instanceof OzToolError && error.code === "IDEMPOTENCY_KEY_REQUIRED");

  const result = await service.execute("oz_propose_external_action", {
    provider: "mock", actionType: "write", requestPayload: {}, targetFingerprint: "safe-fingerprint-0001",
  }, { idempotencyKey: "external-idempotency-0001" });
  assert.equal((result.data as Record<string, unknown>).status, "PROPOSED");
  assert.equal((result.data as Record<string, unknown>).executed, false);
  assert.equal(calls.at(-1)?.kind, "external");
});

test("project candidates preserve approved metadata and create only a pending review", async () => {
  const { repository, calls } = fixtureRepository();
  const result = await new OzToolService(repository).execute("oz_create_project_candidate", {
    name: "SNS事業",
    description: "Safe purpose",
    status: "ACTIVE",
    importance: 5,
    targetDate: "2028-03-31",
  }, { idempotencyKey: "initial-project:sns-business:20260825-v1", sourceType: "MANUAL" });

  assert.equal(result.code, "PROJECT_CANDIDATE_CREATED");
  assert.equal((result.data as Record<string, unknown>).requiresApproval, true);
  assert.equal((result.data as Record<string, unknown>).formalProjectCreated, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.kind, "PROJECT_CREATE");
  assert.deepEqual(calls[0].input.candidate, {
    name: "SNS事業", description: "Safe purpose", status: "ACTIVE", importance: 5,
    targetDate: "2028-03-31", slug: "sns事業",
  });
});

test("project target dates accept only YYYY-MM-DD or null", async () => {
  const { repository, calls } = fixtureRepository();
  const service = new OzToolService(repository);
  await assert.rejects(
    () => service.execute("oz_create_project_candidate", { name: "Invalid date", targetDate: "2028-3-31" }, { idempotencyKey: "invalid-project-date-0001" }),
    (error: unknown) => error instanceof OzToolError && error.code === "INVALID_ARGUMENTS",
  );
  const result = await service.execute(
    "oz_create_project_candidate",
    { name: "No target date", targetDate: null },
    { idempotencyKey: "null-project-target-0001" },
  );
  assert.equal(result.code, "PROJECT_CANDIDATE_CREATED");
  assert.equal(calls.length, 1);
  assert.equal((calls[0].input.candidate as Record<string, unknown>).targetDate, null);
});

test("project candidate creation rejects an existing formal project or actionable review", async () => {
  const formal = fixtureRepository({ projects: [{ name: "SNS事業", slug: "sns事業", formalStatus: "ACTIVE" }] });
  await assert.rejects(
    () => new OzToolService(formal.repository).execute("oz_create_project_candidate", { name: "ＳＮＳ事業" }, { idempotencyKey: "duplicate-formal-project-0001" }),
    (error: unknown) => error instanceof OzToolError && error.code === "PROJECT_ALREADY_EXISTS" && error.status === 409,
  );
  assert.equal(formal.calls.length, 0);

  const pending = fixtureRepository({ reviews: [{ kind: "PROJECT_CREATE", status: "PENDING", candidate_data: { name: "SNS事業", slug: "sns事業" } }] });
  await assert.rejects(
    () => new OzToolService(pending.repository).execute("oz_create_project_candidate", { name: "SNS事業" }, { idempotencyKey: "duplicate-pending-project-0001" }),
    (error: unknown) => error instanceof OzToolError && error.code === "PROJECT_CANDIDATE_ALREADY_PENDING" && error.status === 409,
  );
  assert.equal(pending.calls.length, 0);
});

test("confirmed initial task candidates require the approved project and preserve its identity", async () => {
  const input = {
    title: "愛知県消防団向け提案・見積資料を作成",
    projectId,
    projectCandidate: "愛知県消防団",
    importance: 3,
    dueAt: null,
    assigneeLabel: null,
    source: "USER_CONFIRMED_INITIAL_CANDIDATE" as const,
  };
  const missing = fixtureRepository({ projects: [] });
  await assert.rejects(
    () => new OzToolService(missing.repository).execute("oz_create_task_candidate", input, { idempotencyKey: "initial-task-project-required-0001" }),
    (error: unknown) => error instanceof OzToolError && error.code === "PROJECT_NOT_FOUND" && error.status === 409,
  );
  assert.equal(missing.calls.length, 0);

  const approved = fixtureRepository({ projects: [{ id: projectId, name: "愛知県消防団", slug: "愛知県消防団", formalStatus: "PLANNED" }] });
  const result = await new OzToolService(approved.repository).execute(
    "oz_create_task_candidate",
    input,
    { idempotencyKey: `initial-task:aichi:${projectId}:20260825-v1`, sourceType: "MANUAL" },
  );
  assert.equal(result.code, "TASK_CANDIDATE_CREATED");
  assert.equal((result.data as Record<string, unknown>).formalTaskCreated, false);
  assert.equal(approved.calls.length, 1);
  assert.equal(approved.calls[0].input.kind, "TASK_CREATE");
  assert.equal((approved.calls[0].input.candidate as Record<string, unknown>).projectId, projectId);
  assert.equal((approved.calls[0].input.candidate as Record<string, unknown>).source, "USER_CONFIRMED_INITIAL_CANDIDATE");
});

test("initial task candidates reject project identity mismatches and formal or pending duplicates", async () => {
  const base = {
    title: "スマレジ向け提案資料を作成",
    projectId,
    projectCandidate: "スマレジ",
    source: "USER_CONFIRMED_INITIAL_CANDIDATE" as const,
  };
  const mismatch = fixtureRepository({ projects: [{ id: projectId, name: "別プロジェクト", slug: "別プロジェクト" }] });
  await assert.rejects(
    () => new OzToolService(mismatch.repository).execute("oz_create_task_candidate", base, { idempotencyKey: "initial-task-project-mismatch-0001" }),
    (error: unknown) => error instanceof OzToolError && error.code === "PROJECT_IDENTITY_MISMATCH" && error.status === 409,
  );
  assert.equal(mismatch.calls.length, 0);

  const formal = fixtureRepository({
    projects: [{ id: projectId, name: "スマレジ", slug: "スマレジ" }],
    tasks: [{ id: taskId, projectId, title: " スマレジ向け提案資料を作成 ", formalStatus: "UNSTARTED" }],
  });
  await assert.rejects(
    () => new OzToolService(formal.repository).execute("oz_create_task_candidate", base, { idempotencyKey: "initial-task-formal-duplicate-0001" }),
    (error: unknown) => error instanceof OzToolError && error.code === "TASK_ALREADY_EXISTS" && error.status === 409,
  );
  assert.equal(formal.calls.length, 0);

  const pending = fixtureRepository({
    projects: [{ id: projectId, name: "スマレジ", slug: "スマレジ" }],
    tasks: [],
    reviews: [{ kind: "TASK_CREATE", status: "PENDING", candidate_data: { projectId, title: "スマレジ向け提案資料を作成" } }],
  });
  await assert.rejects(
    () => new OzToolService(pending.repository).execute("oz_create_task_candidate", base, { idempotencyKey: "initial-task-pending-duplicate-0001" }),
    (error: unknown) => error instanceof OzToolError && error.code === "TASK_CANDIDATE_ALREADY_PENDING" && error.status === 409,
  );
  assert.equal(pending.calls.length, 0);
});

test("read tools do not require an idempotency key", async () => {
  const { repository } = fixtureRepository();
  const result = await new OzToolService(repository).execute("oz_get_task", { taskId });
  assert.equal(result.code, "TASK_READY");
});
