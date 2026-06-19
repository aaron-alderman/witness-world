import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSurfaceRuntimeManifest,
  createSurfaceInteractionRuntime,
  describeSurfaceRuntimeView
} from "../src/runtime-surface-interaction-runtime.js";
import { createProcessRuntime } from "../src/desire/process-eval.js";

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
      this.eventListeners = new Map();
      this.id = "";
      this.type = "";
    }

    appendChild(child) {
      const nextChild = child?.firstElementChild && !child?.tagName ? child.firstElementChild : child;
      nextChild.parentNode = this;
      this.children.push(nextChild);
      return nextChild;
    }

    insertBefore(child, beforeChild) {
      const nextChild = child?.firstElementChild && !child?.tagName ? child.firstElementChild : child;
      const index = this.children.indexOf(beforeChild);
      nextChild.parentNode = this;
      if (index < 0) this.children.push(nextChild);
      else this.children.splice(index, 0, nextChild);
      return nextChild;
    }

    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      child.parentNode = null;
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

    removeAttribute(name) {
      const key = String(name);
      this.attributes.delete(key);
      if (key === "id") this.id = "";
      if (key === "class") this.className = "";
    }

    addEventListener(eventName, listener) {
      this.eventListeners.set(eventName, listener);
    }

    removeEventListener(eventName) {
      this.eventListeners.delete(eventName);
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
    }
  };
  document.head = new FakeNode("head", document);
  document.body = new FakeNode("body", document);
  return document;
}

test("describeSurfaceRuntimeView stays generic by default", () => {
  const view = describeSurfaceRuntimeView({
    id: "Surface.Login",
    surfaceKind: "auth-screen",
    props: { domId: "surface-login" }
  });

  assert.equal(view.rootId, "surface-login");
  assert.deepEqual(view.propTargets, {
    className: [{ id: "surface-login", mode: "className", baseClass: "" }],
    text: [{ id: "surface-login", mode: "text" }],
    style: [{ id: "surface-login", mode: "attribute", attr: "style" }],
    visible: [{ id: "surface-login", mode: "visibility" }],
    disabled: [{ id: "surface-login", mode: "disabled" }]
  });
  assert.deepEqual(view.interactionTargets, {
    self: [{ id: "surface-login" }]
  });
});

test("describeSurfaceRuntimeView targets authored form-control attributes by input id", () => {
  const view = describeSurfaceRuntimeView({
    id: "Surface.Slider",
    surfaceKind: "form-field",
    props: { inputId: "time-sl" }
  });

  assert.deepEqual(view.propTargets.value, [{ id: "time-sl", mode: "value" }]);
  assert.deepEqual(view.propTargets.min, [{ id: "time-sl", mode: "attribute", attr: "min" }]);
  assert.deepEqual(view.propTargets.max, [{ id: "time-sl", mode: "attribute", attr: "max" }]);
  assert.deepEqual(view.propTargets.step, [{ id: "time-sl", mode: "attribute", attr: "step" }]);
});

test("createSurfaceInteractionRuntime blocks honestly when interactive semantics lack generic target descriptors", () => {
  const logs = [];
  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById() {
        return null;
      }
    },
    window: {
      console: {
        error: (...args) => logs.push(args.join(" "))
      }
    },
    manifest: {
      surfaces: [
        {
          id: "Surface.Login",
          runtime: {
            processRef: "RouteProcess",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "navigate", href: "/next" }
              }
            ]
          },
          view: {
            rootId: "surface-login",
            propTargets: {},
            interactionTargets: {}
          }
        }
      ],
      processWitnesses: []
    },
    createProcessRuntimeImpl() {
      throw new Error("process runtime must not be created when descriptors are missing");
    }
  });

  assert.equal(runtime.processRuntime, null);
  assert.equal(runtime.blocked?.limitationType, "platform");
  assert.match(runtime.blocked?.missingPrimitive ?? "", /interaction target descriptors/i);
  assert.equal(logs.some(entry => /missing generic interaction target descriptors/i.test(entry)), true);
});

test("createSurfaceInteractionRuntime records blocked boot issues in the inspection ledger and shows the diagnostics overlay in dev", () => {
  const document = createOverlayTestDocument();
  const runtimeWindow = {
    location: {
      href: "http://127.0.0.1:3000/home",
      hostname: "127.0.0.1",
      pathname: "/home"
    },
    console: {
      error() {}
    }
  };

  createSurfaceInteractionRuntime({
    document,
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Login",
      surfaces: [
        {
          id: "Surface.Login",
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "navigate", href: "/next" }
              }
            ]
          },
          view: {
            rootId: "surface-login",
            propTargets: {},
            interactionTargets: {}
          }
        }
      ],
      processWitnesses: []
    },
    createProcessRuntimeImpl() {
      throw new Error("process runtime must not be created when descriptors are missing");
    }
  });

  assert.equal(Array.isArray(runtimeWindow.world.issues), true);
  assert.equal(runtimeWindow.world.issues.length, 1);
  assert.equal(runtimeWindow.world.issues[0].id, "surface-runtime:missing-interaction-target-descriptors");
  assert.equal(runtimeWindow.world.issues[0].phase, "boot");
  const overlayRoot = document.getElementById("sourcery-companion-root");
  const fab = document.getElementById("sourcery-companion-fab");
  assert.ok(overlayRoot);
  assert.ok(fab);
  assert.equal(overlayRoot.hidden, false);
  assert.equal(fab.textContent, "Issues 1");
  runtimeWindow.world.clearIssues();
  assert.equal(runtimeWindow.world.issues.length, 0);
  assert.equal(overlayRoot.hidden, true);
});

test("createSurfaceInteractionRuntime ignores inactive route subtree capability requirements", () => {
  const logs = [];
  const listeners = new Map();
  const nodes = new Map([
    ["login-button", {
      addEventListener(eventName, listener) {
        listeners.set(eventName, listener);
      },
      removeEventListener() {}
    }]
  ]);
  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById(id) {
        return nodes.get(id) ?? null;
      }
    },
    window: {
      location: {
        pathname: "/login"
      },
      history: {
        pushState() {}
      },
      console: {
        error: (...args) => logs.push(args.join(" "))
      }
    },
    manifest: {
      activeSurfaceId: "Surface.Login",
      surfaces: [
        {
          id: "Surface.Root",
          parentId: null,
          children: ["Surface.Login", "Surface.Chart"],
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: []
          },
          view: {
            rootId: "surface-root",
            propTargets: {},
            interactionTargets: {}
          }
        },
        {
          id: "Surface.Login",
          parentId: "Surface.Root",
          children: [],
          runtime: {
            processRef: null,
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: []
          },
          view: {
            rootId: "surface-login",
            propTargets: {},
            interactionTargets: {}
          }
        },
        {
          id: "Surface.Login.Action",
          parentId: "Surface.Login",
          runtime: {
            processRef: null,
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "deliver", message: "SignInRequested" }
              }
            ]
          },
          view: {
            rootId: "surface-login-action",
            propTargets: {},
            interactionTargets: {
              primary: [{ id: "login-button" }]
            }
          }
        },
        {
          id: "Surface.Chart",
          parentId: "Surface.Root",
          children: [],
          runtime: {
            processRef: null,
            projectionRefs: [],
            capabilityRefs: ["chart.render"],
            bindings: [],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "deliver", message: "ChartClicked" }
              }
            ]
          },
          view: {
            rootId: "surface-chart",
            propTargets: {},
            interactionTargets: {}
          }
        }
      ],
      processWitnesses: [
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: [],
          handles: ["SignInRequested"],
          emits: [],
          rules: []
        } },
        { process: "desire.defineMessage", body: { id: "SignInRequested", role: "event", writes: {} } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  assert.equal(runtime.blocked, undefined);
  assert.equal(logs.some(entry => /chart\.render/.test(entry)), false);
  assert.equal(listeners.has("click"), true);
});

test("createSurfaceInteractionRuntime renders and updates repeated select options from runtime collections", async () => {
  const createNode = ({ id, tagName }) => ({
    id,
    tagName,
    innerHTML: "",
    className: "",
    hidden: false,
    style: {},
    value: "",
    attributes: new Map(id ? [["id", id]] : []),
    addEventListener() {},
    removeEventListener() {},
    setAttribute(name, value) {
      this.attributes.set(String(name), String(value));
      if (String(name) === "id") this.id = String(value);
    },
    getAttribute(name) {
      return this.attributes.get(String(name)) ?? null;
    },
    removeAttribute(name) {
      this.attributes.delete(String(name));
    }
  });
  const nodes = new Map([
    ["surface-root", createNode({ id: "surface-root", tagName: "DIV" })],
    ["secret-select", createNode({ id: "secret-select", tagName: "SELECT" })]
  ]);
  const runtimeWindow = {
    location: {
      href: "http://127.0.0.1:3000/platform-config",
      hostname: "127.0.0.1",
      pathname: "/platform-config"
    },
    addEventListener() {},
    removeEventListener() {},
    console: { error() {} }
  };

  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById(id) {
        return nodes.get(String(id)) ?? null;
      }
    },
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Root",
      collections: [{ id: "PlatformConfigSecrets" }],
      templates: [{
        id: "SecretOptionTemplate",
        tag: "option",
        html: '<option value="${item.id}">${item.title}</option>'
      }],
      surfaces: [
        {
          id: "Surface.Root",
          children: ["SecretSelect"],
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: []
          },
          view: {
            rootId: "surface-root",
            propTargets: {},
            interactionTargets: {}
          }
        },
        {
          id: "SecretSelect",
          parentId: "Surface.Root",
          runtime: {
            processRef: null,
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: [],
            repeat: {
              collection: "PlatformConfigSecrets",
              template: "SecretOptionTemplate",
              itemAs: "item",
              indexAs: "index"
            }
          },
          view: {
            rootId: "secret-select",
            propTargets: {},
            interactionTargets: {}
          }
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "StatusText", role: "state", valueType: "text", initial: "idle" } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["StatusText"],
          handles: [],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await runtime.whenSettled();
  runtime.setCollection("PlatformConfigSecrets", [
    { id: "sec_1", title: "Primary password" },
    { id: "sec_2", title: "Reporting password" }
  ]);
  await runtime.refresh();

  assert.equal(runtime.getCollection("PlatformConfigSecrets").length, 2);
  assert.match(nodes.get("secret-select").innerHTML, /<option value="sec_1">Primary password<\/option>/);
  assert.match(nodes.get("secret-select").innerHTML, /<option value="sec_2">Reporting password<\/option>/);

  runtime.setCollection("PlatformConfigSecrets", [
    { id: "sec_3", title: "Rotated password" }
  ]);
  await runtime.refresh();

  assert.equal(nodes.get("secret-select").innerHTML, '<option value="sec_3">Rotated password</option>');
});

