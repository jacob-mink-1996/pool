import {
  ticketStates,
  executionOutcomes,
  roleNames,
  eventTypes,
} from "../packages/domain/src/index.mjs";
import "./check-react-shell.mjs";
import "./check-react-production.mjs";

console.log("Floop product type check");
console.log("=======================");
console.log(`ticket states: ${ticketStates.length}`);
console.log(`execution outcomes: ${executionOutcomes.length}`);
console.log(`roles: ${roleNames.length}`);
console.log(`event types: ${eventTypes.length}`);
