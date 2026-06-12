import { readFile } from "node:fs/promises";

const source = [
  await readFile(new URL("../apps/web-react/src/main.tsx", import.meta.url), "utf8"),
  await readFile(new URL("../apps/web-react/src/ProjectSettings.tsx", import.meta.url), "utf8"),
].join("\n");
const styles = await readFile(new URL("../apps/web-react/src/styles.css", import.meta.url), "utf8");

for (const marker of [
  "function App()",
  "function ProjectRail",
  "function BoardView",
  "function TicketDetailPanel",
  "function TicketComposer",
  "function OpsPanel",
  "function SettingsDrawer",
  "function ProjectSettingsForm",
  "function PolicyForm",
  "function RepoRegistry",
  "function RoleProfiles",
  "function TicketEditSection",
  "function ScopeSection",
  "function WorktreeAndArtifactSection",
  "new EventSource",
]) {
  if (!source.includes(marker)) {
    throw new Error(`Missing React shell marker: ${marker}`);
  }
}

for (const marker of ["@radix-ui/react-dialog", "@radix-ui/react-tabs", "@radix-ui/react-tooltip", "lucide-react"]) {
  if (!source.includes(marker)) {
    throw new Error(`React shell is missing UI library marker: ${marker}`);
  }
}

if (!styles.includes(".ticket-detail")) {
  throw new Error("React ticket detail dialog is missing styling");
}

if (styles.includes(".ticket-detail {\n    display: none")) {
  throw new Error("React ticket detail must remain reachable on mobile");
}

console.log("Floop React shell check");
console.log("======================");
console.log("main shell: ok");
console.log("board view: ok");
console.log("ticket detail mobile drawer: ok");
