"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const OPERATOR_WORKBENCH_IPC_CHANNELS = Object.freeze({
  getSnapshot: "witness:operator-workbench:get-snapshot",
  runCommand: "witness:operator-workbench:run-command",
  dispatchIntent: "witness:operator-workbench:dispatch-intent",
  updateDisplaySettings: "witness:operator-workbench:update-display-settings",
  getAutocomplete: "witness:operator-workbench:get-autocomplete",
  windowControl: "witness:operator-workbench:window-control"
});

contextBridge.exposeInMainWorld("witnessOperatorWorkbench", Object.freeze({
  getSnapshot: () => ipcRenderer.invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.getSnapshot),
  runCommand: command => ipcRenderer.invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.runCommand, { command }),
  dispatchIntent: payload => ipcRenderer.invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.dispatchIntent, payload),
  updateDisplaySettings: payload => ipcRenderer.invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.updateDisplaySettings, payload),
  getAutocomplete: line => ipcRenderer.invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.getAutocomplete, { line }),
  windowControl: action => ipcRenderer.invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.windowControl, { action })
}));
