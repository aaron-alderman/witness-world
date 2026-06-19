import assert from "node:assert/strict";
import test from "node:test";
import {
  createSurfaceRuntimeProbe,
  createSurfaceRuntimeIssueLedger,
  summarizeExecutionBlockers,
  surfaceDiagnosticsOverlayEnabled
} from "../src/runtime-surface-diagnostics.js";
import { createExecutionRunner } from "../src/runtime-execution-runner.js";

function createOverlayTestDocument() {
  class FakeNode {
    constructor(tagName, ownerDocument) {
      this.tagName = String(tagName || "div").toUpperCase();
      this.ownerDocument = ownerDocument;
      this.children = [];
      this.parentNode = null;
      this.attributes = new Map();
      this.style = {};
      this.hidden = false;
      this.textContent = "";
      this.innerHTML = "";
      this.className = "";
      this.id = "";
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    setAttribute(name, value) {
      const key = String(name);
      const text = String(value);
      this.attributes.set(key, text);
      if (key === "id") this.id = text;
      if (key === "class") this.className = text;
    }

    getAttribute(name) {
      return this.attributes.get(String(name)) ?? null;
    }

    matches(selector) {
      if (selector === "[data-surface-id]") return this.attributes.has("data-surface-id");
      const surfaceIdMatch = String(selector).match(/^\[data-surface-id="(.+)"\]$/);
      if (surfaceIdMatch) return this.getAttribute("data-surface-id") === surfaceIdMatch[1];
      return false;
    }

    querySelectorAll(selector) {
      const matches = [];
      const walk = node => {
        for (const child of node.children) {
          if (child.matches(selector)) matches.push(child);
          walk(child);
        }
      };
      walk(this);
      return matches;
    }
  }

  const walk = node => [node, ...node.children.flatMap(child => walk(child))];
  const document = {
    head: null,
    body: null,
    createElement(tagName) {
      return new FakeNode(tagName, document);
    },
    getElementById(id) {
      const target = String(id);
      return [...walk(document.head), ...walk(document.body)].find(node => node.id === target) ?? null;
    },
    querySelectorAll(selector) {
      return [...document.head.querySelectorAll(selector), ...document.body.querySelectorAll(selector)];
    }
  };
  document.head = new FakeNode("head", document);
  document.body = new FakeNode("body", document);
  return document;
}

test("createSurfaceRuntimeIssueLedger dedupes by id and preserves resolution state", () => {
  const ledger = createSurfaceRuntimeIssueLedger();

  ledger.upsert({
    id: "surface-runtime:test",
    severity: "warning",
    message: "first"
  });
  ledger.upsert({
    id: "surface-runtime:test",
    severity: "error",
    message: "second"
  });
  ledger.resolve("surface-runtime:test", { details: "done" });

  const issues = ledger.list();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "error");
  assert.equal(issues[0].status, "resolved");
  assert.equal(issues[0].details, "done");
});

test("summarizeExecutionBlockers groups pending tasks by runtime class", () => {
  const summary = summarizeExecutionBlockers({
    settled: false,
    activeTaskCount: 5,
    pendingByKind: {
      "process.delay": 1,
      "route-swap": 1,
      "capability-assets": 2,
      "runtime-bridge": 1,
      reconcile: 3
    }
  });

  assert.deepEqual(summary, {
    settled: false,
    activeTaskCount: 5,
    process: 1,
    route: 1,
    capability: 2,
    bridge: 1,
    reconcile: 3
  });
});

test("surfaceDiagnosticsOverlayEnabled respects explicit query override", () => {
  assert.equal(surfaceDiagnosticsOverlayEnabled({
    location: { href: "http://example.com/?surfaceDiagnostics=1", hostname: "example.com" }
  }), true);
  assert.equal(surfaceDiagnosticsOverlayEnabled({
    location: { href: "http://localhost/?surfaceDiagnostics=0", hostname: "localhost" }
  }), false);
});

test("createSurfaceRuntimeProbe waits for capability boot tasks before surfacing controller and output gaps", async () => {
  const document = createOverlayTestDocument();
  const wrapper = document.createElement("section");
  wrapper.setAttribute("id", "surface-chart-wrap");
  const mount = document.createElement("div");
  mount.setAttribute("id", "surface-chart");
  mount.setAttribute("data-surface-id", "Surface.Chart");
  const readout = document.createElement("div");
  readout.setAttribute("id", "surface-readout");
  wrapper.appendChild(mount);
  wrapper.appendChild(readout);
  document.body.appendChild(wrapper);

  const manifest = {
    activeSurfaceId: "Surface.Wrap",
    browserRuntimeCapabilities: ["chart.render"],
    capabilityAssets: null,
    surfaces: [
      {
        id: "Surface.Wrap",
        children: ["Surface.Chart", "Surface.Readout"],
        runtime: {
          processRef: "ShellNavigation",
          projectionRefs: [],
          capabilityRefs: ["chart.render"],
          bindings: [],
          interactions: []
        },
        view: {
          rootId: "surface-chart-wrap",
          propTargets: {},
          interactionTargets: {}
        }
      },
      {
        id: "Surface.Chart",
        parentId: "Surface.Wrap",
        runtime: {
          processRef: null,
          projectionRefs: [],
          capabilityRefs: ["chart.render"],
          bindings: [],
          interactions: []
        },
        view: {
          rootId: "surface-chart",
          propTargets: {},
          interactionTargets: {}
        }
      },
      {
        id: "Surface.Readout",
        parentId: "Surface.Wrap",
        runtime: {
          processRef: "ShellNavigation",
          projectionRefs: [],
          capabilityRefs: [],
          bindings: [
            {
              prop: "text",
              source: { kind: "capability", surface: "Surface.Chart", output: "valueText" }
            }
          ],
          interactions: []
        },
        view: {
          rootId: "surface-readout",
          propTargets: { text: [{ id: "surface-readout", mode: "text" }] },
          interactionTargets: {}
        }
      }
    ]
  };
  const surfaceById = new Map(manifest.surfaces.map(surface => [surface.id, surface]));
  const processRuntime = {
    value() {
      return undefined;
    },
    snapshot() {
      return {};
    },
    derives() {
      return {};
    }
  };
  const executionRunner = createExecutionRunner();
  let releaseCapabilityAssets = null;
  const pendingCapabilityAssets = executionRunner.track(
    "capability-assets",
    () => new Promise(resolve => {
      releaseCapabilityAssets = resolve;
    })
  );
  await Promise.resolve();

  const pendingProbe = createSurfaceRuntimeProbe({
    document,
    window: { location: { pathname: "/chart" } },
    manifest,
    surfaceById,
    activeSurfaceId: "Surface.Wrap",
    processRuntime,
    executionRunner
  });
  assert.equal(pendingProbe.missingCapabilityControllers.some(entry => entry.surfaceId === "Surface.Chart"), false);
  assert.equal(pendingProbe.missingCapabilityOutputs.some(entry => entry.surfaceId === "Surface.Readout"), false);

  releaseCapabilityAssets();
  await pendingCapabilityAssets;

  const settledProbe = createSurfaceRuntimeProbe({
    document,
    window: { location: { pathname: "/chart" } },
    manifest,
    surfaceById,
    activeSurfaceId: "Surface.Wrap",
    processRuntime,
    executionRunner
  });
  assert.equal(settledProbe.missingCapabilityControllers.some(entry => entry.surfaceId === "Surface.Chart"), true);
  assert.equal(settledProbe.missingCapabilityOutputs.some(entry => entry.surfaceId === "Surface.Readout"), true);
});
