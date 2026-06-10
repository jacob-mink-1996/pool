const stateOptions = [
  "PROPOSED",
  "READY",
  "WORKING",
  "REVIEWING",
  "VALIDATING",
  "REWORK",
  "BLOCKED",
  "READY_TO_MERGE",
  "DONE",
];
const policyTicketStateOptions = ["DRAFT", ...stateOptions];

const roleOptions = [
  "product_manager",
  "architect",
  "developer",
  "reviewer",
  "validator",
  "integrator",
];

const priorityOptions = ["low", "medium", "high", "urgent"];
const executionOutcomeOptions = [
  "completed",
  "needs_continue",
  "blocked",
  "followup_created",
  "failed",
];
const activityEventTypes = [
  "project.created",
  "project.updated",
  "repo.created",
  "repo.updated",
  "ticket.created",
  "ticket.updated",
  "ticket.transitioned",
  "dependency.added",
  "dependency.removed",
  "execution.started",
  "execution.completed",
  "review.completed",
  "validation.completed",
  "worktree.created",
  "worktree.cleaned",
  "merge.started",
  "merge.completed",
];

const stateClassMap = new Map(stateOptions.map((state) => [state, slugify(state)]));

const dom = {
  projectSelect: document.querySelector("#project-select"),
  refreshButton: document.querySelector("#refresh-button"),
  boardTitle: document.querySelector("#board-title"),
  boardMeta: document.querySelector("#board-meta"),
  projectCreateForm: document.querySelector("#project-create-form"),
  createProjectNameInput: document.querySelector("#create-project-name-input"),
  createProjectSlugInput: document.querySelector("#create-project-slug-input"),
  createProjectBranchInput: document.querySelector("#create-project-branch-input"),
  createProjectWorkspaceRootInput: document.querySelector("#create-project-workspace-root-input"),
  createProjectDescriptionInput: document.querySelector("#create-project-description-input"),
  projectEmpty: document.querySelector("#project-empty"),
  projectWorkspace: document.querySelector("#project-workspace"),
  projectSettingsForm: document.querySelector("#project-settings-form"),
  projectNameInput: document.querySelector("#project-name-input"),
  projectDefaultBranchInput: document.querySelector("#project-default-branch-input"),
  projectWorkspaceRootInput: document.querySelector("#project-workspace-root-input"),
  projectDescriptionInput: document.querySelector("#project-description-input"),
  projectPolicyForm: document.querySelector("#project-policy-form"),
  policyRequireReviewerInput: document.querySelector("#policy-require-reviewer-input"),
  policyRequireValidatorInput: document.querySelector("#policy-require-validator-input"),
  policyRequireHumanApprovalInput: document.querySelector("#policy-require-human-approval-input"),
  policyAgentCreatedStateSelect: document.querySelector("#policy-agent-created-state-select"),
  policyMaxParallelInput: document.querySelector("#policy-max-parallel-input"),
  policyMaxContinueInput: document.querySelector("#policy-max-continue-input"),
  repoCount: document.querySelector("#repo-count"),
  repoCreateForm: document.querySelector("#repo-create-form"),
  repoNameInput: document.querySelector("#repo-name-input"),
  repoSlugInput: document.querySelector("#repo-slug-input"),
  repoDefaultBranchInput: document.querySelector("#repo-default-branch-input"),
  repoRemoteUrlInput: document.querySelector("#repo-remote-url-input"),
  repoLocalPathInput: document.querySelector("#repo-local-path-input"),
  repoIsPrimaryInput: document.querySelector("#repo-is-primary-input"),
  repoList: document.querySelector("#repo-list"),
  roleProfileList: document.querySelector("#role-profile-list"),
  ticketCreateForm: document.querySelector("#ticket-create-form"),
  createTitleInput: document.querySelector("#create-title-input"),
  createStateSelect: document.querySelector("#create-state-select"),
  createPrioritySelect: document.querySelector("#create-priority-select"),
  createRoleSelect: document.querySelector("#create-role-select"),
  createBriefInput: document.querySelector("#create-brief-input"),
  createRepoSelect: document.querySelector("#create-repo-select"),
  boardFilterForm: document.querySelector("#board-filter-form"),
  boardSearchInput: document.querySelector("#board-search-input"),
  boardStateSelect: document.querySelector("#board-state-select"),
  boardRoleSelect: document.querySelector("#board-role-select"),
  boardPrioritySelect: document.querySelector("#board-priority-select"),
  boardFilterResetButton: document.querySelector("#board-filter-reset-button"),
  mergeQueueCount: document.querySelector("#merge-queue-count"),
  mergeQueue: document.querySelector("#merge-queue"),
  activityCount: document.querySelector("#activity-count"),
  activityFilterForm: document.querySelector("#activity-filter-form"),
  activityTicketSelect: document.querySelector("#activity-ticket-select"),
  activityTypeSelect: document.querySelector("#activity-type-select"),
  activityLimitSelect: document.querySelector("#activity-limit-select"),
  activityFilterResetButton: document.querySelector("#activity-filter-reset-button"),
  activityFeed: document.querySelector("#activity-feed"),
  boardColumns: document.querySelector("#board-columns"),
  ticketTitle: document.querySelector("#ticket-title"),
  ticketStateBadge: document.querySelector("#ticket-state-badge"),
  ticketEmpty: document.querySelector("#ticket-empty"),
  ticketDetail: document.querySelector("#ticket-detail"),
  ticketBrief: document.querySelector("#ticket-brief"),
  executionCreateForm: document.querySelector("#execution-create-form"),
  executionRoleSelect: document.querySelector("#execution-role-select"),
  executionReasonInput: document.querySelector("#execution-reason-input"),
  executionActionEmpty: document.querySelector("#execution-action-empty"),
  executionActionForm: document.querySelector("#execution-action-form"),
  executionOutcomeSelect: document.querySelector("#execution-outcome-select"),
  executionNoteInput: document.querySelector("#execution-note-input"),
  executionContinueButton: document.querySelector("#execution-continue-button"),
  executionCancelButton: document.querySelector("#execution-cancel-button"),
  executionList: document.querySelector("#execution-list"),
  reviewForm: document.querySelector("#review-form"),
  reviewExecutionSelect: document.querySelector("#review-execution-select"),
  reviewVerdictSelect: document.querySelector("#review-verdict-select"),
  reviewSummaryInput: document.querySelector("#review-summary-input"),
  reviewFindingTitleInput: document.querySelector("#review-finding-title-input"),
  reviewFindingCategoryInput: document.querySelector("#review-finding-category-input"),
  reviewFindingSeveritySelect: document.querySelector("#review-finding-severity-select"),
  reviewFindingLocationInput: document.querySelector("#review-finding-location-input"),
  reviewFindingDetailsInput: document.querySelector("#review-finding-details-input"),
  reviewList: document.querySelector("#review-list"),
  validationForm: document.querySelector("#validation-form"),
  validationRepoSelect: document.querySelector("#validation-repo-select"),
  validationVerdictSelect: document.querySelector("#validation-verdict-select"),
  validationCommandProfileInput: document.querySelector("#validation-command-profile-input"),
  validationCommandsInput: document.querySelector("#validation-commands-input"),
  validationSummaryInput: document.querySelector("#validation-summary-input"),
  validationList: document.querySelector("#validation-list"),
  mergeStatusTitle: document.querySelector("#merge-status-title"),
  mergeStatusCopy: document.querySelector("#merge-status-copy"),
  mergeStatusBadge: document.querySelector("#merge-status-badge"),
  mergeStatusMeta: document.querySelector("#merge-status-meta"),
  mergeForm: document.querySelector("#merge-form"),
  mergeStrategySelect: document.querySelector("#merge-strategy-select"),
  mergeOutcomeSelect: document.querySelector("#merge-outcome-select"),
  mergeApprovedByKindInput: document.querySelector("#merge-approved-by-kind-input"),
  mergeApprovedByRefInput: document.querySelector("#merge-approved-by-ref-input"),
  mergeSummaryInput: document.querySelector("#merge-summary-input"),
  ticketEditForm: document.querySelector("#ticket-edit-form"),
  ticketTitleInput: document.querySelector("#ticket-title-input"),
  ticketPrioritySelect: document.querySelector("#ticket-priority-select"),
  ticketRoleSelect: document.querySelector("#ticket-role-select"),
  ticketSummaryInput: document.querySelector("#ticket-summary-input"),
  ticketParentSelect: document.querySelector("#ticket-parent-select"),
  ticketBriefInput: document.querySelector("#ticket-brief-input"),
  stateForm: document.querySelector("#state-form"),
  stateSelect: document.querySelector("#state-select"),
  stateReason: document.querySelector("#state-reason"),
  acceptanceCriteria: document.querySelector("#acceptance-criteria"),
  acceptanceCriteriaInput: document.querySelector("#acceptance-criteria-input"),
  definitionOfDone: document.querySelector("#definition-of-done"),
  definitionOfDoneInput: document.querySelector("#definition-of-done-input"),
  repoTargetForm: document.querySelector("#repo-target-form"),
  repoTargetRepoSelect: document.querySelector("#repo-target-repo-select"),
  repoTargetBaseRefInput: document.querySelector("#repo-target-base-ref-input"),
  repoTargetBranchInput: document.querySelector("#repo-target-branch-input"),
  repoTargetScopeInput: document.querySelector("#repo-target-scope-input"),
  repoTargets: document.querySelector("#repo-targets"),
  dependencyForm: document.querySelector("#dependency-form"),
  blockingTicketSelect: document.querySelector("#blocking-ticket-select"),
  dependencies: document.querySelector("#dependencies"),
  worktrees: document.querySelector("#worktrees"),
  eventTimeline: document.querySelector("#event-timeline"),
  ticketCardTemplate: document.querySelector("#ticket-card-template"),
};

