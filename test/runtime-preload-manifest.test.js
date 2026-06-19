import assert from "node:assert/strict";
import test from "node:test";
import { renderSurfacePage } from "../src/runtime-surface-page.js";

function fakeWorld(witnesses) {
  return {
    allWitnesses() {
      return witnesses;
    }
  };
}

function manifestFromHtml(html) {
  const match = String(html).match(/<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/i);
  assert.ok(match, "expected surface runtime manifest");
  return JSON.parse(match[1]);
}

test("surface runtime manifests carry stable preload policies and capability preload assets for the whole shell", () => {
  const world = fakeWorld([
    {
      process: "desire.defineType",
      body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "home" }
    },
    {
      process: "desire.defineProcess",
      body: { id: "ShellNavigation", state: ["ActiveRoute"], handles: [], emits: [], rules: [] }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "Root",
        surfaceKind: "app-root",
        processRef: "ShellNavigation",
        children: ["HomeRoute", "GoodmanRoute"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "HomeRoute",
        surfaceKind: "app-shell",
        props: { routeKey: "home", routePath: "/home", domId: "surface-home", text: "Home" }
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "GoodmanRoute",
        surfaceKind: "app-shell",
        capabilityRefs: ["chart.render"],
        props: { routeKey: "goodman", routePath: "/goodman", domId: "surface-goodman", text: "Goodman" }
      }
    }
  ]);
  const runtimePreloads = [
    {
      id: "chart_boot",
      when: { kind: "boot" },
      targets: [{ kind: "capability", capability: "chart.render", load: ["assets"] }]
    },
    {
      id: "goodman_idle",
      when: { kind: "idleAfterRoute", route: "home", delayMs: 1000 },
      targets: [{ kind: "route", route: "goodman", load: ["manifest", "capabilityAssets"] }]
    }
  ];
  const capabilityPreloadProviders = [{
    id: "test.chart.preload",
    capability: "chart.render",
    factory() {
      return {
        stylesheetHrefs: ["/chart.css"],
        scriptBodies: ["window.__chartRuntimeWarm = true;"]
      };
    }
  }];

  const homeManifest = manifestFromHtml(renderSurfacePage(world, {
    rootSurfaceId: "Root",
    requestPathname: "/home",
    runtimePreloads,
    capabilityPreloadProviders
  }));
  const goodmanManifest = manifestFromHtml(renderSurfacePage(world, {
    rootSurfaceId: "Root",
    requestPathname: "/goodman",
    runtimePreloads,
    capabilityPreloadProviders
  }));

  assert.deepEqual(homeManifest.preloadPolicies, goodmanManifest.preloadPolicies);
  assert.deepEqual(homeManifest.preloadPolicies, runtimePreloads);
  assert.deepEqual(homeManifest.capabilityPreloadAssets, {
    "chart.render": {
      stylesheetHrefs: ["/chart.css"],
      scriptSrcs: [],
      inlineCss: [],
      scriptBodies: ["window.__chartRuntimeWarm = true;"]
    }
  });
});