test("createSurfaceInteractionRuntime dispatches authored event rules and patches bound text", async () => {
  const listeners = new Map();
  const nodes = new Map([
    ["sign-in-button", {
      className: "",
      disabled: false,
      setAttribute(name, value) {
        this[name] = value;
      },
      removeAttribute(name) {
        if (name === "disabled") this.disabled = false;
        else delete this[name];
      },
      addEventListener(eventName, listener) {
        listeners.set(eventName, listener);
      },
      removeEventListener() {}
    }],
    ["status-label", {
      textContent: ""
    }]
  ]);
  const delayed = [];
  const pushed = [];
  const runtimeWindow = {
    location: {
      pathname: "/login"
    },
    history: {
      pushState(_state, _title, path) {
        pushed.push(path);
        this.lastPath = path;
        runtimeWindow.location.pathname = path;
      }
    },
    console: {
      error() {}
    }
  };
  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById(id) {
        return nodes.get(id) ?? null;
      }
    },
    window: runtimeWindow,
    manifest: {
      routeState: {
        process: "ShellNavigation",
        state: "ActiveRoute"
      },
      routeTargets: [
        { key: "login", path: "/login", surfaceId: "Surface.Login" },
        { key: "home", path: "/home", surfaceId: "Surface.Home" }
      ],
      surfaces: [
        {
          id: "Surface.Login",
          parentId: null,
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [
              { prop: "statusText", source: { kind: "state", state: "AuthStatus" } },
              { prop: "className", source: { kind: "state", state: "AuthStatus", map: { pending: "pending", default: "" } } },
              { prop: "disabled", source: { kind: "state", state: "AuthStatus", map: { pending: true, default: false } } }
            ],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "deliver", message: "SignInRequested" }
              }
            ]
          },
          props: {},
          view: {
            rootId: "surface-login",
            propTargets: {
              statusText: [{ id: "status-label", mode: "text" }],
              className: [{ id: "sign-in-button", mode: "className", baseClass: "ms-btn" }],
              visible: [{ id: "sign-in-button", mode: "visibility" }],
              disabled: [{ id: "sign-in-button", mode: "disabled" }]
            },
            interactionTargets: {
              primary: [{ id: "sign-in-button" }]
            }
          }
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "AuthStatus", role: "state", valueType: "text", initial: "idle" } },
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["AuthStatus", "ActiveRoute"],
          handles: ["SignInRequested"],
          emits: [],
          rules: [
            {
              trigger: "SignInRequested",
              steps: [
                { kind: "setState", state: "AuthStatus", value: "pending" },
                { kind: "delay", ms: 605 },
                { kind: "setState", state: "AuthStatus", value: "signedIn" },
                { kind: "setState", state: "ActiveRoute", value: "home" }
              ]
            }
          ]
        } },
        { process: "desire.defineMessage", body: { id: "SignInRequested", role: "event", writes: {} } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses, {
        delayScheduler(ms, context) {
          delayed.push({ ms, eventId: context.eventId });
          return Promise.resolve();
        }
      });
    }
  });

  await runtime.whenSettled();
  assert.equal(nodes.get("status-label").textContent, "idle");
  assert.equal(nodes.get("sign-in-button").className, "ms-btn");
  assert.equal(Object.prototype.hasOwnProperty.call(nodes.get("sign-in-button"), "hidden"), false);
  await listeners.get("click")({ preventDefault() {}, target: nodes.get("sign-in-button") });
  await runtime.whenSettled();

  assert.equal(runtime.processRuntime.value("AuthStatus"), "signedIn");
  assert.equal(runtime.processRuntime.value("ActiveRoute"), "home");
  assert.equal(nodes.get("status-label").textContent, "signedIn");
  assert.equal(nodes.get("sign-in-button").className, "ms-btn");
  assert.equal(nodes.get("sign-in-button").disabled, false);
  assert.deepEqual(delayed, [{ ms: 605, eventId: "SignInRequested" }]);
  assert.deepEqual(pushed, ["/home"]);
  assert.deepEqual(runtime.processRuntime.trace.map(step => step.kind), [
    "deliver",
    "rule.setState",
    "rule.delay",
    "rule.setState",
    "rule.setState"
  ]);
});

test("createSurfaceInteractionRuntime inspection exposes settle and reconcile summaries", async () => {
  const listeners = new Map();
  const nodes = new Map([
    ["route-button", {
      className: "",
      disabled: false,
      addEventListener(eventName, listener) {
        listeners.set(eventName, listener);
      },
      removeEventListener() {},
      setAttribute(name, value) {
        this[name] = value;
      },
      removeAttribute(name) {
        delete this[name];
      }
    }],
    ["route-label", { textContent: "" }]
  ]);
  const runtimeWindow = {
    location: { pathname: "/login" },
    history: {
      pushState(_state, _title, path) {
        runtimeWindow.location.pathname = path;
      }
    },
    console: { error() {} }
  };
  createSurfaceInteractionRuntime({
    document: {
      getElementById(id) {
        return nodes.get(id) ?? null;
      }
    },
    window: runtimeWindow,
    manifest: {
      routeState: { process: "ShellNavigation", state: "ActiveRoute" },
      routeTargets: [
        { key: "login", path: "/login", surfaceId: "Surface.Login" },
        { key: "home", path: "/home", surfaceId: "Surface.Login" }
      ],
      activeSurfaceId: "Surface.Login",
      surfaces: [
        {
          id: "Surface.Login",
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [
              { prop: "text", source: { kind: "state", state: "AuthStatus" } }
            ],
            interactions: [
              { target: "primary", event: "click", action: { kind: "deliver", message: "SignInRequested" } }
            ]
          },
          props: {},
          view: {
            rootId: "surface-login",
            propTargets: {
              text: [{ id: "route-label", mode: "text" }]
            },
            interactionTargets: {
              primary: [{ id: "route-button" }]
            }
          }
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "AuthStatus", role: "state", valueType: "text", initial: "idle" } },
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
        { process: "desire.defineMessage", body: { id: "SignInRequested", role: "event", writes: { AuthStatus: "signedIn", ActiveRoute: "home" } } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["AuthStatus", "ActiveRoute"],
          handles: ["SignInRequested"],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses, executionRunner }) {
      return createProcessRuntime(witnesses, { executionRunner });
    }
  });

  await runtimeWindow.world.whenSettled();
  await listeners.get("click")({ preventDefault() {}, target: nodes.get("route-button") });
  await runtimeWindow.world.whenSettled();

  const inspection = runtimeWindow.world.inspect();
  assert.equal(inspection.executionSummary.settled, true);
  assert.equal(inspection.executionSummary.activeTaskCount, 0);
  assert.equal(typeof inspection.lastReconcileSummary?.opCount, "number");
  assert.equal(inspection.lastReconcileSummary?.activeSurfaceId, "Surface.Login");
});

test("createSurfaceInteractionRuntime boots capability hooks after route surface replacement", async () => {
  const listeners = new Map();
  const booted = [];
  const makeNode = id => ({
    id,
    parentNode: null,
    className: "",
    style: {},
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
    addEventListener(eventName, listener) {
      listeners.set(eventName, listener);
    },
    removeEventListener() {},
    matches(selector) {
      return selector === ".chart-page__mount" && this.isChartMount === true;
    },
    querySelectorAll(selector) {
      if (selector === "*" || selector === ".chart-page__mount") return this.chartNodes ?? [];
      return [];
    },
    replaceWith(next) {
      nodes.delete(this.id);
      nodes.set(next.id, next);
      next.parentNode = this.parentNode;
    }
  });
  const nodes = new Map();
  const homeRoot = makeNode("surface-home");
  const homeButton = makeNode("home-to-chart");
  homeRoot.parentNode = { nodeType: 1 };
  nodes.set(homeRoot.id, homeRoot);
  nodes.set(homeButton.id, homeButton);
  class FakeDomParser {
    parseFromString(html) {
      const manifestMatch = String(html).match(
        /<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/i
      );
      const rootId = String(html).match(/<main id="([^"]+)"/i)?.[1] ?? null;
      const manifest = manifestMatch ? JSON.parse(manifestMatch[1]) : null;
      return {
        getElementById(id) {
          if (id === "surface-runtime-manifest" && manifest) return { textContent: JSON.stringify(manifest) };
          if (id === rootId && rootId) return { outerHTML: `<main id="${rootId}"><svg class="chart-page__mount" data-chart-id="ChartSurface"></svg></main>` };
          return null;
        },
        body: {
          firstElementChild: rootId ? { outerHTML: `<main id="${rootId}"><svg class="chart-page__mount" data-chart-id="ChartSurface"></svg></main>` } : null
        }
      };
    }
  }
  const runtimeWindow = {
    location: { pathname: "/home" },
    history: {
      pushState(_state, _title, path) {
        runtimeWindow.location.pathname = path;
      }
    },
    DOMParser: FakeDomParser,
    async fetch(path) {
      assert.equal(path, "/chart");
      return {
        ok: true,
        async text() {
          return `<html><body><main id="surface-chart"><svg class="chart-page__mount" data-chart-id="ChartSurface"></svg></main><script type="application/json" id="surface-runtime-manifest">${JSON.stringify({
            activeSurfaceId: "Surface.Chart",
            requestPathname: "/chart",
            routeTargets: [
              { key: "home", path: "/home", surfaceId: "Surface.Home" },
              { key: "chart", path: "/chart", surfaceId: "Surface.Chart" }
            ],
            browserRuntimeCapabilities: ["chart.render"],
            chartSpecs: {
              ChartSurface: {
                model: {},
                view: { id: "ChartSurface", frame: "cartesian", encoding: {}, layers: [], props: {} },
                params: {}
              }
            },
            surfaces: [
              {
                id: "Surface.Chart",
                runtime: {
                  processRef: "ShellNavigation",
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
              }
            ]
          })}</script></body></html>`;
        }
      };
    },
    __surfaceCapabilityBootHooks: [
      root => booted.push({
        rootId: root?.id ?? null,
        chartCount: root?.querySelectorAll?.(".chart-page__mount")?.length ?? 0
      })
    ],
    console: { error() {} }
  };

  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById(id) {
        return nodes.get(id) ?? null;
      },
      createElement(tagName) {
        assert.equal(tagName, "template");
        return {
          content: { firstElementChild: null },
          set innerHTML(value) {
            const id = String(value).match(/id="([^"]+)"/)?.[1] ?? "surface-chart";
            const root = makeNode(id);
            const chart = makeNode("chart-node");
            chart.isChartMount = true;
            root.chartNodes = [chart];
            this.content.firstElementChild = root;
          }
        };
      }
    },
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Home",
      routeState: {
        process: "ShellNavigation",
        state: "ActiveRoute"
      },
      routeTargets: [
        { key: "home", path: "/home", surfaceId: "Surface.Home" },
        { key: "chart", path: "/chart", surfaceId: "Surface.Chart" }
      ],
      browserRuntimeCapabilities: ["chart.render"],
      chartSpecs: {
        ChartSurface: {
          model: {},
          view: { id: "ChartSurface", frame: "cartesian", encoding: {}, layers: [], props: {} },
          params: {}
        }
      },
      surfaces: [
        {
          id: "Surface.Home",
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "deliver", message: "OpenChart" }
              }
            ]
          },
          view: {
            rootId: "surface-home",
            propTargets: {},
            interactionTargets: { primary: [{ id: "home-to-chart" }] }
          }
        },
        {
          id: "Surface.Chart",
          runtime: {
            processRef: "ShellNavigation",
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "home" } },
        { process: "desire.defineMessage", body: { id: "OpenChart", role: "event", writes: { ActiveRoute: "chart" } } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: ["OpenChart"],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  assert.equal(typeof listeners.get("click"), "function");
  await listeners.get("click")({ preventDefault() {}, target: homeButton });

  assert.equal(runtime.processRuntime.value("ActiveRoute"), "chart");
  assert.deepEqual(booted.at(-1), { rootId: "surface-chart", chartCount: 1 });
  assert.ok(booted.length >= 1);
  assert.equal(nodes.has("surface-chart"), true);
});

