"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const DESKTOP_IPC_CHANNELS = Object.freeze({
  openWorldHome: "witness:desktop:open-world-home",
  createWorldHome: "witness:desktop:create-world-home",
  revealWorldHome: "witness:desktop:reveal-world-home",
  getDesktopShellState: "witness:desktop:get-state"
});

const OPERATOR_WORKBENCH_IPC_CHANNELS = Object.freeze({
  getSnapshot: "witness:operator-workbench:get-snapshot",
  runCommand: "witness:operator-workbench:run-command",
  dispatchIntent: "witness:operator-workbench:dispatch-intent",
  updateDisplaySettings: "witness:operator-workbench:update-display-settings",
  getAutocomplete: "witness:operator-workbench:get-autocomplete"
});

contextBridge.exposeInMainWorld("witnessDesktop", Object.freeze({
  openWorldHome: request => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openWorldHome, request),
  createWorldHome: request => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.createWorldHome, request),
  revealWorldHome: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.revealWorldHome),
  getDesktopShellState: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getDesktopShellState)
}));

contextBridge.exposeInMainWorld("witnessOperatorWorkbench", Object.freeze({
  getSnapshot: () => ipcRenderer.invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.getSnapshot),
  runCommand: command => ipcRenderer.invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.runCommand, { command }),
  dispatchIntent: payload => ipcRenderer.invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.dispatchIntent, payload),
  updateDisplaySettings: payload => ipcRenderer.invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.updateDisplaySettings, payload),
  getAutocomplete: line => ipcRenderer.invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.getAutocomplete, { line })
}));
