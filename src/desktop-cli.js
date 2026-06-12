import path from "node:path";
import { spawn } from "node:child_process";

function normalizeElectronBinary(moduleValue) {
  if (typeof moduleValue === "string" && moduleValue.trim()) return moduleValue;
  if (typeof moduleValue?.default === "string" && moduleValue.default.trim()) return moduleValue.default;
  return null;
}

async function loadElectronBinary(loadElectronModule = () => import("electron")) {
  try {
    const moduleValue = await loadElectronModule();
    const binary = normalizeElectronBinary(moduleValue);
    if (binary) return binary;
  } catch (error) {
    const wrapped = new Error(`Electron is not installed. Install dependencies before running the desktop shell. (${error instanceof Error ? error.message : String(error)})`);
    wrapped.code = "ELECTRON_UNAVAILABLE";
    throw wrapped;
  }
  const error = new Error("Electron is not installed. Install dependencies before running the desktop shell.");
  error.code = "ELECTRON_UNAVAILABLE";
  throw error;
}

export async function launchDesktopProcess({
  args = [],
  cwd = process.cwd(),
  env = process.env,
  spawnImpl = spawn,
  loadElectronModule = () => import("electron"),
  entryScript = path.resolve(process.cwd(), "src", "desktop-main.js")
} = {}) {
  const electronBinary = await loadElectronBinary(loadElectronModule);
  return new Promise((resolve, reject) => {
    const child = spawnImpl(electronBinary, [entryScript, ...args], {
      cwd,
      env,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 0));
  });
}
