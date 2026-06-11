export type TicketState =
  | "DRAFT"
  | "PROPOSED"
  | "READY"
  | "WORKING"
  | "REVIEWING"
  | "VALIDATING"
  | "REWORK"
  | "BLOCKED"
  | "READY_TO_MERGE"
  | "MERGING"
  | "DONE"
  | "CANCELLED";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type RefinementMode = "autonomous" | "user_approved" | "user_participant" | "user_only";

export type RoleName =
  | "product_manager"
  | "architect"
  | "developer"
  | "reviewer"
  | "validator"
  | "integrator";

export type Project = {
  id: string;
  slug: string;
  name: string;
  description: string;
  workspaceRoot: string;
  defaultBaseBranch: string;
  repoCount: number;
  ticketCount: number;
  board: Record<string, number>;
  policy?: ProjectPolicy;
  roleProfiles?: RoleProfile[];
};

export type ProjectPolicy = {
  requireReviewer: boolean;
  requireValidator: boolean;
  requireHumanApprovalBeforeMerge: boolean;
  requiredValidationCommandProfileForMerge: string;
  maxParallelExecutions: number;
  maxParallelMerges: number;
  maxAutoContinueIterations: number;
  refinementMode: RefinementMode;
  agentCreatedTicketDefaultState: TicketState;
};

export type RoleProfile = {
  role: RoleName;
  adapter: string;
  model: string;
  config?: Record<string, unknown>;
};

export type ProjectUpdateInput = {
  name: string;
  description: string;
  workspaceRoot: string;
  defaultBaseBranch: string;
};

export type ProjectCreateInput = ProjectUpdateInput & {
  slug: string;
};

export type ProjectPolicyInput = {
  requireReviewer: boolean;
  requireValidator: boolean;
  requireHumanApprovalBeforeMerge: boolean;
  requiredValidationCommandProfileForMerge: string;
  maxParallelExecutions: number;
  maxParallelMerges: number;
  maxAutoContinueIterations: number;
  refinementMode: RefinementMode;
  agentCreatedTicketDefaultState: TicketState;
};

export type BoardTicket = {
  id: string;
  projectId: string;
  parentTicketId: string;
  key: string;
  title: string;
  brief: string;
  state: TicketState;
  priority: TicketPriority;
  assignedRole: RoleName;
  latestSummary: string;
  latestReviewVerdict: string;
  latestValidationVerdict: string;
  repoCount: number;
  dependencyCount: number;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BoardColumn = {
  state: TicketState;
  label: string;
  count: number;
  tickets: BoardTicket[];
};

export type Board = {
  projectId: string;
  projectName: string;
  columns: BoardColumn[];
  totalTickets: number;
  generatedAt: string;
};

export type RepoTarget = {
  id: string;
  repoId: string;
  repoSlug: string;
  repoName: string;
  repoLocalPath: string;
  repoDefaultBranch: string;
  baseRef: string;
  branchName: string;
  targetScopeMd: string;
};

export type Execution = {
  id: string;
  role: RoleName;
  iteration: number;
  status: string;
  outcome: string;
  summaryMd: string;
  remainingWorkMd: string;
  expectedNextEvidenceMd?: string;
  failureKind?: string;
  blockedKind?: string;
  startedAt: string;
  finishedAt: string;
};

export type Review = {
  id: string;
  verdict: string;
  summaryMd: string;
  findingsCount: number;
  createdAt: string;
};

export type ValidationRun = {
  id: string;
  repoSlug: string;
  verdict: string;
  commandProfile: string;
  summaryMd: string;
  finishedAt: string;
};

export type EventRecord = {
  id: string;
  type: string;
  lane: string;
  summary: string;
  detail: string;
  createdAt: string;
};

export type TicketDependency = {
  id: string;
  blockedTicketId: string;
  blockingTicketId: string;
  blockingTicketKey: string;
  blockingTicketTitle: string;
  blockingTicketState: TicketState;
  dependencyType: string;
  createdAt: string;
};

export type Worktree = {
  id: string;
  repoId: string;
  repoSlug: string;
  repoName: string;
  executionRole: RoleName;
  executionIteration: number;
  path: string;
  branchName: string;
  baseRef: string;
  status: string;
  isDirty: boolean;
  updatedAt: string;
  cleanedAt: string | null;
};

export type Artifact = {
  id: string;
  kind: string;
  label: string;
  uri: string;
  createdAt: string;
};

export type MergeStatus = {
  readiness: string;
  canMerge: boolean;
  requiresHumanApproval: boolean;
  statusSummary?: string;
  blockingReasons: Array<{ code: string; source?: string; message?: string; summary?: string; detail?: string }>;
  latestRun?: {
    status: string;
    strategy: string;
    summaryMd: string;
    startedAt: string;
    finishedAt: string;
  };
};

export type TicketDetail = BoardTicket & {
  acceptanceCriteriaMd: string;
  definitionOfDoneMd: string;
  repoTargets: RepoTarget[];
  executions: Execution[];
  reviews: Review[];
  validations: ValidationRun[];
  dependencies: TicketDependency[];
  worktrees: Worktree[];
  events: EventRecord[];
  artifacts: Artifact[];
  mergeStatus: MergeStatus;
};

export type Repo = {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  localPath: string;
  remoteUrl: string;
  defaultBranch: string;
  isPrimary: boolean;
};

export type RepoInput = {
  name: string;
  slug: string;
  localPath: string;
  remoteUrl: string;
  defaultBranch: string;
  isPrimary: boolean;
};

export type DirectoryListing = {
  path: string;
  parentPath: string;
  entries: Array<{ name: string; path: string; hidden: boolean }>;
};

export type DirectoryCreateResult = {
  path: string;
};

export type RepoMetadata = RepoInput;

export type RepoUpdateInput = Partial<Omit<RepoInput, "slug">>;

export type MergeQueueItem = BoardTicket & {
  mergeStatus: MergeStatus | null;
};
