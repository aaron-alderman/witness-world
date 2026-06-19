import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { runtimeBundleSummaryForProfile } from "../src/runtime-bundles.js";
import {
  compileRouteMatcher,
  hasReachableHomeRoute,
  shouldServeBootstrapFallback
} from "../src/runtime-routing.js";

test("reachable authored home routes are recognized from declared route tables", () => {
  const world = createWorld();
  const routeTable = [{
    method: "GET",
    path: "/",
    handler: "page.surface",
    params: { rootSurface: "home.surface" },
    matcher: compileRouteMatcher("/")
  }];

  assert.equal(hasReachableHomeRoute(world, routeTable), true);
});

test("bootstrap fallback stays profile-driven and disappears once authored home is reachable", () => {
  const world = createWorld();
  const routeTable = [{
    method: "GET",
    path: "/",
    handler: "page.surface",
    params: { rootSurface: "home.surface" },
    matcher: compileRouteMatcher("/")
  }];

  assert.equal(shouldServeBootstrapFallback({
    world,
    routeTable,
    runtimeBundleSummary: runtimeBundleSummaryForProfile("minimal"),
    method: "GET",
    pathname: "/"
  }), false);

  assert.equal(shouldServeBootstrapFallback({
    world,
    routeTable,
    runtimeBundleSummary: runtimeBundleSummaryForProfile("full"),
    method: "GET",
    pathname: "/"
  }), false);
});
