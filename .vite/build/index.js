"use strict";
const { app, BrowserWindow } = require("electron");
const path = require("path");
const DownloadManager = require("./download");
const { setupDownloadHandlers } = require("./ipc/downloadHandlers");
const { setupMetadataHandlers } = require("./ipc/metadataHandlers");
app.commandLine.appendSwitch("disable-gpu-cache");
app.commandLine.appendSwitch("disable-software-rasterizer");
let mainWindow = null;
let downloadManager = null;
if (require("electron-squirrel-startup")) {
  app.quit();
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Stow - YouTube Audio Downloader",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  });
  const { isPackaged } = app;
  if (!isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    const rendererPath = path.join(__dirname, "..", "renderer", "main_window", "index.html");
    mainWindow.loadFile(rendererPath);
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
app.whenReady().then(() => {
  downloadManager = new DownloadManager();
  setupDownloadHandlers(downloadManager);
  setupMetadataHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  if (downloadManager) {
    downloadManager.cancelAll();
  }
});
