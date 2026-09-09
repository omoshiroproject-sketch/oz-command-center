import { z } from "zod";
import type { OwnerContext } from "../packages/auth/src/owner-context";
import { OzToolError, OzToolService, type OzContext, type OzToolRepository } from "../packages/application/src/oz-tool-service";
import { INITIAL_CLIENT_TASK_CANDIDATES, INITIAL_PROJECT_CANDIDATES, LEGACY_D1_CANDIDATES } from "../packages/application/src/project-candidates";
import { getOzToolDefinition } from "../packages/application/src/tool-contracts";
import {
  createReview,
  decideExternalAction,
  listActionApprovals,
  listAuditLogs,
  listExternalActions,
  listProjects,
  listReviews,
  listTaskDependencies,
  listTaskSources,
  listTasks,
  proposeExternalAction,
  resolveReview,
  type SupabaseDataEnvironment,
} from "../packages/db/src/supabase-rest-repository";
import { getIntegrationStatus, type OzIntegrationEnvironment } from "./integrations";

export interface OzDataEnvironment extends OzIntegrationEnvironment, SupabaseDataEnvironment {
  OZ_TIMEZONE?: string;
}

type Row = Record<string, unknown>;

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  if (value.length < 16 || value.length > 200) throw new OzToolError("IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required.");
  return value;
}

function toolSource(request: Request) {
  const value = request.headers.get("x-oz-tool-source")?.trim().toUpperCase();
  if (["QUICK_ADD", "VOICE", "CHAT", "CONNECTOR", "MANUAL"].includes(value ?? "")) {
    return value as "QUICK_ADD" | "VOICE" | "CHAT" | "CONNECTOR" | "MANUAL";
  }
  return "CHAT" as const;
}

async function getContext(env: OzDataEnvironment, owner: OwnerContext): Promise<OzContext & { externalActions: Row[]; actionApprovals: Row[] }> {
  const [projects, tasks, reviews, dependencies, sources, auditLogs, externalActions, actionApprovals] = await Promise.all([
    listProjects(env, owner),
    listTasks(env, owner),
    listReviews(env, owner),
    listTaskDependencies(env, owner),
    listTaskSources(env, owner),
    listAuditLogs(env, owner),
    listExternalActions(env, owner),
    listActionApprovals(env, owner),
  ]);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const dependenciesByTask = new Map<string, unknown[]>();
  for (const dependency of dependencies) {
    const taskId = String(dependency.task_id ?? "");
    if (!taskId) continue;
    dependenciesByTask.set(taskId, [...(dependenciesByTask.get(taskId) ?? []), dependency.depends_on_task_id]);
  }
  const sourcesByTask = new Map<string, string[]>();
  for (const source of sources) {
    const taskId = String(source.task_id ?? "");
    const sourceType = String(source.source_type ?? "");
    if (!taskId || !sourceType) continue;
    sourcesByTask.set(taskId, [...new Set([...(sourcesByTask.get(taskId) ?? []), sourceType])]);
  }
  const enrichedTasks = tasks.map((task) => ({
    ...task,
    projectName: projectNames.get(task.projectId) ?? null,
    dependencyIds: dependenciesByTask.get(String(task.id)) ?? [],
    sources: sourcesByTask.get(String(task.id)) ?? [],
  }));
  return {
    projects,
    tasks: enrichedTasks,
    reviews,
    auditLogs,
    externalActions,
    actionApprovals,
    integrations: getIntegrationStatus(env),
    legacyCandidates: { projectCount: LEGACY_D1_CANDIDATES.projectCount, taskCount: LEGACY_D1_CANDIDATES.taskCount, items: [...LEGACY_D1_CANDIDATES.items] },
  };
}

export function createOzToolService(env: OzDataEnvironment, owner: OwnerContext) {
  const repository: OzToolRepository = {
    getContext: () => getContext(env, owner),
    createReview: (input) => createReview(env, owner, input),
    resolveReview: (input) => resolveReview(env, owner, input),
    proposeExternalAction: (input) => proposeExternalAction(env, owner, input),
  };
  return new OzToolService(repository, env.OZ_TIMEZONE || "Asia/Tokyo");
}

export async function executeOzTool(
  request: Request,
  env: OzDataEnvironment,
  owner: OwnerContext,
  name: string,
  args: Record<string, unknown>,
) {
  const aliases: Record<string, { name: string; args: Record<string, unknown>; source: "QUICK_ADD" | "VOICE" }> = {
    oz_create_task: {
      name: "oz_create_task_candidate",
      args: {
        title: args.title,
        description: typeof args.description === "string" ? args.description : null,
        projectCandidate: typeof args.project === "string" ? args.project : null,
        dueAt: typeof args.due_at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(args.due_at) ? args.due_at : null,
        importance: 3,
        executionEnvironment: "ANY",
        timeLane: "SOMEDAY",
        sourceEvidence: [],
        missingFields: [],
      },
      source: args.source === "command-center" ? "QUICK_ADD" : "VOICE",
    },
    oz_complete_task: {
      name: "oz_propose_task_status_change",
      args: { taskId: args.id, status: "COMPLETED" },
      source: "VOICE",
    },
  };
  const alias = aliases[name];
  const actualName = alias?.name ?? name;
  const actualArgs = alias?.args ?? args;
  const definition = getOzToolDefinition(actualName);
  if (definition?.approval === "explicit" && request.headers.get("x-oz-explicit-approval") !== "true") {
    throw new OzToolError("EXPLICIT_APPROVAL_REQUIRED", "Explicit owner approval is required.", 409);
  }
  return createOzToolService(env, owner).execute(actualName, actualArgs, {
    idempotencyKey: definition?.annotations.readOnlyHint ? undefined : idempotencyKey(request),
    sourceType: alias?.source ?? toolSource(request),
  });
}

