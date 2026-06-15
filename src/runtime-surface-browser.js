import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientSource = fs.readFileSync(path.join(here, "runtime-surface-browser-client.js"), "utf8");

function jsonScriptValue(value) {
  return JSON.stringify(value ?? null).replace(/</g, "\\u003c");
}

export function surfaceBrowserClientConfig(surface) {
  const props = surface?.props && typeof surface.props === "object" ? surface.props : {};
  const href = typeof props.clientRuntimeConfigHref === "string" && props.clientRuntimeConfigHref.trim()
    ? props.clientRuntimeConfigHref.trim()
    : "";
  return href ? { configHref: href } : null;
}

export function renderSurfaceBrowserRuntime(clientConfig = null) {
  return `const desireSurfaceClientConfig = ${jsonScriptValue(clientConfig)};\n${clientSource}`;
}
