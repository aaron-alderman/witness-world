import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyWitnessToml } from "../../src/dsl.js";
import { createWorld } from "../../src/kernel.js";
import { serializeRuntimePageJson } from "../../src/runtime-page-state.js";
import { ensureRuntimeBuiltins } from "../../src/runtime-builtins.js";
import { renderRuntimeWidgetPage } from "../../src/runtime-widget-page.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bootstrapWtomlSourceCache = new Map();

export function renderBootstrapJsonForScript(value) {
  return serializeRuntimePageJson(value);
}

export function bootstrapWtomlSource(fileName) {
  if (bootstrapWtomlSourceCache.has(fileName)) return bootstrapWtomlSourceCache.get(fileName);
  const source = fs.readFileSync(path.join(__dirname, fileName), "utf8");
  bootstrapWtomlSourceCache.set(fileName, source);
  return source;
}

export function extractBootstrapBodyInner(html) {
  const match = String(html ?? "").match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1] : String(html ?? "");
}

export function replaceBootstrapSectionSlot(html, domId, content) {
  const escaped = String(domId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(html ?? "").replace(new RegExp(`(<section[^>]*id="${escaped}"[^>]*>)([\\s\\S]*?)(</section>)`, "i"), `$1${content}$3`);
}

export function replaceBootstrapWholeSection(html, domId, content) {
  const escaped = String(domId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(html ?? "").replace(new RegExp(`<section[^>]*id="${escaped}"[^>]*>[\\s\\S]*?<\\/section>`, "i"), String(content ?? ""));
}

export function renderBootstrapAuthoredWidget({
  wtomlFile,
  rootWidget,
  frontendProgram = null,
  frontendProgramScriptId = null,
  initialStateScriptId = null,
  initialStateInto = null
} = {}) {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapWtomlSource(wtomlFile));
  return extractBootstrapBodyInner(renderRuntimeWidgetPage(world, {
    actor: "frontendHost",
    rootWidget,
    ...(frontendProgram ? { frontendProgram } : {}),
    appConfig: {
      traceProcessEvents: false,
      ...(frontendProgramScriptId ? { frontendProgramScriptId } : {}),
      ...(initialStateScriptId ? { initialStateScriptId } : {}),
      ...(initialStateInto ? { initialStateInto } : {})
    }
  }));
}

export function renderBootstrapAuthoredSlot({
  wtomlFile,
  rootWidget,
  frontendProgram = null,
  frontendProgramScriptId = null,
  initialStateScriptId = null,
  initialStateInto = null,
  initialState = null,
  replacementSlotDomId = null,
  replacementHtml = null
} = {}) {
  let html = renderBootstrapAuthoredWidget({
    wtomlFile,
    rootWidget,
    frontendProgram,
    frontendProgramScriptId,
    initialStateScriptId,
    initialStateInto
  });
  if (initialStateScriptId && initialState !== undefined && initialState !== null) {
    html = `<script type="application/json" id="${initialStateScriptId}">${renderBootstrapJsonForScript(initialState)}</script>${html}`;
  }
  if (replacementSlotDomId && typeof replacementHtml === "string") {
    html = replaceBootstrapSectionSlot(html, replacementSlotDomId, replacementHtml);
  }
  return html;
}