const state = {
  projects: [],
  project: null,
  projectId: "",
  board: null,
  ticketDetail: null,
  selectedTicketId: "",
  tickets: [],
  repos: [],
  mergeQueue: [],
  events: [],
  activityFilters: {
    ticketId: "",
    type: "",
    limit: 20,
  },
  boardFilters: {
    search: "",
    state: "",
    assignedRole: "",
    priority: "",
  },
};

bootstrap().catch((error) => {
  console.error(error);
  setBoardError(error instanceof Error ? error.message : String(error));
});

async function bootstrap() {
  renderStateOptions();
  renderRoleOptions();
  renderPriorityOptions();
  renderExecutionOptions();
  renderPolicyStateOptions();
  renderCreateFormOptions();
  renderBoardFilterOptions();
  bindEvents();
  resetProjectCreateForm();
  resetReviewForm();
  resetValidationForm();
  resetMergeForm();
  await refreshProjects();
}

function bindEvents() {
  dom.projectSelect.addEventListener("change", async (event) => {
    const nextProjectId = event.target.value;
    if (!nextProjectId) {
      renderNoProjectState();
      return;
    }
    location.hash = nextProjectId;
    await loadBoard(nextProjectId);
  });

  dom.refreshButton.addEventListener("click", async () => {
    if (!state.projectId) return;
    await loadBoard(state.projectId, { keepSelection: true });
  });

  dom.boardFilterForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId) return;

    state.boardFilters.search = dom.boardSearchInput.value.trim();
    state.boardFilters.state = dom.boardStateSelect.value;
    state.boardFilters.assignedRole = dom.boardRoleSelect.value;
    state.boardFilters.priority = dom.boardPrioritySelect.value;
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.boardFilterResetButton.addEventListener("click", async () => {
    if (!state.projectId) return;

    state.boardFilters = {
      search: "",
      state: "",
      assignedRole: "",
      priority: "",
    };
    renderBoardFilters();
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.activityFilterForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId) return;

    state.activityFilters.ticketId = dom.activityTicketSelect.value;
    state.activityFilters.type = dom.activityTypeSelect.value;
    state.activityFilters.limit = Number.parseInt(dom.activityLimitSelect.value, 10) || 20;
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.activityFilterResetButton.addEventListener("click", async () => {
    if (!state.projectId) return;

    state.activityFilters = {
      ticketId: "",
      type: "",
      limit: 20,
    };
    dom.activityTicketSelect.value = "";
    dom.activityTypeSelect.value = "";
    dom.activityLimitSelect.value = "20";
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.projectSettingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId) return;

    await fetchJson(`/api/v1/projects/${state.projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: dom.projectNameInput.value,
        description: dom.projectDescriptionInput.value,
        workspaceRoot: dom.projectWorkspaceRootInput.value,
        defaultBaseBranch: dom.projectDefaultBranchInput.value,
      }),
    });

    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.projectPolicyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId) return;

    await fetchJson(`/api/v1/projects/${state.projectId}/policy`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requireReviewer: dom.policyRequireReviewerInput.checked,
        requireValidator: dom.policyRequireValidatorInput.checked,
        requireHumanApprovalBeforeMerge: dom.policyRequireHumanApprovalInput.checked,
        agentCreatedTicketDefaultState: dom.policyAgentCreatedStateSelect.value,
        maxParallelExecutions: Number.parseInt(dom.policyMaxParallelInput.value, 10),
        maxAutoContinueIterations: Number.parseInt(dom.policyMaxContinueInput.value, 10),
      }),
    });

    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.createProjectNameInput.addEventListener("input", () => {
    if (!dom.createProjectSlugInput.value.trim()) {
      dom.createProjectSlugInput.value = slugify(dom.createProjectNameInput.value);
    }
  });

  dom.projectCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = await fetchJson("/api/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: dom.createProjectNameInput.value,
        slug: dom.createProjectSlugInput.value || slugify(dom.createProjectNameInput.value),
        workspaceRoot: dom.createProjectWorkspaceRootInput.value,
        description: dom.createProjectDescriptionInput.value,
        defaultBaseBranch: dom.createProjectBranchInput.value || "main",
      }),
    });

    location.hash = payload.project.id;
    dom.projectCreateForm.reset();
    resetProjectCreateForm();
    await refreshProjects({ projectId: payload.project.id });
  });

  dom.repoNameInput.addEventListener("input", () => {
    if (!dom.repoSlugInput.value.trim()) {
      dom.repoSlugInput.value = slugify(dom.repoNameInput.value);
    }
  });

  dom.repoCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId) return;

    await fetchJson(`/api/v1/projects/${state.projectId}/repos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: dom.repoNameInput.value,
        slug: dom.repoSlugInput.value || slugify(dom.repoNameInput.value),
        localPath: dom.repoLocalPathInput.value,
        remoteUrl: dom.repoRemoteUrlInput.value,
        defaultBranch: dom.repoDefaultBranchInput.value || state.project?.defaultBaseBranch || "main",
        isPrimary: dom.repoIsPrimaryInput.checked,
      }),
    });

    dom.repoCreateForm.reset();
    resetRepoCreateForm();
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.repoList.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-repo-id]");
    if (!form || !state.projectId) {
      return;
    }

    event.preventDefault();
    await fetchJson(`/api/v1/projects/${state.projectId}/repos/${form.dataset.repoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.elements.namedItem("name").value,
        localPath: form.elements.namedItem("localPath").value,
        remoteUrl: form.elements.namedItem("remoteUrl").value,
        defaultBranch: form.elements.namedItem("defaultBranch").value,
        isPrimary: form.elements.namedItem("isPrimary").checked,
      }),
    });

    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.roleProfileList.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-role]");
    if (!form || !state.projectId) {
      return;
    }

    event.preventDefault();
    const configText = form.elements.namedItem("config").value.trim();
    let config = {};
    if (configText) {
      config = JSON.parse(configText);
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error("Role profile config must be a JSON object");
      }
    }

    await fetchJson(`/api/v1/projects/${state.projectId}/agent-profiles/${form.dataset.role}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        adapter: form.elements.namedItem("adapter").value,
        model: form.elements.namedItem("model").value,
        config,
      }),
    });

    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.ticketCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId) return;

    const repoId = dom.createRepoSelect.value;
    const payload = await fetchJson(`/api/v1/projects/${state.projectId}/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: dom.createTitleInput.value,
        brief: dom.createBriefInput.value,
        state: dom.createStateSelect.value,
        priority: dom.createPrioritySelect.value,
        assignedRole: dom.createRoleSelect.value,
        repoTargets: repoId ? [{ repoId, baseRef: repoDefaultBranch(repoId) }] : [],
      }),
    });

    dom.ticketCreateForm.reset();
    resetCreateFormDefaults();
    await loadBoard(state.projectId, { keepSelection: false, ticketId: payload.ticket.id });
  });

  dom.executionCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId) return;

    await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}/executions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: dom.executionRoleSelect.value,
        reason: dom.executionReasonInput.value,
      }),
    });

    dom.executionReasonInput.value = "";
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId || !dom.reviewExecutionSelect.value) return;

    const finding = buildPrimaryReviewFinding();
    await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        executionId: dom.reviewExecutionSelect.value,
        verdict: dom.reviewVerdictSelect.value,
        summaryMd: dom.reviewSummaryInput.value,
        findings: finding ? [finding] : [],
      }),
    });

    resetReviewForm();
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.validationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId) return;

    const repoId = dom.validationRepoSelect.value;
    await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}/validations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repoIds: repoId ? [repoId] : [],
        commandProfile: dom.validationCommandProfileInput.value,
        commands: splitLines(dom.validationCommandsInput.value),
        verdict: dom.validationVerdictSelect.value,
        summaryMd: dom.validationSummaryInput.value,
      }),
    });

    resetValidationForm();
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.mergeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId) return;

    const outcome = dom.mergeOutcomeSelect.value;
    const payload = {
      strategy: dom.mergeStrategySelect.value,
      status: outcome,
      summaryMd: dom.mergeSummaryInput.value.trim(),
    };
    if (outcome === "completed" || dom.mergeApprovedByRefInput.value.trim()) {
      payload.approvedByKind = dom.mergeApprovedByKindInput.value.trim() || "human";
      payload.approvedByRef = dom.mergeApprovedByRefInput.value.trim();
    }

    await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    resetMergeForm();
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.stateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId) return;

    const targetState = dom.stateSelect.value;
    const reason = dom.stateReason.value.trim() || `Moved to ${targetState}`;
    await fetchJson(
      `/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}/transition`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetState, reason }),
      },
    );
    dom.stateReason.value = "";
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.ticketEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId) return;

    await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: dom.ticketTitleInput.value,
        brief: dom.ticketBriefInput.value,
        parentTicketId: dom.ticketParentSelect.value || null,
        priority: dom.ticketPrioritySelect.value,
        assignedRole: dom.ticketRoleSelect.value,
        latestSummary: dom.ticketSummaryInput.value,
        acceptanceCriteriaMd: dom.acceptanceCriteriaInput.value,
        definitionOfDoneMd: dom.definitionOfDoneInput.value,
      }),
    });

    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.repoTargetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId || !dom.repoTargetRepoSelect.value) return;

    const repoId = dom.repoTargetRepoSelect.value;
    await saveTicketRepoTargets([
      ...currentTicketRepoTargets(),
      {
        repoId,
        baseRef: dom.repoTargetBaseRefInput.value.trim() || repoDefaultBranch(repoId),
        branchName: dom.repoTargetBranchInput.value.trim(),
        targetScopeMd: dom.repoTargetScopeInput.value.trim(),
      },
    ]);

    resetRepoTargetForm();
  });

  dom.repoTargets.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-repo-id]");
    if (!form || !state.projectId || !state.selectedTicketId) {
      return;
    }

    event.preventDefault();
    const repoId = form.dataset.repoId;
    await saveTicketRepoTargets(
      currentTicketRepoTargets().map((target) =>
        target.repoId === repoId
          ? {
              repoId,
              baseRef: form.elements.namedItem("baseRef").value.trim() || repoDefaultBranch(repoId),
              branchName: form.elements.namedItem("branchName").value.trim(),
              targetScopeMd: form.elements.namedItem("targetScopeMd").value.trim(),
            }
          : {
              repoId: target.repoId,
              baseRef: target.baseRef,
              branchName: target.branchName,
              targetScopeMd: target.targetScopeMd,
            },
      ),
    );
  });

  dom.repoTargets.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='remove-repo-target']");
    if (!button || !state.projectId || !state.selectedTicketId) {
      return;
    }

    await saveTicketRepoTargets(
      currentTicketRepoTargets().filter((target) => target.repoId !== button.dataset.repoId),
    );
  });

  dom.dependencyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId || !dom.blockingTicketSelect.value) return;

    await fetchJson(
      `/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}/dependencies`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blockingTicketId: dom.blockingTicketSelect.value,
          dependencyType: "finish_to_start",
        }),
      },
    );

    dom.blockingTicketSelect.value = "";
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.dependencies.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='remove-dependency']");
    if (!button || !state.projectId || !state.selectedTicketId) {
      return;
    }

    await fetchJson(
      `/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}/dependencies/${button.dataset.dependencyId}`,
      {
        method: "DELETE",
      },
    );

    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.worktrees.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='clean-worktree']");
    if (!button || !state.projectId) {
      return;
    }

    await fetchJson(`/api/v1/projects/${state.projectId}/worktrees/${button.dataset.worktreeId}/clean`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "Operator cleaned the finished worktree from mission control.",
      }),
    });

    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.activityFeed.addEventListener("click", (event) => {
    const button = event.target.closest("[data-activity-ticket-id]");
    if (!button || !state.projectId) {
      return;
    }

    loadTicket(button.dataset.activityTicketId).catch((error) => {
      console.error(error);
    });
  });

  dom.executionActionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const activeExecution = currentActiveExecution();
    if (!state.projectId || !activeExecution) return;

    const note = dom.executionNoteInput.value.trim();
    const outcome = dom.executionOutcomeSelect.value;
    const payload = {
      outcome,
      summaryMd: note,
    };
    if (outcome === "needs_continue") {
      payload.remainingWorkMd = note;
    }

    await fetchJson(`/api/v1/projects/${state.projectId}/executions/${activeExecution.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    dom.executionNoteInput.value = "";
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.executionContinueButton.addEventListener("click", async () => {
    const activeExecution = currentActiveExecution();
    if (!state.projectId || !activeExecution) return;

    const reason = dom.executionNoteInput.value.trim() || "Continue the bounded execution loop.";
    await fetchJson(`/api/v1/projects/${state.projectId}/executions/${activeExecution.id}/continue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    dom.executionNoteInput.value = "";
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.executionCancelButton.addEventListener("click", async () => {
    const activeExecution = currentActiveExecution();
    if (!state.projectId || !activeExecution) return;

    const reason = dom.executionNoteInput.value.trim() || "Execution cancelled by operator.";
    await fetchJson(`/api/v1/projects/${state.projectId}/executions/${activeExecution.id}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    dom.executionNoteInput.value = "";
    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });
}

function renderStateOptions() {
  dom.stateSelect.innerHTML = "";
  for (const ticketState of stateOptions) {
    const option = document.createElement("option");
    option.value = ticketState;
    option.textContent = prettyState(ticketState);
    dom.stateSelect.append(option);
  }
}

function renderRoleOptions() {
  fillSelectOptions(dom.ticketRoleSelect, roleOptions, prettyRole);
}

function renderPriorityOptions() {
  fillSelectOptions(dom.ticketPrioritySelect, priorityOptions, prettyState);
}

function renderExecutionOptions() {
  fillSelectOptions(dom.executionRoleSelect, roleOptions, prettyRole);
  fillSelectOptions(dom.executionOutcomeSelect, executionOutcomeOptions, prettyState);
}

function renderPolicyStateOptions() {
  fillSelectOptions(dom.policyAgentCreatedStateSelect, policyTicketStateOptions, prettyState);
}

function renderCreateFormOptions() {
  fillSelectOptions(dom.createStateSelect, stateOptions, prettyState);
  fillSelectOptions(dom.createPrioritySelect, priorityOptions, prettyState);
  fillSelectOptions(dom.createRoleSelect, roleOptions, prettyRole);
  resetCreateFormDefaults();
}

function renderBoardFilterOptions() {
  fillSelectOptionsWithPlaceholder(dom.boardStateSelect, stateOptions, prettyState, "All states");
  fillSelectOptionsWithPlaceholder(dom.boardRoleSelect, roleOptions, prettyRole, "All roles");
  fillSelectOptionsWithPlaceholder(dom.boardPrioritySelect, priorityOptions, prettyState, "All priorities");
  renderBoardFilters();
}

function renderProjectOptions() {
  dom.projectSelect.innerHTML = "";
  for (const project of state.projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    dom.projectSelect.append(option);
  }
}

function renderBoardFilters() {
  dom.boardSearchInput.value = state.boardFilters.search;
  dom.boardStateSelect.value = state.boardFilters.state;
  dom.boardRoleSelect.value = state.boardFilters.assignedRole;
  dom.boardPrioritySelect.value = state.boardFilters.priority;
}

async function refreshProjects(options = {}) {
  const projectsPayload = await fetchJson("/api/v1/projects");
  state.projects = projectsPayload.projects || [];
  renderProjectOptions();

  if (state.projects.length === 0) {
    renderNoProjectState();
    return;
  }

  const requestedProjectId = options.projectId || location.hash.slice(1);
  const nextProject = state.projects.find((project) => project.id === requestedProjectId) || state.projects[0];
  location.hash = nextProject.id;
  dom.projectSelect.value = nextProject.id;
  await loadBoard(nextProject.id, options.loadBoardOptions);
}

async function loadBoard(projectId, options = {}) {
  state.projectId = projectId;
  setProjectWorkspaceVisible(true);
  dom.boardColumns.innerHTML = "";
  dom.boardTitle.textContent = "Loading board...";
  dom.boardMeta.textContent = "";
  dom.projectSelect.disabled = false;
  dom.refreshButton.disabled = false;

  const [projectPayload, boardPayload, ticketsPayload, reposPayload, mergeQueuePayload, activityPayload] = await Promise.all([
    fetchJson(`/api/v1/projects/${projectId}`),
    fetchJson(buildBoardUrl(projectId)),
    fetchJson(`/api/v1/projects/${projectId}/tickets`),
    fetchJson(`/api/v1/projects/${projectId}/repos`),
    fetchJson(`/api/v1/projects/${projectId}/merge-queue`),
    fetchJson(buildActivityEventsUrl(projectId)),
  ]);
  state.project = projectPayload.project;
  state.board = boardPayload.board;
  state.tickets = ticketsPayload.tickets || [];
  state.repos = reposPayload.repos || [];
  state.mergeQueue = mergeQueuePayload.queue || [];
  state.events = activityPayload.events || [];
  syncProjectSummary(projectPayload.project);
  renderProjectSettings();
  renderProjectPolicy();
  renderRepoRegistry();
  renderRoleProfiles();
  renderBoardFilters();
  renderRepoTargetOptions();
  renderMergeQueue();
  renderActivityFilters();
  renderActivityFeed();
  renderBoard(boardPayload.board);

  const nextTicketId =
    options.ticketId ||
    (options.keepSelection ? state.selectedTicketId : "") ||
    boardPayload.board.columns.flatMap((column) => column.tickets).at(0)?.id ||
    "";

  if (nextTicketId) {
    await loadTicket(nextTicketId);
    return;
  }

  clearTicketDetail();
}

function renderBoard(board) {
  dom.boardTitle.textContent = board.projectName;
  dom.boardMeta.textContent = `${board.totalTickets} tickets across ${board.columns.length} lanes`;
  dom.boardColumns.innerHTML = "";

  for (const column of board.columns) {
    const columnNode = document.createElement("section");
    columnNode.className = `board-column ${stateClassMap.get(column.state)}`;

    const header = document.createElement("header");
    header.className = "board-column-header";
    header.innerHTML = `
      <div>
        <p>${prettyState(column.state)}</p>
        <span>${column.count} ticket${column.count === 1 ? "" : "s"}</span>
      </div>
    `;
    columnNode.append(header);

    const body = document.createElement("div");
    body.className = "board-column-body";

    if (column.tickets.length === 0) {
      const empty = document.createElement("p");
      empty.className = "column-empty";
      empty.textContent = "No tickets in this lane.";
      body.append(empty);
    }

    for (const ticket of column.tickets) {
      body.append(renderTicketCard(ticket));
    }

    columnNode.append(body);
    dom.boardColumns.append(columnNode);
  }
}

function renderMergeQueue() {
  dom.mergeQueueCount.textContent = `${state.mergeQueue.length} ticket${state.mergeQueue.length === 1 ? "" : "s"} ready`;
  dom.mergeQueue.innerHTML = "";

  if (state.mergeQueue.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No tickets are waiting in the merge queue.";
    dom.mergeQueue.append(empty);
    return;
  }

  for (const item of state.mergeQueue) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "ticket-card";
    card.innerHTML = `
      <p class="ticket-key">${escapeHtml(item.key)}</p>
      <strong class="ticket-card-title">${escapeHtml(item.title)}</strong>
      <p class="ticket-card-summary">${escapeHtml(item.latestSummary || item.mergeStatus?.statusSummary || "Ready for merge.")}</p>
      <div class="ticket-card-meta">
        <span>${escapeHtml(item.priority)}</span>
        <span>${escapeHtml(item.assignedRole)}</span>
        <span>${item.mergeStatus?.requiresHumanApproval ? "Approval required" : "Approval optional"}</span>
        <span>${item.mergeStatus?.uncleanedWorktreeCount || 0} worktree</span>
      </div>
    `;

    card.addEventListener("click", () => {
      loadTicket(item.id).catch((error) => {
        console.error(error);
      });
    });

    dom.mergeQueue.append(card);
  }
}

