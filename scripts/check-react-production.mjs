import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const repoRoot = new URL("../", import.meta.url);
const distRoot = new URL("apps/web-react/dist/", repoRoot);
const indexUrl = new URL("index.html", distRoot);
const apiSourceUrl = new URL("services/api/src/app.mjs", repoRoot);

if (!existsSync(distRoot)) {
  throw new Error("Missing apps/web-react/dist. Run npm run build:web before production serving.");
}

const indexHtml = await readFile(indexUrl, "utf8");
const scriptMatch = indexHtml.match(/<script[^>]+src="([^"]+\.js)"/);
const cssMatch = indexHtml.match(/<link[^>]+href="([^"]+\.css)"/);

if (!scriptMatch) {
  throw new Error("React production index does not reference a JavaScript asset.");
}
if (!cssMatch) {
  throw new Error("React production index does not reference a CSS asset.");
}

const scriptPath = scriptMatch[1].replace(/^\//, "");
const cssPath = cssMatch[1].replace(/^\//, "");
const scriptUrl = new URL(scriptPath, distRoot);
const cssUrl = new URL(cssPath, distRoot);

if (!existsSync(scriptUrl)) {
  throw new Error(`React production script asset is missing: ${scriptPath}`);
}
if (!existsSync(cssUrl)) {
  throw new Error(`React production stylesheet asset is missing: ${cssPath}`);
}

const apiSource = await readFile(apiSourceUrl, "utf8");
for (const marker of [
  "apps/web-react/dist/",
  "Missing apps/web-react/dist",
  "walkWebAssetTree(reactBuildRoot",
]) {
  if (!apiSource.includes(marker)) {
    throw new Error(`API static serving is missing React production marker: ${marker}`);
  }
}

console.log("Floop React production check");
console.log("===========================");
console.log(`index: ${scriptPath}`);
console.log(`styles: ${cssPath}`);
console.log("api serving: ok");