export async function handleOzApi(request: Request, env: OzDataEnvironment, owner: OwnerContext, pathname: string) {
  try {
    const service = createOzToolService(env, owner);
    if (pathname === "/api/oz/context" && request.method === "GET") return json((await service.execute("oz_get_context", {})).data);
    if (pathname === "/api/oz/daily-brief" && request.method === "GET") return json((await service.execute("oz_get_daily_brief", {})).data);
    if (pathname === "/api/oz/projects/initial-candidates" && request.method === "GET") {
      return json({ candidates: INITIAL_PROJECT_CANDIDATES, taskCandidates: INITIAL_CLIENT_TASK_CANDIDATES });
    }
    if (pathname === "/api/oz/legacy-candidates" && request.method === "GET") return json(LEGACY_D1_CANDIDATES);
    if (pathname === "/api/oz/projects" && request.method === "GET") return json((await service.execute("oz_list_projects", {})).data);
    if (pathname === "/api/oz/tasks" && request.method === "GET") return json((await service.execute("oz_list_tasks", {})).data);
    if (pathname === "/api/oz/reviews" && request.method === "GET") return json((await service.execute("oz_list_reviews", {})).data);
    if (pathname === "/api/oz/audit" && request.method === "GET") {
      const context = await getContext(env, owner);
      return json({ auditLogs: context.auditLogs });
    }

    if (pathname === "/api/oz/tasks" && request.method === "POST") {
      return json({ result: await executeOzTool(request, env, owner, "oz_create_task_candidate", await request.json() as Row) }, 202);
    }
    if (pathname === "/api/oz/projects/candidates" && request.method === "POST") {
      return json({ result: await executeOzTool(request, env, owner, "oz_create_project_candidate", await request.json() as Row) }, 202);
    }
    if (pathname === "/api/oz/reviews" && request.method === "POST") {
      const body = await request.json() as { kind?: unknown; candidate?: unknown };
      const candidate = z.record(z.string(), z.unknown()).parse(body.candidate ?? {});
      const routes: Record<string, string> = {
        TASK_CREATE: "oz_create_task_candidate",
        TASK_EDIT: "oz_propose_task_update",
        TASK_STATUS_CHANGE: "oz_propose_task_status_change",
        PROJECT_CREATE: "oz_create_project_candidate",
      };
      const name = routes[String(body.kind ?? "")];
      if (!name) throw new OzToolError("REVIEW_KIND_NOT_SUPPORTED", "This review kind is not supported.");
      return json({ result: await executeOzTool(request, env, owner, name, candidate) }, 202);
    }

    const reviewMatch = /^\/api\/oz\/reviews\/([^/]+)\/resolve$/.exec(pathname);
    if (reviewMatch && request.method === "POST") {
      const body = z.record(z.string(), z.unknown()).parse(await request.json());
      const headers = new Headers(request.headers);
      return json({ result: await executeOzTool(new Request(request.url, { method: "POST", headers }), env, owner, "oz_resolve_review", { reviewId: reviewMatch[1], ...body }) });
    }

    if (pathname === "/api/oz/actions" && request.method === "POST") {
      return json({ result: await executeOzTool(request, env, owner, "oz_propose_external_action", await request.json() as Row) }, 202);
    }
    const actionMatch = /^\/api\/oz\/actions\/([^/]+)\/decision$/.exec(pathname);
    if (actionMatch && request.method === "POST") {
      if (request.headers.get("x-oz-explicit-approval") !== "true") throw new OzToolError("EXPLICIT_APPROVAL_REQUIRED", "Explicit owner approval is required.", 409);
      const body = z.object({ decision: z.enum(["APPROVED", "REJECTED"]) }).strict().parse(await request.json());
      return json({ result: await decideExternalAction(env, owner, { actionId: actionMatch[1], decision: body.decision, idempotencyKey: idempotencyKey(request) }) });
    }

    if (pathname === "/api/oz/tools" && request.method === "POST") {
      const body = await request.json() as { name?: unknown; arguments?: unknown };
      const name = z.string().trim().min(1).max(80).parse(body.name);
      const args = z.record(z.string(), z.unknown()).parse(body.arguments ?? {});
      return json({ result: await executeOzTool(request, env, owner, name, args) });
    }
    return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
  } catch (error) {
    const status = error instanceof OzToolError ? error.status : error instanceof z.ZodError ? 400 : Number((error as { status?: unknown })?.status ?? 400);
    const code = error instanceof OzToolError ? error.code : error instanceof z.ZodError ? "INVALID_ARGUMENTS" : "OPERATION_FAILED";
    return json({ error: { code, message: status === 401 || status === 403 ? "Access denied." : "The requested operation could not be completed." } }, status);
  }
}