test("createSurfaceInteractionRuntime loads route-local capability assets before booting swapped surfaces", async () => {
  const listeners = new Map();
  const nodes = new Map();
  const appended = [];
  const makeNode = id => ({
    id,
    parentNode: null,
    className: "",
    style: {},
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
    addEventListener(eventName, listener) {
      listeners.set(eventName, listener);
    },
    removeEventListener() {},
    matches(selector) {
      return selector === ".chart-page__mount" && this.isChartMount === true;
    },
    querySelectorAll(selector) {
      if (selector === "*" || selector === ".chart-page__mount") return this.chartNodes ?? [];
      return [];
    },
    replaceWith(next) {
      nodes.delete(this.id);
      nodes.set(next.id, next);
      next.parentNode = this.parentNode;
    }
  });
  const homeRoot = makeNode("surface-home");
  const homeButton = makeNode("home-to-chart");
  homeRoot.parentNode = { nodeType: 1 };
  nodes.set(homeRoot.id, homeRoot);
  nodes.set(homeButton.id, homeButton);

  class FakeDomParser {
    parseFromString(html) {
      const manifestMatch = String(html).match(
        /<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/i
      );
      const rootId = String(html).match(/<main id="([^"]+)"/i)?.[1] ?? null;
      const manifest = manifestMatch ? JSON.parse(manifestMatch[1]) : null;
      return {
        getElementById(id) {
          if (id === "surface-runtime-manifest" && manifest) return { textContent: JSON.stringify(manifest) };
          if (id === rootId && rootId) return { outerHTML: `<main id="${rootId}"></main>` };
          return null;
        },
        body: {
          firstElementChild: rootId ? { outerHTML: `<main id="${rootId}"></main>` } : null
        }
      };
    }
  }

  const runtimeWindow = {
    location: { pathname: "/home" },
    history: {
      pushState(_state, _title, path) {
        runtimeWindow.location.pathname = path;
      }
    },
    DOMParser: FakeDomParser,
    async fetch(path) {
      assert.equal(path, "/chart");
      return {
        ok: true,
        async text() {
          return `<html><body><main id="surface-chart"></main><script type="application/json" id="surface-runtime-manifest">${JSON.stringify({
            activeSurfaceId: "Surface.Chart",
            routeTargets: [
              { key: "home", path: "/home", surfaceId: "Surface.Home" },
              { key: "chart", path: "/chart", surfaceId: "Surface.Chart" }
            ],
            browserRuntimeCapabilities: ["chart.render"],
            chartSpecs: {
              ChartSurface: {
                model: {},
                view: { id: "ChartSurface", frame: "cartesian", encoding: {}, layers: [], props: {} },
                params: {}
              }
            },
            capabilityAssets: {
              stylesheetHrefs: ["/chart.css"],
              scriptSrcs: ["/chart-lib.js"],
              inlineCss: [".chart{display:block}"],
              scriptBodies: ["window.__surfaceCapabilityBootHooks = [root => window.__bootedRootIds.push(root.id)];"]
            },
            surfaces: [
              {
                id: "Surface.Chart",
                runtime: {
                  processRef: "ShellNavigation",
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
              }
            ],
            processWitnesses: [
              { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "chart" } },
              { process: "desire.defineProcess", body: {
                id: "ShellNavigation",
                state: ["ActiveRoute"],
                handles: [],
                emits: [],
                rules: []
              } }
            ]
          })}</script></body></html>`;
        }
      };
    },
    __bootedRootIds: [],
    console: { error() {} }
  };

  const head = {
    appendChild(node) {
      appended.push({
        tag: node.tagName,
        rel: node.rel ?? null,
        href: node.href ?? null,
        src: node.src ?? null,
        type: node.type ?? null,
        textContent: node.textContent ?? null
      });
      if (node.tagName === "SCRIPT" && node.textContent) {
        const fn = new Function("window", node.textContent);
        fn(runtimeWindow);
      }
      queueMicrotask(() => node.dispatchEvent?.({ type: "load" }));
      return node;
    }
  };

  const runtime = createSurfaceInteractionRuntime({
    document: {
      head,
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
              const id = String(value).match(/id="([^"]+)"/)?.[1] ?? "surface-chart";
              const root = makeNode(id);
              const chart = makeNode("chart-node");
              chart.isChartMount = true;
              root.chartNodes = [chart];
              this.content.firstElementChild = root;
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
    manifest: {
      activeSurfaceId: "Surface.Home",
      routeState: {
        process: "ShellNavigation",
        state: "ActiveRoute"
      },
      routeTargets: [
        { key: "home", path: "/home", surfaceId: "Surface.Home" },
        { key: "chart", path: "/chart", surfaceId: "Surface.Chart" }
      ],
      surfaces: [
        {
          id: "Surface.Home",
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "deliver", message: "OpenChart" }
              }
            ]
          },
          view: {
            rootId: "surface-home",
            propTargets: {},
            interactionTargets: { primary: [{ id: "home-to-chart" }] }
          }
        },
        {
          id: "Surface.Chart",
          runtime: {
            processRef: "ShellNavigation",
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "home" } },
        { process: "desire.defineMessage", body: { id: "OpenChart", role: "event", writes: { ActiveRoute: "chart" } } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: ["OpenChart"],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await listeners.get("click")({ preventDefault() {}, target: homeButton });

  assert.equal(runtimeWindow.location.pathname, "/chart");
  assert.equal(runtimeWindow.__bootedRootIds.at(-1), "surface-chart");
  assert.equal(appended.some(entry => entry.href === "/chart.css"), true);
  assert.equal(appended.some(entry => entry.src === "/chart-lib.js"), true);
  assert.equal(appended.some(entry => entry.type === "module"), true);
  runtime.destroy();
});

