const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const {
  createDesktopEnvironment,
  findRepoRoot,
  resolveHost,
  resolvePort,
  waitForHealth,
} = require("./runtime.cjs");

let apiServer;
let executionDriver;
let mergeDriver;
let mainWindow;

async function startPoolApi(repoRoot) {
  const hasExplicitPort = Boolean(process.env.POOL_PORT);
  const desktopEnv = createDesktopEnvironment({
    userDataPath: app.getPath("userData"),
  });
  Object.assign(process.env, desktopEnv);

  const [{ createPoolServer }, { createExecutionDriver }, { createMergeDriver }, { createStore }] =
    await Promise.all([
      import(pathToFileURL(path.join(repoRoot, "services/api/src/app.mjs")).href),
      import(pathToFileURL(path.join(repoRoot, "services/api/src/execution-driver.mjs")).href),
      import(pathToFileURL(path.join(repoRoot, "services/api/src/merge-driver.mjs")).href),
      import(pathToFileURL(path.join(repoRoot, "services/api/src/store.mjs")).href),
    ]);

  const host = resolveHost(desktopEnv.POOL_HOST);
  const port = resolvePort(desktopEnv.POOL_PORT);
  const store = createStore();
  apiServer = createPoolServer({ store, host, port });
  executionDriver = createExecutionDriver({
    store,
    pollIntervalMs: Number.parseInt(process.env.POOL_EXECUTION_POLL_MS || "2000", 10),
  });
  mergeDriver = createMergeDriver({
    store,
    pollIntervalMs: Number.parseInt(process.env.POOL_MERGE_POLL_MS || "2000", 10),
  });

  executionDriver.start();
  mergeDriver.start();

  const actualPort = await listenWithFallback(apiServer, {
    host,
    port,
    allowFallback: !hasExplicitPort,
  });
  process.env.POOL_PORT = String(actualPort);
  await waitForHealth({ host, port: actualPort });
  console.log(`Pool desktop API listening on http://${host}:${actualPort}`);

  return { host, port: actualPort };
}

function listenWithFallback(server, { host, port, allowFallback }) {
  return new Promise((resolve, reject) => {
    const listen = (nextPort) => {
      const onError = (error) => {
        server.off("listening", onListening);
        if (allowFallback && nextPort !== 0 && error.code === "EADDRINUSE") {
          listen(0);
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        resolve(typeof address === "object" && address ? address.port : nextPort);
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(nextPort, host);
    };

    listen(port);
  });
}

function createMainWindow({ host, port }) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 680,
    title: "Pool",
    backgroundColor: "#f6f7f9",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const nextUrl = new URL(url);
      if (nextUrl.origin === `http://${host}:${port}`) {
        return;
      }
      event.preventDefault();
      shell.openExternal(url);
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  mainWindow.loadURL(`http://${host}:${port}/`);
}

async function stopPoolApi() {
  await Promise.allSettled([
    executionDriver?.stop(),
    mergeDriver?.stop(),
    apiServer
      ? new Promise((resolve) => {
          apiServer.close(resolve);
        })
      : undefined,
  ]);
  apiServer = undefined;
  executionDriver = undefined;
  mergeDriver = undefined;
}

function installMenu() {
  const template = [
    {
      label: "Pool",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady()
  .then(async () => {
    installMenu();
    const repoRoot = findRepoRoot(__dirname);
    const api = await startPoolApi(repoRoot);
    createMainWindow(api);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(api);
      }
    });
  })
  .catch((error) => {
    console.error("Pool desktop failed to start", error);
    dialog.showErrorBox(
      "Pool failed to start",
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  });

app.on("before-quit", (event) => {
  if (!apiServer) {
    return;
  }
  event.preventDefault();
  stopPoolApi()
    .catch((error) => {
      console.error("Failed to stop Pool API cleanly", error);
    })
    .finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
