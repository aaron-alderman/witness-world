import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapBackendAuthoringControlsState,
  applyBootstrapBackendVersionControlsState,
  bindBootstrapBackendAuthoringControlsSync,
  bindBootstrapBackendVersionControlsSync,
  buildBootstrapBackendControlsSyncDeps,
  renderBootstrapControlsSyncFactory,
  runBootstrapBackendControlsRender,
  runBootstrapBackendAuthoringControlsSync,
  runBootstrapBackendVersionControlsSync,
  syncBootstrapBackendAuthoringControlsState,
  syncBootstrapBackendVersionControlsState
} from "./bootstrap-controls-sync.js";

test("backend authoring controls sync builds and applies derived state only for the authored backend source", () => {
  let appliedView = null;

  assert.deepEqual(runBootstrapBackendAuthoringControlsSync({
    detail: { source: "bootstrap-backend-authoring-controls" },
    syncBootstrapBackendAuthoringControlsStateFn: () => ({ selectedVersionSoul: "program.alpha" }),
    applyBootstrapBackendAuthoringControlsStateFn: ({ view }) => { appliedView = view; }
  }), {
    handled: true,
    view: { selectedVersionSoul: "program.alpha" }
  });

  assert.deepEqual(runBootstrapBackendAuthoringControlsSync({
    detail: { source: "other" },
    syncBootstrapBackendAuthoringControlsStateFn: () => ({ selectedVersionSoul: "program.beta" }),
    applyBootstrapBackendAuthoringControlsStateFn: ({ view }) => { appliedView = view; }
  }), { handled: false });

  assert.deepEqual(appliedView, { selectedVersionSoul: "program.alpha" });
});

test("backend version controls sync builds and applies derived state only for the authored backend version source", () => {
  let appliedView = null;

  assert.deepEqual(runBootstrapBackendVersionControlsSync({
    detail: { source: "bootstrap-backend-version-controls" },
    syncBootstrapBackendVersionControlsStateFn: () => ({ activate: { selectedSoul: "program.alpha" } }),
    applyBootstrapBackendVersionControlsStateFn: ({ view }) => { appliedView = view; }
  }), {
    handled: true,
    view: { activate: { selectedSoul: "program.alpha" } }
  });

  assert.deepEqual(runBootstrapBackendVersionControlsSync({
    detail: { source: "other" },
    syncBootstrapBackendVersionControlsStateFn: () => ({ activate: { selectedSoul: "program.beta" } }),
    applyBootstrapBackendVersionControlsStateFn: ({ view }) => { appliedView = view; }
  }), { handled: false });

  assert.deepEqual(appliedView, { activate: { selectedSoul: "program.alpha" } });
});

test("backend state sync helpers derive authoring and version views from current form reads", () => {
  const authoringView = syncBootstrapBackendAuthoringControlsState({
    readFieldValue(formId, fieldName) {
      const values = {
        "backend-program-form:context": "ctx.demo",
        "backend-program-version-form:soul": "program.alpha",
        "backend-program-version-form:context": "ctx.demo",
        "backend-program-version-form:transitionFrom": "v1",
        "backend-program-version-form:transitionStrategy": "migrate",
        "backend-step-form:version": "v2",
        "backend-step-form:op": "emit"
      };
      return values[`${formId}:${fieldName}`] || "";
    },
    contextRows: [{ id: "ctx.demo" }],
    backendProgramRows: [{ soul: "program.alpha" }],
    backendProgramVersionRows: [
      { soul: "program.alpha", version: "v1" },
      { soul: "program.alpha", version: "v2" }
    ],
    supportedBackendOps: ["emit", "await"]
  });

  assert.equal(authoringView.selectedProgramContext, "ctx.demo");
  assert.equal(authoringView.selectedVersionSoul, "program.alpha");
  assert.equal(authoringView.selectedTransitionFrom, "v1");
  assert.equal(authoringView.selectedTransitionStrategy, "migrate");
  assert.equal(authoringView.selectedStepVersion, "v2");
  assert.equal(authoringView.selectedStepOp, "emit");

  const versionView = syncBootstrapBackendVersionControlsState({
    readSelectValue(id) {
      const values = {
        "backend-program-activate-soul": "program.alpha",
        "backend-program-activate-version": "v2",
        "backend-program-rollback-soul": "program.alpha"
      };
      return values[id] || "";
    },
    backendProgramRows: [{ soul: "program.alpha", context: "ctx.demo" }],
    backendProgramVersionRows: [
      { soul: "program.alpha", version: "v1", active: true, index: 1 },
      { soul: "program.alpha", version: "v2", active: false, index: 2 }
    ],
    backendProgramTransitionRows: [{ soul: "program.alpha", from: "v1", to: "v2", strategy: "migrate" }],
    backendProgramActivationHistoryRows: [
      { soul: "program.alpha", version: "v1" },
      { soul: "program.alpha", version: "v2" }
    ],
    authorityContexts: ["ctx.demo"]
  });

  assert.equal(versionView.activate.selectedSoul, "program.alpha");
  assert.equal(versionView.activate.selectedVersion, "v2");
  assert.equal(versionView.activate.submitDisabled, false);
  assert.equal(versionView.rollback.selectedSoul, "program.alpha");
});