test("createSurfaceInteractionRuntime swaps to the fetched same-shell route fragment without replacing the process runtime", async () => {
  const listeners = new Map();
  const nodes = new Map();
  const makeNode = id => ({
    id,
    parentNode: null,
    className: "",
    style: {},
    addEventListener(eventName, listener) {
      listeners.set(`${id}:${eventName}`, listener);
    },
    removeEventListener(eventName) {
      listeners.delete(`${id}:${eventName}`);
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
    replaceWith(next) {
      nodes.delete(this.id);
      nodes.set(next.id, next);
      next.parentNode = this.parentNode;
    }
  });
  const loginRoot = makeNode("surface-login");
  const loginButton = makeNode("login-button");
  loginRoot.parentNode = { nodeType: 1 };
  nodes.set(loginRoot.id, loginRoot);
  nodes.set(loginButton.id, loginButton);

  class FakeDomParser {
    parseFromString(html) {
      const manifestMatch = String(html).match(
        /<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/i
      );
      const rootId = String(html).match(/<main id="([^"]+)"/i)?.[1] ?? null;
      const manifest = manifestMatch ? JSON.parse(manifestMatch[1]) : null;
      return {
        getElementById(id) {
          if (id === "surface-runtime-manifest" && manifest) {
            return { textContent: JSON.stringify(manifest) };
          }
          if (id === rootId && rootId) {
            return { outerHTML: `<main id="${rootId}"></main>` };
          }
          return null;
        },
        body: {
          firstElementChild: rootId ? { outerHTML: `<main id="${rootId}"></main>` } : null
        }
      };
    }
  }

  const runtimeWindow = {
    location: { pathname: "/login" },
    history: {
      pushState(_state, _title, path) {
        runtimeWindow.location.pathname = path;
      }
    },
    DOMParser: FakeDomParser,
    async fetch(path) {
      const pages = {
        "/home": {
          activeSurfaceId: "Surface.Home",
          rootId: "surface-home",
          surfaces: [
            {
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
            }
          ],
          processWitnesses: [
            { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
            { process: "desire.defineType", body: { id: "AuthStatus", role: "state", valueType: "text", initial: "idle" } },
            { process: "desire.defineMessage", body: { id: "SignOut", role: "event", writes: {} } },
            { process: "desire.defineProcess", body: {
              id: "ShellNavigation",
              state: ["ActiveRoute", "AuthStatus"],
              handles: ["SignOut"],
              emits: [],
              rules: [
                {
                  trigger: "SignOut",
                  steps: [{ kind: "setState", state: "ActiveRoute", value: "signout" }]
                }
              ]
            } }
          ]
        },
        "/signout": {
          activeSurfaceId: "Surface.Signout",
          rootId: "surface-signout",
          surfaces: [
            {
              id: "Surface.Signout",
              runtime: {
                processRef: "ShellNavigation",
                projectionRefs: [],
                capabilityRefs: [],
                bindings: [],
                interactions: []
              },
              view: {
                rootId: "surface-signout",
                propTargets: {},
                interactionTargets: {}
              }
            }
          ],
          processWitnesses: [
            { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "signout" } },
            { process: "desire.defineType", body: { id: "AuthStatus", role: "state", valueType: "text", initial: "signedIn" } },
            { process: "desire.defineProcess", body: {
              id: "ShellNavigation",
              state: ["ActiveRoute", "AuthStatus"],
              handles: [],
              emits: [],
              rules: []
            } }
          ]
        }
      };
      assert.ok(pages[path], `unexpected route fetch ${path}`);
      return {
        ok: true,
        async text() {
          const page = pages[path];
          return `<html><body><main id="${page.rootId}"></main><script type="application/json" id="surface-runtime-manifest">${JSON.stringify({
            activeSurfaceId: page.activeSurfaceId,
            routeState: { process: "ShellNavigation", state: "ActiveRoute" },
            routeTargets: [
              { key: "login", path: "/login", surfaceId: "Surface.Login" },
              { key: "home", path: "/home", surfaceId: "Surface.Home" },
              { key: "signout", path: "/signout", surfaceId: "Surface.Signout" }
            ],
            surfaces: page.surfaces,
            processWitnesses: page.processWitnesses
          })}</script></body></html>`;
        }
      };
    },
    console: { error() {} }
  };

  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById(id) {
        return nodes.get(id) ?? null;
      },
      createElement(tagName) {
        assert.equal(tagName, "template");
        return {
          content: { firstElementChild: null },
          set innerHTML(value) {
            const id = String(value).match(/id="([^"]+)"/)?.[1] ?? "surface-home";
            this.content.firstElementChild = makeNode(id);
          }
        };
      }
    },
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Login",
      routeState: {
        process: "ShellNavigation",
        state: "ActiveRoute"
      },
      routeTargets: [
        { key: "login", path: "/login", surfaceId: "Surface.Login" },
        { key: "home", path: "/home", surfaceId: "Surface.Home" }
      ],
      surfaces: [
        {
          id: "Surface.Login",
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "deliver", message: "SignIn" }
              }
            ]
          },
          view: {
            rootId: "surface-login",
            propTargets: {},
            interactionTargets: { primary: [{ id: "login-button" }] }
          }
        },
        {
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
        },
        {
          id: "Surface.Signout",
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: []
          },
          view: {
            rootId: "surface-signout",
            propTargets: {},
            interactionTargets: {}
          }
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
        { process: "desire.defineType", body: { id: "AuthStatus", role: "state", valueType: "text", initial: "idle" } },
        { process: "desire.defineMessage", body: { id: "SignIn", role: "event", writes: {} } },
        { process: "desire.defineMessage", body: { id: "SignOut", role: "event", writes: {} } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute", "AuthStatus"],
          handles: ["SignIn", "SignOut"],
          emits: [],
          rules: [
            {
              trigger: "SignIn",
              steps: [
                { kind: "setState", state: "ActiveRoute", value: "home" },
                { kind: "setState", state: "AuthStatus", value: "signedIn" }
              ]
            },
            {
              trigger: "SignOut",
              steps: [{ kind: "setState", state: "ActiveRoute", value: "signout" }]
            }
          ]
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await listeners.get("login-button:click")({ preventDefault() {}, target: loginButton });

  assert.equal(runtimeWindow.location.pathname, "/home");
  assert.equal(runtime.processRuntime.value("ActiveRoute"), "home");
  assert.equal(runtime.processRuntime.value("AuthStatus"), "signedIn");
  await runtime.processRuntime.deliverAuthored("SignOut");
  assert.equal(runtime.processRuntime.value("ActiveRoute"), "signout");
  runtime.destroy();
});

test("createSurfaceInteractionRuntime keeps the swapped fragment alive across delayed route-changing rules in a single runtime", async () => {
  const listeners = new Map();
  const nodes = new Map();
  const makeNode = id => ({
    id,
    parentNode: null,
    className: "",
    style: {},
    addEventListener(eventName, listener) {
      listeners.set(`${id}:${eventName}`, listener);
    },
    removeEventListener(eventName) {
      listeners.delete(`${id}:${eventName}`);
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
    replaceWith(next) {
      nodes.delete(this.id);
      nodes.set(next.id, next);
      next.parentNode = this.parentNode;
    }
  });
  const loginRoot = makeNode("surface-login");
  const loginButton = makeNode("login-button");
  loginRoot.parentNode = { nodeType: 1 };
  nodes.set(loginRoot.id, loginRoot);
  nodes.set(loginButton.id, loginButton);

  class FakeDomParser {
    parseFromString(html) {
      const manifestMatch = String(html).match(
        /<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/i
      );
      const rootId = String(html).match(/<main id="([^"]+)"/i)?.[1] ?? null;
      const manifest = manifestMatch ? JSON.parse(manifestMatch[1]) : null;
      return {
        getElementById(id) {
          if (id === "surface-runtime-manifest" && manifest) {
            return { textContent: JSON.stringify(manifest) };
          }
          if (id === rootId && rootId) {
            return { outerHTML: `<main id="${rootId}"></main>` };
          }
          return null;
        },
        body: {
          firstElementChild: rootId ? { outerHTML: `<main id="${rootId}"></main>` } : null
        }
      };
    }
  }

  const delayed = [];
  const runtimeWindow = {
    location: { pathname: "/login" },
    history: {
      pushState(_state, _title, path) {
        runtimeWindow.location.pathname = path;
      }
    },
    DOMParser: FakeDomParser,
    async fetch(path) {
      assert.ok(["/home", "/signout"].includes(path));
      return {
        ok: true,
        async text() {
          if (path === "/signout") {
            return `<html><body><main id="surface-signout"></main><script type="application/json" id="surface-runtime-manifest">${JSON.stringify({
              activeSurfaceId: "Surface.Signout",
              routeState: { process: "ShellNavigation", state: "ActiveRoute" },
              routeTargets: [
                { key: "login", path: "/login", surfaceId: "Surface.Login" },
                { key: "home", path: "/home", surfaceId: "Surface.Home" },
                { key: "signout", path: "/signout", surfaceId: "Surface.Signout" }
              ],
              surfaces: [
                {
                  id: "Surface.Signout",
                  runtime: {
                    processRef: "ShellNavigation",
                    projectionRefs: [],
                    capabilityRefs: [],
                    bindings: [],
                    interactions: []
                  },
                  view: {
                    rootId: "surface-signout",
                    propTargets: {},
                    interactionTargets: {}
                  }
                }
              ],
              processWitnesses: [
                { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "signout" } },
                { process: "desire.defineType", body: { id: "AuthStatus", role: "state", valueType: "text", initial: "signedOut" } },
                { process: "desire.defineProcess", body: {
                  id: "ShellNavigation",
                  state: ["ActiveRoute", "AuthStatus"],
                  handles: [],
                  emits: [],
                  rules: []
                } }
              ]
            })}</script></body></html>`;
          }
          return `<html><body><main id="surface-home"></main><script type="application/json" id="surface-runtime-manifest">${JSON.stringify({
            activeSurfaceId: "Surface.Home",
            routeState: { process: "ShellNavigation", state: "ActiveRoute" },
            routeTargets: [
              { key: "login", path: "/login", surfaceId: "Surface.Login" },
              { key: "home", path: "/home", surfaceId: "Surface.Home" },
              { key: "signout", path: "/signout", surfaceId: "Surface.Signout" }
            ],
            surfaces: [
              {
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
              }
            ],
            processWitnesses: [
              { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
              { process: "desire.defineType", body: { id: "AuthStatus", role: "state", valueType: "text", initial: "idle" } },
              { process: "desire.defineMessage", body: { id: "SignOut", role: "event", writes: {} } },
              { process: "desire.defineProcess", body: {
                id: "ShellNavigation",
                state: ["ActiveRoute", "AuthStatus"],
                handles: ["SignOut"],
                emits: [],
                rules: [
                  {
                    trigger: "SignOut",
                    steps: [
                      { kind: "setState", state: "ActiveRoute", value: "signout" }
                    ]
                  }
                ]
              } }
            ]
          })}</script></body></html>`;
        }
      };
    },
    console: { error() {} }
  };

  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById(id) {
        return nodes.get(id) ?? null;
      },
      createElement(tagName) {
        assert.equal(tagName, "template");
        return {
          content: { firstElementChild: null },
          set innerHTML(value) {
            const id = String(value).match(/id="([^"]+)"/)?.[1] ?? "surface-home";
            this.content.firstElementChild = makeNode(id);
          }
        };
      }
    },
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Login",
      routeState: {
        process: "ShellNavigation",
        state: "ActiveRoute"
      },
      routeTargets: [
        { key: "login", path: "/login", surfaceId: "Surface.Login" },
        { key: "home", path: "/home", surfaceId: "Surface.Home" },
        { key: "signout", path: "/signout", surfaceId: "Surface.Signout" }
      ],
      surfaces: [
        {
          id: "Surface.Login",
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "deliver", message: "SignIn" }
              }
            ]
          },
          view: {
            rootId: "surface-login",
            propTargets: {},
            interactionTargets: { primary: [{ id: "login-button" }] }
          }
        },
        {
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
        },
        {
          id: "Surface.Signout",
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: []
          },
          view: {
            rootId: "surface-signout",
            propTargets: {},
            interactionTargets: {}
          }
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
        { process: "desire.defineType", body: { id: "AuthStatus", role: "state", valueType: "text", initial: "idle" } },
        { process: "desire.defineMessage", body: { id: "SignIn", role: "event", writes: {} } },
        { process: "desire.defineMessage", body: { id: "SignOut", role: "event", writes: {} } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute", "AuthStatus"],
          handles: ["SignIn", "SignOut"],
          emits: [],
          rules: [
            {
              trigger: "SignIn",
              steps: [
                { kind: "setState", state: "AuthStatus", value: "pending" },
                { kind: "delay", ms: 10 },
                { kind: "setState", state: "AuthStatus", value: "folding" },
                { kind: "delay", ms: 10 },
                { kind: "setState", state: "ActiveRoute", value: "home" },
                { kind: "setState", state: "AuthStatus", value: "signedIn" }
              ]
            },
            {
              trigger: "SignOut",
              steps: [{ kind: "setState", state: "ActiveRoute", value: "signout" }]
            }
          ]
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses, {
        delayScheduler(ms, context) {
          delayed.push({ ms, eventId: context.eventId });
          return Promise.resolve();
        }
      });
    }
  });

  await listeners.get("login-button:click")({ preventDefault() {}, target: loginButton });

  assert.deepEqual(delayed, [
    { ms: 10, eventId: "SignIn" },
    { ms: 10, eventId: "SignIn" }
  ]);
  assert.equal(runtimeWindow.location.pathname, "/home");
  assert.equal(runtime.processRuntime.value("ActiveRoute"), "home");
  assert.equal(runtime.processRuntime.value("AuthStatus"), "signedIn");
  await assert.doesNotReject(() => runtime.processRuntime.deliverAuthored("SignOut"));
  await runtime.refresh();
  runtime.destroy();
});

