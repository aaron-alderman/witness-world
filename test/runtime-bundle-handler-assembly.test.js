import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeBundleHandlers } from "../src/runtime-bundle-handler-assembly.js";

test("runtime bundle handler assembly injects diagnostics and preserves reserved handlers", () => {
  const capturedDiagnostics = [];
  const sessionStore = new Map();

  const handlers = createRuntimeBundleHandlers({
    runtimeProfile: "test",
    activeBundleIds: ["bundle-a"],
    sessionStore,
    factoryDeps: { label: "ok" },
    handlerFactories: [
      {
        factory: ({ label, getRuntimeBundleHandlerDiagnostics }) => ({
          "page.surface": () => {
            capturedDiagnostics.push(getRuntimeBundleHandlerDiagnostics());
            return label;
          }
        })
      }
    ],
    composeHandlers: ({ availableHandlers }) => ({
      handlers: {
        __sessionStore: availableHandlers.__sessionStore,
        "page.surface": availableHandlers["page.surface"]
      },
      diagnostics: {
        activeBundleIds: ["bundle-a"],
        activeHandlerIds: ["page.surface"],
        missingHandlerIds: [],
        extraHandlerIds: []
      }
    })
  });

  assert.equal(handlers.__sessionStore, sessionStore);
  assert.equal(typeof handlers["page.surface"], "function");
  assert.equal(handlers["page.surface"](), "ok");
  assert.deepEqual(capturedDiagnostics, [{
    activeBundleIds: ["bundle-a"],
    activeHandlerIds: ["page.surface"],
    missingHandlerIds: [],
    extraHandlerIds: []
  }]);
  assert.deepEqual(handlers.__runtimeBundleHandlerDiagnostics, {
    activeBundleIds: ["bundle-a"],
    activeHandlerIds: ["page.surface"],
    missingHandlerIds: [],
    extraHandlerIds: []
  });
});
