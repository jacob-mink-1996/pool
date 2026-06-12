import {
  parseCreateRepoInput,
  parseUpdateRepoInput,
} from "../../../../packages/contracts/src/index.mjs";
import { respondMaybe } from "./shared.mjs";

export function handleRepoRoute(route, _url, body, store) {
  switch (route.name) {
    case "repos":
      if (route.method === "GET") {
        return { status: 200, body: { repos: store.listRepos(route.params.projectId) } };
      }
      return {
        status: 201,
        body: { repo: store.createRepo(route.params.projectId, parseCreateRepoInput(body)) },
      };
    case "repo":
      return respondMaybe(
        store.updateRepo(route.params.projectId, route.params.repoId, parseUpdateRepoInput(body)),
        "repo",
      );
    default:
      return null;
  }
}
