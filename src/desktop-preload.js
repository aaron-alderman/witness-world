import { createWitnessDesktopApi } from "./desktop-bridge.js";
import { createWitnessOperatorWorkbenchApi } from "./operator-workbench/bridge.js";

const { contextBridge, ipcRenderer } = await import("electron");

contextBridge.exposeInMainWorld("witnessDesktop", createWitnessDesktopApi({
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload)
}));

contextBridge.exposeInMainWorld("witnessOperatorWorkbench", createWitnessOperatorWorkbenchApi({
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload)
}));
