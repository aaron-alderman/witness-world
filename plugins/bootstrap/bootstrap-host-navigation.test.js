import test from "node:test";
import assert from "node:assert/strict";
import {
  continueBootstrapTutorialOnPage,
  openBootstrapAppHome,
  renderBootstrapHostNavigationFactory
} from "./bootstrap-host-navigation.js";

test("bootstrap host navigation keeps not-ready app handoff explicit", async () => {
  const calls = [];
  const result = await openBootstrapAppHome({
    href: "/",
    getAppReady: () => false,
    refresh: async () => { calls.push("refresh"); },
    setBootstrapStatus(message) { calls.push(["status", message]); }
  });
  assert.deepEqual(result, { opened: false, reason: "not-ready" });
  assert.deepEqual(calls, ["refresh", ["status", "Home route is not ready yet."]]);
});

test("bootstrap host navigation re-checks freshness and handles same-url handoff by surface", async () => {
  const calls = [];
  let ready = false;
  const result = await openBootstrapAppHome({
    href: "/",
    currentSurfacePage: "bootstrap",
    currentHref: "http://bootstrap.local/",
    getAppReady: () => ready,
    refresh: async () => { ready = true; calls.push("refresh"); },
    advance: true,
    advanceTutorial: async () => { calls.push("advance"); },
    assign(target) { calls.push(["assign", target]); },
    reload() { calls.push("reload"); }
  });
  assert.deepEqual(result, { opened: true, mode: "assign-same-url", target: "http://bootstrap.local/" });
  assert.deepEqual(calls, ["refresh", "advance", ["assign", "http://bootstrap.local/"]]);

  const reloadResult = await openBootstrapAppHome({
    href: "/",
    currentSurfacePage: "app",
    currentHref: "http://bootstrap.local/",
    getAppReady: () => true,
    assign(target) { calls.push(["assign-app", target]); },
    reload() { calls.push("reload-app"); }
  });
  assert.deepEqual(reloadResult, { opened: true, mode: "reload-same-url", target: "http://bootstrap.local/" });
  assert.equal(calls.includes("reload-app"), true);
});

test("bootstrap tutorial page continuation delegates app handoff and reloads same-page bootstrap/world routes", async () => {
  const calls = [];
  const appResult = { opened: true, mode: "assign", target: "http://bootstrap.local/" };
  assert.deepEqual(await continueBootstrapTutorialOnPage({
    page: "app",
    openAppHome: async options => {
      calls.push(["openAppHome", options]);
      return appResult;
    }
  }), appResult);

  const bootstrapResult = await continueBootstrapTutorialOnPage({
    page: "bootstrap",
    currentHref: "http://bootstrap.local/_bootstrap",
    currentPathname: "/_bootstrap",
    reload() { calls.push("reload-bootstrap"); }
  });
  assert.deepEqual(bootstrapResult, { continued: true, mode: "reload", target: "http://bootstrap.local/_bootstrap" });

  const worldResult = await continueBootstrapTutorialOnPage({
    page: "world",
    currentHref: "http://bootstrap.local/_bootstrap",
    currentPathname: "/_bootstrap",
    assign(target) { calls.push(["assign-world", target]); }
  });
  assert.deepEqual(worldResult, { continued: true, mode: "assign", target: "http://bootstrap.local/world" });
  assert.equal(calls.some(entry => Array.isArray(entry) && entry[0] === "openAppHome"), true);
});

test("bootstrap host navigation factory exposes the shared browser seam", () => {
  const factory = renderBootstrapHostNavigationFactory();
  assert.equal(factory.includes("const openBootstrapAppHome ="), true);
  assert.equal(factory.includes("const continueBootstrapTutorialOnPage ="), true);
});
