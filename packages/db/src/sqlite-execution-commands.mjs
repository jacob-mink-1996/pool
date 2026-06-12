import { executionDto, worktreeDto } from "../../contracts/src/index.mjs";

export function createExecutionCommands({
  database,
  getExecutionRow,
  getTicketRow,
  getWorktreeRow,
  insertEvent,
  withTransaction,
  now,
  requiredText,
  optionalText,
  addMs,
  isExpiredIso,
  mapExecution,
  mapWorktree,
  getArtifactsByExecutionId,
  getWorktreesByExecutionId,
  listWorktreeRows,
}) {
  const commands = {
    listExecutions(projectId, ticketId) {
      if (!getTicketRow(database, projectId, ticketId)) {
        return null;
      }

      return database
        .prepare(
          `select * from executions
           where project_id = ? and ticket_id = ?
           order by started_at desc, iteration desc`,
        )
        .all(projectId, ticketId)
        .map((row) => commands.getExecution(projectId, row.id));
    },

    getExecution(projectId, executionId) {
      const execution = getExecutionRow(database, projectId, executionId);
      if (!execution) {
        return null;
      }

      const ticket = getTicketRow(database, projectId, execution.ticket_id);
      const worktrees = getWorktreesByExecutionId(database, projectId, [execution.id]).get(execution.id) || [];
      const artifacts = getArtifactsByExecutionId(database, projectId, [execution.id]).get(execution.id) || [];
      return executionDto({
        ...mapExecution(execution),
        ticketKey: ticket?.key || "",
        ticketTitle: ticket?.title || "",
        ticketState: ticket?.state || "",
        artifacts,
        worktrees,
      });
    },

    listActiveExecutions() {
      return database
        .prepare(
          `select project_id, id
           from executions
           where finished_at is null and status = 'running'
           order by started_at asc`,
        )
        .all()
        .map((row) => commands.getExecution(row.project_id, row.id))
        .filter(Boolean);
    },

    claimExecution(projectId, executionId, input = {}) {
      const claimToken = requiredText(input.claimToken, "claimToken");
      const claimedAt = optionalText(input.claimedAt, now());
      const leaseMs = Number.isInteger(input.leaseMs) && input.leaseMs > 0 ? input.leaseMs : 30_000;
      const leaseExpiresAt = addMs(claimedAt, leaseMs);

      const claimed = withTransaction(database, () => {
        const execution = getExecutionRow(database, projectId, executionId);
        if (!execution || execution.finished_at || execution.status !== "running") {
          return false;
        }
        if (execution.claim_token && execution.claim_token !== claimToken && !isExpiredIso(execution.claim_expires_at, claimedAt)) {
          return false;
        }

        database
          .prepare(
            `update executions
             set claim_token = ?, claim_expires_at = ?, updated_at = ?
             where project_id = ? and id = ?`,
          )
          .run(claimToken, leaseExpiresAt, claimedAt, projectId, executionId);
        return true;
      });

      return claimed ? commands.getExecution(projectId, executionId) : null;
    },

    releaseExecutionClaim(projectId, executionId, input = {}) {
      const claimToken = requiredText(input.claimToken, "claimToken");
      const releasedAt = optionalText(input.releasedAt, now());
      database
        .prepare(
          `update executions
           set claim_token = '', claim_expires_at = null, updated_at = ?
           where project_id = ? and id = ? and claim_token = ? and finished_at is null`,
        )
        .run(releasedAt, projectId, executionId, claimToken);
      return commands.getExecution(projectId, executionId);
    },

    listWorktrees(projectId, filters = {}) {
      return listWorktreeRows(database, projectId, filters).map((row) => worktreeDto(mapWorktree(row)));
    },

    cleanWorktree(projectId, worktreeId, input = {}) {
      const worktree = getWorktreeRow(database, projectId, worktreeId);
      if (!worktree) {
        return null;
      }
      if (worktree.status === "active") {
        throw new Error("Cannot clean an active worktree");
      }
      if (worktree.cleaned_at) {
        return worktreeDto(mapWorktree(worktree));
      }

      const ticket = getTicketRow(database, projectId, worktree.ticket_id);
      const repo = database
        .prepare("select name from repos where project_id = ? and id = ?")
        .get(projectId, worktree.repo_id);
      const timestamp = now();
      const reason = optionalText(input.reason, "Operator cleaned the completed worktree");

      withTransaction(database, () => {
        database
          .prepare(
            `update worktrees
             set status = ?, cleaned_at = ?, updated_at = ?
             where project_id = ? and id = ?`,
          )
          .run("cleaned", timestamp, timestamp, projectId, worktreeId);

        insertEvent(database, {
          projectId,
          repoId: worktree.repo_id,
          ticketId: worktree.ticket_id,
          type: "worktree.cleaned",
          summary: `${ticket.key} worktree cleaned for ${repo.name}`,
          detail: `${reason}\n${worktree.path}`,
        });
      });

      return worktreeDto(mapWorktree(getWorktreeRow(database, projectId, worktreeId)));
    },
  };

  return commands;
}
