import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSurfaceRuntimeManifest,
  createSurfaceInteractionRuntime,
  describeSurfaceRuntimeView
} from "../src/runtime-surface-interaction-runtime.js";
import { createProcessRuntime } from "../src/desire/process-eval.js";

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

  assert.equal(nodes.get("status-label").textContent, "idle");
  assert.equal(nodes.get("sign-in-button").className, "ms-btn");
  assert.equal(Object.prototype.hasOwnProperty.call(nodes.get("sign-in-button"), "hidden"), false);
  await listeners.get("click")({ preventDefault() {}, target: nodes.get("sign-in-button") });

  assert.equal(runtime.processRuntime.value("AuthStatus"), "signedIn");
  assert.equal(runtime.processRuntime.value("ActiveRoute"), "home");
  assert.equal(nodes.get("status-label").textContent, "signedIn");
  assert.equal(nodes.get("sign-in-button").className, "ms-btn");
  assert.equal(nodes.get("sign-in-button").disabled, false);
  assert.deepEqual(delayed, [{ ms: 605, eventId: "SignInRequested" }]);
  assert.deepEqual(pushed, ["/home"]);
  assert.deepEqual(runtime.processRuntime.trace.map(step => step.kind), [
    "rule.setState",
    "rule.delay",
    "rule.setState",
    "rule.setState"
  ]);
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
      return selector === "[data-chart-spec]" && this.hasChartSpec === true;
    },
    querySelectorAll(selector) {
      return selector === "[data-chart-spec]" ? (this.chartNodes ?? []) : [];
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
  const runtimeWindow = {
    location: { pathname: "/home" },
    history: {
      pushState(_state, _title, path) {
        runtimeWindow.location.pathname = path;
      }
    },
    async fetch(path) {
      assert.equal(path, "/chart");
      return {
        ok: true,
        async text() {
          return '<main id="surface-chart"><svg data-chart-spec="{}"></svg></main>';
        }
      };
    },
    __surfaceCapabilityBootHooks: [
      root => booted.push({
        rootId: root?.id ?? null,
        chartCount: root?.querySelectorAll?.("[data-chart-spec]")?.length ?? 0
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
            chart.hasChartSpec = true;
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

test("createSurfaceInteractionRuntime swaps to the fetched route-local process fragment", async () => {
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
        { process: "desire.defineType", body: { id: "AuthStatus", role: "state", valueType: "text", initial: "idle" } },
        { process: "desire.defineMessage", body: { id: "SignIn", role: "event", writes: {} } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute", "AuthStatus"],
          handles: ["SignIn"],
          emits: [],
          rules: [
            {
              trigger: "SignIn",
              steps: [
                { kind: "setState", state: "ActiveRoute", value: "home" },
                { kind: "setState", state: "AuthStatus", value: "signedIn" }
              ]
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

test("createSurfaceInteractionRuntime keeps the swapped fragment alive across delayed route-changing rules", async () => {
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
        { process: "desire.defineType", body: { id: "AuthStatus", role: "state", valueType: "text", initial: "idle" } },
        { process: "desire.defineMessage", body: { id: "SignIn", role: "event", writes: {} } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute", "AuthStatus"],
          handles: ["SignIn"],
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
        }
      ],
      processWitnesses: [
        { process: "desire.defineType", body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "login" } },
        { process: "desire.defineMessage", body: { id: "SignIn", role: "event", writes: { ActiveRoute: "home" } } },
        { process: "desire.defineProcess", body: {
          id: "ShellNavigation",
          state: ["ActiveRoute"],
          handles: ["SignIn"],
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
  assert.deepEqual(fetches, ["/home", "/home"]);
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

test("buildSurfaceRuntimeManifest only carries process witnesses reachable from active runtime surfaces", () => {
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
    ["ActiveRoute", "OpenHome", "ShellNavigation"]
  );
  const shellProcess = manifest.processWitnesses.find(witness => witness.body.id === "ShellNavigation");
  assert.deepEqual(shellProcess.body.state, ["ActiveRoute"]);
  assert.deepEqual(shellProcess.body.handles, ["OpenHome"]);
  assert.deepEqual(shellProcess.body.rules, []);
  assert.equal(manifest.diagnostics.activeSurfaceId, "Surface.Home");
  assert.deepEqual(manifest.diagnostics.includedSurfaceIds.sort(), ["Surface.Home"]);
  assert.deepEqual(manifest.diagnostics.includedRuntimeIds.sort(), ["ActiveRoute", "OpenHome", "ShellNavigation"]);
  assert.equal(manifest.diagnostics.serializedBytes > 0, true);
});
