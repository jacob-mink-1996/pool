import {
  ticketStates,
  executionOutcomes,
  roleNames,
  eventTypes,
} from "../packages/domain/src/index.mjs";

console.log("Pool product type check");
console.log("=======================");
console.log(`ticket states: ${ticketStates.length}`);
console.log(`execution outcomes: ${executionOutcomes.length}`);
console.log(`roles: ${roleNames.length}`);
console.log(`event types: ${eventTypes.length}`);
