import {
  parseAddDependencyInput,
  parseCreateTicketInput,
  parseTicketTransitionInput,
  parseUpdateTicketInput,
} from "../../../../packages/contracts/src/index.mjs";
import { parseTicketFilters, RequestError, respondMaybe } from "./shared.mjs";

export function handleTicketRoute(route, url, body, store) {
  switch (route.name) {
    case "tickets":
      if (route.method === "GET") {
        return {
          status: 200,
          body: { tickets: store.listTickets(route.params.projectId, parseTicketFilters(url)) },
        };
      }
      return {
        status: 201,
        body: { ticket: store.createTicket(route.params.projectId, parseCreateTicketInput(body)) },
      };
    case "ticket":
      return respondMaybe(store.getTicket(route.params.projectId, route.params.ticketId), "ticket");
    case "ticketUpdate":
      return respondMaybe(
        store.updateTicket(route.params.projectId, route.params.ticketId, parseUpdateTicketInput(body)),
        "ticket",
      );
    case "ticketDependencies":
      {
        const input = parseAddDependencyInput(body);
        if (input.blockingTicketId === route.params.ticketId) {
          throw new RequestError(400, "A ticket cannot depend on itself");
        }
        return respondMaybe(
          store.addDependency(route.params.projectId, route.params.ticketId, input),
          "ticket",
        );
      }
    case "ticketDependency":
      return respondMaybe(
        store.removeDependency(
          route.params.projectId,
          route.params.ticketId,
          route.params.dependencyId,
        ),
        "ticket",
      );
    case "ticketTransition":
      return respondMaybe(
        store.transitionTicket(
          route.params.projectId,
          route.params.ticketId,
          parseTicketTransitionInput(body),
        ),
        "ticket",
      );
    case "ticketRestart":
      return respondMaybe(
        store.restartTicket(route.params.projectId, route.params.ticketId, body || {}),
        "ticket",
      );
    default:
      return null;
  }
}
