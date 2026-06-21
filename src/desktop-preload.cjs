"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const DESKTOP_IPC_CHANNELS = Object.freeze({
  openWorldHome: "witness:desktop:open-world-home",
  createWorldHome: "witness:desktop:create-world-home",
  revealWorldHome: "witness:desktop:reveal-world-home",
  getDesktopShellState: "witness:desktop:get-state"
});

contextBridge.exposeInMainWorld("witnessDesktop", Object.freeze({
  openWorldHome: request => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openWorldHome, request),
  createWorldHome: request => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.createWorldHome, request),
  revealWorldHome: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.revealWorldHome),
  getDesktopShellState: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getDesktopShellState)
}));
