import test from "node:test";
import assert from "node:assert/strict";
import { createBootstrapLiveStateReaders, renderBootstrapLiveStateFactory } from "./bootstrap-live-state.js";

test("live bootstrap state readers resolve authored, model, session, scoped selectors, and runtime integration at event time", () => {
  const state = {
    bootstrapState: {
      identities: [],
      contexts: [{ id: "ctx.one" }],
      perspectives: [{ id: "perspective.one" }],
      contextScopes: [{ context: "ctx.one", sourceKind: "local", target: "widget.one", name: "homePage" }],
      contextExports: [{ context: "ctx.one", name: "homePage", target: "widget.one" }]
    },
    session: { authenticated: false },
    model: {
      runtimeProfile: "minimal",
      supportedMcpActingModes: ["delegated"],
      contextBindableTargets: [{ id: "widget.one", context: "ctx.one" }]
    }
  };
  const readers = createBootstrapLiveStateReaders({
    state,
    buildBootstrapRuntimeIntegrationStateFn({ authored, model }) {
      return {
        snapshot: { authored, model },
        runtimePluginAvailabilityForRunner: runnerId => [{ plugin: "plugin." + runnerId }],
        runtimePluginAvailabilityRow: (runnerId, pluginId) => ({ runnerId, pluginId }),
        mcpSupportedTools: () => [{ name: "notes.write" }],
        mcpInstalledToolsForServer: () => [{ tool: "notes.search" }],
        mcpServerRow: () => ({ id: "notes" }),
        mcpSupportedToolRow: () => ({ name: "notes.write" }),
        mcpScopeSummary: () => "scoped"
      };
    }
  });

  state.bootstrapState = {
    identities: [{ id: "identity.aaron" }],
    contexts: [{ id: "ctx.two" }],
    perspectives: [{ id: "perspective.two" }],
    contextScopes: [{ context: "ctx.two", sourceKind: "local", target: "widget.two", name: "homePage" }],
    contextExports: [{ context: "ctx.two", name: "homePage", target: "widget.two" }]
  };
  state.session = { authenticated: true };
  state.model = {
    runtimeProfile: "full",
    supportedMcpActingModes: ["delegated", "service"],
    contextBindableTargets: [{ id: "widget.two", context: "ctx.two" }]
  };

  assert.deepEqual(readers.authored(), state.bootstrapState);
  assert.deepEqual(readers.session(), { authenticated: true });
  assert.deepEqual(readers.model(), state.model);
  assert.equal(readers.runtimeProfile(), "full");
  assert.deepEqual(readers.supportedMcpActingModes(), ["delegated", "service"]);
  assert.deepEqual(readers.contextRows(), [{ id: "ctx.two" }]);
  assert.deepEqual(readers.contextBindableTargets("ctx.two"), [{ id: "widget.two", context: "ctx.two" }]);
  assert.deepEqual(readers.contextScopeRows("ctx.two", "local"), [{ context: "ctx.two", sourceKind: "local", target: "widget.two", name: "homePage" }]);
  assert.deepEqual(readers.contextExportRows("ctx.two"), [{ context: "ctx.two", name: "homePage", target: "widget.two" }]);
  assert.deepEqual(readers.stewardshipTargetKinds(), []);
  assert.deepEqual(readers.stewardshipTargetsFor("context"), [{ id: "ctx.two" }]);
  assert.deepEqual(readers.stewardshipTargetsFor("perspective"), [{ id: "perspective.two" }]);
  assert.deepEqual(readers.runtimeIntegrationState().snapshot, {
    authored: state.bootstrapState,
    model: state.model
  });
  assert.deepEqual(readers.runtimeIntegrationState().runtimePluginAvailabilityForRunner("demo"), [{ plugin: "plugin.demo" }]);
});

test("live bootstrap state factory exposes the browser helper seam", () => {
  const factory = renderBootstrapLiveStateFactory();
  assert.equal(factory.includes("const createBootstrapLiveStateReaders ="), true);
});
