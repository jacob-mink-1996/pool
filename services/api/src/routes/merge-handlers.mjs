import { parseMergeTicketInput } from "../../../../packages/contracts/src/index.mjs";
import { currentMergeReasonCode, inferErrorStatus, respondMaybe } from "./shared.mjs";

export function handleMergeRoute(route, _url, body, store) {
  switch (route.name) {
    case "projectMergeQueue":
      {
        const queue = store.listMergeQueue(route.params.projectId);
        if (!queue) {
          return { status: 404, body: { error: "not_found" } };
        }
        return { status: 200, body: { queue } };
      }
    case "ticketMerge":
      if (route.method === "GET") {
        return respondMaybe(store.getMergeStatus(route.params.projectId, route.params.ticketId), "merge");
      }
      try {
        return respondMaybe(
          store.mergeTicket(
            route.params.projectId,
            route.params.ticketId,
            parseMergeTicketInput(body),
          ),
          "merge",
        );
      } catch (error) {
        const status = inferErrorStatus(error);
        if (status === 409) {
          const mergeStatus = store.getMergeStatus(route.params.projectId, route.params.ticketId);
          return {
            status,
            body: {
              error: "conflict",
              message: error instanceof Error ? error.message : String(error),
              reasonCode: currentMergeReasonCode(mergeStatus),
              merge: mergeStatus,
            },
          };
        }
        throw error;
      }
    default:
      return null;
  }
}
