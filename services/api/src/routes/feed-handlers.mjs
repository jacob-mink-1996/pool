import { parseArtifactFilters, parseEventFilters, parseWorktreeFilters, respondMaybe } from "./shared.mjs";

export function handleFeedRoute(route, url, body, store) {
  switch (route.name) {
    case "worktrees":
      return {
        status: 200,
        body: { worktrees: store.listWorktrees(route.params.projectId, parseWorktreeFilters(url)) },
      };
    case "worktreeClean":
      return respondMaybe(
        store.cleanWorktree(route.params.projectId, route.params.worktreeId, body || {}),
        "worktree",
      );
    case "events":
      return {
        status: 200,
        body: { events: store.listEvents(route.params.projectId, parseEventFilters(url)) },
      };
    case "artifacts":
      return {
        status: 200,
        body: { artifacts: store.listArtifacts(route.params.projectId, parseArtifactFilters(url)) },
      };
    default:
      return null;
  }
}
