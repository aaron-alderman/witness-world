import assert from "node:assert/strict";
import test from "node:test";
import { createSurfaceInteractionRuntime } from "../src/runtime-surface-interaction-runtime.js";
import { createProcessRuntime } from "../src/desire/process-eval.js";

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test("surface preload boot warms capability assets once and records completed preload tasks", async () => {
  const appended = [];
  const nodes = new Map();
  const rootNode = {
    id: "surface-home",
    parentNode: { nodeType: 1 },
    addEventListener() {},
    removeEventListener() {},
    matches() { return false; },
    querySelectorAll() { return []; }
  };
  nodes.set(rootNode.id, rootNode);
  const runtimeWindow = {
    location: { pathname: "/home", href: "http://127.0.0.1:3000/home", hostname: "127.0.0.1" },
    history: { pushState() {}, replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    console: { error() {} }
  };
  const head = {
    appendChild(node) {
      appended.push(node);
      if (node.tagName === "SCRIPT" && node.textContent) {
        const run = new Function("window", node.textContent);
        run(runtimeWindow);
      }
      queueMicrotask(() => node.dispatchEvent?.({ type: "load" }));
      return node;
    }
  };

  const runtime = createSurfaceInteractionRuntime({
    document: {
      head,
      body: rootNode,
      getElementById(id) {
        return nodes.get(id) ?? null;
      },
      querySelector() {
        return null;
      },
      createElement(tagName) {
        return {
          tagName: String(tagName).toUpperCase(),
          addEventListener(eventName, listener) {
            this[`on${eventName}`] = listener;
          },
          removeEventListener() {},
          dispatchEvent(event) {
            this[`on${event.type}`]?.(event);
          },
          setAttribute(name, value) {
            this[name] = value;
          }
        };
      }
    },
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Home",
      routeState: { process: "ShellNavigation", state: "ActiveRoute" },
      routeTargets: [{ key: "home", path: "/home", surfaceId: "Surface.Home" }],
      preloadPolicies: [{
        id: "chart_boot",
        when: { kind: "boot" },
        targets: [{ kind: "capability", capability: "chart.render", load: ["assets"] }]
      }],
      capabilityPreloadAssets: {
        "chart.render": {
          scriptBodies: ["window.__chartWarmCount = (window.__chartWarmCount || 0) + 1;"]
        }
      },
      surfaces: [{
        id: "Surface.Home",
        runtime: {
          processRef: "ShellNavigation",
          projectionRefs: [],
          capabilityRefs: [],
          bindings: [],
          interactions: []
        },
        view: {
          rootId: "surface-home",
          propTargets: {},
          interactionTargets: {}
        }
      }],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "home" } },
        { process: "desire.defineProcess", body: { id: "ShellNavigation", state: ["ActiveRoute"], handles: [], emits: [], rules: [] } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await runtime.whenSettled();
  await wait(30);
  await runtime.refresh();
  await wait(30);

  assert.equal(runtimeWindow.__chartWarmCount, 1);
  assert.equal(runtime.preloadTasks.some(task => task.key === "capability:chart.render:assets" && task.status === "completed"), true);
  runtime.destroy();
});

test("surface preload idle route warm caches the route manifest and warms its capability assets without swapping DOM", async () => {
  const nodes = new Map();
  const rootNode = {
    id: "surface-home",
    parentNode: { nodeType: 1 },
    addEventListener() {},
    removeEventListener() {},
    matches() { return false; },
    querySelectorAll() { return []; },
    replaceWith() {
      throw new Error("idle preload must not swap the active route DOM");
    }
  };
  nodes.set(rootNode.id, rootNode);
  class FakeDomParser {
    parseFromString(html) {
      const manifestMatch = String(html).match(/<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/i);
      const manifest = manifestMatch ? JSON.parse(manifestMatch[1]) : null;
      return {
        getElementById(id) {
          if (id === "surface-runtime-manifest" && manifest) return { textContent: JSON.stringify(manifest) };
          if (id === "surface-goodman") return { outerHTML: '<main id="surface-goodman"></main>' };
          return null;
        },
        body: {
          firstElementChild: { outerHTML: '<main id="surface-goodman"></main>' }
        }
      };
    }
  }
  const runtimeWindow = {
    location: { pathname: "/home", href: "http://127.0.0.1:3000/home", hostname: "127.0.0.1" },
    history: { pushState() {}, replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    DOMParser: FakeDomParser,
    console: { error() {} },
    async fetch(path) {
      assert.equal(path, "/goodman");
      return {
        ok: true,
        async text() {
          return `<html><body><main id="surface-goodman"></main><script type="application/json" id="surface-runtime-manifest">${JSON.stringify({
            activeSurfaceId: "Surface.Goodman",
            routeTargets: [
              { key: "home", path: "/home", surfaceId: "Surface.Home" },
              { key: "goodman", path: "/goodman", surfaceId: "Surface.Goodman" }
            ],
            capabilityAssets: {
              scriptBodies: ["window.__goodmanWarmCount = (window.__goodmanWarmCount || 0) + 1;"]
            },
            surfaces: [{
              id: "Surface.Goodman",
              runtime: {
                processRef: "ShellNavigation",
                projectionRefs: [],
                capabilityRefs: ["chart.render"],
                bindings: [],
                interactions: []
              },
              view: {
                rootId: "surface-goodman",
                propTargets: {},
                interactionTargets: {}
              }
            }],
            processWitnesses: [
              { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "goodman" } },
              { process: "desire.defineProcess", body: { id: "ShellNavigation", state: ["ActiveRoute"], handles: [], emits: [], rules: [] } }
            ]
          })}</script></body></html>`;
        }
      };
    }
  };
  const head = {
    appendChild(node) {
      if (node.tagName === "SCRIPT" && node.textContent) {
        const run = new Function("window", node.textContent);
        run(runtimeWindow);
      }
      queueMicrotask(() => node.dispatchEvent?.({ type: "load" }));
      return node;
    }
  };
  const manifest = {
    activeSurfaceId: "Surface.Home",
    routeState: { process: "ShellNavigation", state: "ActiveRoute" },
    routeTargets: [
      { key: "home", path: "/home", surfaceId: "Surface.Home" },
      { key: "goodman", path: "/goodman", surfaceId: "Surface.Goodman" }
    ],
    preloadPolicies: [{
      id: "goodman_idle",
      when: { kind: "idleAfterRoute", route: "home", delayMs: 10 },
      targets: [{ kind: "route", route: "goodman", load: ["manifest", "capabilityAssets"] }]
    }],
    surfaces: [{
      id: "Surface.Home",
      runtime: {
        processRef: "ShellNavigation",
        projectionRefs: [],
        capabilityRefs: [],
        bindings: [],
        interactions: []
      },
      view: {
        rootId: "surface-home",
        propTargets: {},
        interactionTargets: {}
      }
    }],
    processWitnesses: [
      { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "home" } },
      { process: "desire.defineProcess", body: { id: "ShellNavigation", state: ["ActiveRoute"], handles: [], emits: [], rules: [] } }
    ]
  };

  const runtime = createSurfaceInteractionRuntime({
    document: {
      head,
      body: rootNode,
      getElementById(id) {
        return nodes.get(id) ?? null;
      },
      querySelector() {
        return null;
      },
      createElement(tagName) {
        if (tagName === "template") {
          return {
            content: { firstElementChild: null },
            set innerHTML(value) {
              this.content.firstElementChild = { id: String(value).match(/id="([^"]+)"/)?.[1] ?? "surface-goodman" };
            }
          };
        }
        return {
          tagName: String(tagName).toUpperCase(),
          addEventListener(eventName, listener) {
            this[`on${eventName}`] = listener;
          },
          removeEventListener() {},
          dispatchEvent(event) {
            this[`on${event.type}`]?.(event);
          },
          setAttribute(name, value) {
            this[name] = value;
          }
        };
      }
    },
    window: runtimeWindow,
    manifest,
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await runtime.whenSettled();
  await wait(40);

  assert.equal(runtimeWindow.__goodmanWarmCount, 1);
  assert.ok(manifest.__routeSurfacePageCache?.goodman?.manifest);
  assert.equal(runtime.preloadTasks.some(task => task.key === "route:goodman:manifest" && task.status === "completed"), true);
  assert.equal(runtime.preloadTasks.some(task => task.key === "route:goodman:capabilityAssets" && task.status === "completed"), true);
  runtime.destroy();
});
