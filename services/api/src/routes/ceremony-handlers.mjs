import {
  parseApplyCeremonyRunInput,
  parseCreateCeremonyRunInput,
} from "../../../../packages/contracts/src/index.mjs";
import { respondCreated, respondMaybe } from "./shared.mjs";

export function handleCeremonyRoute(route, _url, body, store) {
  switch (route.name) {
    case "projectCeremonies":
      if (route.method === "GET") {
        const ceremonies = store.listCeremonyRuns(route.params.projectId);
        if (!ceremonies) {
          return { status: 404, body: { error: "not_found" } };
        }
        return { status: 200, body: { ceremonies } };
      }
      return respondCreated(
        store.createCeremonyRun(route.params.projectId, parseCreateCeremonyRunInput(body)),
        "ceremony",
      );
    case "projectCeremony":
      return respondMaybe(
        store.getCeremonyRun(route.params.projectId, route.params.runId),
        "ceremony",
      );
    case "projectCeremonyApply":
      return respondMaybe(
        store.applyCeremonyRun(
          route.params.projectId,
          route.params.runId,
          parseApplyCeremonyRunInput(body || {}),
        ),
        "ceremony",
      );
    default:
      return null;
  }
}
