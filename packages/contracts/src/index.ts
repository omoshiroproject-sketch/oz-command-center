export const TASK_STATUSES = [
  "UNSTARTED",
  "IN_PROGRESS",
  "WAITING",
  "ON_HOLD",
  "COMPLETED",
] as const;

export const REVIEW_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "NEEDS_EDIT",
] as const;

export const EXTERNAL_ACTION_STATUSES = [
  "PROPOSED",
  "APPROVED",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;

export const PROJECT_STATUSES = [
  "IDEA",
  "PLANNED",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
] as const;

export const PROPOSAL_STATUSES = [
  "DRAFT",
  "SENT",
  "WON",
  "LOST",
  "ON_HOLD",
] as const;

export const CALENDAR_BLOCK_TYPES = [
  "MEETING",
  "WORK",
  "TRAVEL",
  "FOCUS",
  "PERSONAL",
] as const;

export const EXECUTION_ENVIRONMENTS = [
  "ANY",
  "MOBILE",
  "PC",
  "TRAVEL_OK",
  "CALL",
  "IN_PERSON",
] as const;

export const JOB_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "RETRYABLE",
  "FAILED",
  "CANCELLED",
] as const;

export const REVIEW_KINDS = [
  "TASK_CREATE",
  "TASK_STATUS_CHANGE",
  "TASK_EDIT",
  "PROJECT_CREATE",
  "EXTERNAL_ACTION",
] as const;

export const REVIEW_SOURCE_TYPES = [
  "QUICK_ADD",
  "VOICE",
  "CHAT",
  "EMAIL",
  "MEETING",
  "CONNECTOR",
  "MANUAL",
] as const;

export const TIME_LANES = ["DUE", "TODAY_IF_POSSIBLE", "SOMEDAY"] as const;
export const DELEGATION_STATES = ["SELF", "CANDIDATE", "DELEGATED"] as const;
export const APPROVAL_DECISIONS = ["APPROVED", "REJECTED"] as const;
export const IDEMPOTENCY_STATUSES = ["PROCESSING", "SUCCEEDED", "FAILED"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type ExternalActionStatus = (typeof EXTERNAL_ACTION_STATUSES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export type CalendarBlockType = (typeof CALENDAR_BLOCK_TYPES)[number];
export type ExecutionEnvironment = (typeof EXECUTION_ENVIRONMENTS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export type ReviewSourceType = (typeof REVIEW_SOURCE_TYPES)[number];
export type TimeLane = (typeof TIME_LANES)[number];
export type DelegationState = (typeof DELEGATION_STATES)[number];
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];
export type IdempotencyStatus = (typeof IDEMPOTENCY_STATUSES)[number];

export type ConnectorCapabilities = {
  read: boolean;
  search: boolean;
  write: boolean;
  webhook: boolean;
  polling: boolean;
};

export type ConnectionHealth = {
  ok: boolean;
  checkedAt: string;
  detail?: string;
};

export type SyncResult<TItem = unknown> = {
  items: TItem[];
  nextCursor?: string;
};

export interface OzConnector<
  TSearch = unknown,
  TItem = unknown,
  TAction = unknown,
  TPreview = unknown,
  TResult = unknown,
> {
  getCapabilities(): ConnectorCapabilities;
  validateConnection(): Promise<ConnectionHealth>;
  sync(cursor?: string): Promise<SyncResult<TItem>>;
  search?(query: TSearch): Promise<TItem[]>;
  previewAction?(input: TAction): Promise<TPreview>;
  executeApprovedAction?(approvalId: string): Promise<TResult>;
}
