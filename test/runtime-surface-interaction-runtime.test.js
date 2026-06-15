import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createWorld } from "../src/kernel.js";
import { createProcessRuntime } from "../src/desire/process-eval.js";
import { readSurfaceMapFromWorld } from "../src/runtime-surface-shell.js";
import {
  buildSurfaceRuntimeManifest,
  createSurfaceInteractionRuntime,
  resolveSurfaceRuntimeBinding
} from "../src/runtime-surface-interaction-runtime.js";
import {
  requestProcessDefine,
  requestProjectionDefine,
  requestSurfaceDefine,
  requestTypeDefine
} from "../plugins/authoring-core/authoring-core-processes.js";

class FakeNode {
  constructor(id) {
    this.id = id;
    this.textContent = "";
    this.innerHTML = "";
    this.attributes = new Map();
    this.listeners = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
  }

  removeEventListener(name, listener) {
    this.listeners.get(name)?.delete(listener);
  }

  dispatch(name, event = {}) {
    const listeners = [...(this.listeners.get(name) ?? [])];
    for (const listener of listeners) {
      listener({
        preventDefault() {},
        target: this,
        ...event
      });
    }
  }
}

function interactiveWorld() {
  const world = createWorld();
  assert.equal(requestTypeDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "ReplayTitle", role: "state", valueType: "text", initial: "Interactive replay" }
  }).ok, true);
  assert.equal(requestTypeDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "ReplayOpen", role: "state", valueType: "bool", initial: false }
  }).ok, true);
  assert.equal(requestProcessDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "ReplayFlow", state: ["ReplayTitle", "ReplayOpen"], handles: [], emits: [], rules: [] }
  }).ok, true);
  assert.equal(requestProjectionDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "ReplayClosed", projectionKind: "bool_not", source: "ReplayOpen", props: {} }
  }).ok, true);
  assert.equal(requestSurfaceDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: [
      {
        id: "ReplayRoot",
        surfaceKind: "app-root",
        children: ["ReplayLogin"],
        props: { brandName: "DESIRE", productName: "Replay" }
      },
      {
        id: "ReplayLogin",
        surfaceKind: "auth-screen",
        processRef: "ReplayFlow",
        projectionRefs: ["ReplayClosed"],
        bindings: [
          { prop: "title", source: { kind: "state", state: "ReplayTitle" } },
          { prop: "subtitle", source: { kind: "projection", projection: "ReplayClosed" } }
        ],
        interactions: [
          { target: "primaryAction", event: "click", action: { kind: "setState", state: "ReplayOpen", value: { kind: "toggleState", state: "ReplayOpen" } } }
        ],
        props: {
          domId: "replay-login",
          routeKey: "login",
          title: "Static fallback",
          subtitle: "Static subtitle",
          primaryActionLabel: "Toggle"
        }
      }
    ]
  }).ok, true);
  return world;
}

test("resolveSurfaceRuntimeBinding inherits process ownership through the active surface tree", () => {
  const manifest = {
    surfaces: [
      { id: "root", parentId: null, runtime: { processRef: "RootFlow", projectionRefs: [], capabilityRefs: [] } },
      { id: "child", parentId: "root", runtime: { processRef: null, projectionRefs: ["ChildProjection"], capabilityRefs: ["plugin.chart-runtime"] } }
    ]
  };
  const binding = resolveSurfaceRuntimeBinding(manifest, "child");
  assert.equal(binding.processRef, "RootFlow");
  assert.deepEqual(binding.projectionRefs, ["ChildProjection"]);
  assert.deepEqual(binding.capabilityRefs, ["plugin.chart-runtime"]);
});

test("canonical surface interaction runtime patches authored bindings and recomputes projections after interaction", () => {
  const world = interactiveWorld();
  const surfaces = readSurfaceMapFromWorld(world);
  const root = surfaces.get("ReplayRoot");
  const activeSurface = surfaces.get("ReplayLogin");
  const manifest = buildSurfaceRuntimeManifest({
    world,
    root,
    activeSurface,
    surfaces,
    browserRuntimeCapabilities: [],
    rootSurfaceId: "ReplayRoot",
    requestPathname: "/replay"
  });
  assert.ok(manifest);

  const documentNodes = new Map([
    ["replay-login__title", new FakeNode("replay-login__title")],
    ["replay-login__subtitle", new FakeNode("replay-login__subtitle")],
    ["replay-login__primaryAction", new FakeNode("replay-login__primaryAction")],
    ["replay-login__primaryLabel", new FakeNode("replay-login__primaryLabel")]
  ]);
  const document = {
    readyState: "complete",
    getElementById(id) {
      return documentNodes.get(id) ?? null;
    }
  };
  const runtime = createSurfaceInteractionRuntime({
    document,
    window: { console },
    manifest,
    createProcessRuntimeImpl: createProcessRuntime
  });

  assert.equal(documentNodes.get("replay-login__title").innerHTML, "Interactive replay");
  assert.equal(documentNodes.get("replay-login__subtitle").innerHTML, "true");

  documentNodes.get("replay-login__primaryAction").dispatch("click");
  assert.equal(runtime.processRuntime.value("ReplayOpen"), true);
  assert.equal(documentNodes.get("replay-login__subtitle").innerHTML, "false");

  runtime.destroy();
});

test("runtime-surface-shell stays a host and does not import process execution directly", async () => {
  const source = await readFile(new URL("../src/runtime-surface-shell.js", import.meta.url), "utf8");
  assert.equal(source.includes("process-eval"), false);
  assert.equal(source.includes("createProcessRuntime("), false);
  assert.equal(source.includes("patchSurfaceDom("), false);
});
