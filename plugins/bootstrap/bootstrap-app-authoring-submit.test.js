import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  bootstrapAppAuthoringSubmitContractsByFamily,
  loadBootstrapAppAuthoringSubmitContracts
} from "./bootstrap-app-authoring-submit-contracts.js";
import {
  bindBootstrapAppAuthoringSubmit,
  buildBootstrapAppAuthoringSubmitRequest,
  renderBootstrapAppAuthoringSubmitFactory,
  runBootstrapAppAuthoringSubmit
} from "./bootstrap-app-authoring-submit.js";

test("bootstrap app authoring submit contracts load from authored WTOML", async () => {
  const source = await readFile(new URL("./bootstrap-app-authoring-submit-contracts.wtoml", import.meta.url), "utf8");
  const contracts = loadBootstrapAppAuthoringSubmitContracts();

  assert.equal(source.includes('family = "widget"'), true);
  assert.equal(source.includes('strategy = "firstNonBlank"'), true);
  assert.equal(source.includes('family = "route"'), true);
  assert.equal(contracts.widget.url, "/api/widgets");
  assert.equal(contracts.widget.checkboxes, "boolean");
  assert.deepEqual(contracts.widget.dropFields, ["guidanceTarget", "tutorialTarget"]);
  assert.equal(Array.isArray(contracts.widget.fields), true);
  assert.equal(contracts.route.url, "/api/routes");
});

test("bootstrap app authoring submit request builder preserves create-form payload contracts", () => {
  assert.deepEqual(
    buildBootstrapAppAuthoringSubmitRequest({
      detail: { family: "context" },
      data: {
        id: "ctx.platform",
        label: "Platform",
        parent: "",
        stewardsJson: "[]"
      }
    }),
    {
      url: "/api/contexts",
      body: {
        id: "ctx.platform",
        label: "Platform",
        parent: "",
        stewardsJson: "[]"
      }
    }
  );

  assert.deepEqual(
    buildBootstrapAppAuthoringSubmitRequest({
      detail: { family: "widget" },
      data: {
        id: "page_root",
        kind: "Page",
        parent: "",
        guidanceTarget: "",
        attach: false,
        template: true,
        order: "0",
        level: "",
        text: "",
        title: "Home"
      }
    }),
    {
      url: "/api/widgets",
      body: {
        id: "page_root",
        kind: "Page",
        guidanceTarget: "page_root",
        attach: false,
        template: true,
        order: 0,
        level: undefined,
        title: "Home"
      }
    }
  );

  assert.deepEqual(
    buildBootstrapAppAuthoringSubmitRequest({
      detail: { family: "route" },
      data: {
        id: "world_route",
        path: "/world",
        handler: "page.world",
        page: "world",
        rootWidget: "page_root",
        rootWidgetRef: "landingPage",
        liveProjection: true
      }
    }),
    {
      url: "/api/routes",
      body: {
        id: "world_route",
        path: "/world",
        handler: "page.world",
        page: "world",
        rootWidget: "page_root",
        rootWidgetRef: "landingPage",
        liveProjection: true
      }
    }
  );

  assert.deepEqual(
    buildBootstrapAppAuthoringSubmitRequest({
      detail: { family: "route" },
      data: {
        id: "surface_route",
        path: "/surface",
        handler: "page.surface",
        rootWidget: "",
        frontendProgram: "",
        routeStateProcess: "ShellNavigation",
        routeStateProcessRef: "",
        routeStateState: "",
        routeStateStateRef: "activeRoute",
        liveProjection: false
      }
    }),
    {
      url: "/api/routes",
      body: {
        id: "surface_route",
        path: "/surface",
        handler: "page.surface",
        routeState: {
          process: "ShellNavigation",
          stateRef: "activeRoute"
        },
        liveProjection: false
      }
    }
  );
});

test("bootstrap app authoring submit helper posts, resets, and refreshes on success", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapAppAuthoringSubmit({
    detail: {
      family: "route",
      formId: "route-form",
      statusId: "route-status"
    },
    contractsByFamily: bootstrapAppAuthoringSubmitContractsByFamily,
    readFormData: () => ({
      id: "surface_route",
      path: "/surface",
      handler: "page.surface",
      rootSurface: "landing_surface",
      routeStateProcess: "ShellNavigation",
      routeStateStateRef: "activeRoute",
      liveProjection: false
    }),
    postJson: async (url, body) => {
      calls.push({ url, body });
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: "/api/routes",
    body: {
      id: "surface_route",
      path: "/surface",
      handler: "page.surface",
      rootSurface: "landing_surface",
      routeState: {
        process: "ShellNavigation",
        stateRef: "activeRoute"
      },
      liveProjection: false
    }
  }]);
  assert.deepEqual(statuses, [{ id: "route-status", text: "Saved." }]);
  assert.deepEqual(resets, ["route-form"]);
  assert.equal(refreshed, 1);
});

test("bootstrap app authoring submit helper reports errors without reset or refresh", async () => {
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapAppAuthoringSubmit({
    detail: {
      family: "runner",
      formId: "runner-form",
      statusId: "runner-status"
    },
    contractsByFamily: bootstrapAppAuthoringSubmitContractsByFamily,
    readFormData: () => ({
      id: "demo_server"
    }),
    postJson: async () => {
      throw new Error("runner conflict");
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, false);
  assert.deepEqual(statuses, [{ id: "runner-status", text: "runner conflict" }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 0);
});

test("bootstrap app authoring submit bridge binds one documented event family", () => {
  const events = [];
  const forms = new Map([
    ["context-form", { addEventListener(name, handler) { events.push([name, handler]); } }],
    ["perspective-form", { addEventListener(name, handler) { events.push([name, handler]); } }],
    ["widget-form", { addEventListener(name, handler) { events.push([name, handler]); } }],
    ["route-form", { addEventListener(name, handler) { events.push([name, handler]); } }],
    ["serve-form", { addEventListener(name, handler) { events.push([name, handler]); } }],
    ["runner-form", { addEventListener(name, handler) { events.push([name, handler]); } }]
  ]);
  const target = {
    document: {
      getElementById(id) {
        return forms.get(id) || null;
      }
    }
  };

  const registered = bindBootstrapAppAuthoringSubmit({ target });
  assert.equal(events.length, 6);
  assert.equal(events.every(([name]) => name === "submit"), true);
  assert.equal(typeof registered, "function");

  const factory = renderBootstrapAppAuthoringSubmitFactory();
  assert.equal(factory.includes("const bootstrapAppAuthoringSubmitContractsByFamily ="), true);
  assert.equal(factory.includes("const buildBootstrapAppAuthoringSubmitRequest ="), true);
  assert.equal(factory.includes("const runBootstrapAppAuthoringSubmit ="), true);
  assert.equal(factory.includes("const bindBootstrapAppAuthoringSubmit ="), true);
});
