import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../apps/web/index.html", import.meta.url), "utf8");

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

if (duplicateIds.length > 0) {
  throw new Error(`Duplicate HTML ids in apps/web/index.html: ${duplicateIds.join(", ")}`);
}

function sectionBetween(label, startMarker, endMarker, requiredMarkers) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);

  if (start === -1) {
    throw new Error(`Missing start marker for ${label}`);
  }
  if (end === -1) {
    throw new Error(`Missing end marker for ${label}`);
  }

  const slice = html.slice(start, end);
  for (const marker of requiredMarkers) {
    if (!slice.includes(marker)) {
      throw new Error(`Missing ${marker} inside ${label}`);
    }
  }

  return { start, end, slice };
}

const boardSection = sectionBetween(
  "board workspace panel",
  '<section class="workspace-panel" data-workspace-panel="board">',
  '<section class="workspace-panel" data-workspace-panel="ops" hidden>',
  [
    '<sl-drawer id="settings-drawer"',
    '<form id="board-filter-form"',
    '<div id="board-columns" class="board-columns"',
  ],
);

const drawerStart = boardSection.slice.indexOf('<sl-drawer id="settings-drawer"');
const drawerEnd = boardSection.slice.indexOf("</sl-drawer>");
const boardFilterIndex = boardSection.slice.indexOf('<form id="board-filter-form"');
const boardColumnsIndex = boardSection.slice.indexOf('<div id="board-columns" class="board-columns"');

if (drawerStart === -1 || drawerEnd === -1) {
  throw new Error("Settings drawer is not properly enclosed inside the board workspace panel");
}
if (boardFilterIndex === -1 || boardColumnsIndex === -1) {
  throw new Error("Board filter form or board columns are missing from the board workspace panel");
}
if (drawerEnd > boardFilterIndex || drawerEnd > boardColumnsIndex) {
  throw new Error("Board content is still nested inside the settings drawer");
}
if (!boardSection.slice.slice(drawerStart, drawerEnd).includes('<div id="role-profile-list" class="repo-list"></div>')) {
  throw new Error("Role profiles block is missing from the settings drawer");
}

const opsSection = sectionBetween(
  "ops workspace panel",
  '<section class="workspace-panel" data-workspace-panel="ops" hidden>',
  "</div>\n        </section>",
  [
    '<sl-tab-group id="ops-tab-group" class="ops-tab-group">',
    '<sl-tab slot="nav" panel="overview">Overview</sl-tab>',
    '<sl-tab slot="nav" panel="board">Board</sl-tab>',
    '<sl-tab slot="nav" panel="history">History</sl-tab>',
    '<div id="recent-artifacts" class="collection"></div>',
  ],
);

if (!opsSection.slice.includes("</sl-tab-group>")) {
  throw new Error("Ops tab group is not properly closed");
}

console.log("Pool web shell check");
console.log("====================");
console.log(`html ids: ${ids.length}`);
console.log("board workspace structure: ok");
console.log("ops workspace structure: ok");
