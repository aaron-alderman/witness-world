import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  refreshDesktopLauncherState,
  renderDesktopLauncherRuntimeFactory,
  renderDesktopLauncherState,
  setDesktopLauncherStatus,
  startDesktopLauncherRuntime
} from "./desktop-launcher-runtime.js";

function createFakeElement(tagName = "div") {
  return {
    tagName: String(tagName).toUpperCase(),
    textContent: "",
    listeners: new Map(),
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };
}

function createLauncherDocument() {
  const elements = new Map([
    ["launcher-status", createFakeElement("div")],
    ["launcher-profile", createFakeElement("div")],
    ["launcher-runtime-status", createFakeElement("div")],
    ["launcher-summary", createFakeElement("p")],
    ["recent-worlds", createFakeElement("section")],
    ["open-existing-world", createFakeElement("button")],
    ["create-new-world", createFakeElement("button")]
  ]);
  return {
    elements,
    getElementById(id) {
      return elements.get(id) || null;
    }
  };
}

test("desktop launcher runtime renders shared shell state and recent worlds through explicit helpers", () => {
  const documentTarget = createLauncherDocument();
  const rendered = [];
  const statuses = [];

  renderDesktopLauncherState({
    state: {
      runtimeProfile: "authoring",
      runtimeStatus: "ready",
      launcherRequired: false,
      recentWorldHomes: ["C:/worlds/demo"]
    },
    initialMessage: "hello",
    documentTarget,
    renderDesktopRecentWorlds: payload => rendered.push(payload),
    setStatus: text => statuses.push(text)
  });

  assert.equal(documentTarget.getElementById("launcher-profile").textContent, "authoring");
  assert.equal(documentTarget.getElementById("launcher-runtime-status").textContent, "ready");
  assert.equal(documentTarget.getElementById("launcher-summary").textContent, "Desktop runtime is already active.");
  assert.deepEqual(rendered, [{
    root: documentTarget.getElementById("recent-worlds"),
    rows: ["C:/worlds/demo"],
    document: documentTarget
  }]);
  assert.deepEqual(statuses, ["hello"]);
});

test("desktop launcher runtime refresh helper preserves the desktop-bridge contract", async () => {
  const seen = [];
  const state = { runtimeProfile: "full" };
  const result = await refreshDesktopLauncherState({
    desktop: {
      async getDesktopShellState() {
        return state;
      }
    },
    render: next => seen.push(next)
  });

  assert.equal(result, state);
  assert.deepEqual(seen, [state]);
});

test("desktop launcher runtime boot binds launcher actions, recent worlds, and initial refresh", async () => {
  const documentTarget = createLauncherDocument();
  const actionBindings = [];
  const recentBindings = [];
  const rendered = [];
  const desktopState = {
    runtimeProfile: "full",
    runtimeStatus: "idle",
    launcherRequired: true,
    recentWorldHomes: ["C:/worlds/demo", "C:/worlds/second"]
  };

  const runtime = startDesktopLauncherRuntime({
    windowTarget: {
      witnessDesktop: {
        async getDesktopShellState() {
          return desktopState;
        }
      }
    },
    documentTarget,
    initialMessage: "queued",
    bindDesktopLauncherAction: payload => {
      actionBindings.push(payload);
      return payload;
    },
    bindDesktopRecentWorlds: payload => {
      recentBindings.push(payload);
      return payload;
    },
    renderDesktopRecentWorlds: payload => rendered.push(payload)
  });

  await runtime.started;

  assert.equal(actionBindings.length, 2);
  assert.deepEqual(actionBindings.map(binding => binding.action), ["openWorldHome", "createWorldHome"]);
  assert.equal(actionBindings[0].button, documentTarget.getElementById("open-existing-world"));
  assert.equal(actionBindings[1].button, documentTarget.getElementById("create-new-world"));
  assert.equal(recentBindings.length, 1);
  assert.equal(recentBindings[0].root, documentTarget.getElementById("recent-worlds"));
  assert.equal(typeof recentBindings[0].refresh, "function");
  assert.deepEqual(rendered, [{
    root: documentTarget.getElementById("recent-worlds"),
    rows: desktopState.recentWorldHomes,
    document: documentTarget
  }]);
  assert.equal(documentTarget.getElementById("launcher-profile").textContent, "full");
  assert.equal(documentTarget.getElementById("launcher-runtime-status").textContent, "idle");
  assert.equal(documentTarget.getElementById("launcher-summary").textContent, "Open or create a named WORLD_HOME before entering the app.");
  assert.equal(runtime.getState(), desktopState);
});

test("desktop launcher runtime reports a clear status when the desktop bridge is unavailable", async () => {
  const documentTarget = createLauncherDocument();
  const runtime = startDesktopLauncherRuntime({
    windowTarget: {},
    documentTarget
  });

  await runtime.started;
  assert.equal(documentTarget.getElementById("launcher-status").textContent, "Desktop bridge unavailable. Restart the desktop shell.");
});

test("desktop launcher runtime factory and page source expose the shared boot seam", async () => {
  const factory = renderDesktopLauncherRuntimeFactory();
  const pageSource = await readFile(new URL("./desktop-launcher-page.js", import.meta.url), "utf8");

  assert.equal(factory.includes("const startDesktopLauncherRuntime ="), true);
  assert.equal(factory.includes("const refreshDesktopLauncherState ="), true);
  assert.equal(pageSource.includes('from "./desktop-launcher-runtime.js"'), true);
  assert.equal(pageSource.includes("renderDesktopLauncherRuntimeFactory()"), true);
  assert.equal(pageSource.includes("startDesktopLauncherRuntime({"), true);
  assert.equal(pageSource.includes("const render = () => {"), false);
  assert.equal(pageSource.includes("const refresh = async () => {"), false);
  assert.equal(pageSource.includes("bindDesktopRecentWorlds({"), false);
  assert.equal(pageSource.includes("bindDesktopLauncherAction({"), false);
});

test("desktop launcher runtime status helper writes directly to the shared shell status node", () => {
  const documentTarget = createLauncherDocument();
  setDesktopLauncherStatus({
    documentTarget,
    text: "busy"
  });
  assert.equal(documentTarget.getElementById("launcher-status").textContent, "busy");
});