test("createSurfaceInteractionRuntime refetches an active route when the cached underlay page lacks a manifest", async () => {
  const listeners = new Map();
  const nodes = new Map();
  const makeNode = id => ({
    id,
    parentNode: null,
    className: "",
    style: {},
    addEventListener(eventName, listener) {
      listeners.set(`${id}:${eventName}`, listener);
    },
    removeEventListener(eventName) {
      listeners.delete(`${id}:${eventName}`);
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
    replaceWith(next) {
      nodes.delete(this.id);
      nodes.set(next.id, next);
      next.parentNode = this.parentNode;
    }
  });
  const loginRoot = makeNode("surface-login");
  const loginButton = makeNode("login-button");
  loginRoot.parentNode = { nodeType: 1 };
  nodes.set(loginRoot.id, loginRoot);
  nodes.set(loginButton.id, loginButton);

  class FakeDomParser {
    parseFromString(html) {
      const manifestMatch = String(html).match(
        /<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/i
      );
      const rootId = String(html).match(/<main id="([^"]+)"/i)?.[1] ?? null;
      const manifest = manifestMatch ? JSON.parse(manifestMatch[1]) : null;
      return {
        getElementById(id) {
          if (id === "surface-runtime-manifest" && manifest) {
            return { textContent: JSON.stringify(manifest) };
          }
          if (id === rootId && rootId) {
            return { outerHTML: `<main id="${rootId}"></main>` };
          }
          return null;
        },
        body: {
          firstElementChild: rootId ? { outerHTML: `<main id="${rootId}"></main>` } : null
        }
      };
    }
  }

  const fetches = [];
  const runtimeWindow = {
    location: { pathname: "/login" },
    history: {
      pushState(_state, _title, path) {
        runtimeWindow.location.pathname = path;
      }
    },
    DOMParser: FakeDomParser,
    async fetch(path) {
      fetches.push(path);
      return {
        ok: true,
        async text() {
          if (fetches.length === 1) return `<html><body><main id="surface-home"></main></body></html>`;
          return `<html><body><main id="surface-home"></main><script type="application/json" id="surface-runtime-manifest">${JSON.stringify({
            activeSurfaceId: "Surface.Home",
            routeState: { process: "ShellNavigation", state: "ActiveRoute" },
            routeTargets: [
              { key: "login", path: "/login", surfaceId: "Surface.Login" },
              { key: "home", path: "/home", surfaceId: "Surface.Home" },
              { key: "signout", path: "/signout", surfaceId: "Surface.Signout" }
            ],
            surfaces: [
              {
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
              }
            ],
            processWitnesses: [
              { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "home" } },
              { process: "desire.defineType", body: { id: "ProfileMenuVisible", role: "state", valueType: "bool", initial: false } },
              { process: "desire.defineMessage", body: { id: "SignOut", role: "event", writes: {} } },
              { process: "desire.defineProcess", body: {
                id: "ShellNavigation",
                state: ["ActiveRoute", "ProfileMenuVisible"],
                handles: ["SignOut"],
                emits: [],
                rules: []
              } }
            ]
          })}</script></body></html>`;
        }
      };
    },
    console: { error() {} }
  };

  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById(id) {
        return nodes.get(id) ?? null;
      },
      createElement(tagName) {
        assert.equal(tagName, "template");
        return {
          content: { firstElementChild: null },
          set innerHTML(value) {
            const id = String(value).match(/id="([^"]+)"/)?.[1] ?? "surface-home";
            this.content.firstElementChild = makeNode(id);
          }
        };
      }
    },
    window: runtimeWindow,
    manifest: {
      __routeSurfacePageCache: {
        home: { fragment: '<main id="surface-home"></main>', manifest: null }
      },
      activeSurfaceId: "Surface.Login",
      routeState: {
        process: "ShellNavigation",
        state: "ActiveRoute"
      },
      routeTargets: [
        { key: "login", path: "/login", surfaceId: "Surface.Login" },
        { key: "home", path: "/home", surfaceId: "Surface.Home" }
      ],
      surfaces: [
        {
          id: "Surface.Login",
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "deliver", message: "SignIn" }
              }
            ]
          },
          view: {
            rootId: "surface-login",
            propTargets: {},
            interactionTargets: { primary: [{ id: "login-button" }] }
          }
        },
        {
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
        { process: "desire.defineType", body: { id: "ProfileMenuVisible", role: "state", valueType: "bool", initial: false } },
        { process: "desire.defineMessage", body: { id: "SignIn", role: "event", writes: { ActiveRoute: "home" } } },
        { process: "desire.defineMessage", body: { id: "SignOut", role: "event", writes: {} } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute", "ProfileMenuVisible"],
          handles: ["SignIn", "SignOut"],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await listeners.get("login-button:click")({ preventDefault() {}, target: loginButton });
  assert.deepEqual(fetches.filter(path => path !== "/api/runtime/diagnostics"), ["/home"]);
  assert.equal(runtime.processRuntime.value("ProfileMenuVisible"), false);
  assert.doesNotThrow(() => runtime.processRuntime.deliver("SignOut"));
  runtime.destroy();
});

