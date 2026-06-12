import { repoDto } from "../../contracts/src/index.mjs";

export function createRepoCommands({
  database,
  getProjectRow,
  insertEvent,
  withTransaction,
  now,
  requiredText,
  optionalText,
  normalizeFilesystemPath,
  slugify,
  applyTextPatch,
  applyBooleanPatch,
  mapRepo,
}) {
  return {
    listRepos(projectId) {
      return database
        .prepare("select * from repos where project_id = ? order by created_at asc")
        .all(projectId)
        .map((row) => repoDto(mapRepo(row)));
    },

    createRepo(projectId, input) {
      if (!getProjectRow(database, projectId)) {
        return null;
      }

      const timestamp = now();
      const slug = requiredText(input.slug, "slug");
      const name = requiredText(input.name, "name");
      const localPath = normalizeFilesystemPath(requiredText(input.localPath, "localPath"));
      const repo = {
        id: `repo_${slugify(projectId)}_${slugify(slug)}`,
        projectId,
        slug,
        name,
        localPath,
        remoteUrl: optionalText(input.remoteUrl),
        defaultBranch: optionalText(input.defaultBranch, "main"),
        isPrimary: Boolean(input.isPrimary),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      withTransaction(database, () => {
        database
          .prepare(
            `insert into repos (
              id, project_id, slug, name, local_path, remote_url, default_branch, is_primary, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            repo.id,
            repo.projectId,
            repo.slug,
            repo.name,
            repo.localPath,
            repo.remoteUrl,
            repo.defaultBranch,
            repo.isPrimary ? 1 : 0,
            repo.createdAt,
            repo.updatedAt,
          );

        insertEvent(database, {
          projectId,
          repoId: repo.id,
          type: "repo.created",
          summary: `Repo ${repo.name} registered`,
        });
      });

      return repoDto(repo);
    },

    updateRepo(projectId, repoId, input) {
      const existing = database.prepare("select * from repos where project_id = ? and id = ?").get(projectId, repoId);
      if (!existing) {
        return null;
      }

      const updates = {};
      const changedFields = [];
      applyTextPatch(updates, changedFields, input, existing, "name", { required: true });
      applyTextPatch(updates, changedFields, input, existing, "localPath", {
        column: "local_path",
        required: true,
        transform: normalizeFilesystemPath,
      });
      applyTextPatch(updates, changedFields, input, existing, "remoteUrl", { column: "remote_url" });
      applyTextPatch(updates, changedFields, input, existing, "defaultBranch", {
        column: "default_branch",
        required: true,
      });
      applyBooleanPatch(updates, changedFields, input, existing, "isPrimary", { column: "is_primary" });

      if (changedFields.length === 0) {
        return repoDto(mapRepo(existing));
      }

      const timestamp = now();
      withTransaction(database, () => {
        if (updates.is_primary === 1) {
          database.prepare("update repos set is_primary = 0, updated_at = ? where project_id = ?").run(timestamp, projectId);
        }

        const clauses = [];
        const values = [];
        for (const [column, value] of Object.entries(updates)) {
          clauses.push(`${column} = ?`);
          values.push(value);
        }

        clauses.push("updated_at = ?");
        values.push(timestamp, projectId, repoId);

        database
          .prepare(`update repos set ${clauses.join(", ")} where project_id = ? and id = ?`)
          .run(...values);

        insertEvent(database, {
          projectId,
          repoId,
          type: "repo.updated",
          summary: `${existing.name} repo updated`,
          detail: `Updated ${changedFields.join(", ")}`,
        });
      });

      const repo = database.prepare("select * from repos where project_id = ? and id = ?").get(projectId, repoId);
      return repoDto(mapRepo(repo));
    },
  };
}
