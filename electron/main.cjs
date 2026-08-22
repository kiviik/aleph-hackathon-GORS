const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const port = Number(process.env.ELECTRON_UI_PORT || 3210);
const appUrl = `http://127.0.0.1:${port}/estaciona`;
let nextProcess = null;

function serverIsReady() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/estaciona`, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 400));
    });
    request.setTimeout(500, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function startNext() {
  const nextBinary = path.join(projectRoot, "node_modules", ".bin", "next");
  const command = process.platform === "win32" ? `${nextBinary}.cmd` : nextBinary;
  const mode = app.isPackaged ? "start" : "dev";
  nextProcess = spawn(command, [mode, "-H", "127.0.0.1", "-p", String(port)], {
    cwd: projectRoot,
    env: { ...process.env, BROWSER: "none" },
    stdio: "ignore",
  });
  nextProcess.on("error", (error) => console.error("Unable to start local UI", error));
}

async function waitForNext(timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await serverIsReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function createWindow() {
  if (!(await serverIsReady())) startNext();
  if (!(await waitForNext())) {
    throw new Error(`The local UI did not start on ${appUrl}`);
  }

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#f4f0e8",
    title: "BA Estaciona",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  await window.loadURL(appUrl);
}

app.whenReady().then(() => createWindow().catch((error) => {
  console.error(error);
  app.quit();
}));

app.on("window-all-closed", () => {
  if (nextProcess && !nextProcess.killed) nextProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess && !nextProcess.killed) nextProcess.kill();
});