test("createSurfaceInteractionRuntime synchronizes URL path into authored route state on boot", () => {
  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById() {
        return null;
      }
    },
    window: {
      location: {
        pathname: "/home"
      },
      history: {
        pushState() {}
      },
      console: {
        error() {}
      }
    },
    manifest: {
      routeState: {
        process: "ShellNavigation",
        state: "ActiveRoute"
      },
      routeTargets: [
        { key: "login", path: "/login", surfaceId: "Surface.Login" },
        { key: "home", path: "/home", surfaceId: "Surface.Home" }
      ],
      surfaces: [
        {
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: [],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  assert.equal(runtime.processRuntime.value("ActiveRoute"), "home");
});

test("createSurfaceInteractionRuntime maps browser back through explicit authored route state", () => {
  const listeners = new Map();
  const pushed = [];
  const runtimeWindow = {
    location: {
      pathname: "/home"
    },
    history: {
      pushState(_state, _title, path) {
        pushed.push(path);
        runtimeWindow.location.pathname = path;
      }
    },
    addEventListener(eventName, listener) {
      listeners.set(eventName, listener);
    },
    removeEventListener(eventName) {
      listeners.delete(eventName);
    },
    console: {
      error() {}
    }
  };
  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById() {
        return null;
      }
    },
    window: runtimeWindow,
    manifest: {
      routeState: {
        process: "ShellNavigation",
        state: "ActiveRoute"
      },
      routeTargets: [
        { key: "login", path: "/login", surfaceId: "Surface.Login" },
        { key: "home", path: "/home", surfaceId: "Surface.Home" }
      ],
      surfaces: [
        {
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: [],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  assert.equal(runtime.processRuntime.value("ActiveRoute"), "home");
  assert.equal(typeof listeners.get("popstate"), "function");

  runtimeWindow.location.pathname = "/login";
  listeners.get("popstate")();

  assert.equal(runtime.processRuntime.value("ActiveRoute"), "login");
  assert.deepEqual(pushed, []);

  runtime.destroy();
  assert.equal(listeners.has("popstate"), false);
});

test("createSurfaceInteractionRuntime keeps a single process runtime across same-shell route changes", async () => {
  const listeners = new Map();
  const nodes = new Map();
  const pushed = [];
  const replaced = [];
  const createdRuntimes = [];
  const makeNode = id => ({
    id,
    parentNode: null,
    className: "",
    style: {},
    addEventListener(eventName, listener) {
      listeners.set(`${id}:${eventName}`, listener);
    },
    removeEventListener(eventName) {
      listeners.delete(`${id}:${eventName}`);
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    },
    replaceWith(next) {
      nodes.delete(this.id);
      nodes.set(next.id, next);
      next.parentNode = this.parentNode;
      replaced.push(next.id);
    }
  });
  const millForceRoot = makeNode("surface-mill-force");
  const homeButton = makeNode("home-button");
  millForceRoot.parentNode = { nodeType: 1 };
  nodes.set(millForceRoot.id, millForceRoot);
  nodes.set(homeButton.id, homeButton);

  class FakeDomParser {
    parseFromString(html) {
      const manifestMatch = String(html).match(
        /<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/i
      );
      const rootId = String(html).match(/<main id="([^"]+)"/i)?.[1] ?? null;
      const manifest = manifestMatch ? JSON.parse(manifestMatch[1]) : null;
      return {
        getElementById(id) {
          if (id === "surface-runtime-manifest" && manifest) {
            return { textContent: JSON.stringify(manifest) };
          }
          if (id === rootId && rootId) {
            return { outerHTML: `<main id="${rootId}"></main>` };
          }
          return null;
        },
        body: {
          firstElementChild: rootId ? { outerHTML: `<main id="${rootId}"></main>` } : null
        }
      };
    }
  }

  const manifestForPath = pathname => ({
    activeSurfaceId: pathname === "/home" ? "Surface.Home" : "Surface.MillForce",
    requestPathname: pathname,
    routeState: {
      process: "ShellNavigation",
      state: "ActiveRoute"
    },
    routeTargets: [
      { key: "login", path: "/login", surfaceId: "Surface.Login" },
      { key: "home", path: "/home", surfaceId: "Surface.Home" },
      { key: "mill-force", path: "/mill-force", surfaceId: "Surface.MillForce" }
    ],
    surfaces: [
      {
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
      },
      {
        id: "Surface.MillForce",
        runtime: {
          processRef: "ShellNavigation",
          projectionRefs: [],
          capabilityRefs: [],
          bindings: [],
          interactions: [
            {
              target: "home",
              event: "click",
              action: { kind: "deliver", message: "NavigateHome" }
            }
          ]
        },
        view: {
          rootId: "surface-mill-force",
          propTargets: {},
          interactionTargets: { home: [{ id: "home-button" }] }
        }
      }
    ],
    processWitnesses: [
      { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
      { process: "desire.defineMessage", body: { id: "NavigateHome", role: "event", writes: {} } },
      { process: "desire.defineProcess", body: {
        id: "ShellNavigation",
        state: ["ActiveRoute"],
        handles: ["NavigateHome"],
        emits: [],
        rules: []
      } }
    ]
  });

  const runtimeWindow = {
    location: {
      pathname: "/mill-force"
    },
    history: {
      pushState(_state, _title, path) {
        pushed.push(path);
        runtimeWindow.location.pathname = path;
      },
      replaceState(_state, _title, path) {
        runtimeWindow.location.pathname = path;
      }
    },
    async fetch(path) {
      const manifest = manifestForPath(path);
      const rootId = manifest.activeSurfaceId === "Surface.Home" ? "surface-home" : "surface-mill-force";
      return {
        ok: true,
        async text() {
          return `<html><body><main id="${rootId}"></main><script type="application/json" id="surface-runtime-manifest">${JSON.stringify(manifest)}</script></body></html>`;
        }
      };
    },
    DOMParser: FakeDomParser,
    addEventListener(eventName, listener) {
      listeners.set(eventName, listener);
    },
    removeEventListener(eventName) {
      listeners.delete(eventName);
    },
    console: { error() {} }
  };

  const createStubRuntime = witnesses => {
    const state = new Map(
      witnesses
        .filter(witness => witness?.process === "desire.defineType" && witness?.body?.role === "state")
        .map(witness => [witness.body.id, witness.body.initial])
    );
    const subscribers = new Set();
    let resolveIdle = null;
    const idle = new Promise(resolve => {
      resolveIdle = resolve;
    });
    const runtime = {
      value(stateId) {
        return state.get(stateId);
      },
      set(stateId, value) {
        const previous = state.get(stateId);
        state.set(stateId, value);
        if (previous === value) return;
        const observation = { changes: [{ field: stateId, from: previous, to: value }] };
        for (const subscriber of [...subscribers]) subscriber(observation);
      },
      subscribe(listener) {
        subscribers.add(listener);
        return () => subscribers.delete(listener);
      },
      async deliverAuthored(message) {
        if (message === "NavigateHome") runtime.set("ActiveRoute", "home");
      },
      whenIdle() {
        return idle;
      },
      resolveIdle() {
        resolveIdle?.();
      }
    };
    createdRuntimes.push(runtime);
    return runtime;
  };

  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById(id) {
        return nodes.get(id) ?? null;
      },
      createElement(tagName) {
        assert.equal(tagName, "template");
        return {
          content: { firstElementChild: null },
          set innerHTML(value) {
            const id = String(value).match(/id="([^"]+)"/)?.[1] ?? "surface-home";
            this.content.firstElementChild = makeNode(id);
          }
        };
      }
    },
    window: runtimeWindow,
    manifest: manifestForPath("/mill-force"),
    createProcessRuntimeImpl({ witnesses }) {
      return createStubRuntime(witnesses);
    }
  });

  await listeners.get("home-button:click")({ preventDefault() {}, target: homeButton });
  assert.equal(runtimeWindow.location.pathname, "/home");
  assert.equal(runtime.processRuntime.value("ActiveRoute"), "home");
  assert.deepEqual(replaced, ["surface-home"]);
  assert.equal(createdRuntimes.length, 1);
  assert.equal(runtime.processRuntime, createdRuntimes[0]);

  runtime.destroy();
});

test("createSurfaceInteractionRuntime ignores non-route processes during browser route-state sync", () => {
  const listeners = new Map();
  const runtimeWindow = {
    location: {
      pathname: "/login"
    },
    history: {
      pushState() {}
    },
    addEventListener(eventName, listener) {
      listeners.set(eventName, listener);
    },
    removeEventListener(eventName) {
      listeners.delete(eventName);
    },
    console: {
      error() {}
    }
  };
  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById() {
        return null;
      }
    },
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Goodman",
      routeState: {
        process: "ShellNavigation",
        state: "ActiveRoute"
      },
      routeTargets: [
        { key: "login", path: "/login", surfaceId: "Surface.Login" },
        { key: "goodman", path: "/goodman", surfaceId: "Surface.Goodman" }
      ],
      surfaces: [
        {
          id: "Surface.Goodman",
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: []
          },
          view: {
            rootId: "surface-goodman",
            propTargets: {},
            interactionTargets: {}
          }
        },
        {
          id: "Surface.Editor",
          parentId: "Surface.Goodman",
          runtime: {
            processRef: "GoodmanBoltSetEditor",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: []
          },
          view: {
            rootId: "surface-editor",
            propTargets: {},
            interactionTargets: {}
          }
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "goodman" } },
        { process: "desire.defineType", body: { id: "EditorMode", role: "state", valueType: "text", initial: "goodman" } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: [],
          emits: [],
          rules: []
        } },
        { process: "desire.defineProcess", body: {
          id: "GoodmanBoltSetEditor",
          state: ["EditorMode"],
          handles: [],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  assert.equal(runtime.processRuntime.value("ActiveRoute"), "login");
  assert.equal(runtime.processRuntime.value("EditorMode"), "goodman");

  runtimeWindow.location.pathname = "/goodman";
  listeners.get("popstate")();

  assert.equal(runtime.processRuntime.value("ActiveRoute"), "goodman");
  assert.equal(runtime.processRuntime.value("EditorMode"), "goodman");
});

