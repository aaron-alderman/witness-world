import assert from "node:assert/strict";
import test from "node:test";
import {
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
