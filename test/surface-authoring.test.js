import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { requestBootstrapRouteDefine, requestSurfaceDefine } from "../plugins/authoring-core/authoring-core-processes.js";

function routeSupport() {
  return {
    allowedHandlers: ["page.surface"],
    handlerMetadataById: {
      "page.surface": {
        routeKind: "page",
        methods: ["GET"]
      }
    }
  };
}

test("requestSurfaceDefine emits real DESIRE surface witnesses for a single surface", () => {
  const world = createWorld();
  const result = requestSurfaceDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ReplayRoot",
      surfaceKind: "app-root",
      props: {
        brandName: "DESIRE",
        productName: "Replay"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.single, true);
  assert.equal(result.surfaces[0].id, "ReplayRoot");
  assert.deepEqual(result.witnesses.map(witness => witness.body?.id), ["ReplayRoot"]);
  assert.equal(world.allWitnesses().some(witness => witness.process === "desire.defineSurface" && witness.body?.id === "ReplayRoot"), true);
  assert.equal(world.allWitnesses().some(witness => witness.process === "dsl.source.annotate" && witness.body?.target === "ReplayRoot"), true);
});

test("requestSurfaceDefine accepts an ordered array and preserves witness order", () => {
  const world = createWorld();
  const result = requestSurfaceDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: [
      {
        id: "ReplayRoot",
        surfaceKind: "app-root",
        children: ["ReplayLogin"]
      },
      {
        id: "ReplayLogin",
        surfaceKind: "auth-screen",
        props: {
          routeKey: "login",
          title: "Replay login",
          subtitle: "Surface projection is live"
        }
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.single, false);
  assert.deepEqual(result.surfaces.map(surface => surface.id), ["ReplayRoot", "ReplayLogin"]);
  assert.deepEqual(result.witnesses.map(witness => witness.body?.id), ["ReplayRoot", "ReplayLogin"]);
});

test("requestSurfaceDefine rejects malformed, duplicate, and inconsistent surface batches", () => {
  const world = createWorld();

  const malformed = requestSurfaceDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "BadSurface",
      surfaceKind: { nope: true }
    }
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.status, 400);

  const duplicate = requestSurfaceDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: [
      { id: "ReplayRoot", surfaceKind: "app-root" },
      { id: "ReplayRoot", surfaceKind: "auth-screen" }
    ]
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.status, 409);

  const inconsistent = requestSurfaceDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ReplayRoot",
      surfaceKind: "app-root",
      children: ["MissingChild"]
    }
  });
  assert.equal(inconsistent.ok, false);
  assert.equal(inconsistent.status, 400);
});

test("route.create accepts page.surface rootSurface params and rejects missing rootSurface", () => {
  const world = createWorld();
  const created = requestSurfaceDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: [
      { id: "ReplayRoot", surfaceKind: "app-root", children: ["ReplayLogin"] },
      {
        id: "ReplayLogin",
        surfaceKind: "auth-screen",
        props: { routeKey: "login", title: "Replay login" }
      }
    ]
  });
  assert.equal(created.ok, true);

  const okRoute = requestBootstrapRouteDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "replay_surface_route",
      path: "/replay-surface",
      serves: "ReplayRoot",
      method: "GET",
      handler: "page.surface",
      rootSurface: "ReplayRoot",
      defaultScreen: "login"
    },
    ...routeSupport()
  });
  assert.equal(okRoute.ok, true);
  assert.equal(okRoute.route.params.rootSurface, "ReplayRoot");
  assert.equal(okRoute.route.params.defaultScreen, "login");

  const missingRootSurface = requestBootstrapRouteDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "missing_surface_route",
      path: "/missing-surface",
      serves: "ReplayRoot",
      method: "GET",
      handler: "page.surface"
    },
    ...routeSupport()
  });
  assert.equal(missingRootSurface.ok, false);
  assert.equal(missingRootSurface.status, 400);
  assert.match(missingRootSurface.error, /rootSurface/);
});