test("createSurfaceInteractionRuntime installs a browser inspection point on window", async () => {
  const document = createOverlayTestDocument();
  const surfaceHome = document.createElement("main");
  surfaceHome.id = "surface-home";
  document.body.appendChild(surfaceHome);
  const runtimeWindow = {
    location: { pathname: "/home" },
    history: { pushState() {} },
    console: { error() {} },
    fetch: async path => ({
      ok: path === "/api/runtime/diagnostics",
      async json() {
        return {
          activeBundles: [{ id: "bundle-core-runtime" }],
          plugins: { activePluginIds: ["plugin.chart-runtime"] }
        };
      }
    })
  };

  const runtime = createSurfaceInteractionRuntime({
    document,
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Home",
      browserRuntimeCapabilities: ["chart.render"],
      capabilityAssets: null,
      diagnostics: {
        activeSurfaceId: "Surface.Home",
        includedSurfaceIds: ["Surface.Home"],
        includedRuntimeIds: ["ShellNavigation", "ActiveRoute"]
      },
      routeTargets: [
        { key: "home", path: "/home", surfaceId: "Surface.Home" }
      ],
      surfaces: [
        {
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "home" } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: [],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await Promise.resolve();
  const inspection = runtimeWindow.world;
  assert.equal(runtimeWindow.witnessWorld, inspection);
  assert.equal(runtimeWindow.__surfaceRuntimeInspection, inspection);
  assert.equal(inspection.activeSurfaceId, "Surface.Home");
  assert.deepEqual(inspection.surfaceIds, ["Surface.Home"]);
  assert.deepEqual(inspection.runtimeIds, ["ShellNavigation", "ActiveRoute"]);
  assert.deepEqual(inspection.browserRuntimeCapabilities, ["chart.render"]);
  assert.equal(inspection.capabilityAssets, null);
  assert.deepEqual(inspection.process.state, { ActiveRoute: "home" });
  const probe = await inspection.rerunProbe();
  assert.equal(probe.activeSurfaceId, "Surface.Home");
  assert.deepEqual(probe.currentProcessRefs, ["ShellNavigation"]);
  assert.deepEqual(inspection.latestProbe.currentProcessRefs, ["ShellNavigation"]);
  assert.deepEqual(inspection.issues, []);
  const diagnostics = await inspection.refreshServerDiagnostics();
  assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.chart-runtime"]);
  runtime.destroy();
});

test("createSurfaceInteractionRuntime surfaces missing capability controllers as non-fatal runtime issues", async () => {
  const document = createOverlayTestDocument();
  const root = document.createElement("main");
  root.id = "surface-chart";
  document.body.appendChild(root);
  const listeners = new Map();
  const runtimeWindow = {
    location: { pathname: "/chart" },
    history: { pushState() {} },
    console: { error() {} },
    addEventListener(eventName, listener) {
      listeners.set(eventName, listener);
    },
    removeEventListener(eventName) {
      listeners.delete(eventName);
    }
  };

  const runtime = createSurfaceInteractionRuntime({
    document,
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Chart",
      browserRuntimeCapabilities: ["chart.render"],
      capabilityAssets: null,
      surfaces: [
        {
          id: "Surface.Chart",
          runtime: {
            processRef: "ShellNavigation",
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "chart" } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: [],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(Boolean(runtimeWindow.world), true);
  await runtime.whenSettled();
  const probe = await runtime.rerunProbe();
  assert.equal(probe.missingCapabilityControllers.some(entry => entry.surfaceId === "Surface.Chart"), true);
  assert.equal(runtimeWindow.world.issues.some(issue =>
    issue.id === "surface-runtime:missing-capability-controller:Surface.Chart"
    && issue.status === "active"
  ), true);
  runtime.destroy();
});

test("createSurfaceInteractionRuntime recognizes descendant capability controllers and outputs for dependent capability bindings", async () => {
  const document = createOverlayTestDocument();
  const wrapper = document.createElement("section");
  wrapper.id = "surface-chart-wrap";
  const mount = document.createElement("div");
  mount.id = "surface-chart";
  mount.setAttribute("data-surface-id", "Surface.Chart");
  mount.__surfaceCapabilityController = {
    updateProps() {}
  };
  mount.__surfaceCapabilityOutputs = { valueText: "ready" };
  const readout = document.createElement("div");
  readout.id = "surface-readout";
  wrapper.appendChild(mount);
  wrapper.appendChild(readout);
  document.body.appendChild(wrapper);
  const runtimeWindow = {
    location: { pathname: "/chart" },
    history: { pushState() {} },
    console: { error() {} }
  };

  const runtime = createSurfaceInteractionRuntime({
    document,
    window: runtimeWindow,
    manifest: {
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
            processRef: null,
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
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "chart" } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: [],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  const probe = await runtime.rerunProbe();
  assert.equal(probe.missingCapabilityControllers.some(entry => entry.surfaceId === "Surface.Chart"), false);
  assert.equal(probe.missingCapabilityOutputs.some(entry => entry.surfaceId === "Surface.Readout"), false);
  runtime.destroy();
});

test("createSurfaceInteractionRuntime surfaces expected-visible surfaces that never materialize in the DOM", async () => {
  const document = createOverlayTestDocument();
  const root = document.createElement("main");
  root.id = "surface-root";
  document.body.appendChild(root);
  const runtimeWindow = {
    location: { pathname: "/shell" },
    history: { pushState() {} },
    console: { error() {} }
  };

  const runtime = createSurfaceInteractionRuntime({
    document,
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Root",
      browserRuntimeCapabilities: [],
      capabilityAssets: null,
      surfaces: [
        {
          id: "Surface.Root",
          children: ["Surface.Window"],
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: []
          },
          view: {
            rootId: "surface-root",
            propTargets: {},
            interactionTargets: {}
          }
        },
        {
          id: "Surface.Window",
          parentId: "Surface.Root",
          runtime: {
            processRef: null,
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [
              {
                prop: "visible",
                source: { kind: "state", state: "WindowVisible" }
              }
            ],
            interactions: []
          },
          view: {
            rootId: "surface-window",
            propTargets: {
              visible: [{ id: "surface-window", mode: "visibility" }]
            },
            interactionTargets: {}
          }
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "WindowVisible", role: "state", valueType: "bool", initial: false } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["WindowVisible"],
          handles: [],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await Promise.resolve();
  await runtime.processRuntime.set("WindowVisible", true);
  await runtime.refresh();
  const probe = await runtime.rerunProbe();
  assert.deepEqual(probe.missingVisibleSurfaces, [{
    surfaceId: "Surface.Window",
    rootId: "surface-window",
    parentId: "Surface.Root"
  }]);
  assert.equal(runtimeWindow.world.issues.some(issue =>
    issue.id === "surface-runtime:missing-visible-surface:Surface.Window"
    && issue.status === "active"
  ), true);
  runtime.destroy();
});

test("createSurfaceInteractionRuntime materializes visibility-bound surfaces from manifest fragments and rebinds their interactions", async () => {
  const document = createOverlayTestDocument();
  const baseCreateElement = document.createElement.bind(document);
  document.createElement = tagName => {
    if (tagName === "template") {
      return {
        content: { firstElementChild: null },
        set innerHTML(value) {
          const rootId = String(value).match(/id="([^"]+)"/)?.[1] ?? "surface-window";
          const root = baseCreateElement("section");
          root.setAttribute("id", rootId);
          root.textContent = "Window";
          this.content.firstElementChild = root;
        }
      };
    }
    return baseCreateElement(tagName);
  };
  const root = document.createElement("main");
  root.id = "surface-root";
  document.body.appendChild(root);
  const runtimeWindow = {
    location: { pathname: "/shell" },
    history: { pushState() {} },
    console: { error() {} }
  };

  const runtime = createSurfaceInteractionRuntime({
    document,
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Root",
      browserRuntimeCapabilities: [],
      capabilityAssets: null,
      surfaces: [
        {
          id: "Surface.Root",
          children: ["Surface.Window"],
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: []
          },
          view: {
            rootId: "surface-root",
            propTargets: {},
            interactionTargets: {}
          }
        },
        {
          id: "Surface.Window",
          parentId: "Surface.Root",
          fragmentHtml: '<section id="surface-window">Window</section>',
          runtime: {
            processRef: null,
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [
              {
                prop: "visible",
                source: { kind: "state", state: "WindowVisible" }
              }
            ],
            interactions: [
              {
                target: "self",
                event: "click",
                action: { kind: "deliver", message: "HideWindow" }
              }
            ]
          },
          view: {
            rootId: "surface-window",
            propTargets: {
              visible: [{ id: "surface-window", mode: "visibility" }]
            },
            interactionTargets: {
              self: [{ id: "surface-window" }]
            }
          }
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "WindowVisible", role: "state", valueType: "bool", initial: false } },
        { process: "desire.defineMessage", body: { id: "HideWindow", role: "event", writes: { WindowVisible: false } } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["WindowVisible"],
          handles: ["HideWindow"],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await Promise.resolve();
  await runtime.processRuntime.set("WindowVisible", true);
  await runtime.refresh();
  const windowNode = document.getElementById("surface-window");
  assert.ok(windowNode);
  assert.equal(windowNode.hidden, false);
  assert.equal(windowNode.getAttribute("hidden"), null);
  assert.equal(runtimeWindow.world.issues.some(issue =>
    issue.id === "surface-runtime:missing-visible-surface:Surface.Window"
    && issue.status === "active"
  ), false);

  await windowNode.eventListeners.get("click")({ preventDefault() {}, target: windowNode });
  await runtime.refresh();
  assert.equal(runtime.processRuntime.value("WindowVisible"), false);
  assert.equal(document.getElementById("surface-window"), null);
  runtime.destroy();
});

test("createSurfaceInteractionRuntime ignores non-rendered active descendants when probing and binding", async () => {
  const document = createOverlayTestDocument();
  const root = document.createElement("main");
  root.id = "surface-home";
  document.body.appendChild(root);
  const runtimeWindow = {
    location: { pathname: "/home" },
    history: { pushState() {} },
    console: { error() {} }
  };

  const runtime = createSurfaceInteractionRuntime({
    document,
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Home",
      browserRuntimeCapabilities: [],
      capabilityAssets: null,
      surfaces: [
        {
          id: "Surface.Home",
          children: ["Surface.HiddenPanel"],
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
        },
        {
          id: "Surface.HiddenPanel",
          parentId: "Surface.Home",
          runtime: {
            processRef: null,
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [
              { prop: "text", source: { kind: "state", state: "ActiveRoute" } }
            ],
            interactions: [
              { target: "self", event: "click", action: { kind: "deliver", message: "NavigateHome" } }
            ]
          },
          view: {
            rootId: "surface-hidden-panel",
            propTargets: { text: [{ id: "surface-hidden-panel", mode: "text" }] },
            interactionTargets: { self: [{ id: "surface-hidden-panel" }] }
          }
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "home" } },
        { process: "desire.defineMessage", body: { id: "NavigateHome", writes: { ActiveRoute: "home" }, fields: [] } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: ["NavigateHome"],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  const probe = await runtime.rerunProbe();
  assert.equal(probe.missingInteractionTargets.some(entry => entry.surfaceId === "Surface.HiddenPanel"), false);
  assert.equal(probe.missingBindingTargets.some(entry => entry.surfaceId === "Surface.HiddenPanel"), false);
  runtime.destroy();
});

test("createSurfaceInteractionRuntime records capability error events in the shared issue ledger", async () => {
  const document = createOverlayTestDocument();
  const root = document.createElement("main");
  root.id = "surface-chart";
  document.body.appendChild(root);
  const listeners = new Map();
  const runtimeWindow = {
    location: { pathname: "/chart" },
    history: { pushState() {} },
    console: { error() {} },
    addEventListener(eventName, listener) {
      listeners.set(eventName, listener);
    },
    removeEventListener(eventName) {
      listeners.delete(eventName);
    }
  };

  const runtime = createSurfaceInteractionRuntime({
    document,
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Chart",
      browserRuntimeCapabilities: ["chart.render"],
      capabilityAssets: null,
      surfaces: [
        {
          id: "Surface.Chart",
          runtime: {
            processRef: "ShellNavigation",
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "chart" } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: [],
          emits: [],
          rules: []
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  listeners.get("surface-capability-error")?.({
    detail: {
      capability: "chart.render",
      surfaceId: "Surface.Chart",
      targetId: "surface-chart",
      phase: "capability-mount",
      message: "Chart capability failed during mount",
      details: { message: "mount exploded" }
    }
  });

  assert.equal(runtimeWindow.world.issues.some(issue =>
    issue.id === "surface-runtime:capability-error:chart.render:Surface.Chart:capability-mount"
    && issue.status === "active"
  ), true);
  runtime.destroy();
});

test("createSurfaceInteractionRuntime merges expectation-provider issues into the shared ledger and probe summary", async () => {
  const document = createOverlayTestDocument();
  const root = document.createElement("main");
  root.id = "surface-home";
  document.body.appendChild(root);
  const runtimeWindow = {
    location: { pathname: "/home" },
    history: { pushState() {} },
    console: { error() {} }
  };
  let mismatch = true;

  const runtime = createSurfaceInteractionRuntime({
    document,
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Home",
      routeTargets: [
        { key: "home", path: "/home", surfaceId: "Surface.Home" }
      ],
      surfaces: [
        {
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "home" } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: [],
          emits: [],
          rules: []
        } }
      ]
    },
    expectationProviders: [
      snapshot => mismatch
        ? [{
            id: "engentus-shell:test-mismatch",
            severity: "error",
            kind: "engentus-shell",
            message: "Injected shell mismatch",
            details: { route: snapshot.routePathname }
          }]
        : []
    ],
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  const initialProbe = await runtime.rerunProbe();
  assert.equal(runtime.expectationProviderCount, 1);
  assert.deepEqual(initialProbe.expectationSummary, {
    total: 1,
    bySeverity: { error: 1, warning: 0, info: 0 }
  });
  assert.equal(runtimeWindow.world.issues.some(issue => issue.id === "engentus-shell:test-mismatch" && issue.status === "active"), true);

  mismatch = false;
  const settledProbe = await runtime.rerunProbe();
  assert.deepEqual(settledProbe.expectationSummary, {
    total: 0,
    bySeverity: { error: 0, warning: 0, info: 0 }
  });
  assert.equal(runtimeWindow.world.issues.some(issue => issue.id === "engentus-shell:test-mismatch" && issue.status === "resolved"), true);
  runtime.destroy();
});

test("createSurfaceInteractionRuntime falls back to full document navigation when same-document route replacement is unavailable", async () => {
  const listeners = new Map();
  const nodes = new Map();
  const assigned = [];
  const pushed = [];
  const loginRoot = {
    id: "surface-login",
    parentNode: { nodeType: 1 },
    addEventListener() {},
    removeEventListener() {},
    replaceWith() {
      throw new Error("same-document replacement should not run in this fallback test");
    }
  };
  const loginButton = {
    addEventListener(eventName, listener) {
      listeners.set(`login-button:${eventName}`, listener);
    },
    removeEventListener(eventName) {
      listeners.delete(`login-button:${eventName}`);
    }
  };
  nodes.set("surface-login", loginRoot);
  nodes.set("login-button", loginButton);

  const runtimeWindow = {
    location: {
      pathname: "/login",
      assign(path) {
        assigned.push(path);
        this.pathname = path;
      }
    },
    history: {
      pushState(_state, _title, path) {
        pushed.push(path);
        runtimeWindow.location.pathname = path;
      }
    },
    addEventListener(eventName, listener) {
      listeners.set(eventName, listener);
    },
    removeEventListener(eventName) {
      listeners.delete(eventName);
    },
    console: { error() {} }
  };

  createSurfaceInteractionRuntime({
    document: {
      getElementById(id) {
        return nodes.get(id) ?? null;
      }
    },
    window: runtimeWindow,
    manifest: {
      activeSurfaceId: "Surface.Login",
      routeState: {
        process: "ShellNavigation",
        state: "ActiveRoute"
      },
      routeTargets: [
        { key: "login", path: "/login", surfaceId: "Surface.Login" },
        { key: "home", path: "/home", surfaceId: "Surface.Home" }
      ],
      surfaces: [
        {
          id: "Surface.Login",
          runtime: {
            processRef: "ShellNavigation",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "deliver", message: "SignIn" }
              }
            ]
          },
          view: {
            rootId: "surface-login",
            propTargets: {},
            interactionTargets: { primary: [{ id: "login-button" }] }
          }
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
        { process: "desire.defineMessage", body: { id: "SignIn", role: "event", writes: {} } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: ["SignIn"],
          emits: [],
          rules: [
            {
              trigger: "SignIn",
              steps: [{ kind: "setState", state: "ActiveRoute", value: "home" }]
            }
          ]
        } }
      ]
    },
    createProcessRuntimeImpl({ witnesses }) {
      return createProcessRuntime(witnesses);
    }
  });

  await listeners.get("login-button:click")({ preventDefault() {}, target: loginButton });

  assert.deepEqual(pushed, ["/home"]);
  assert.deepEqual(assigned, ["/home"]);
  assert.equal(runtimeWindow.location.pathname, "/home");
});

test("buildSurfaceRuntimeManifest carries the whole shell runtime closure while preserving the active route", () => {
  const world = {
    allWitnesses() {
      return [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "home" } },
        { process: "desire.defineType", body: { id: "AuthStatus", role: "state", valueType: "text", initial: "idle" } },
        { process: "desire.defineMessage", body: { id: "OpenHome", role: "event", writes: { ActiveRoute: "home" } } },
        { process: "desire.defineMessage", body: { id: "SignInRequested", role: "event", writes: { AuthStatus: "pending" } } },
        {
          process: "desire.defineProcess",
          body: {
            id: "ShellNavigation",
            state: ["ActiveRoute", "AuthStatus"],
            handles: ["OpenHome", "SignInRequested"],
            emits: [],
            rules: [
              {
                trigger: "SignInRequested",
                steps: [
                  { kind: "setState", state: "AuthStatus", value: "signedIn" },
                  { kind: "setState", state: "ActiveRoute", value: "home" }
                ]
              }
            ]
          }
        },
        { process: "desire.defineType", body: { id: "GoodmanMode", role: "state", valueType: "text", initial: "static" } },
        { process: "desire.defineMessage", body: { id: "OpenGoodman", role: "event", writes: { GoodmanMode: "mc" } } },
        { process: "desire.defineProcess", body: { id: "GoodmanControls", state: ["GoodmanMode"], handles: ["OpenGoodman"], emits: [], rules: [] } }
      ];
    }
  };
  const surfaces = new Map([
    ["Surface.Root", {
      id: "Surface.Root",
      children: ["Surface.Home", "Surface.Goodman"],
      processRef: "ShellNavigation"
    }],
    ["Surface.Home", {
      id: "Surface.Home",
      parentId: "Surface.Root",
      children: [],
      interactions: [
        { target: "self", event: "click", action: { kind: "deliver", message: "OpenHome" } }
      ],
      props: { domId: "surface-home" }
    }],
    ["Surface.Goodman", {
      id: "Surface.Goodman",
      parentId: "Surface.Root",
      children: [],
      processRef: "GoodmanControls",
      props: { domId: "surface-goodman" }
    }]
  ]);

  const manifest = buildSurfaceRuntimeManifest({
    world,
    root: surfaces.get("Surface.Root"),
    activeSurface: surfaces.get("Surface.Home"),
    surfaces,
    rootSurfaceId: "Surface.Root",
    requestPathname: "/home",
    routeStateDescriptor: { process: "ShellNavigation", state: "ActiveRoute" }
  });

  assert.deepEqual(
    manifest.processWitnesses.map(witness => witness.body.id).sort(),
    ["ActiveRoute", "AuthStatus", "GoodmanControls", "GoodmanMode", "OpenGoodman", "OpenHome", "ShellNavigation", "SignInRequested"]
  );
  const shellProcess = manifest.processWitnesses.find(witness => witness.body.id === "ShellNavigation");
  assert.deepEqual(shellProcess.body.state, ["ActiveRoute", "AuthStatus"]);
  assert.deepEqual(shellProcess.body.handles, ["OpenHome", "SignInRequested"]);
  assert.equal(shellProcess.body.rules.length, 1);
  assert.equal(manifest.diagnostics.activeSurfaceId, "Surface.Home");
  assert.deepEqual(manifest.diagnostics.includedSurfaceIds.sort(), ["Surface.Goodman", "Surface.Home", "Surface.Root"]);
  assert.deepEqual(
    manifest.diagnostics.includedRuntimeIds.sort(),
    ["ActiveRoute", "AuthStatus", "GoodmanControls", "GoodmanMode", "OpenGoodman", "OpenHome", "ShellNavigation", "SignInRequested"]
  );
  assert.equal(manifest.diagnostics.serializedBytes > 0, true);
});

test("buildSurfaceRuntimeManifest preserves the active parent chain for reused shared surfaces", () => {
  const world = {
    allWitnesses() {
      return [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "home" } },
        { process: "desire.defineType", body: { id: "ProfileMenuVisible", role: "state", valueType: "bool", initial: false } },
        { process: "desire.defineMessage", body: { id: "SignOutRequested", role: "event", writes: {} } },
        {
          process: "desire.defineProcess",
          body: {
            id: "ShellNavigation",
            state: ["ActiveRoute", "ProfileMenuVisible"],
            handles: ["SignOutRequested"],
            emits: [],
            rules: []
          }
        }
      ];
    }
  };
  const surfaces = new Map([
    ["Surface.Root", {
      id: "Surface.Root",
      children: ["Surface.Home", "Surface.Module"],
      processRef: "ShellNavigation"
    }],
    ["Surface.Home", {
      id: "Surface.Home",
      children: ["Surface.HomeChrome"]
    }],
    ["Surface.Module", {
      id: "Surface.Module",
      children: ["Surface.ModuleChrome"]
    }],
    ["Surface.HomeChrome", {
      id: "Surface.HomeChrome",
      children: ["Surface.ProfileSummary"]
    }],
    ["Surface.ModuleChrome", {
      id: "Surface.ModuleChrome",
      children: ["Surface.ProfileSummary"]
    }],
    ["Surface.ProfileSummary", {
      id: "Surface.ProfileSummary",
      interactions: [
        {
          target: "self",
          event: "click",
          action: {
            kind: "setState",
            state: "ProfileMenuVisible",
            value: { kind: "toggleState", state: "ProfileMenuVisible" }
          }
        }
      ],
      props: { domId: "user-prof" }
    }]
  ]);

  const manifest = buildSurfaceRuntimeManifest({
    world,
    root: surfaces.get("Surface.Root"),
    activeSurface: surfaces.get("Surface.Module"),
    surfaces,
    rootSurfaceId: "Surface.Root",
    requestPathname: "/module",
    routeStateDescriptor: { process: "ShellNavigation", state: "ActiveRoute" }
  });

  const profile = manifest.surfaces.find(surface => surface.id === "Surface.ProfileSummary");
  assert.equal(profile?.parentId, "Surface.ModuleChrome");
});