function renderActivityFilters() {
  dom.activityCount.textContent = `${state.events.length} recent event${state.events.length === 1 ? "" : "s"}`;

  dom.activityTicketSelect.innerHTML = "";
  const allTicketsOption = document.createElement("option");
  allTicketsOption.value = "";
  allTicketsOption.textContent = "All tickets";
  dom.activityTicketSelect.append(allTicketsOption);
  for (const ticket of state.tickets) {
    const option = document.createElement("option");
    option.value = ticket.id;
    option.textContent = `${ticket.key} · ${ticket.title}`;
    dom.activityTicketSelect.append(option);
  }
  dom.activityTicketSelect.value = state.activityFilters.ticketId;

  dom.activityTypeSelect.innerHTML = "";
  const allTypesOption = document.createElement("option");
  allTypesOption.value = "";
  allTypesOption.textContent = "All event types";
  dom.activityTypeSelect.append(allTypesOption);
  for (const eventType of activityEventTypes) {
    const option = document.createElement("option");
    option.value = eventType;
    option.textContent = prettyEventType(eventType);
    dom.activityTypeSelect.append(option);
  }
  dom.activityTypeSelect.value = state.activityFilters.type;
  dom.activityLimitSelect.value = String(state.activityFilters.limit);
}

function renderActivityFeed() {
  dom.activityFeed.innerHTML = "";

  if (state.events.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No activity matches the current filters yet.";
    dom.activityFeed.append(empty);
    return;
  }

  for (const event of state.events) {
    const item = document.createElement("article");
    item.className = "collection-item activity-item";
    const contextBadges = [];
    if (event.ticketKey) {
      contextBadges.push(`<span>${escapeHtml(event.ticketKey)}</span>`);
    }
    if (event.repoName) {
      contextBadges.push(`<span>${escapeHtml(event.repoName)}</span>`);
    }

    item.innerHTML = `
      <div class="activity-item-header">
        <div>
          <p class="timeline-type">${escapeHtml(prettyEventType(event.type))}</p>
          <strong>${escapeHtml(event.summary)}</strong>
        </div>
        <time>${formatDate(event.createdAt)}</time>
      </div>
      <p>${escapeHtml(event.detail || "No additional detail.")}</p>
      <div class="ticket-card-meta execution-meta">
        ${contextBadges.join("")}
      </div>
      ${
        event.ticketId
          ? `<div class="form-actions"><button class="ghost-button" type="button" data-activity-ticket-id="${event.ticketId}">Open ticket</button></div>`
          : ""
      }
    `;
    dom.activityFeed.append(item);
  }
}

