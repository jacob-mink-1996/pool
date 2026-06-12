import {
  parseCreateProjectInput,
  parseUpdateProjectInput,
  parseUpdateProjectPolicyInput,
  parseUpdateRoleProfileInput,
} from "../../../../packages/contracts/src/index.mjs";
import { parseTicketFilters, respondMaybe } from "./shared.mjs";

export function handleProjectRoute(route, url, body, store) {
  switch (route.name) {
    case "projects":
      if (route.method === "GET") {
        return { status: 200, body: { projects: store.listProjects() } };
      }
      return { status: 201, body: { project: store.createProject(parseCreateProjectInput(body)) } };
    case "project":
      if (route.method === "GET") {
        return respondMaybe(store.getProjectSummary(route.params.projectId), "project");
      }
      if (route.method === "DELETE") {
        return respondMaybe(store.deleteProject(route.params.projectId), "project");
      }
      return respondMaybe(
        store.updateProject(route.params.projectId, parseUpdateProjectInput(body)),
        "project",
      );
    case "projectPolicy":
      if (route.method === "GET") {
        return respondMaybe(store.getProjectPolicy(route.params.projectId), "policy");
      }
      return respondMaybe(
        store.updateProjectPolicy(route.params.projectId, parseUpdateProjectPolicyInput(body)),
        "policy",
      );
    case "projectBoard":
      return respondMaybe(
        store.getProjectBoard(route.params.projectId, parseTicketFilters(url)),
        "board",
      );
    case "projectAgentProfiles":
      {
        const profiles = store.listRoleProfiles(route.params.projectId);
        if (!profiles) {
          return { status: 404, body: { error: "not_found" } };
        }
        return { status: 200, body: { profiles } };
      }
    case "projectAgentProfile":
      return respondMaybe(
        store.updateRoleProfile(
          route.params.projectId,
          route.params.role,
          parseUpdateRoleProfileInput(body),
        ),
        "profile",
      );
    default:
      return null;
  }
}
