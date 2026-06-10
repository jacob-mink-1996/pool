import {
  activityEventTypes,
  executionOutcomeOptions,
  policyTicketStateOptions,
  priorityOptions,
  roleOptions,
  stateClassMap,
  stateOptions,
} from "./lib/constants.js";
import { dom } from "./lib/dom.js";
import { state } from "./lib/state.js";
import { ApiError, buildActivityEventsUrl, buildBoardUrl, buildEventsStreamUrl, fetchJson } from "./lib/api.js";
import {
  createRepoField,
  currentActiveExecution,
  escapeHtml,
  executionBadgeClass,
  formatDate,
  laneSnapshotNote,
  mergeStatusClass,
  parseLocation,
  prettyReasonCode,
  prettyReasonSource,
  prettyDependencyType,
  prettyEventType,
  prettyRole,
  prettyState,
  repoDefaultBranch,
  reviewVerdictClass,
  roleLoadoutNote,
  roleProfileForRole,
  setFormControlsDisabled,
  slugify,
  splitLines,
  validationVerdictClass,
} from "./lib/helpers.js";

bootstrap().catch((error) => {
  console.error(error);
  setBoardError(error instanceof Error ? error.message : String(error));
});

window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
  showStatus(message, "error", { persist: true });
});

window.addEventListener("error", (event) => {
  if (event.error) {
    showStatus(event.error.message, "error", { persist: true });
  }
});

async function bootstrap() {
  await loadMeta();
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
  renderLiveIndicator();
  await refreshProjects();
}