function renderProjectSettings() {
  const project = state.project;
  if (!project) {
    return;
  }

  dom.projectNameInput.value = project.name || "";
  dom.projectDefaultBranchInput.value = project.defaultBaseBranch || "main";
  dom.projectWorkspaceRootInput.value = project.workspaceRoot || "";
  dom.projectDescriptionInput.value = project.description || "";
  resetRepoCreateForm();
}

function renderProjectPolicy() {
  const policy = state.project?.policy;
  if (!policy) {
    return;
  }

  dom.policyRequireReviewerInput.checked = Boolean(policy.requireReviewer);
  dom.policyRequireValidatorInput.checked = Boolean(policy.requireValidator);
  dom.policyRequireHumanApprovalInput.checked = Boolean(policy.requireHumanApprovalBeforeMerge);
  dom.policyAgentCreatedStateSelect.value = policy.agentCreatedTicketDefaultState || "PROPOSED";
  dom.policyMaxParallelInput.value = String(policy.maxParallelExecutions || 1);
  dom.policyMaxContinueInput.value = String(policy.maxAutoContinueIterations || 1);
}

function renderNoProjectState() {
  state.project = null;
  state.projectId = "";
  state.board = null;
  state.selectedTicketId = "";
  state.tickets = [];
  state.repos = [];
  state.mergeQueue = [];
  state.events = [];
  dom.projectSelect.innerHTML = "";
  dom.projectSelect.disabled = true;
  dom.refreshButton.disabled = true;
  dom.boardTitle.textContent = "Create your first project";
  dom.boardMeta.textContent = "No Pool spaces are registered yet.";
  dom.mergeQueueCount.textContent = "";
  dom.mergeQueue.innerHTML = "";
  dom.activityCount.textContent = "";
  dom.activityFeed.innerHTML = "";
  renderBoardFilters();
  setProjectWorkspaceVisible(false);
  clearTicketDetail();
}