test("control sync binders route backend events through the shared deps seam", () => {
  const listeners = new Map();
  let backendAuthoring = 0;
  let backendVersion = 0;

  const target = {
    addEventListener(eventName, handler) {
      listeners.set(eventName, handler);
    }
  };

  bindBootstrapBackendAuthoringControlsSync({
    target,
    buildDeps: () => ({
      syncBootstrapBackendAuthoringControlsStateFn: () => {
        backendAuthoring += 1;
        return { selectedVersionSoul: "program.alpha" };
      },
      applyBootstrapBackendAuthoringControlsStateFn: () => { backendAuthoring += 1; }
    })
  });
  bindBootstrapBackendVersionControlsSync({
    target,
    buildDeps: () => ({
      syncBootstrapBackendVersionControlsStateFn: () => {
        backendVersion += 1;
        return { activate: { selectedSoul: "program.alpha" } };
      },
      applyBootstrapBackendVersionControlsStateFn: () => { backendVersion += 1; }
    })
  });

  listeners.get("witness:bootstrap-backend-authoring-sync")?.({
    detail: { source: "bootstrap-backend-authoring-controls" }
  });
  listeners.get("witness:bootstrap-backend-help-sync")?.({
    detail: { source: "bootstrap-backend-version-controls" }
  });

  assert.equal(backendAuthoring, 2);
  assert.equal(backendVersion, 2);
});

test("backend render helper preserves authoring-before-version sync/apply ordering", () => {
  const calls = [];

  assert.deepEqual(runBootstrapBackendControlsRender({
    syncBootstrapBackendAuthoringControlsStateFn: () => {
      calls.push("sync-authoring");
      return { selectedVersionSoul: "program.alpha" };
    },
    syncBootstrapBackendVersionControlsStateFn: () => {
      calls.push("sync-version");
      return { activate: { selectedSoul: "program.alpha" } };
    },
    applyBootstrapBackendAuthoringControlsStateFn: ({ view }) => {
      calls.push(["apply-authoring", view.selectedVersionSoul].join(":"));
    },
    applyBootstrapBackendVersionControlsStateFn: ({ view }) => {
      calls.push(["apply-version", view.activate.selectedSoul].join(":"));
    }
  }), {
    handled: true,
    authoringView: { selectedVersionSoul: "program.alpha" },
    versionView: { activate: { selectedSoul: "program.alpha" } }
  });

  assert.deepEqual(calls, [
    "sync-authoring",
    "sync-version",
    "apply-authoring:program.alpha",
    "apply-version:program.alpha"
  ]);
});

test("backend deps builder resolves live authored and DOM readers through the shared runtime packet", () => {
  const nodes = new Map([
    ["backend-program-activate-soul", { value: "program.alpha" }],
    ["backend-program-form", {
      elements: {
        namedItem(name) {
          return name === "context" ? { value: "ctx.demo" } : null;
        }
      },
      querySelector() {
        return null;
      }
    }]
  ]);

  const deps = buildBootstrapBackendControlsSyncDeps({
    state: {},
    liveState: {
      authored: () => ({
        contexts: [{ id: "ctx.demo" }],
        backendPrograms: [{ soul: "program.alpha", context: "ctx.demo" }],
        backendProgramVersions: [{ soul: "program.alpha", version: "v1", active: true }],
        backendProgramTransitions: [],
        backendProgramActivationHistory: [],
        authority: { mutationContexts: ["ctx.demo"] },
        operator: { mutations: { enabled: true } },
        identities: []
      }),
      session: () => ({ authenticated: true }),
      model: () => ({ supportedBackendOps: ["emit"] })
    },
    dom: {
      byId(id) {
        return nodes.get(id) || null;
      },
      formField(form, name) {
        return form?.elements?.namedItem(name) || null;
      },
      fillSelect() {},
      setStatus() {}
    }
  });

  assert.deepEqual(deps.contextRows, [{ id: "ctx.demo" }]);
  assert.deepEqual(deps.backendProgramRows, [{ soul: "program.alpha", context: "ctx.demo" }]);
  assert.deepEqual(deps.backendProgramVersionRows, [{ soul: "program.alpha", version: "v1", active: true }]);
  assert.deepEqual(deps.authorityContexts, ["ctx.demo"]);
  assert.equal(deps.readSelectValue("backend-program-activate-soul"), "program.alpha");
  assert.equal(deps.readFieldValue("backend-program-form", "context"), "ctx.demo");
});

test("controls sync factory exposes the shared browser seam", () => {
  const factory = renderBootstrapControlsSyncFactory();

  assert.equal(factory.includes("const syncBootstrapBackendAuthoringControlsState ="), true);
  assert.equal(factory.includes("const applyBootstrapBackendAuthoringControlsState ="), true);
  assert.equal(factory.includes("const syncBootstrapBackendVersionControlsState ="), true);
  assert.equal(factory.includes("const applyBootstrapBackendVersionControlsState ="), true);
  assert.equal(factory.includes("const runBootstrapBackendControlsRender ="), true);
  assert.equal(factory.includes("const buildBootstrapBackendControlsSyncDeps ="), true);
  assert.equal(factory.includes("const createBootstrapBackendControlsSyncDepsBuilder ="), true);
  assert.equal(factory.includes("const bindBootstrapBackendAuthoringControlsSync ="), true);
  assert.equal(factory.includes("const bindBootstrapBackendVersionControlsSync ="), true);
  assert.equal(factory.includes("const bindBootstrapScopedControlsSync ="), false);
  assert.equal(factory.includes('"witness:bootstrap-dependent-select-sync"'), false);
});
