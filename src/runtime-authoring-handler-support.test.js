import assert from "node:assert/strict";
import test from "node:test";
import { mergeAuthoringHandlerSupport, resolveAuthoringHandlerSupport } from "./runtime-authoring-handler-support.js";

test("mergeAuthoringHandlerSupport adds compatible plugin-provided handlers, metadata, and handler sets", () => {
  const support = mergeAuthoringHandlerSupport({
    supportedHandlerSets: [],
    supportedHandlers: ["page.surface"],
    supportedPageHandlers: ["page.surface"],
    supportedHandlerMetadata: {
      "page.surface": { routeKind: "page", methods: ["GET"] }
    },
    pluginCatalog: {
      packages: [
        {
          validation: { ok: true },
          compatibility: { compatible: true },
          execution: { executable: true },
          resolvedBundles: [{ id: "bundle-inspect" }, { id: "bundle-demo" }],
          resolvedRuntimeContributions: {
            handlerSets: ["demo"],
            handlerMetadata: {
              "events.stream": { routeKind: "stream", methods: ["GET"] }
            }
          }
        }
      ]
    }
  });

  assert.equal(support.supportedHandlers.includes("page.surface"), true);
  assert.equal(support.supportedHandlers.includes("events.stream"), true);
  assert.equal(support.supportedHandlerSets.includes("demo"), true);
  assert.equal(support.supportedHandlerMetadata["events.stream"]?.routeKind, "stream");
});

test("resolveAuthoringHandlerSupport loads compatible inactive plugin-owned packages for authoring inspection", async () => {
  let promotedActive = false;
  const support = await resolveAuthoringHandlerSupport({
    supportedHandlerSets: [],
    supportedHandlers: [],
    supportedPageHandlers: [],
    supportedHandlerMetadata: {},
    pluginCatalog: {
      packages: [
        {
          id: "plugin.inspect",
          validation: { ok: true },
          compatibility: { compatible: true },
          execution: { executable: true, mode: "plugin-owned" },
          activation: { active: false },
          resolvedBundles: [],
          resolvedRuntimeContributions: { handlerSets: [], handlerMetadata: {} }
        }
      ]
    },
    loadRuntimePluginModulesImpl: async ({ pluginCatalog }) => {
      promotedActive = pluginCatalog.packages[0]?.activation?.active === true;
      return { pluginStates: {} };
    },
    applyRuntimePluginLoadStateImpl: pluginCatalog => ({
      ...pluginCatalog,
      packages: pluginCatalog.packages.map(pluginPackage => ({
        ...pluginPackage,
        resolvedRuntimeContributions: {
          handlerSets: ["demo"],
          handlerMetadata: {
            "events.stream": { routeKind: "stream", methods: ["GET"] }
          }
        }
      }))
    })
  });

  assert.equal(promotedActive, true);
  assert.equal(support.supportedHandlers.includes("events.stream"), true);
  assert.equal(support.supportedHandlerSets.includes("demo"), true);
  assert.equal(support.supportedHandlerMetadata["events.stream"]?.routeKind, "stream");
});