function renderRepoRegistry() {
  dom.repoCount.textContent = `${state.repos.length} repo${state.repos.length === 1 ? "" : "s"} registered`;
  dom.repoList.innerHTML = "";

  if (state.repos.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No repositories registered yet.";
    dom.repoList.append(empty);
    return;
  }

  for (const repo of state.repos) {
    const form = document.createElement("form");
    form.className = "repo-card collection-item";
    form.dataset.repoId = repo.id;

    const header = document.createElement("div");
    header.className = "repo-card-header";

    const title = document.createElement("strong");
    title.textContent = repo.slug;
    header.append(title);

    const pill = document.createElement("span");
    pill.className = `repo-pill${repo.isPrimary ? " is-primary" : ""}`;
    pill.textContent = repo.isPrimary ? "Primary repo" : "Attached repo";
    header.append(pill);
    form.append(header);

    const grid = document.createElement("div");
    grid.className = "detail-grid";
    grid.append(
      createRepoField("Name", "name", repo.name),
      createRepoField("Default Branch", "defaultBranch", repo.defaultBranch),
      createRepoField("Remote URL", "remoteUrl", repo.remoteUrl),
      createRepoField("Local Path", "localPath", repo.localPath),
    );
    form.append(grid);

    const footer = document.createElement("div");
    footer.className = "repo-card-footer";

    const toggle = document.createElement("label");
    toggle.className = "repo-primary-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "isPrimary";
    checkbox.checked = repo.isPrimary;
    const toggleText = document.createElement("span");
    toggleText.textContent = "Primary repo";
    toggle.append(checkbox, toggleText);
    footer.append(toggle);

    const button = document.createElement("button");
    button.className = "ghost-button";
    button.type = "submit";
    button.textContent = "Save repo";
    footer.append(button);

    form.append(footer);
    dom.repoList.append(form);
  }
}

function renderRoleProfiles() {
  dom.roleProfileList.innerHTML = "";
  const roleProfiles = state.project?.roleProfiles || [];

  if (roleProfiles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No role profiles configured yet.";
    dom.roleProfileList.append(empty);
    return;
  }

  for (const profile of roleProfiles) {
    const form = document.createElement("form");
    form.className = "repo-card collection-item";
    form.dataset.role = profile.role;

    const header = document.createElement("div");
    header.className = "repo-card-header";

    const title = document.createElement("strong");
    title.textContent = prettyRole(profile.role);
    header.append(title);

    const pill = document.createElement("span");
    pill.className = "repo-pill";
    pill.textContent = profile.adapter;
    header.append(pill);
    form.append(header);

    const grid = document.createElement("div");
    grid.className = "detail-grid";
    grid.append(
      createRepoField("Adapter", "adapter", profile.adapter),
      createRepoField("Model", "model", profile.model),
    );
    form.append(grid);

    const configField = document.createElement("label");
    configField.className = "field";
    configField.innerHTML = `
      <span>Config JSON</span>
      <textarea name="config" rows="4">${escapeHtml(JSON.stringify(profile.config || {}, null, 2))}</textarea>
    `;
    form.append(configField);

    const footer = document.createElement("div");
    footer.className = "form-actions";
    const button = document.createElement("button");
    button.className = "ghost-button";
    button.type = "submit";
    button.textContent = "Save profile";
    footer.append(button);
    form.append(footer);

    dom.roleProfileList.append(form);
  }
}

function renderTicketCard(ticket) {
  const card = dom.ticketCardTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.ticketId = ticket.id;
  card.querySelector(".ticket-key").textContent = ticket.key;
  card.querySelector(".ticket-card-title").textContent = ticket.title;
  card.querySelector(".ticket-card-summary").textContent = ticket.latestSummary || ticket.brief;
  const evidenceBadges = [];
  if (ticket.latestReviewVerdict) {
    evidenceBadges.push(
      `<span class="state-badge ${reviewVerdictClass(ticket.latestReviewVerdict)}">Review ${prettyState(ticket.latestReviewVerdict)}</span>`,
    );
  }
  if (ticket.latestValidationVerdict) {
    evidenceBadges.push(
      `<span class="state-badge ${validationVerdictClass(ticket.latestValidationVerdict)}">Validation ${prettyState(ticket.latestValidationVerdict)}</span>`,
    );
  }
  card.querySelector(".ticket-card-meta").innerHTML = `
    <span>${ticket.priority}</span>
    <span>${ticket.assignedRole}</span>
    <span>${ticket.repoCount} repo</span>
    <span>${ticket.dependencyCount} dep</span>
    ${evidenceBadges.join("")}
  `;
  if (ticket.id === state.selectedTicketId) {
    card.classList.add("selected");
  }

  card.addEventListener("click", () => {
    loadTicket(ticket.id).catch((error) => {
      console.error(error);
    });
  });

  return card;
}

