import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapRouteAuthoringView,
  bindBootstrapRouteAuthoringSync,
  buildBootstrapRouteAuthoringSyncDeps,
  buildBootstrapRouteAuthoringView,
  createBootstrapRouteAuthoringSyncDepsBuilder,
  createBootstrapRouteAuthoringSyncHandler,
  renderBootstrapRouteAuthoringSyncFactory,
  runBootstrapRouteAuthoringSync,
  syncBootstrapRouteAuthoringState
} from "./bootstrap-route-authoring-sync.js";

function createRouteFormHarness() {
  const submitButton = { disabled: false };
  const fields = {
    handler: { value: "", disabled: false, type: "select-one" },
    method: { value: "GET", disabled: false, type: "select-one" },
    backendProgramSoul: { value: "", disabled: false, type: "select-one" },
    page: { value: "home", disabled: false, type: "text" },
    rootWidget: { value: "page_root", disabled: false, type: "select-one" },
    rootWidgetRef: { value: "landingPage", disabled: false, type: "text" },
    frontendProgram: { value: "landing_program", disabled: false, type: "select-one" },
    liveProjection: { value: "on", checked: true, disabled: false, type: "checkbox" }
  };
  const routeForm = {
    querySelector(selector) {
      if (selector === 'button[type="submit"]') return submitButton;
      return null;
    }
  };
  const statuses = [];
  return {
    fields,
    routeForm,
    submitButton,
    statuses,
    byId(id) {
      if (id === "route-form") return routeForm;
      return null;
    },
    formField(form, name) {
      if (form !== routeForm) return null;
      return fields[name] || null;
    },
    readFieldValue(formId, fieldName) {
      if (formId !== "route-form") return "";
      return fields[fieldName]?.value ?? "";
    },
    setStatus(id, value) {
      statuses.push([id, value]);
    },
    setSubmitDisabled(formId, value) {
      if (formId === "route-form") submitButton.disabled = value;
    }
  };
}

test("route authoring view explains page handlers and preserves page fields", () => {
  const harness = createRouteFormHarness();
  harness.fields.handler.value = "page.home";
  harness.fields.method.value = "GET";

  const view = buildBootstrapRouteAuthoringView({
    model: {
      runtimeProfile: "full",
      supportedHandlerMetadata: {
        "page.home": {
          routeKind: "page",
          responseKind: "page",
          methods: ["GET"]
        }
      }
    },
    readFieldValue: harness.readFieldValue
  });

  assert.equal(view.enabledFields.page, true);
  assert.equal(view.enabledFields.backendProgramSoul, false);
  assert.equal(view.helpText.includes("page.home"), true);
  assert.equal(view.helpText.includes("page -> page"), true);
  assert.equal(view.submitDisabled, false);
});

test("route authoring sync disables incompatible fields and blocks invalid backend routes", () => {
  const harness = createRouteFormHarness();
  harness.fields.handler.value = "backendProgram.run";
  harness.fields.method.value = "POST";
  harness.fields.backendProgramSoul.value = "";

  const result = runBootstrapRouteAuthoringSync({
    model: {
      runtimeProfile: "minimal",
      supportedHandlerMetadata: {
        "backendProgram.run": {
          routeKind: "backendProgram",
          responseKind: "json",
          methods: ["GET"]
        }
      }
    },
    byId: harness.byId,
    formField: harness.formField,
    readFieldValue: harness.readFieldValue,
    setStatus: harness.setStatus,
    setSubmitDisabled: harness.setSubmitDisabled
  });

  assert.equal(result.handled, true);
  assert.equal(harness.fields.backendProgramSoul.disabled, false);
  assert.equal(harness.fields.page.disabled, true);
  assert.equal(harness.fields.page.value, "");
  assert.equal(harness.fields.rootWidget.disabled, true);
  assert.equal(harness.fields.rootWidget.value, "");
  assert.equal(harness.fields.liveProjection.disabled, true);
  assert.equal(harness.fields.liveProjection.checked, false);
  assert.equal(harness.submitButton.disabled, true);
  assert.equal(harness.statuses.at(-1)?.[0], "route-help");
  assert.equal(harness.statuses.at(-1)?.[1].includes("selected method POST is unsupported"), true);
  assert.equal(harness.statuses.at(-1)?.[1].includes("choose a backend program soul"), true);
});

