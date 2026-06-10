import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

import { createPoolServer } from "../services/api/src/app.mjs";
import { createStore } from "../services/api/src/store.mjs";

const elementKey = "element-6066-11e4-a52e-4f735466cecf";
const fixtureDir = mkdtempSync(join(tmpdir(), "pool-visual-fixture-"));
const outputDir = "/tmp/pool-visuals";
mkdirSync(outputDir, { recursive: true });

const store = createStore({
  filename: join(fixtureDir, "pool.sqlite"),
  seedDemo: true,
  workspaceRoot: join(fixtureDir, "workspace"),
});
const server = createPoolServer({ store });
let driver;
let sessionId = "";
let driverBaseUrl = "";

try {
  await listen(server);
  const appUrl = `http://127.0.0.1:${server.address().port}`;
  const driverPort = await freePort();
  driverBaseUrl = `http://127.0.0.1:${driverPort}`;
  driver = await launchChromeDriver(driverPort);
  sessionId = await createSession();

  await navigate(appUrl);
  await waitForText("Define first transport contracts");
  await assertScript("document.documentElement.scrollHeight <= window.innerHeight && document.body.scrollHeight <= window.innerHeight", "desktop body does not own vertical scrolling");
  await screenshot("01-desktop-board");
  await clickText("Collapse project rail");
  await waitForScript("document.querySelector('.app-shell.is-rail-collapsed') !== null");
  await delay(180);
  await screenshot("02-desktop-rail-collapsed");
  await clickText("Expand project rail");
  await waitForScript("document.querySelector('.app-shell.is-rail-collapsed') === null");
  await delay(180);

  await clickText("Ops");
  await waitForText("Merge Queue");
  await screenshot("03-desktop-ops");
  await clickText("Board");
  await waitForText("Backlog");

  await clickTicket("Define first transport contracts");
  await waitForScript("document.querySelector('.ticket-detail') !== null");
  await delay(220);
  await screenshot("04-desktop-ticket-modal");
  await clickText("Edit ticket");
  await waitForScript("document.querySelector('.ticket-detail .icon-button.is-active') !== null");
  await delay(150);
  await screenshot("05-desktop-ticket-editing");
  await clickText("Stop editing");
  await waitForScript("document.querySelector('.ticket-detail .icon-button.is-active') === null");
  await execute("document.querySelector('.ticket-detail').scrollTop = 520; return true;");
  await delay(150);
  await screenshot("06-desktop-ticket-modal-scrolled");
  await clickSelector(".ticket-detail .detail-heading button[aria-label='Close ticket detail']");
  await waitForScript("document.querySelector('.ticket-detail') === null");

  await clickText("Settings");
  await waitForScript("document.querySelector('.settings-drawer') !== null");
  await screenshot("07-desktop-settings");
  await execute("document.querySelector('.settings-grid').scrollTop = 460; return true;");
  await delay(150);
  await screenshot("08-desktop-settings-scrolled");
  await clickSelector(".settings-drawer .drawer-heading button[aria-label='Close settings']");
  await waitForScript("document.querySelector('.settings-drawer') === null");

  await clickText("New project");
  await waitForScript("document.querySelector('.onboarding-dialog') !== null");
  await screenshot("09-desktop-onboarding");
  await clickSelector(".onboarding-dialog .drawer-heading button[aria-label='Close onboarding']");
  await waitForScript("document.querySelector('.onboarding-dialog') === null");

  await clickText("New Ticket");
  await waitForScript("document.querySelector('.ticket-composer') !== null");
  await screenshot("10-desktop-composer");

  await setViewport(390, 844, true);
  await navigate(appUrl);
  await waitForText("Define first transport contracts");
  await screenshot("11-mobile-board-top");
  await execute("window.scrollTo(0, 620); return true;");
  await delay(150);
  await screenshot("12-mobile-board-scrolled");
  await clickText("Projects");
  await waitForScript("document.querySelector('.project-rail.is-open') !== null");
  await delay(220);
  await screenshot("13-mobile-project-rail");
  await clickText("New project");
  await waitForScript("document.querySelector('.onboarding-dialog') !== null");
  await delay(220);
  await screenshot("14-mobile-onboarding");
  await clickSelector(".onboarding-dialog .drawer-heading button[aria-label='Close onboarding']");
  await waitForScript("document.querySelector('.onboarding-dialog') === null");
  await navigate(appUrl);
  await waitForText("Define first transport contracts");
  await clickTicket("Define first transport contracts");
  await waitForScript("document.querySelector('.ticket-detail') !== null");
  await delay(220);
  await screenshot("15-mobile-detail");
  await execute("document.querySelector('.ticket-detail').scrollTop = 520; return true;");
  await delay(150);
  await screenshot("16-mobile-detail-scrolled");

  console.log(`Pool visual screenshots written to ${outputDir}`);
} finally {
  if (sessionId) {
    await webdriver("DELETE", `/session/${sessionId}`).catch(() => {});
  }
  if (driver) {
    driver.kill("SIGTERM");
    await once(driver, "exit").catch(() => {});
  }
  await new Promise((resolve) => server.close(resolve));
  store.close();
  rmSync(fixtureDir, { recursive: true, force: true });
}