function bindEvents() {
  dom.projectSelect.addEventListener("change", async (event) => {
    const nextProjectId = event.target.value;
    if (!nextProjectId) {
      closeLiveStream();
      renderNoProjectState();
      return;
    }
    location.hash = nextProjectId;
    await loadBoard(nextProjectId);
  });

  dom.refreshButton.addEventListener("click", async () => {
    if (!state.projectId) return;
    await withBusyState([dom.refreshButton], "Refreshing…", async () => {
      await loadBoard(state.projectId, { keepSelection: true });
    });
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
        requiredValidationCommandProfileForMerge: dom.policyRequiredValidationProfileInput.value.trim(),
        requireReviewer: dom.policyRequireReviewerInput.checked,
        requireValidator: dom.policyRequireValidatorInput.checked,
        requireHumanApprovalBeforeMerge: dom.policyRequireHumanApprovalInput.checked,
        agentCreatedTicketDefaultState: dom.policyAgentCreatedStateSelect.value,
        maxParallelExecutions: Number.parseInt(dom.policyMaxParallelInput.value, 10),
        maxParallelMerges: Number.parseInt(dom.policyMaxParallelMergesInput.value, 10),
        maxAutoContinueIterations: Number.parseInt(dom.policyMaxContinueInput.value, 10),
      }),
    });

    await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
  });

  dom.createProjectNameInput.addEventListener("input", () => {
    if (!dom.createProjectSlugInput.value.trim()) {
      dom.createProjectSlugInput.value = slugify(dom.createProjectNameInput.value);
    }
    if (!dom.createProjectWorkspaceRootInput.value.trim()) {
      dom.createProjectWorkspaceRootInput.value = buildProjectWorkspaceDraft(
        dom.createProjectSlugInput.value || slugify(dom.createProjectNameInput.value),
      );
    }
  });

  dom.createProjectSlugInput.addEventListener("input", () => {
    if (!dom.createProjectWorkspaceRootInput.value.trim()) {
      dom.createProjectWorkspaceRootInput.value = buildProjectWorkspaceDraft(dom.createProjectSlugInput.value);
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
    if (!dom.repoLocalPathInput.value.trim()) {
      dom.repoLocalPathInput.value = buildRepoLocalPathDraft(
        state.project?.workspaceRoot || dom.createProjectWorkspaceRootInput.value,
        dom.repoSlugInput.value || slugify(dom.repoNameInput.value),
      );
    }
  });

  dom.repoSlugInput.addEventListener("input", () => {
    if (!dom.repoLocalPathInput.value.trim()) {
      dom.repoLocalPathInput.value = buildRepoLocalPathDraft(
        state.project?.workspaceRoot || dom.createProjectWorkspaceRootInput.value,
        dom.repoSlugInput.value,
      );
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
        repoTargets: repoId ? [{ repoId, baseRef: repoDefaultBranch(state, repoId) }] : [],
      }),
    });

    dom.ticketCreateForm.reset();
    resetCreateFormDefaults();
    await loadBoard(state.projectId, { keepSelection: false, ticketId: payload.ticket.id });
  });

  dom.executionCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId) return;

    await withBusyState([dom.executionCreateForm], "Starting execution…", async () => {
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
  });

  dom.reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId || !dom.reviewExecutionSelect.value) return;

    await withBusyState([dom.reviewForm], "Recording review…", async () => {
      const finding = buildPrimaryReviewFinding();
      await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          executionId: dom.reviewExecutionSelect.value,
          verdict: dom.reviewVerdictSelect.value,
          summaryMd: dom.reviewSummaryInput.value,
          artifacts: parseArtifactLines(dom.reviewArtifactsInput.value),
          findings: finding ? [finding] : [],
        }),
      });

      resetReviewForm();
      await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
    });
  });

  dom.validationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId) return;

    await withBusyState([dom.validationForm], "Recording validation…", async () => {
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
          artifacts: parseArtifactLines(dom.validationArtifactsInput.value),
        }),
      });

      resetValidationForm();
      await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
    });
  });

  dom.mergeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.projectId || !state.selectedTicketId) return;

    await withBusyState([dom.mergeForm], "Recording merge…", async () => {
      const outcome = dom.mergeOutcomeSelect.value;
      const payload = {
        strategy: dom.mergeStrategySelect.value,
        status: outcome,
        summaryMd: dom.mergeSummaryInput.value.trim(),
        artifacts: parseArtifactLines(dom.mergeArtifactsInput.value),
      };
      if (outcome === "completed" || dom.mergeApprovedByRefInput.value.trim()) {
        payload.approvedByKind = dom.mergeApprovedByKindInput.value.trim() || "human";
        payload.approvedByRef = dom.mergeApprovedByRefInput.value.trim();
      }

      try {
        await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}/merge`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          applyMergeConflict(error.payload);
          throw new Error(describeMergeConflict(error.payload));
        }
        throw error;
      }

      resetMergeForm();
      await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
    });
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
        baseRef: dom.repoTargetBaseRefInput.value.trim() || repoDefaultBranch(state, repoId),
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
              baseRef: form.elements.namedItem("baseRef").value.trim() || repoDefaultBranch(state, repoId),
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
    if (!window.confirm("Remove this repo target from the ticket?")) {
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
    if (!window.confirm("Remove this dependency?")) {
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
    if (!window.confirm("Mark this worktree as cleaned?")) {
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

  dom.recentArtifacts.addEventListener("click", handleArtifactAction);
  dom.artifactList.addEventListener("click", handleArtifactAction);

  dom.executionActionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const activeExecution = currentActiveExecution(state.ticketDetail);
    if (!state.projectId || !activeExecution) return;

    const note = dom.executionNoteInput.value.trim();
    const outcome = dom.executionOutcomeSelect.value;
    const payload = {
      outcome,
      summaryMd: note,
      artifacts: parseArtifactLines(dom.executionArtifactsInput.value),
    };
    if (outcome === "needs_continue") {
      payload.remainingWorkMd = note;
    }

    await withBusyState(
      [dom.executionActionForm, dom.executionContinueButton, dom.executionCancelButton],
      "Completing run…",
      async () => {
        await fetchJson(`/api/v1/projects/${state.projectId}/executions/${activeExecution.id}/complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        dom.executionNoteInput.value = "";
        dom.executionArtifactsInput.value = "";
        await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
      },
    );
  });

  dom.executionContinueButton.addEventListener("click", async () => {
    const activeExecution = currentActiveExecution(state.ticketDetail);
    if (!state.projectId || !activeExecution) return;

    await withBusyState(
      [dom.executionActionForm, dom.executionContinueButton, dom.executionCancelButton],
      "Continuing run…",
      async () => {
        const reason = dom.executionNoteInput.value.trim() || "Continue the bounded execution loop.";
        await fetchJson(`/api/v1/projects/${state.projectId}/executions/${activeExecution.id}/continue`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        });

        dom.executionNoteInput.value = "";
        dom.executionArtifactsInput.value = "";
        await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
      },
    );
  });

  dom.executionCancelButton.addEventListener("click", async () => {
    const activeExecution = currentActiveExecution(state.ticketDetail);
    if (!state.projectId || !activeExecution) return;
    if (!window.confirm("Cancel the active execution?")) {
      return;
    }

    await withBusyState(
      [dom.executionActionForm, dom.executionContinueButton, dom.executionCancelButton],
      "Cancelling run…",
      async () => {
        const reason = dom.executionNoteInput.value.trim() || "Execution cancelled by operator.";
        await fetchJson(`/api/v1/projects/${state.projectId}/executions/${activeExecution.id}/cancel`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        });

        dom.executionNoteInput.value = "";
        dom.executionArtifactsInput.value = "";
        await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
      },
    );
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

async function handleArtifactAction(event) {
  const button = event.target.closest("[data-artifact-action]");
  if (!button) {
    return;
  }

  const uri = button.dataset.artifactUri || "";
  if (!uri) {
    return;
  }

  if (button.dataset.artifactAction === "open") {
    window.open(uri, "_blank", "noopener,noreferrer");
    return;
  }

  if (button.dataset.artifactAction === "copy") {
    try {
      await navigator.clipboard.writeText(uri);
      showStatus("Copied artifact URI", "success");
    } catch (error) {
      showStatus("Could not copy artifact URI", "error");
    }
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
  if (!options.silent) {
    showStatus("Refreshing mission control…", "loading", { persist: true });
  }

  try {
    const [projectPayload, boardPayload, ticketsPayload, reposPayload, mergeQueuePayload, activityPayload, artifactsPayload] = await Promise.all([
      fetchJson(`/api/v1/projects/${projectId}`),
      fetchJson(buildBoardUrl(state, projectId)),
      fetchJson(`/api/v1/projects/${projectId}/tickets`),
      fetchJson(`/api/v1/projects/${projectId}/repos`),
      fetchJson(`/api/v1/projects/${projectId}/merge-queue`),
      fetchJson(buildActivityEventsUrl(state, projectId)),
      fetchJson(`/api/v1/projects/${projectId}/artifacts?limit=10`),
    ]);
    state.project = projectPayload.project;
    state.tickets = ticketsPayload.tickets || [];
    state.repos = reposPayload.repos || [];
    state.mergeQueue = mergeQueuePayload.queue || [];
    state.events = activityPayload.events || [];
    state.artifacts = artifactsPayload.artifacts || [];
    state.board = buildBoardState(projectPayload.project, state.tickets, boardPayload.board?.columns);
    syncProjectSummary(projectPayload.project);
    renderProjectSettings();
    renderProjectPolicy();
    renderMissionSnapshot();
    renderRepoRegistry();
    renderRoleProfiles();
    renderBoardFilters();
    renderRepoTargetOptions();
    renderMergeQueue();
    renderActivityFilters();
    renderActivityFeed();
    renderRecentArtifacts();
    renderBoard(state.board);
    ensureLiveStream(projectId);

    const nextTicketId =
      options.ticketId ||
      (options.keepSelection ? state.selectedTicketId : "") ||
      state.board.columns.flatMap((column) => column.tickets).at(0)?.id ||
      "";

    if (nextTicketId) {
      await loadTicket(nextTicketId, { preserveDrafts: Boolean(options.preserveDrafts) });
    } else {
      clearTicketDetail();
    }

    if (!options.silent) {
      showStatus(`Loaded ${projectPayload.project.name}`, "success");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showStatus(message, "error", { persist: true });
    throw error;
  }
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
      <p class="ticket-card-summary">${escapeHtml(item.latestSummary || mergeSummaryText(item.mergeStatus) || "Ready for merge.")}</p>
      <div class="ticket-card-meta">
        <span>${escapeHtml(item.priority)}</span>
        <span>${escapeHtml(item.assignedRole)}</span>
        <span>${escapeHtml(mergeApprovalLabel(item.mergeStatus))}</span>
        <span>${escapeHtml(mergeReadinessLabel(item.mergeStatus))}</span>
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
  dom.activityCount.textContent = `${state.events.length} recent event${state.events.length === 1 ? "" : "s"}`;
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
    if (event.lane) {
      contextBadges.push(`<span>${escapeHtml(prettyState(event.lane))}</span>`);
    }
    if (event.reasonCode) {
      contextBadges.push(`<span>${escapeHtml(prettyReasonCode(event.reasonCode))}</span>`);
    }
    if (event.reasonSource) {
      contextBadges.push(`<span>${escapeHtml(prettyReasonSource(event.reasonSource))}</span>`);
    }
    if (event.sequence) {
      contextBadges.push(`<span>${escapeHtml(`Seq ${event.sequence}`)}</span>`);
    }

    item.innerHTML = `
      <div class="activity-item-header">
        <div>
          <p class="timeline-type">${escapeHtml(eventTypeLabel(event))}</p>
          <strong>${escapeHtml(event.summary || event.detail || "Project activity updated")}</strong>
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

function renderRecentArtifacts() {
  dom.recentArtifactsCount.textContent = `${state.artifacts.length} recent artifact${state.artifacts.length === 1 ? "" : "s"}`;
  dom.recentArtifacts.innerHTML = "";

  if (state.artifacts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No durable artifacts recorded yet.";
    dom.recentArtifacts.append(empty);
    return;
  }

  renderArtifactGroups(dom.recentArtifacts, state.artifacts, { showTicketLabel: true });
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

function renderMissionSnapshot() {
  const boardColumns = state.board?.columns || [];
  const openTickets = state.tickets.filter((ticket) => ticket.state !== "DONE");
  const blockedTickets = state.tickets.filter((ticket) => ticket.state === "BLOCKED");
  const activeExecutions = state.tickets
    .flatMap((ticket) => ticket.executions || [])
    .filter((execution) => execution.status === "running");
  const readyToMergeCount = state.mergeQueue.length;
  const staleWorktreeCount = state.tickets.reduce(
    (count, ticket) =>
      count +
      (ticket.worktrees || []).filter((worktree) => worktree.status !== "active" && worktree.status !== "cleaned")
        .length,
    0,
  );

  const metrics = [
    {
      label: "Open tickets",
      value: String(openTickets.length),
      tone: "neutral",
      note: `${state.tickets.length} total in project`,
    },
    {
      label: "Active runs",
      value: String(activeExecutions.length),
      tone: activeExecutions.length ? "good" : "neutral",
      note: activeExecutions.length ? "Execution lane is live" : "No execution currently running",
    },
    {
      label: "Merge ready",
      value: String(readyToMergeCount),
      tone: readyToMergeCount ? "good" : "neutral",
      note: readyToMergeCount ? "Tickets are waiting for integration" : "Nothing queued for merge",
    },
    {
      label: "Blocked",
      value: String(blockedTickets.length),
      tone: blockedTickets.length ? "danger" : "neutral",
      note: blockedTickets.length ? "Operator attention likely needed" : "No tickets blocked right now",
    },
    {
      label: "Stale worktrees",
      value: String(staleWorktreeCount),
      tone: staleWorktreeCount ? "warn" : "neutral",
      note: staleWorktreeCount ? "Finished trees still need cleanup" : "No stale worktrees hanging around",
    },
  ];

  dom.snapshotMetrics.innerHTML = metrics
    .map(
      (metric) => `
        <article class="snapshot-metric tone-${metric.tone}">
          <p>${escapeHtml(metric.label)}</p>
          <strong>${escapeHtml(metric.value)}</strong>
          <span>${escapeHtml(metric.note)}</span>
        </article>
      `,
    )
    .join("");

  const lanePressure = [...boardColumns]
    .sort((left, right) => right.count - left.count)
    .filter((column) => column.count > 0)
    .slice(0, 4);
  renderSnapshotList(
    dom.snapshotLanes,
    lanePressure.map((column) => ({
      title: prettyState(column.state),
      value: `${column.count} ticket${column.count === 1 ? "" : "s"}`,
      note: laneSnapshotNote(column.state),
    })),
    "No lane pressure yet. Create or unpause tickets to start the board.",
  );

  const roleCounts = new Map();
  for (const ticket of openTickets) {
    const role = ticket.assignedRole || "unassigned";
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
  }
  const roleLoadout = [...roleCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([role, count]) => ({
      title: role === "unassigned" ? "Unassigned" : prettyRole(role),
      value: `${count} ticket${count === 1 ? "" : "s"}`,
      note: roleLoadoutNote(role, count),
    }));
  renderSnapshotList(
    dom.snapshotRoles,
    roleLoadout,
    "No active workload split yet. Assigned roles will show up here.",
  );
}

function renderProjectPolicy() {
  const policy = state.project?.policy;
  if (!policy) {
    return;
  }

  dom.policyRequiredValidationProfileInput.value = policy.requiredValidationCommandProfileForMerge || "";
  dom.policyRequireReviewerInput.checked = Boolean(policy.requireReviewer);
  dom.policyRequireValidatorInput.checked = Boolean(policy.requireValidator);
  dom.policyRequireHumanApprovalInput.checked = Boolean(policy.requireHumanApprovalBeforeMerge);
  dom.policyAgentCreatedStateSelect.value = policy.agentCreatedTicketDefaultState || "PROPOSED";
  dom.policyMaxParallelInput.value = String(policy.maxParallelExecutions || 1);
  dom.policyMaxParallelMergesInput.value = String(policy.maxParallelMerges || 1);
  dom.policyMaxContinueInput.value = String(policy.maxAutoContinueIterations || 1);
}

function renderNoProjectState() {
  closeLiveStream();
  state.ticketDetail = null;
  state.project = null;
  state.projectId = "";
  state.board = null;
  state.selectedTicketId = "";
  state.tickets = [];
  state.repos = [];
  state.mergeQueue = [];
  state.events = [];
  state.artifacts = [];
  dom.projectSelect.innerHTML = "";
  dom.projectSelect.disabled = true;
  dom.refreshButton.disabled = true;
  dom.boardTitle.textContent = "Create your first project";
  dom.boardMeta.textContent = "No Pool spaces are registered yet.";
  dom.mergeQueueCount.textContent = "";
  dom.mergeQueue.innerHTML = "";
  dom.activityCount.textContent = "";
  dom.activityFeed.innerHTML = "";
  dom.recentArtifactsCount.textContent = "";
  dom.recentArtifacts.innerHTML = "";
  renderBoardFilters();
  renderLiveIndicator();
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
  card.querySelector(".ticket-card-updated").textContent = `Updated ${formatDate(ticket.updatedAt)}`;
  card.querySelector(".ticket-card-title").textContent = ticket.title;
  card.querySelector(".ticket-card-summary").textContent = ticket.latestSummary || ticket.brief;
  card.querySelector(".ticket-card-decision").textContent = boardDecisionLabel(ticket);
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
    <span>${prettyState(ticket.priority)}</span>
    <span>${prettyRole(ticket.assignedRole)}</span>
    <span>${ticket.repoCount} repo</span>
    <span>${ticket.dependencyCount} dep</span>
    <span>${ticket.eventCount} events</span>
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

async function loadTicket(ticketId, options = {}) {
  const draft = options.preserveDrafts && state.selectedTicketId === ticketId ? captureDetailDraftState(ticketId) : null;
  state.selectedTicketId = ticketId;
  const payload = await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${ticketId}`);
  renderTicketDetail(payload.ticket);
  if (draft) {
    restoreDetailDraftState(draft, payload.ticket);
  }
  syncDraftWarningState(payload.ticket);
  renderTicketLiveNote(payload.ticket);
  renderBoard(state.board);
}

function renderTicketDetail(ticket) {
  state.ticketDetail = ticket;
  dom.ticketEmpty.hidden = true;
  dom.ticketDetail.hidden = false;
  dom.ticketTitle.textContent = `${ticket.key} · ${ticket.title}`;
  dom.ticketStateBadge.textContent = prettyState(ticket.state);
  dom.ticketStateBadge.className = `state-badge ${stateClassMap.get(ticket.state)}`;
  renderTicketLiveNote(ticket);
  dom.ticketBrief.textContent = ticket.brief;
  dom.stateSelect.value = ticket.state;
  dom.ticketTitleInput.value = ticket.title;
  dom.ticketPrioritySelect.value = ticket.priority || "medium";
  dom.ticketRoleSelect.value = ticket.assignedRole || "developer";
  dom.ticketSummaryInput.value = ticket.latestSummary || "";
  renderTicketOverview(ticket);
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
  renderArtifacts(ticket);
  renderTicketTimeline(ticket.events);
}

function renderTicketOverview(ticket) {
  const latestExecution = ticket.executions.at(-1) || null;
  const latestReview = ticket.reviews.at(-1) || null;
  const latestValidation = ticket.validations.at(-1) || null;
  const cards = [
    {
      label: "Current lane",
      value: prettyState(ticket.state),
      note: `${prettyRole(ticket.assignedRole || "developer")} owns the next move.`,
    },
    {
      label: "Latest summary",
      value: ticket.latestSummary || "No summary recorded yet",
      note: `Updated ${formatDate(ticket.updatedAt)}`,
    },
    {
      label: "Evidence health",
      value: latestReview ? `Review ${prettyState(latestReview.verdict)}` : "Review pending",
      note: latestValidation
        ? `Validation ${prettyState(latestValidation.verdict)}`
        : latestExecution
          ? "Validation evidence still pending"
          : "No execution evidence yet",
    },
    {
      label: "Dependencies",
      value: ticket.dependencies.length ? `${ticket.dependencies.length} blocker${ticket.dependencies.length === 1 ? "" : "s"}` : "No blockers",
      note: ticket.repoTargets.length
        ? `${ticket.repoTargets.length} repo target${ticket.repoTargets.length === 1 ? "" : "s"} attached`
        : "No repo targets attached",
    },
  ];

  if (ticket.mergeStatus) {
    cards.push({
      label: "Merge readiness",
      value: mergeReadinessLabel(ticket.mergeStatus),
      note: mergeSummaryText(ticket.mergeStatus) || "Waiting on delivery evidence.",
    });
  }

  dom.ticketOverviewCards.innerHTML = cards
    .map(
      (card) => `
        <article class="ticket-overview-card">
          <p>${escapeHtml(card.label)}</p>
          <strong>${escapeHtml(card.value)}</strong>
          <span>${escapeHtml(card.note)}</span>
        </article>
      `,
    )
    .join("");
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
    const roleProfile = roleProfileForRole(state, execution.role);
    const profileLabel = roleProfile ? `${roleProfile.adapter} · ${roleProfile.model}` : "Unbound profile";
    const item = document.createElement("article");
    item.className = "collection-item execution-item";

    const note =
      execution.summaryMd ||
      execution.remainingWorkMd ||
      execution.expectedNextEvidenceMd ||
      "No execution notes recorded yet.";
    const artifactSummary = renderArtifactSummary(execution.artifacts);
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
        ${artifactSummary}
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
    const artifactSummary = renderArtifactSummary(review.artifacts);
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
        ${artifactSummary}
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
    const artifactSummary = renderArtifactSummary(validation.artifacts);
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
        ${artifactSummary}
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
  const blockingReasons = normalizeBlockingReasonObjects(mergeStatus);

  dom.mergeStatusTitle.textContent = latestRun
    ? `Latest merge ${prettyState(latestRun.status)}`
    : mergeStatus?.canMerge
      ? mergeStatus?.requiresHumanApproval
        ? "Approval is the final gate"
        : "Ready to record merge"
      : "Waiting on merge readiness";
  dom.mergeStatusCopy.textContent =
    mergeSummaryText(mergeStatus) || "Ticket must reach merge readiness before the operator can close the loop.";
  dom.mergeStatusBadge.textContent = latestRun
    ? prettyState(latestRun.status)
    : mergeReadinessLabel(mergeStatus);
  dom.mergeStatusBadge.className = `state-badge ${mergeStatusClass(ticket, mergeStatus)}`;

  const meta = [];
  if (mergeStatus) {
    meta.push(`State ${prettyState(mergeStatus.ticketState)}`);
    meta.push(mergeApprovalLabel(mergeStatus));
    if (mergeStatus.readiness) {
      meta.push(`Readiness ${prettyState(mergeStatus.readiness)}`);
    }
    if (mergeStatus.requiresHumanApproval && mergeStatus.canMerge) {
      meta.push("Human sign-off is the only remaining gate");
    }
    meta.push(
      `${mergeStatus.uncleanedWorktreeCount} worktree${mergeStatus.uncleanedWorktreeCount === 1 ? "" : "s"} not cleaned`,
    );
  }
  if (latestRun) {
    meta.push(`Strategy ${prettyState(latestRun.strategy)}`);
    if (latestRun.approvedByKind && latestRun.approvedByRef) {
      meta.push(`Approved by ${latestRun.approvedByKind}:${latestRun.approvedByRef}`);
    }
    if (latestRun.artifacts?.length) {
      meta.push(`${latestRun.artifacts.length} artifact${latestRun.artifacts.length === 1 ? "" : "s"}`);
    }
    meta.push(`Recorded ${formatDate(latestRun.finishedAt)}`);
  }
  dom.mergeStatusMeta.innerHTML = meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  dom.mergeBlockingReasons.innerHTML = renderReasonCards(blockingReasons);

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

function renderArtifacts(ticket) {
  dom.artifactList.innerHTML = "";
  if (ticket.artifacts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = "No durable artifacts recorded yet.";
    dom.artifactList.append(empty);
    return;
  }

  renderArtifactGroups(dom.artifactList, ticket.artifacts, { showTicketLabel: false });
}

function renderTicketTimeline(events) {
  dom.eventTimeline.innerHTML = "";
  for (const event of events) {
    const item = document.createElement("article");
    item.className = "timeline-item";
    item.dataset.eventCursor = event.cursor || "";
    item.innerHTML = `
      <p class="timeline-type">${escapeHtml(eventTypeLabel(event))}</p>
      <strong>${escapeHtml(event.summary || event.detail || "Project event recorded")}</strong>
      <p>${escapeHtml(event.detail || "No additional detail.")}</p>
      <div class="ticket-card-meta execution-meta">
        <span>${escapeHtml(`Lane ${prettyState(event.lane || event.family || "ticket")}`)}</span>
        ${event.reasonCode ? `<span>${escapeHtml(prettyReasonCode(event.reasonCode))}</span>` : ""}
        ${event.reasonSource ? `<span>${escapeHtml(prettyReasonSource(event.reasonSource))}</span>` : ""}
        ${event.sequence ? `<span>${escapeHtml(`Seq ${event.sequence}`)}</span>` : ""}
      </div>
      <time>${formatDate(event.createdAt)}</time>
    `;
    dom.eventTimeline.append(item);
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

function renderSnapshotList(container, items, emptyText) {
  container.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "collection-empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("article");
    row.className = "snapshot-list-item";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.note)}</p>
      </div>
      <span>${escapeHtml(item.value)}</span>
    `;
    container.append(row);
  }
}

function captureDetailDraftState(ticketId) {
  if (!ticketId) {
    return null;
  }

  const fieldIds = [
    "state-select",
    "state-reason",
    "ticket-title-input",
    "ticket-priority-select",
    "ticket-role-select",
    "ticket-summary-input",
    "ticket-parent-select",
    "ticket-brief-input",
    "acceptance-criteria-input",
    "definition-of-done-input",
    "execution-role-select",
    "execution-reason-input",
    "execution-outcome-select",
    "execution-note-input",
    "execution-artifacts-input",
    "review-execution-select",
    "review-verdict-select",
    "review-summary-input",
    "review-artifacts-input",
    "review-finding-title-input",
    "review-finding-category-input",
    "review-finding-severity-select",
    "review-finding-location-input",
    "review-finding-details-input",
    "validation-repo-select",
    "validation-verdict-select",
    "validation-command-profile-input",
    "validation-commands-input",
    "validation-summary-input",
    "validation-artifacts-input",
    "merge-strategy-select",
    "merge-outcome-select",
    "merge-approved-by-kind-input",
    "merge-approved-by-ref-input",
    "merge-summary-input",
    "merge-artifacts-input",
    "repo-target-repo-select",
    "repo-target-base-ref-input",
    "repo-target-branch-input",
    "repo-target-scope-input",
    "blocking-ticket-select",
  ];

  const fields = {};
  for (const fieldId of fieldIds) {
    const element = document.getElementById(fieldId);
    if (!element) {
      continue;
    }
    fields[fieldId] = element.value;
  }

  const activeElement = document.activeElement;
  const activeField =
    activeElement && activeElement.id && fields[activeElement.id] != null
      ? {
          id: activeElement.id,
          selectionStart: typeof activeElement.selectionStart === "number" ? activeElement.selectionStart : null,
          selectionEnd: typeof activeElement.selectionEnd === "number" ? activeElement.selectionEnd : null,
        }
      : null;

  return {
    ticketId,
    fields,
    activeField,
  };
}

function restoreDetailDraftState(draft, ticket) {
  if (!draft || draft.ticketId !== ticket.id) {
    return;
  }

  for (const [fieldId, value] of Object.entries(draft.fields)) {
    const element = document.getElementById(fieldId);
    if (!element || element.disabled) {
      continue;
    }
    element.value = value;
  }

  if (draft.activeField?.id) {
    const element = document.getElementById(draft.activeField.id);
    if (element && !element.disabled) {
      element.focus({ preventScroll: true });
      if (
        typeof element.setSelectionRange === "function" &&
        draft.activeField.selectionStart != null &&
        draft.activeField.selectionEnd != null
      ) {
        element.setSelectionRange(draft.activeField.selectionStart, draft.activeField.selectionEnd);
      }
    }
  }
}

function clearTicketDetail() {
  state.ticketDetail = null;
  state.selectedTicketId = "";
  dom.ticketEmpty.hidden = false;
  dom.ticketDetail.hidden = true;
  dom.ticketTitle.textContent = "Select a ticket";
  dom.ticketLiveNote.hidden = true;
  dom.ticketLiveNote.textContent = "";
  dom.ticketLiveNote.className = "ticket-live-note";
  dom.ticketStateBadge.textContent = "No ticket";
  dom.ticketStateBadge.className = "state-badge subtle";
  dom.executionList.innerHTML = "";
  dom.executionReasonInput.value = "";
  dom.executionNoteInput.value = "";
  dom.executionArtifactsInput.value = "";
  resetRepoTargetForm();
  dom.repoTargets.innerHTML = "";
  dom.ticketOverviewCards.innerHTML = "";
  dom.executionActionForm.hidden = true;
  dom.executionActionEmpty.hidden = false;
  dom.reviewList.innerHTML = "";
  dom.validationList.innerHTML = "";
  dom.mergeStatusTitle.textContent = "Waiting on delivery evidence";
  dom.mergeStatusCopy.textContent = "Ticket must reach merge readiness before the operator can close the loop.";
  dom.mergeStatusBadge.textContent = "Waiting";
  dom.mergeStatusBadge.className = "state-badge subtle";
  dom.mergeStatusMeta.innerHTML = "";
  dom.mergeBlockingReasons.innerHTML = "";
  resetMergeForm();
  setFormControlsDisabled(dom.mergeForm, true);
  dom.mergeApprovedByKindInput.disabled = true;
  dom.mergeApprovedByRefInput.disabled = true;
  dom.mergeSummaryInput.disabled = true;
  dom.worktrees.innerHTML = "";
  dom.artifactList.innerHTML = "";
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
  dom.repoLocalPathInput.value = buildRepoLocalPathDraft(state.project?.workspaceRoot, dom.repoSlugInput.value);
  dom.repoIsPrimaryInput.checked = state.repos.length === 0;
}

function resetProjectCreateForm() {
  dom.createProjectBranchInput.value = "main";
  dom.createProjectWorkspaceRootInput.value = buildProjectWorkspaceDraft(dom.createProjectSlugInput.value);
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
  dom.reviewArtifactsInput.value = "";
}

function resetValidationForm() {
  dom.validationForm.reset();
  dom.validationVerdictSelect.value = "passed";
  dom.validationArtifactsInput.value = "";
}

function resetMergeForm() {
  dom.mergeForm.reset();
  dom.mergeStrategySelect.value = "squash";
  dom.mergeOutcomeSelect.value = "completed";
  dom.mergeApprovedByKindInput.value = "human";
  dom.mergeArtifactsInput.value = "";
}

function setProjectWorkspaceVisible(isVisible) {
  dom.projectWorkspace.hidden = !isVisible;
  dom.projectEmpty.hidden = isVisible;
}

async function loadMeta() {
  try {
    state.meta = await fetchJson("/api/v1/meta");
  } catch (error) {
    console.warn("Could not load Pool runtime metadata", error);
    state.meta = null;
  }
}

function setBoardError(message) {
  dom.boardTitle.textContent = "Pool unavailable";
  dom.boardMeta.textContent = message;
  dom.boardColumns.innerHTML = "";
  dom.mergeQueueCount.textContent = "";
  dom.mergeQueue.innerHTML = "";
  dom.activityCount.textContent = "";
  dom.activityFeed.innerHTML = "";
  dom.recentArtifactsCount.textContent = "";
  dom.recentArtifacts.innerHTML = "";
  dom.projectSelect.disabled = !state.projectId;
  dom.refreshButton.disabled = !state.projectId;
  clearTicketDetail();
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

function parseArtifactLines(value) {
  return splitLines(value).map((line, index) => {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new Error(`Artifact line ${index + 1} must use: kind | label | uri`);
    }

    return {
      kind: parts[0],
      label: parts[1],
      uri: parts[2],
    };
  });
}

function buildProjectWorkspaceDraft(projectSlug) {
  const slug = slugify(projectSlug || "");
  const root = state.meta?.workspaceRoot || "";
  if (!root) {
    return "";
  }
  return slug ? `${root}/${slug}` : root;
}

function buildRepoLocalPathDraft(workspaceRoot, repoSlug) {
  const root = (workspaceRoot || "").trim();
  const slug = slugify(repoSlug || "");
  if (!root) {
    return "";
  }
  return slug ? `${root}/${slug}` : root;
}

function currentTicketRepoTargets() {
  return (state.ticketDetail?.repoTargets || []).map((target) => ({
    repoId: target.repoId,
    baseRef: target.baseRef,
    branchName: target.branchName || "",
    targetScopeMd: target.targetScopeMd || "",
  }));
}

async function saveTicketRepoTargets(repoTargets) {
  await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${state.selectedTicketId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repoTargets }),
  });

  await loadBoard(state.projectId, { keepSelection: true, ticketId: state.selectedTicketId });
}

function ensureLiveStream(projectId) {
  if (!projectId) {
    closeLiveStream();
    renderLiveIndicator();
    return;
  }

  if (typeof window.EventSource !== "function") {
    state.live.status = "unsupported";
    state.live.isConnected = false;
    renderLiveIndicator();
    return;
  }

  const url = buildEventsStreamUrl(state, projectId);
  if (state.live.eventSource && state.live.projectId === projectId && state.live.url === url) {
    return;
  }

  closeLiveStream({ keepIndicator: true });
  state.live.projectId = projectId;
  state.live.url = url;
  state.live.status = "connecting";
  state.live.isConnected = false;
  state.live.lastEventAt = "";
  renderLiveIndicator();

  const source = new EventSource(url);
  state.live.eventSource = source;

  source.addEventListener("open", () => {
    state.live.status = "connected";
    state.live.isConnected = true;
    renderLiveIndicator();
  });

  source.addEventListener("snapshot", (browserEvent) => {
    state.live.status = "connected";
    state.live.isConnected = true;
    state.live.lastEventAt = new Date().toISOString();
    renderLiveIndicator();
    handleLiveEvent(browserEvent, "snapshot");
  });

  source.addEventListener("event", (browserEvent) => {
    state.live.status = "connected";
    state.live.isConnected = true;
    state.live.lastEventAt = new Date().toISOString();
    renderLiveIndicator();
    handleLiveEvent(browserEvent, "event");
  });

  source.addEventListener("error", () => {
    if (state.live.projectId !== projectId) {
      return;
    }
    state.live.status = "reconnecting";
    state.live.isConnected = false;
    renderLiveIndicator();
    closeLiveStream({ keepIndicator: true });
    window.clearTimeout(state.live.reconnectTimerId);
    state.live.reconnectTimerId = window.setTimeout(() => {
      ensureLiveStream(projectId);
    }, 1800);
  });
}

function closeLiveStream(options = {}) {
  if (state.live.eventSource) {
    state.live.eventSource.close();
  }
  state.live.eventSource = null;
  window.clearTimeout(state.live.reconnectTimerId);
  window.clearTimeout(state.live.artifactsRefreshTimerId);
  window.clearTimeout(state.live.mergeQueueRefreshTimerId);
  for (const timerId of Object.values(state.live.pendingTicketSyncs || {})) {
    window.clearTimeout(timerId);
  }
  state.live.reconnectTimerId = 0;
  state.live.artifactsRefreshTimerId = 0;
  state.live.mergeQueueRefreshTimerId = 0;
  state.live.pendingTicketSyncs = {};
  state.live.isConnected = false;
  state.live.projectId = options.keepIndicator ? state.live.projectId : "";
  state.live.url = options.keepIndicator ? state.live.url : "";
  if (!options.keepIndicator) {
    state.live.status = state.projectId ? "idle" : "offline";
    state.live.lastEventAt = "";
  }
}

function handleLiveEvent(browserEvent, streamKind = "event") {
  let payload = null;
  try {
    if (browserEvent.data) {
      payload = JSON.parse(browserEvent.data);
    }
  } catch (error) {
    console.warn("Failed to parse live event payload", error);
  }
  const streamEvents =
    streamKind === "snapshot"
      ? Array.isArray(payload?.events)
        ? payload.events
        : []
      : [payload?.event || payload?.events?.[0] || payload].filter(Boolean);

  let didApply = false;
  for (const streamEvent of streamEvents) {
    didApply = applyLiveStreamEvent(streamEvent, { streamKind }) || didApply;
  }

  if (didApply) {
    renderLiveIndicator();
  }
}

function applyLiveStreamEvent(streamEvent, options = {}) {
  if (!streamEvent || !streamEvent.id) {
    return false;
  }

  if (options.streamKind === "snapshot") {
    if (!state.live.lastCursor) {
      rememberLiveCursor(streamEvent);
      return false;
    }
    if (streamEvent.cursor && streamEvent.cursor <= state.live.lastCursor) {
      return false;
    }
  }

  if (streamEvent.cursor && streamEvent.cursor === state.live.lastCursor) {
    return false;
  }

  rememberLiveCursor(streamEvent);
  upsertActivityEvent(streamEvent);

  if (streamEvent.ticketId && state.ticketDetail?.id === streamEvent.ticketId) {
    prependTicketEvent(streamEvent);
    if (isTicketDraftDirty(state.ticketDetail)) {
      state.live.staleDraftTicketId = streamEvent.ticketId;
      state.live.staleDraftCount += 1;
    }
    renderTicketLiveNote(state.ticketDetail);
  }

  if (streamEvent.ticketId) {
    scheduleTicketSync(streamEvent.ticketId, {
      preserveDrafts: state.selectedTicketId === streamEvent.ticketId,
    });
  }

  if (shouldRefreshMergeQueueForEvent(streamEvent)) {
    scheduleMergeQueueRefresh();
  }

  if (shouldRefreshArtifactsForEvent(streamEvent)) {
    scheduleArtifactsRefresh();
  }

  return true;
}

function rememberLiveCursor(streamEvent) {
  if (streamEvent?.cursor) {
    state.live.lastCursor = streamEvent.cursor;
  }
  if (Number.isInteger(streamEvent?.sequence)) {
    state.live.lastSequence = streamEvent.sequence;
  }
}

function scheduleTicketSync(ticketId, options = {}) {
  if (!state.projectId || !ticketId) {
    return;
  }

  window.clearTimeout(state.live.pendingTicketSyncs[ticketId]);
  state.live.pendingTicketSyncs[ticketId] = window.setTimeout(async () => {
    delete state.live.pendingTicketSyncs[ticketId];
    try {
      const payload = await fetchJson(`/api/v1/projects/${state.projectId}/tickets/${ticketId}`);
      applyTicketSyncPayload(payload.ticket, options);
    } catch (error) {
      console.error(error);
    }
  }, 120);
}

function applyTicketSyncPayload(ticket, options = {}) {
  upsertTicketSummary(ticket);
  state.board = buildBoardState(state.project, state.tickets, state.board?.columns);
  renderBoard(state.board);
  renderMissionSnapshot();
  renderActivityFilters();

  if (state.selectedTicketId === ticket.id) {
    const draft = options.preserveDrafts ? captureDetailDraftState(ticket.id) : null;
    renderTicketDetail(ticket);
    if (draft) {
      restoreDetailDraftState(draft, ticket);
    }
    syncDraftWarningState(ticket);
    renderTicketLiveNote(ticket);
  }
}

function scheduleArtifactsRefresh() {
  if (!state.projectId) {
    return;
  }

  window.clearTimeout(state.live.artifactsRefreshTimerId);
  state.live.artifactsRefreshTimerId = window.setTimeout(async () => {
    try {
      const artifactsPayload = await fetchJson(`/api/v1/projects/${state.projectId}/artifacts?limit=10`);
      state.artifacts = artifactsPayload.artifacts || [];
      renderRecentArtifacts();
    } catch (error) {
      console.error(error);
    }
  }, 180);
}

function scheduleMergeQueueRefresh() {
  if (!state.projectId) {
    return;
  }

  window.clearTimeout(state.live.mergeQueueRefreshTimerId);
  state.live.mergeQueueRefreshTimerId = window.setTimeout(async () => {
    try {
      const mergeQueuePayload = await fetchJson(`/api/v1/projects/${state.projectId}/merge-queue`);
      state.mergeQueue = mergeQueuePayload.queue || [];
      renderMergeQueue();
      renderMissionSnapshot();
    } catch (error) {
      console.error(error);
    }
  }, 180);
}

function upsertActivityEvent(streamEvent) {
  if (!matchesActivityFilters(streamEvent, state.activityFilters)) {
    return;
  }

  const nextEvents = [streamEvent, ...state.events.filter((event) => event.id !== streamEvent.id)];
  state.events = nextEvents
    .sort((left, right) => {
      const rightSequence = Number.isInteger(right.sequence) ? right.sequence : 0;
      const leftSequence = Number.isInteger(left.sequence) ? left.sequence : 0;
      if (rightSequence !== leftSequence) {
        return rightSequence - leftSequence;
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    })
    .slice(0, state.activityFilters.limit || 20);
  renderActivityFeed();
}

function prependTicketEvent(streamEvent) {
  if (!state.ticketDetail || state.ticketDetail.id !== streamEvent.ticketId) {
    return;
  }

  const nextEvents = [streamEvent, ...state.ticketDetail.events.filter((event) => event.id !== streamEvent.id)];
  nextEvents.sort((left, right) => {
    const rightSequence = Number.isInteger(right.sequence) ? right.sequence : 0;
    const leftSequence = Number.isInteger(left.sequence) ? left.sequence : 0;
    if (rightSequence !== leftSequence) {
      return rightSequence - leftSequence;
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
  state.ticketDetail.events = nextEvents;
  renderTicketTimeline(state.ticketDetail.events);
}

function renderLiveIndicator() {
  let badge = "Live idle";
  let badgeClass = "state-badge subtle";
  let meta = "Waiting for a project stream.";

  if (!state.projectId) {
    badge = "Live offline";
    meta = "Select or create a project to start streaming updates.";
  } else if (state.live.status === "unsupported") {
    badge = "Live fallback";
    badgeClass = "state-badge live-polling";
    meta = "This browser cannot open the event stream. Manual refresh still works.";
  } else if (state.live.status === "connecting") {
    badge = "Live connecting";
    badgeClass = "state-badge live-polling";
    meta = "Opening the Mission Control event stream.";
  } else if (state.live.status === "connected") {
    badge = "Live connected";
    badgeClass = "state-badge live";
    meta = state.live.lastEventAt
      ? `Last update ${formatDate(state.live.lastEventAt)}${state.live.lastSequence ? ` · seq ${state.live.lastSequence}` : ""}. Selection and filters stay pinned.`
      : "Watching project activity and applying reducer-based updates live.";
  } else if (state.live.status === "reconnecting") {
    badge = "Live reconnecting";
    badgeClass = "state-badge live-error";
    meta = "Stream dropped. Reconnecting automatically while manual refresh stays available.";
  }

  dom.liveIndicatorBadge.textContent = badge;
  dom.liveIndicatorBadge.className = badgeClass;
  dom.liveIndicatorMeta.textContent = meta;
}

async function withBusyState(controls, busyLabel, work) {
  const snapshots = snapshotControls(controls);
  setControlsBusy(snapshots, busyLabel, true);
  try {
    return await work();
  } finally {
    setControlsBusy(snapshots, busyLabel, false);
  }
}

function snapshotControls(controls) {
  const elements = controls.flatMap((control) => {
    if (!control) {
      return [];
    }
    if (typeof HTMLFormElement !== "undefined" && control instanceof HTMLFormElement) {
      return [...control.elements];
    }
    return [control];
  });

  return elements
    .filter((element, index) => element && elements.indexOf(element) === index)
    .map((element) => ({
      element,
      disabled: element.disabled,
      textContent: element instanceof HTMLButtonElement ? element.textContent : "",
    }));
}

function setControlsBusy(snapshots, busyLabel, isBusy) {
  for (const snapshot of snapshots) {
    snapshot.element.disabled = isBusy ? true : snapshot.disabled;
    if (snapshot.element instanceof HTMLButtonElement && busyLabel) {
      snapshot.element.textContent = isBusy ? busyLabel : snapshot.textContent;
    }
  }
}

function mergeReadinessLabel(mergeStatus) {
  if (!mergeStatus) {
    return "Waiting";
  }
  if (mergeStatus.readiness) {
    return prettyState(mergeStatus.readiness);
  }
  if (mergeStatus.canMerge) {
    return mergeStatus.requiresHumanApproval ? "Approval needed" : "Auto-merge ready";
  }
  return "Blocked";
}

function mergeApprovalLabel(mergeStatus) {
  if (!mergeStatus) {
    return "Approval unknown";
  }
  if (mergeStatus.approval?.required != null) {
    return mergeStatus.approval.required
      ? mergeStatus.approval.satisfied
        ? "Approval satisfied"
        : "Approval required"
      : "Approval optional";
  }
  return mergeStatus.requiresHumanApproval ? "Approval required" : "Approval optional";
}

function mergeSummaryText(mergeStatus) {
  if (!mergeStatus) {
    return "";
  }
  if (mergeStatus.statusSummary) {
    return mergeStatus.statusSummary;
  }
  const blockingReasons = normalizeBlockingReasonObjects(mergeStatus).map((reason) => reason.message);
  if (blockingReasons.length) {
    return blockingReasons[0];
  }
  return "";
}

function normalizeBlockingReasonObjects(mergeStatus) {
  const blockingReasons = mergeStatus?.blockingReasons || [];
  return blockingReasons
    .map((reason) => {
      if (!reason) {
        return null;
      }
      if (typeof reason === "string") {
        return {
          code: "",
          source: "",
          message: reason,
        };
      }
      return {
        code: reason.code || "",
        source: reason.source || "",
        message: reason.message || reason.summary || prettyReasonCode(reason.code || "") || "",
      };
    })
    .filter(Boolean);
}

function describeMergeConflict(payload = {}) {
  const merge = payload.merge || {};
  return payload.message || mergeSummaryText(merge) || "Merge policy blocked this action.";
}

function applyMergeConflict(payload = {}) {
  const merge = payload.merge || null;
  if (merge) {
    dom.mergeStatusCopy.textContent = mergeSummaryText(merge) || "Merge policy blocked this action.";
    dom.mergeBlockingReasons.innerHTML = renderReasonCards(normalizeBlockingReasonObjects(merge));
  }
}

function renderReasonCards(reasons) {
  return reasons
    .map((reason) => {
      const title = reason.code ? prettyReasonCode(reason.code) : reason.message || "Policy block";
      const source = reason.source ? prettyReasonSource(reason.source) : "Operator state";
      const message =
        reason.message && reason.message !== title
          ? reason.message
          : "Mission Control is rendering this block from structured backend policy state.";
      return `
        <article class="merge-reason-card">
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(message)}</p>
          <span>${escapeHtml(source)}</span>
        </article>
      `;
    })
    .join("");
}

function buildBoardState(project, tickets, previousColumns = []) {
  const orderedStates = previousColumns.length
    ? previousColumns.map((column) => column.state)
    : stateOptions;
  const columns = orderedStates.map((ticketState) => ({
    state: ticketState,
    tickets: [],
    count: 0,
  }));
  const columnMap = new Map(columns.map((column) => [column.state, column]));

  const filteredTickets = [...tickets]
    .filter((ticket) => matchesBoardFilters(ticket, state.boardFilters))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  for (const ticket of filteredTickets) {
    const column = columnMap.get(ticket.state);
    if (!column) {
      continue;
    }
    column.tickets.push(ticket);
    column.count += 1;
  }

  return {
    projectId: project?.id || state.projectId,
    projectSlug: project?.slug || "",
    projectName: project?.name || state.project?.name || "Pool Mission Control",
    totalTickets: filteredTickets.length,
    generatedAt: new Date().toISOString(),
    columns,
  };
}

function matchesBoardFilters(ticket, filters) {
  if (!ticket) {
    return false;
  }

  if (filters.state && ticket.state !== filters.state) {
    return false;
  }
  if (filters.assignedRole && ticket.assignedRole !== filters.assignedRole) {
    return false;
  }
  if (filters.priority && ticket.priority !== filters.priority) {
    return false;
  }
  if (filters.search) {
    const haystack = [ticket.key, ticket.title, ticket.brief, ticket.latestSummary].join(" ").toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) {
      return false;
    }
  }
  return true;
}

function upsertTicketSummary(ticket) {
  const summary = ticketSummaryFromDetail(ticket);
  const index = state.tickets.findIndex((item) => item.id === summary.id);
  if (index === -1) {
    state.tickets.unshift(summary);
    return;
  }
  state.tickets[index] = {
    ...state.tickets[index],
    ...summary,
  };
}

function ticketSummaryFromDetail(ticket) {
  return {
    id: ticket.id,
    projectId: ticket.projectId,
    parentTicketId: ticket.parentTicketId || "",
    key: ticket.key,
    title: ticket.title,
    brief: ticket.brief,
    state: ticket.state,
    priority: ticket.priority,
    assignedRole: ticket.assignedRole,
    latestSummary: ticket.latestSummary,
    latestReviewVerdict: ticket.latestReviewVerdict || ticket.reviews?.at(-1)?.verdict || "",
    latestValidationVerdict: ticket.latestValidationVerdict || ticket.validations?.at(-1)?.verdict || "",
    repoCount: ticket.repoTargets?.length || 0,
    dependencyCount: ticket.dependencies?.length || 0,
    eventCount: ticket.events?.length || 0,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function matchesActivityFilters(event, filters) {
  if (!event) {
    return false;
  }
  if (filters.ticketId && event.ticketId !== filters.ticketId) {
    return false;
  }
  if (filters.type && event.type !== filters.type) {
    return false;
  }
  return true;
}

function shouldRefreshArtifactsForEvent(event) {
  return ["execution", "review", "validation", "merge"].includes(event.family);
}

function shouldRefreshMergeQueueForEvent(event) {
  return ["ticket", "review", "validation", "merge", "execution"].includes(event.family);
}

function ticketDraftFieldValues(ticket) {
  return {
    "state-select": ticket.state || "READY",
    "state-reason": "",
    "ticket-title-input": ticket.title || "",
    "ticket-priority-select": ticket.priority || "medium",
    "ticket-role-select": ticket.assignedRole || "developer",
    "ticket-summary-input": ticket.latestSummary || "",
    "ticket-parent-select": ticket.parentTicketId || "",
    "ticket-brief-input": ticket.brief || "",
    "acceptance-criteria-input": ticket.acceptanceCriteriaMd || "",
    "definition-of-done-input": ticket.definitionOfDoneMd || "",
    "execution-role-select": ticket.assignedRole || "developer",
    "execution-reason-input": "",
    "execution-outcome-select": "completed",
    "execution-note-input": "",
    "execution-artifacts-input": "",
    "review-execution-select": "",
    "review-verdict-select": "passed",
    "review-summary-input": "",
    "review-artifacts-input": "",
    "review-finding-title-input": "",
    "review-finding-category-input": "correctness",
    "review-finding-severity-select": "high",
    "review-finding-location-input": "",
    "review-finding-details-input": "",
    "validation-repo-select": "",
    "validation-verdict-select": "passed",
    "validation-command-profile-input": "",
    "validation-commands-input": "",
    "validation-summary-input": "",
    "validation-artifacts-input": "",
    "merge-strategy-select": "squash",
    "merge-outcome-select": "completed",
    "merge-approved-by-kind-input": "human",
    "merge-approved-by-ref-input": "",
    "merge-summary-input": "",
    "merge-artifacts-input": "",
    "repo-target-repo-select": "",
    "repo-target-base-ref-input": "",
    "repo-target-branch-input": "",
    "repo-target-scope-input": "",
    "blocking-ticket-select": "",
  };
}

function isTicketDraftDirty(ticket) {
  if (!ticket) {
    return false;
  }

  const expected = ticketDraftFieldValues(ticket);
  for (const [fieldId, expectedValue] of Object.entries(expected)) {
    const element = document.getElementById(fieldId);
    if (!element || element.disabled) {
      continue;
    }
    if ((element.value || "") !== expectedValue) {
      return true;
    }
  }
  return false;
}

function syncDraftWarningState(ticket) {
  if (!ticket || state.live.staleDraftTicketId !== ticket.id) {
    return;
  }

  if (!isTicketDraftDirty(ticket)) {
    state.live.staleDraftTicketId = "";
    state.live.staleDraftCount = 0;
  }
}

function renderTicketLiveNote(ticket) {
  if (!ticket) {
    dom.ticketLiveNote.hidden = true;
    dom.ticketLiveNote.textContent = "";
    dom.ticketLiveNote.className = "ticket-live-note";
    return;
  }

  if (state.live.staleDraftTicketId === ticket.id && state.live.staleDraftCount > 0) {
    dom.ticketLiveNote.hidden = false;
    dom.ticketLiveNote.textContent = `${state.live.staleDraftCount} live update${state.live.staleDraftCount === 1 ? "" : "s"} landed while you were editing. Your draft stayed in place.`;
    dom.ticketLiveNote.className = "ticket-live-note is-warning";
    return;
  }

  if (state.live.isConnected) {
    dom.ticketLiveNote.hidden = false;
    dom.ticketLiveNote.textContent = "This detail view is staying pinned while live reducers apply stream updates underneath it.";
    dom.ticketLiveNote.className = "ticket-live-note is-live";
    return;
  }

  dom.ticketLiveNote.hidden = true;
  dom.ticketLiveNote.textContent = "";
  dom.ticketLiveNote.className = "ticket-live-note";
}

function showStatus(message, tone = "info", options = {}) {
  if (!message) {
    dom.statusBanner.hidden = true;
    dom.statusBanner.textContent = "";
    dom.statusBanner.className = "status-banner";
    return;
  }

  dom.statusBanner.hidden = false;
  dom.statusBanner.textContent = message;
  dom.statusBanner.className = `status-banner${tone ? ` is-${tone}` : ""}`;

  if (!options.persist && tone !== "loading") {
    window.clearTimeout(showStatus.timeoutId);
    showStatus.timeoutId = window.setTimeout(() => {
      dom.statusBanner.hidden = true;
    }, 2200);
  }
}

function renderArtifactSummary(artifacts = []) {
  if (!artifacts.length) {
    return "";
  }

  return `<span>${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}</span>`;
}

function renderArtifactGroups(container, artifacts, options = {}) {
  const sortedArtifacts = [...artifacts].sort((left, right) => {
    const laneDelta = artifactSourceRank(left) - artifactSourceRank(right);
    if (laneDelta !== 0) {
      return laneDelta;
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  const groups = new Map();
  for (const artifact of sortedArtifacts) {
    const label = artifactSourceLabel(artifact);
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label).push(artifact);
  }

  for (const [groupLabel, groupArtifacts] of groups.entries()) {
    const section = document.createElement("section");
    section.className = "artifact-group";

    const header = document.createElement("div");
    header.className = "artifact-group-header";
    header.innerHTML = `
      <strong>${escapeHtml(groupLabel)}</strong>
      <span>${escapeHtml(`${groupArtifacts.length} artifact${groupArtifacts.length === 1 ? "" : "s"}`)}</span>
    `;
    section.append(header);

    const list = document.createElement("div");
    list.className = "artifact-group-list";

    for (const artifact of groupArtifacts) {
      const item = document.createElement("article");
      item.className = "collection-item artifact-item";
      const ticketLabel =
        artifact.ticketKey && artifact.ticketTitle
          ? `${artifact.ticketKey} · ${artifact.ticketTitle}`
          : artifact.ticketKey || artifact.ticketId || "Unscoped ticket";
      item.innerHTML = `
        <div class="execution-item-header">
          <div>
            <strong>${escapeHtml(artifact.label)}</strong>
            <p>${escapeHtml(artifact.uri)}</p>
          </div>
          <span class="state-badge subtle">${escapeHtml(artifact.kind)}</span>
        </div>
        <div class="ticket-card-meta execution-meta">
          <span>${escapeHtml(groupLabel)}</span>
          ${options.showTicketLabel ? `<span>${escapeHtml(ticketLabel)}</span>` : ""}
          <span>${formatDate(artifact.createdAt)}</span>
        </div>
        <div class="artifact-item-actions">
          <button class="ghost-button" type="button" data-artifact-action="copy" data-artifact-uri="${escapeHtml(artifact.uri)}">Copy URI</button>
          <button class="ghost-button" type="button" data-artifact-action="open" data-artifact-uri="${escapeHtml(artifact.uri)}">Open</button>
        </div>
      `;
      list.append(item);
    }

    section.append(list);
    container.append(section);
  }
}

function eventTypeLabel(event) {
  if (event.type) {
    return prettyEventType(event.type);
  }
  const compact = [event.family, event.action].filter(Boolean).join(".");
  return compact ? prettyEventType(compact) : "Project Event";
}

function artifactSourceLabel(artifact) {
  if (artifact.mergeRunId) return "Merge lane";
  if (artifact.validationRunId) return "Validation lane";
  if (artifact.reviewId) return "Review lane";
  if (artifact.executionId) return "Execution lane";
  return "Ticket";
}

function artifactSourceRank(artifact) {
  if (artifact.mergeRunId) return 0;
  if (artifact.validationRunId) return 1;
  if (artifact.reviewId) return 2;
  if (artifact.executionId) return 3;
  return 4;
}

function boardDecisionLabel(ticket) {
  if (ticket.state === "READY_TO_MERGE") {
    return "Decision: inspect evidence and either merge or bounce it back.";
  }
  if (ticket.state === "BLOCKED") {
    return "Decision: unblock the lane before the backlog stalls further.";
  }
  if (ticket.state === "REWORK") {
    return "Decision: route the follow-up work and keep the loop moving.";
  }
  if (ticket.state === "WORKING") {
    return "Decision: watch the active lane and check for continuation needs.";
  }
  if (ticket.state === "REVIEWING" || ticket.state === "VALIDATING") {
    return "Decision: confirm the evidence needed to advance this ticket.";
  }
  return "Decision: shape scope, ownership, and readiness for the next lane.";
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
