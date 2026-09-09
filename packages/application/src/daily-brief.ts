export type BriefProject = {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  formalStatus?: unknown;
  importance?: unknown;
};

export type BriefTask = {
  id?: unknown;
  projectId?: unknown;
  projectName?: unknown;
  title?: unknown;
  formalStatus?: unknown;
  importance?: unknown;
  dueAt?: unknown;
  estimatedMinutes?: unknown;
  blockReason?: unknown;
  dependencyIds?: unknown;
};

export type BriefReview = { status?: unknown };
export type BriefConnector = { id?: unknown; label?: unknown; connected?: unknown };

export type DailyBriefInput = {
  projects: BriefProject[];
  tasks: BriefTask[];
  reviews: BriefReview[];
  connectors: BriefConnector[];
  now?: Date;
  timezone?: string;
};

export type DailyBriefTask = {
  id: string;
  title: string;
  project: string | null;
  status: string;
  importance: number;
  dueAt: string | null;
  estimatedMinutes: number | null;
  blocked: boolean;
  reasons: string[];
  score: number;
};

export type DailyBrief = {
  generatedAt: string;
  timezone: string;
  topPriorities: DailyBriefTask[];
  waitingAlerts: DailyBriefTask[];
  waitingUpcoming: DailyBriefTask[];
  overdue: DailyBriefTask[];
  today: DailyBriefTask[];
  thisWeek: DailyBriefTask[];
  blocked: DailyBriefTask[];
  quickWins: DailyBriefTask[];
  reviewCount: number;
  unavailableSources: string[];
  summary: string;
};

const DAY_MS = 86_400_000;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback: number | null = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dayKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function dayDistance(dueAt: string, now: Date, timezone: string) {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  return Math.round((Date.parse(`${dayKey(due, timezone)}T00:00:00Z`) - Date.parse(`${dayKey(now, timezone)}T00:00:00Z`)) / DAY_MS);
}

function normalizeTask(task: BriefTask, completedIds: Set<string>, projectStatuses: Map<string, string>, now: Date, timezone: string): DailyBriefTask | null {
  const id = text(task.id);
  const title = text(task.title).trim();
  const projectStatus = projectStatuses.get(text(task.projectId)) ?? "";
  if (!id || !title || text(task.formalStatus) === "COMPLETED" || ["COMPLETED", "ARCHIVED"].includes(projectStatus)) return null;
  const importance = Math.max(1, Math.min(5, number(task.importance, 3) ?? 3));
  const status = text(task.formalStatus).toUpperCase();
  const dueAt = text(task.dueAt) || null;
  const distance = dueAt ? dayDistance(dueAt, now, timezone) : null;
  const dependencyIds = Array.isArray(task.dependencyIds) ? task.dependencyIds.map(text).filter(Boolean) : [];
  const dependencyBlocked = dependencyIds.some((dependencyId) => !completedIds.has(dependencyId));
  const projectOnHold = projectStatus === "ON_HOLD";
  const blocked = Boolean(text(task.blockReason).trim()) || dependencyBlocked || projectOnHold;
  const reasons: string[] = [];
  let score = importance * 12;

  if (distance !== null && distance < 0) {
    score += 120 + Math.min(30, Math.abs(distance) * 4);
    reasons.push(`${Math.abs(distance)}日、期限を超過しています`);
  } else if (distance === 0) {
    score += 95;
    reasons.push("今日が期限です");
  } else if (distance !== null && distance <= 2) {
    score += 72 - distance * 5;
    reasons.push(`期限まで${distance}日です`);
  } else if (distance !== null && distance <= 7) {
    score += 42 - distance;
    reasons.push("今週が期限です");
  }

  if (importance >= 4) {
    score += importance * 4;
    reasons.push(`重要度${importance}です`);
  }
  if (blocked) {
    score -= 45;
    reasons.push(dependencyBlocked ? "未完了の依存タスクがあります" : projectOnHold ? "projectが保留中です" : "ブロック理由が登録されています");
  }
  const estimate = number(task.estimatedMinutes);
  if (estimate !== null && estimate > 0 && estimate <= 30) {
    score += 8;
    reasons.push(`${estimate}分で完了できる見込みです`);
  }
  if (!reasons.length) reasons.push("未完了タスクとして整理が必要です");

  return {
    id,
    title,
    project: text(task.projectName) || null,
    status,
    importance,
    dueAt,
    estimatedMinutes: estimate,
    blocked,
    reasons: reasons.slice(0, 3),
    score,
  };
}