async function listen(httpServer) {
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
}

async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function launchChromeDriver(port) {
  const process = spawn("chromedriver", [`--port=${port}`], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  process.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await fetchJson(`${driverBaseUrl}/status`);
      return process;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`chromedriver did not become ready. ${stderr}`);
}

async function createSession() {
  const payload = await webdriver("POST", "/session", {
    capabilities: {
      alwaysMatch: {
        browserName: "chrome",
        "goog:chromeOptions": {
          binary: "/usr/bin/chromium",
          args: [
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-background-networking",
            "--window-size=1440,1000",
            `--user-data-dir=${join(fixtureDir, "chromium")}`,
          ],
        },
      },
    },
  });
  return payload.sessionId || payload.value?.sessionId;
}

async function navigate(url) {
  await webdriver("POST", `/session/${sessionId}/url`, { url });
}

async function setViewport(width, height, mobile) {
  await webdriver("POST", `/session/${sessionId}/goog/cdp/execute`, {
    cmd: "Emulation.setDeviceMetricsOverride",
    params: { width, height, deviceScaleFactor: 1, mobile },
  });
}

async function screenshot(name) {
  const payload = await webdriver("GET", `/session/${sessionId}/screenshot`);
  const filePath = join(outputDir, `${name}.png`);
  writeFileSync(filePath, Buffer.from(payload.value, "base64"));
  console.log(filePath);
}

async function clickText(text) {
  const element = await elementFromScript(`
    const text = arguments[0];
    const buttons = Array.from(document.querySelectorAll("button"))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        const label = [button.innerText, button.getAttribute("aria-label"), button.getAttribute("title")].filter(Boolean).join(" ");
        return label.includes(text) && !button.disabled && rect.width > 0 && rect.height > 0;
      });
    return buttons.find((button) => [button.innerText, button.getAttribute("aria-label"), button.getAttribute("title")].filter(Boolean).some((label) => label.trim() === text)) || buttons[0] || null;
  `, [text]);
  await clickElement(element);
}

async function clickTicket(text) {
  const element = await elementFromScript(`
    const text = arguments[0];
    return Array.from(document.querySelectorAll(".ticket-card"))
      .find((button) => button.innerText.includes(text)) || null;
  `, [text]);
  await clickElement(element);
}

async function clickSelector(selector) {
  const element = await elementFromScript("return document.querySelector(arguments[0]);", [selector]);
  await clickElement(element);
}

async function waitForText(text, timeoutMs = 5000) {
  await waitForScript("document.body && document.body.innerText.includes(arguments[0])", [text], timeoutMs);
}

async function assertScript(script, message) {
  const ok = await execute(`return Boolean(${script});`);
  if (!ok) {
    throw new Error(message);
  }
}

async function waitForScript(script, args = [], timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await execute(`return Boolean(${script});`, args).catch(() => false)) {
      return;
    }
    await delay(80);
  }
  const text = await execute("return document.body?.innerText || ''").catch(() => "");
  throw new Error(`Timed out waiting for: ${script}\n\nPage text:\n${text.slice(0, 2000)}`);
}

async function elementFromScript(script, args = []) {
  const element = await execute(script, args);
  if (!element) {
    throw new Error("Expected script to return an element");
  }
  return element;
}

async function clickElement(element) {
  await webdriver("POST", `/session/${sessionId}/element/${elementId(element)}/click`, {});
}

function elementId(element) {
  return element[elementKey] || element.ELEMENT;
}

async function execute(script, args = []) {
  const payload = await webdriver("POST", `/session/${sessionId}/execute/sync`, { script, args });
  return payload.value;
}

async function webdriver(method, path, body) {
  return fetchJson(`${driverBaseUrl}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.value?.error) {
    throw new Error(payload.value?.message || `${response.status} ${response.statusText}`);
  }
  return Object.hasOwn(payload, "value") ? payload : { value: payload };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
