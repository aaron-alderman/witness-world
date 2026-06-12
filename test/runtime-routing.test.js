import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, thing } from "../src/kernel.js";
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
    handler: "page.home",
    params: { rootWidget: "home.page" },
    matcher: compileRouteMatcher("/")
  }];

  assert.equal(hasReachableHomeRoute(world, routeTable), false);

  world.emit({
    process: "test.widget.define",
    actor: "system",
    claims: [thing("home.page")],
    body: { id: "home.page" }
  });

  assert.equal(hasReachableHomeRoute(world, routeTable), true);
});

test("bootstrap fallback stays profile-driven and disappears once authored home is reachable", () => {
  const world = createWorld();
  const routeTable = [{
    method: "GET",
    path: "/",
    handler: "page.home",
    params: { rootWidget: "home.page" },
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
  }), true);

  world.emit({
    process: "test.widget.define",
    actor: "system",
    claims: [thing("home.page")],
    body: { id: "home.page" }
  });

  assert.equal(shouldServeBootstrapFallback({
    world,
    routeTable,
    runtimeBundleSummary: runtimeBundleSummaryForProfile("full"),
    method: "GET",
    pathname: "/"
  }), false);
});
