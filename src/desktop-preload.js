import { createWitnessDesktopApi } from "./desktop-bridge.js";

const { contextBridge, ipcRenderer } = await import("electron");

contextBridge.exposeInMainWorld("witnessDesktop", createWitnessDesktopApi({
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload)
}));