async function loadTicket(ticketId) {
  state.selectedTicketId = ticketId;
  const payload = await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${ticketId}`);
  renderTicketDetail(payload.ticket);
  renderBoard(state.board);
}

function renderTicketDetail(ticket) {
  state.ticketDetail = ticket;
  dom.ticketEmpty.hidden = true;
  dom.ticketDetail.hidden = false;
  dom.ticketTitle.textContent = `${ticket.key} · ${ticket.title}`;
  dom.ticketStateBadge.textContent = prettyState(ticket.state);
  dom.ticketStateBadge.className = `state-badge ${stateClassMap.get(ticket.state)}`;
  dom.ticketBrief.textContent = ticket.brief;
  dom.stateSelect.value = ticket.state;
  dom.ticketTitleInput.value = ticket.title;
  dom.ticketPrioritySelect.value = ticket.priority || "medium";
  dom.ticketRoleSelect.value = ticket.assignedRole || "developer";
  dom.ticketSummaryInput.value = ticket.latestSummary || "";
  renderParentTicketOptions(ticket);
  dom.ticketParentSelect.value = ticket.parentTicketId || "";
  dom.ticketBriefInput.value = ticket.brief || "";
  dom.executionRoleSelect.value = ticket.assignedRole || "developer";
  dom.acceptanceCriteriaInput.value = ticket.acceptanceCriteriaMd || "";
  dom.definitionOfDoneInput.value = ticket.definitionOfDoneMd || "";
  dom.acceptanceCriteria.textContent = ticket.acceptanceCriteriaMd || "No acceptance criteria yet.";
  dom.definitionOfDone.textContent = ticket.definitionOfDoneMd || "No definition of done yet.";
  resetRepoTargetForm();
  renderRepoTargets(ticket);
  renderDependencies(ticket);
  renderBlockingTicketOptions(ticket);
  renderExecutions(ticket);
  renderReviews(ticket);
  renderValidations(ticket);
  renderMergeStatus(ticket);
  renderWorktrees(ticket);

  dom.eventTimeline.innerHTML = "";
  for (const event of ticket.events) {
    const item = document.createElement("article");
    item.className = "timeline-item";
    item.innerHTML = `
      <p class="timeline-type">${event.type}</p>
      <strong>${event.summary}</strong>
      <p>${event.detail || "No additional detail."}</p>
      <time>${formatDate(event.createdAt)}</time>
    `;
    dom.eventTimeline.append(item);
  }
}

function renderExecutions(ticket) {
  dom.executionList.innerHTML = "";
  const activeExecution = ticket.executions.find((execution) => execution.status === "running");
  dom.executionActionForm.hidden = !activeExecution;
  dom.executionActionEmpty.hidden = Boolean(activeExecution);
  dom.executionOutcomeSelect.value = activeExecution ? "completed" : dom.executionOutcomeSelect.value;

  if (ticket.executions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No executions recorded yet.";
    dom.executionList.append(empty);
    return;
  }

  for (const execution of ticket.executions) {
    const roleProfile = roleProfileForRole(execution.role);
    const profileLabel = roleProfile ? `${roleProfile.adapter} · ${roleProfile.model}` : "Unbound profile";
    const item = document.createElement("article");
    item.className = "collection-item execution-item";

    const note =
      execution.summaryMd ||
      execution.remainingWorkMd ||
      execution.expectedNextEvidenceMd ||
      "No execution notes recorded yet.";
    item.innerHTML = `
      <div class="execution-item-header">
        <div>
          <strong>${prettyRole(execution.role)} · Iteration ${execution.iteration}</strong>
          <p>${note}</p>
        </div>
        <span class="state-badge ${executionBadgeClass(execution)}">
          ${prettyState(execution.status === "running" ? execution.status : execution.outcome || execution.status)}
        </span>
      </div>
      <div class="ticket-card-meta execution-meta">
        <span>${profileLabel}</span>
        <span>${execution.worktrees?.length || 0} worktree</span>
        <span>Started ${formatDate(execution.startedAt)}</span>
        <span>${execution.finishedAt ? `Finished ${formatDate(execution.finishedAt)}` : "Active run"}</span>
      </div>
    `;
    dom.executionList.append(item);
  }
}

function renderReviews(ticket) {
  dom.reviewList.innerHTML = "";
  renderReviewExecutionOptions(ticket);

  if (ticket.reviews.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No reviewer evidence recorded yet.";
    dom.reviewList.append(empty);
    return;
  }

  for (const review of ticket.reviews) {
    const item = document.createElement("article");
    item.className = "collection-item";
    const findingsMarkup =
      review.findings?.length
        ? `<div class="ticket-card-meta execution-meta">${review.findings
            .map((finding) => {
              const location = finding.filePath
                ? `${finding.filePath}${finding.lineNumber ? `:${finding.lineNumber}` : ""}`
                : finding.category;
              return `<span>${escapeHtml(finding.severity)} · ${escapeHtml(finding.title)} · ${escapeHtml(location)}</span>`;
            })
            .join("")}</div>`
        : "";
    item.innerHTML = `
      <div class="execution-item-header">
        <div>
          <strong>${prettyState(review.verdict)}</strong>
          <p>${review.summaryMd || "No review summary recorded."}</p>
        </div>
        <span class="state-badge ${reviewVerdictClass(review.verdict)}">${prettyState(review.verdict)}</span>
      </div>
      <div class="ticket-card-meta execution-meta">
        <span>${review.findingsCount} finding${review.findingsCount === 1 ? "" : "s"}</span>
        <span>${formatDate(review.createdAt)}</span>
      </div>
      ${findingsMarkup}
    `;
    dom.reviewList.append(item);
  }
}

function renderReviewExecutionOptions(ticket) {
  dom.reviewExecutionSelect.innerHTML = "";

  const completedExecutions = ticket.executions.filter((execution) => execution.status !== "running");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = completedExecutions.length === 0 ? "No completed execution" : "Select execution";
  dom.reviewExecutionSelect.append(placeholder);

  for (const execution of completedExecutions) {
    const option = document.createElement("option");
    option.value = execution.id;
    option.textContent = `${prettyRole(execution.role)} · Iteration ${execution.iteration} · ${prettyState(execution.outcome || execution.status)}`;
    dom.reviewExecutionSelect.append(option);
  }

  dom.reviewExecutionSelect.disabled = completedExecutions.length === 0;
}

function renderValidations(ticket) {
  dom.validationList.innerHTML = "";
  renderValidationRepoOptions(ticket);

  if (ticket.validations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No validation evidence recorded yet.";
    dom.validationList.append(empty);
    return;
  }

  for (const validation of ticket.validations) {
    const item = document.createElement("article");
    item.className = "collection-item";
    item.innerHTML = `
      <div class="execution-item-header">
        <div>
          <strong>${validation.repoName} · ${prettyState(validation.verdict)}</strong>
          <p>${validation.summaryMd || "No validation summary recorded."}</p>
        </div>
        <span class="state-badge ${validationVerdictClass(validation.verdict)}">${prettyState(validation.verdict)}</span>
      </div>
      <div class="ticket-card-meta execution-meta">
        <span>${validation.commandProfile || "ad hoc commands"}</span>
        <span>${validation.commands.length} command${validation.commands.length === 1 ? "" : "s"}</span>
        <span>${formatDate(validation.finishedAt)}</span>
      </div>
      <p>${validation.commands.length ? validation.commands.map((command) => `<code>${escapeHtml(command)}</code>`).join(" · ") : "No commands recorded."}</p>
    `;
    dom.validationList.append(item);
  }
}

function renderValidationRepoOptions(ticket) {
  dom.validationRepoSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = ticket.repoTargets.length === 0 ? "No repo targets" : "All targeted repos";
  dom.validationRepoSelect.append(placeholder);

  for (const target of ticket.repoTargets) {
    const option = document.createElement("option");
    option.value = target.repoId;
    option.textContent = `${target.repoName} · ${target.baseRef}`;
    dom.validationRepoSelect.append(option);
  }

  dom.validationRepoSelect.disabled = ticket.repoTargets.length === 0;
}

function renderMergeStatus(ticket) {
  const mergeStatus = ticket.mergeStatus;
  const latestRun = mergeStatus?.latestRun || null;

  dom.mergeStatusTitle.textContent = latestRun
    ? `Latest merge ${prettyState(latestRun.status)}`
    : mergeStatus?.canMerge
      ? "Ready to record merge"
      : "Waiting on merge readiness";
  dom.mergeStatusCopy.textContent =
    mergeStatus?.statusSummary || "Ticket must reach merge readiness before the operator can close the loop.";
  dom.mergeStatusBadge.textContent = latestRun
    ? prettyState(latestRun.status)
    : mergeStatus?.canMerge
      ? "Ready"
      : "Waiting";
  dom.mergeStatusBadge.className = `state-badge ${mergeStatusClass(ticket, mergeStatus)}`;

  const meta = [];
  if (mergeStatus) {
    meta.push(`State ${prettyState(mergeStatus.ticketState)}`);
    meta.push(mergeStatus.requiresHumanApproval ? "Approval required" : "Approval optional");
    meta.push(
      `${mergeStatus.uncleanedWorktreeCount} worktree${mergeStatus.uncleanedWorktreeCount === 1 ? "" : "s"} not cleaned`,
    );
  }
  if (latestRun) {
    meta.push(`Strategy ${prettyState(latestRun.strategy)}`);
    if (latestRun.approvedByKind && latestRun.approvedByRef) {
      meta.push(`Approved by ${latestRun.approvedByKind}:${latestRun.approvedByRef}`);
    }
    meta.push(`Recorded ${formatDate(latestRun.finishedAt)}`);
  }
  dom.mergeStatusMeta.innerHTML = meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("");

  const mergeEnabled = Boolean(mergeStatus?.canMerge);
  setFormControlsDisabled(dom.mergeForm, !mergeEnabled);
  dom.mergeApprovedByKindInput.disabled = !mergeEnabled;
  dom.mergeApprovedByRefInput.disabled = !mergeEnabled;
  dom.mergeSummaryInput.disabled = !mergeEnabled;

  if (mergeEnabled && mergeStatus.requiresHumanApproval && !dom.mergeApprovedByKindInput.value.trim()) {
    dom.mergeApprovedByKindInput.value = "human";
  }
}

function renderRepoTargetOptions() {
  dom.createRepoSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "No repo target yet";
  dom.createRepoSelect.append(placeholder);

  for (const repo of state.repos) {
    const option = document.createElement("option");
    option.value = repo.id;
    option.textContent = `${repo.name} · ${repo.defaultBranch}`;
    dom.createRepoSelect.append(option);
  }
}

function renderRepoTargets(ticket) {
  dom.repoTargets.innerHTML = "";
  renderRepoTargetCreateOptions(ticket);

  if (ticket.repoTargets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No repo targets yet.";
    dom.repoTargets.append(empty);
    return;
  }

  for (const target of ticket.repoTargets) {
    const form = document.createElement("form");
    form.className = "repo-target-card collection-item";
    form.dataset.repoId = target.repoId;

    const header = document.createElement("div");
    header.className = "repo-target-header";
    header.innerHTML = `
      <div>
        <strong>${target.repoName}</strong>
        <p>${target.repoSlug} · default ${target.repoDefaultBranch}</p>
      </div>
      <button
        class="ghost-button danger-button"
        type="button"
        data-action="remove-repo-target"
        data-repo-id="${target.repoId}"
      >
        Remove
      </button>
    `;
    form.append(header);

    const grid = document.createElement("div");
    grid.className = "detail-grid";
    grid.append(
      createRepoField("Base Ref", "baseRef", target.baseRef),
      createRepoField("Branch", "branchName", target.branchName),
    );
    form.append(grid);

    const scopeField = document.createElement("label");
    scopeField.className = "field";
    scopeField.innerHTML = `
      <span>Scope Notes</span>
      <textarea name="targetScopeMd" rows="3">${escapeHtml(target.targetScopeMd || "")}</textarea>
    `;
    form.append(scopeField);

    const footer = document.createElement("div");
    footer.className = "form-actions";
    const button = document.createElement("button");
    button.className = "ghost-button";
    button.type = "submit";
    button.textContent = "Save target";
    footer.append(button);
    form.append(footer);

    dom.repoTargets.append(form);
  }
}

function renderRepoTargetCreateOptions(ticket) {
  const targetedRepoIds = new Set(ticket.repoTargets.map((target) => target.repoId));
  dom.repoTargetRepoSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = targetedRepoIds.size === state.repos.length ? "All repos already targeted" : "Select repo";
  dom.repoTargetRepoSelect.append(placeholder);

  for (const repo of state.repos) {
    if (targetedRepoIds.has(repo.id)) {
      continue;
    }

    const option = document.createElement("option");
    option.value = repo.id;
    option.textContent = `${repo.name} · ${repo.defaultBranch}`;
    dom.repoTargetRepoSelect.append(option);
  }

  dom.repoTargetRepoSelect.disabled = dom.repoTargetRepoSelect.options.length <= 1;
}

function renderDependencies(ticket) {
  dom.dependencies.innerHTML = "";
  if (ticket.dependencies.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No blockers recorded.";
    dom.dependencies.append(empty);
    return;
  }

  for (const dependency of ticket.dependencies) {
    const item = document.createElement("article");
    item.className = "collection-item dependency-item";
    item.innerHTML = `
      <div>
        <strong>${dependency.blockingTicketKey} · ${dependency.blockingTicketTitle}</strong>
        <p>${prettyState(dependency.blockingTicketState)} · ${prettyDependencyType(dependency.dependencyType)}</p>
      </div>
      <button
        class="ghost-button danger-button"
        type="button"
        data-action="remove-dependency"
        data-dependency-id="${dependency.id}"
      >
        Remove
      </button>
    `;
    dom.dependencies.append(item);
  }
}

function renderWorktrees(ticket) {
  dom.worktrees.innerHTML = "";
  if (ticket.worktrees.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No execution worktrees planned yet.";
    dom.worktrees.append(empty);
    return;
  }

  for (const worktree of ticket.worktrees) {
    const item = document.createElement("article");
    item.className = "collection-item worktree-item";
    const actions =
      worktree.status === "active" || worktree.status === "cleaned"
        ? ""
        : `
          <button
            class="ghost-button danger-button"
            type="button"
            data-action="clean-worktree"
            data-worktree-id="${worktree.id}"
          >
            Mark cleaned
          </button>
        `;
    item.innerHTML = `
      <div class="worktree-item-header">
        <div>
          <strong>${worktree.repoName} · ${worktree.branchName}</strong>
          <p>${prettyState(worktree.status)} · ${prettyRole(worktree.executionRole)} iteration ${worktree.executionIteration}</p>
        </div>
        <div class="worktree-item-actions">
          <span class="state-badge ${slugify(worktree.status)}">${prettyState(worktree.status)}</span>
          ${actions}
        </div>
      </div>
      <p><code>${escapeHtml(worktree.path)}</code></p>
      <div class="ticket-card-meta execution-meta">
        <span>Base ${worktree.baseRef}</span>
        <span>${worktree.isDirty ? "Dirty" : "Clean"}</span>
        <span>Updated ${formatDate(worktree.updatedAt)}</span>
      </div>
    `;
    dom.worktrees.append(item);
  }
}

function renderParentTicketOptions(ticket) {
  dom.ticketParentSelect.innerHTML = "";

  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "No parent ticket";
  dom.ticketParentSelect.append(noneOption);

  for (const candidate of state.tickets) {
    if (candidate.id === ticket.id) {
      continue;
    }

    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = `${candidate.key} · ${candidate.title}`;
    dom.ticketParentSelect.append(option);
  }
}

function renderBlockingTicketOptions(ticket) {
  const existingDependencies = new Set(ticket.dependencies.map((dependency) => dependency.blockingTicketId));
  dom.blockingTicketSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select ticket";
  dom.blockingTicketSelect.append(placeholder);

  for (const candidate of state.tickets) {
    if (candidate.id === ticket.id || existingDependencies.has(candidate.id)) {
      continue;
    }

    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = `${candidate.key} · ${candidate.title} · ${prettyState(candidate.state)}`;
    dom.blockingTicketSelect.append(option);
  }

  dom.blockingTicketSelect.disabled = dom.blockingTicketSelect.options.length <= 1;
}

function renderCollection(container, items, emptyText) {
  container.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  for (const itemText of items) {
    const item = document.createElement("article");
    item.className = "collection-item";
    item.textContent = itemText;
    container.append(item);
  }
}

function buildBoardUrl(projectId) {
  const params = new URLSearchParams();
  if (state.boardFilters.search) {
    params.set("search", state.boardFilters.search);
  }
  if (state.boardFilters.state) {
    params.set("state", state.boardFilters.state);
  }
  if (state.boardFilters.assignedRole) {
    params.set("assignedRole", state.boardFilters.assignedRole);
  }
  if (state.boardFilters.priority) {
    params.set("priority", state.boardFilters.priority);
  }
  const query = params.toString();
  return query ? `/api/v1/projects/${projectId}/board?${query}` : `/api/v1/projects/${projectId}/board`;
}

function buildActivityEventsUrl(projectId) {
  const params = new URLSearchParams();
  params.set("order", "desc");
  params.set("limit", String(state.activityFilters.limit || 20));
  if (state.activityFilters.ticketId) {
    params.set("ticketId", state.activityFilters.ticketId);
  }
  if (state.activityFilters.type) {
    params.set("type", state.activityFilters.type);
  }
  return `/api/v1/projects/${projectId}/events?${params.toString()}`;
}

function clearTicketDetail() {
  state.ticketDetail = null;
  state.selectedTicketId = "";
  dom.ticketEmpty.hidden = false;
  dom.ticketDetail.hidden = true;
  dom.ticketTitle.textContent = "Select a ticket";
  dom.ticketStateBadge.textContent = "No ticket";
  dom.ticketStateBadge.className = "state-badge subtle";
  dom.executionList.innerHTML = "";
  dom.executionReasonInput.value = "";
  dom.executionNoteInput.value = "";
  resetRepoTargetForm();
  dom.repoTargets.innerHTML = "";
  dom.executionActionForm.hidden = true;
  dom.executionActionEmpty.hidden = false;
  dom.reviewList.innerHTML = "";
  dom.validationList.innerHTML = "";
  dom.mergeStatusTitle.textContent = "Waiting on delivery evidence";
  dom.mergeStatusCopy.textContent = "Ticket must reach merge readiness before the operator can close the loop.";
  dom.mergeStatusBadge.textContent = "Waiting";
  dom.mergeStatusBadge.className = "state-badge subtle";
  dom.mergeStatusMeta.innerHTML = "";
  resetMergeForm();
  setFormControlsDisabled(dom.mergeForm, true);
  dom.mergeApprovedByKindInput.disabled = true;
  dom.mergeApprovedByRefInput.disabled = true;
  dom.mergeSummaryInput.disabled = true;
  dom.worktrees.innerHTML = "";
  resetReviewForm();
  resetValidationForm();
}

function fillSelectOptions(select, values, labeler) {
  select.innerHTML = "";
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    select.append(option);
  }
}

function fillSelectOptionsWithPlaceholder(select, values, labeler, placeholderText) {
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = placeholderText;
  select.append(placeholder);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    select.append(option);
  }
}

function resetCreateFormDefaults() {
  dom.createStateSelect.value = "READY";
  dom.createPrioritySelect.value = "medium";
  dom.createRoleSelect.value = "developer";
  dom.createRepoSelect.value = "";
}

function resetRepoCreateForm() {
  dom.repoDefaultBranchInput.value = state.project?.defaultBaseBranch || "main";
  dom.repoIsPrimaryInput.checked = state.repos.length === 0;
}

function resetProjectCreateForm() {
  dom.createProjectBranchInput.value = "main";
}

function resetRepoTargetForm() {
  dom.repoTargetForm.reset();
  dom.repoTargetRepoSelect.disabled = !state.ticketDetail || state.ticketDetail.repoTargets.length >= state.repos.length;
  dom.repoTargetBaseRefInput.value = "";
  dom.repoTargetBranchInput.value = "";
  dom.repoTargetScopeInput.value = "";
}

function resetReviewForm() {
  dom.reviewForm.reset();
  dom.reviewVerdictSelect.value = "passed";
  dom.reviewFindingCategoryInput.value = "correctness";
  dom.reviewFindingSeveritySelect.value = "high";
}

function resetValidationForm() {
  dom.validationForm.reset();
  dom.validationVerdictSelect.value = "passed";
}

function resetMergeForm() {
  dom.mergeForm.reset();
  dom.mergeStrategySelect.value = "squash";
  dom.mergeOutcomeSelect.value = "completed";
  dom.mergeApprovedByKindInput.value = "human";
}

function setProjectWorkspaceVisible(isVisible) {
  dom.projectWorkspace.hidden = !isVisible;
  dom.projectEmpty.hidden = isVisible;
}

function setBoardError(message) {
  dom.boardTitle.textContent = "Pool unavailable";
  dom.boardMeta.textContent = message;
  dom.boardColumns.innerHTML = "";
  dom.mergeQueueCount.textContent = "";
  dom.mergeQueue.innerHTML = "";
  dom.activityCount.textContent = "";
  dom.activityFeed.innerHTML = "";
  dom.projectSelect.disabled = !state.projectId;
  dom.refreshButton.disabled = !state.projectId;
  clearTicketDetail();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

function prettyState(value) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function prettyRole(value) {
  return prettyState(value);
}

function buildPrimaryReviewFinding() {
  const title = dom.reviewFindingTitleInput.value.trim();
  if (!title) {
    return null;
  }

  const finding = {
    severity: dom.reviewFindingSeveritySelect.value,
    category: dom.reviewFindingCategoryInput.value.trim() || "correctness",
    title,
    detailsMd: dom.reviewFindingDetailsInput.value.trim(),
  };
  const { filePath, lineNumber } = parseLocation(dom.reviewFindingLocationInput.value);
  if (filePath) {
    finding.filePath = filePath;
  }
  if (lineNumber) {
    finding.lineNumber = lineNumber;
  }
  return finding;
}

function currentTicketRepoTargets() {
  return (state.ticketDetail?.repoTargets || []).map((target) => ({
    repoId: target.repoId,
    baseRef: target.baseRef,
    branchName: target.branchName || "",
    targetScopeMd: target.targetScopeMd || "",
  }));
}

function splitLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function saveTicketRepoTargets(repoTargets) {
  await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repoTargets }),
  });

  await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function prettyDependencyType(value) {
  return value.replace(/_/g, " ");
}

function prettyEventType(value) {
  return value.replace(/[._]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function repoDefaultBranch(repoId) {
  return state.repos.find((repo) => repo.id === repoId)?.defaultBranch || "main";
}

function roleProfileForRole(role) {
  return state.project?.roleProfiles?.find((profile) => profile.role === role) || null;
}

function setFormControlsDisabled(form, disabled) {
  for (const element of form.elements) {
    element.disabled = disabled;
  }
}

function createRepoField(labelText, name, value) {
  const label = document.createElement("label");
  label.className = "field";

  const title = document.createElement("span");
  title.textContent = labelText;
  label.append(title);

  const input = document.createElement("input");
  input.name = name;
  input.type = "text";
  input.value = value || "";
  label.append(input);

  return label;
}

function currentActiveExecution() {
  return state.ticketDetail?.executions?.find((execution) => execution.status === "running") || null;
}

function reviewVerdictClass(verdict) {
  if (verdict === "passed") return "ready-to-merge";
  if (verdict === "blocked") return "blocked";
  return "rework";
}

function validationVerdictClass(verdict) {
  if (verdict === "passed") return "ready-to-merge";
  if (verdict === "blocked") return "blocked";
  return "rework";
}

function executionBadgeClass(execution) {
  if (execution.status === "running") return "working";
  if (execution.status === "cancelled") return "blocked";
  if (execution.outcome === "completed") return "reviewing";
  if (execution.outcome === "needs_continue") return "working";
  if (execution.outcome === "blocked" || execution.outcome === "failed") return "blocked";
  if (execution.outcome === "followup_created") return "ready";
  return "subtle";
}

function mergeStatusClass(ticket, mergeStatus) {
  const latestRun = mergeStatus?.latestRun;
  if (latestRun?.status === "completed" || ticket.state === "DONE") return "done";
  if (latestRun?.status === "blocked") return "blocked";
  if (latestRun?.status === "rework") return "rework";
  if (mergeStatus?.canMerge) return "ready-to-merge";
  return "subtle";
}

function syncProjectSummary(project) {
  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index === -1) {
    state.projects.push(project);
    renderProjectOptions();
    dom.projectSelect.value = project.id;
    return;
  }

  state.projects[index] = {
    ...state.projects[index],
    ...project,
  };
  renderProjectOptions();
  dom.projectSelect.value = project.id;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseLocation(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { filePath: "", lineNumber: null };
  }

  const match = trimmed.match(/^(.*?):(\d+)$/);
  if (!match) {
    return { filePath: trimmed, lineNumber: null };
  }

  return {
    filePath: match[1],
    lineNumber: Number.parseInt(match[2], 10),
  };
}

function formatDate(value) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