test("route authoring deps builder keeps model and form reads live at event time", () => {
  const harness = createRouteFormHarness();
  const state = {
    model: {
      runtimeProfile: "full",
      supportedHandlerMetadata: {
        "events.stream": {
          routeKind: "stream",
          responseKind: "stream",
          methods: ["GET"]
        }
      }
    }
  };
  const liveState = {
    model: () => state.model || {}
  };

  const buildDeps = createBootstrapRouteAuthoringSyncDepsBuilder({
    liveState,
    dom: {
      byId: harness.byId,
      formField: harness.formField,
      readFieldValue: harness.readFieldValue,
      setStatus: harness.setStatus,
      setSubmitDisabled: harness.setSubmitDisabled
    }
  });

  harness.fields.handler.value = "events.stream";
  const deps = buildDeps();
  assert.equal(deps.model.runtimeProfile, "full");
  assert.equal(deps.readFieldValue("route-form", "handler"), "events.stream");

  state.model = {
    runtimeProfile: "minimal",
    supportedHandlerMetadata: {
      "page.home": {
        routeKind: "page",
        responseKind: "page",
        methods: ["GET"]
      }
    }
  };
  harness.fields.handler.value = "page.home";

  const directDeps = buildBootstrapRouteAuthoringSyncDeps({
    liveState,
    dom: {
      byId: harness.byId,
      formField: harness.formField,
      readFieldValue: harness.readFieldValue,
      setStatus: harness.setStatus,
      setSubmitDisabled: harness.setSubmitDisabled
    }
  });
  assert.equal(directDeps.model.runtimeProfile, "minimal");
  assert.equal(directDeps.readFieldValue("route-form", "handler"), "page.home");
});

test("route authoring sync bridge binds one documented event family", () => {
  const events = [];
  const target = {
    addEventListener(name, handler) {
      events.push([name, handler]);
    }
  };

  const registered = bindBootstrapRouteAuthoringSync({ target });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "witness:bootstrap-route-authoring-sync");
  assert.equal(typeof registered, "function");

  const handler = createBootstrapRouteAuthoringSyncHandler({
    buildDeps: () => ({
      model: {},
      byId: () => null,
      formField: () => null,
      readFieldValue: () => "",
      setStatus: () => {},
      setSubmitDisabled: () => {}
    })
  });
  assert.deepEqual(handler({ detail: { source: "other" } }), { handled: false });

  const factory = renderBootstrapRouteAuthoringSyncFactory();
  assert.equal(factory.includes("const buildBootstrapRouteAuthoringView ="), true);
  assert.equal(factory.includes("const applyBootstrapRouteAuthoringView ="), true);
  assert.equal(factory.includes("const syncBootstrapRouteAuthoringState ="), true);
  assert.equal(factory.includes("const runBootstrapRouteAuthoringSync ="), true);
  assert.equal(factory.includes("const createBootstrapRouteAuthoringSyncHandler ="), true);
  assert.equal(factory.includes("const bindBootstrapRouteAuthoringSync ="), true);
  assert.equal(factory.includes("const buildBootstrapRouteAuthoringSyncDeps ="), true);
  assert.equal(factory.includes("const createBootstrapRouteAuthoringSyncDepsBuilder ="), true);
});

test("route authoring state sync exposes the shared view contract", () => {
  const view = syncBootstrapRouteAuthoringState({
    model: {
      runtimeProfile: "full",
      supportedHandlerMetadata: {}
    },
    readFieldValue: () => ""
  });

  assert.equal(view.helpText.includes("Select a handler"), true);
  assert.equal(view.submitDisabled, false);
});