export function buildDailyBrief(input: DailyBriefInput): DailyBrief {
  const now = input.now ?? new Date();
  const timezone = input.timezone || "Asia/Tokyo";
  const completedIds = new Set(input.tasks.filter((task) => text(task.formalStatus) === "COMPLETED").map((task) => text(task.id)));
  const projectStatuses = new Map(input.projects.map((project) => [text(project.id), (text(project.formalStatus) || text(project.status)).toUpperCase()]));
  const tasks = input.tasks.map((task) => normalizeTask(task, completedIds, projectStatuses, now, timezone)).filter((task): task is DailyBriefTask => Boolean(task));
  const sourceOrder = new Map(tasks.map((task, index) => [task, index]));
  const distance = (task: DailyBriefTask) => task.dueAt ? dayDistance(task.dueAt, now, timezone) : null;
  const dueTime = (task: DailyBriefTask) => task.dueAt ? new Date(task.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const stablePriority = (left: DailyBriefTask, right: DailyBriefTask) => right.score - left.score
    || dueTime(left) - dueTime(right)
    || right.importance - left.importance
    || (sourceOrder.get(left) ?? 0) - (sourceOrder.get(right) ?? 0);
  const stableDue = (left: DailyBriefTask, right: DailyBriefTask) => dueTime(left) - dueTime(right)
    || right.importance - left.importance
    || (sourceOrder.get(left) ?? 0) - (sourceOrder.get(right) ?? 0);
  const byPriority = [...tasks].sort(stablePriority);
  const workPriorities = byPriority.filter((task) => !task.blocked && !["WAITING", "ON_HOLD"].includes(task.status));
  const topPriorities = workPriorities.slice(0, 5);
  const waiting = tasks.filter((task) => task.status === "WAITING").sort(stableDue);
  const waitingAlerts = waiting.filter((task) => {
    const days = distance(task);
    return days !== null && days <= 2;
  });
  const waitingUpcoming = waiting.filter((task) => {
    const days = distance(task);
    return days === null || days > 2;
  });
  const overdue = byPriority.filter((task) => (distance(task) ?? 0) < 0);
  const today = byPriority.filter((task) => distance(task) === 0);
  const thisWeek = byPriority.filter((task) => {
    const days = distance(task);
    return days !== null && days >= 0 && days <= 7;
  });
  const blocked = byPriority.filter((task) => task.blocked);
  const quickWins = workPriorities.filter((task) => task.estimatedMinutes !== null && task.estimatedMinutes > 0 && task.estimatedMinutes <= 30).slice(0, 5);
  const reviewCount = input.reviews.filter((review) => ["PENDING", "NEEDS_EDIT"].includes(text(review.status))).length;
  const unavailableSources = input.connectors
    .filter((connector) => connector.id !== "project-database" && connector.connected !== true)
    .map((connector) => text(connector.label) || text(connector.id))
    .filter(Boolean);
  const summary = topPriorities.length
    ? `今日の作業候補は${topPriorities.length}件です。期限超過${overdue.length}件、確認待ち${reviewCount}件、返事待ちアラート${waitingAlerts.length}件があります。`
    : `正式な未完了タスクはありません。確認待ちは${reviewCount}件です。`;

  return {
    generatedAt: now.toISOString(),
    timezone,
    topPriorities,
    waitingAlerts,
    waitingUpcoming,
    overdue,
    today,
    thisWeek,
    blocked,
    quickWins,
    reviewCount,
    unavailableSources,
    summary,
  };
}
