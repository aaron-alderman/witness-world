import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { requestBootstrapRouteDefine, requestMessageDefine, requestProcessDefine, requestProjectionDefine, requestSurfaceDefine, requestTypeDefine } from "../plugins/authoring-core/authoring-core-processes.js";

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

test("requestSurfaceDefine preserves canonical runtime binding semantics on authored surfaces", () => {
  const world = createWorld();
  const result = requestSurfaceDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ReplayInteractive",
      surfaceKind: "auth-screen",
      processRef: "ReplayFlow",
      projectionRefs: ["ReplayClosed"],
      capabilityRefs: ["plugin.chart-runtime"],
      bindings: [
        { prop: "title", source: { kind: "state", state: "ReplayTitle" } }
      ],
      interactions: [
        { target: "primaryAction", event: "click", action: { kind: "setState", state: "ReplayTitle", value: { literal: "Updated" } } }
      ],
      props: {
        routeKey: "login",
        title: "Initial"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.surfaces[0].processRef, "ReplayFlow");
  assert.deepEqual(result.surfaces[0].projectionRefs, ["ReplayClosed"]);
  assert.deepEqual(result.surfaces[0].capabilityRefs, ["plugin.chart-runtime"]);
  assert.equal(result.surfaces[0].bindings[0].prop, "title");
  assert.equal(result.surfaces[0].interactions[0].target, "primaryAction");
  const witness = world.allWitnesses().find(entry => entry.process === "desire.defineSurface" && entry.body?.id === "ReplayInteractive");
  assert.equal(witness?.body?.processRef, "ReplayFlow");
  assert.deepEqual(witness?.body?.projectionRefs, ["ReplayClosed"]);
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

test("requestProcessDefine emits a real DESIRE process witness and source annotation", () => {
  const world = createWorld();
  const result = requestProcessDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ReplayFlow",
      context: "frontend",
      state: ["mode"],
      handles: ["InputChanged"],
      emits: ["ModeChanged"],
      rules: [{ when: "InputChanged", then: "ModeChanged" }]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.process.id, "ReplayFlow");
  assert.equal(result.witness?.process, "desire.defineProcess");
  assert.equal(world.allWitnesses().some(witness => witness.process === "desire.defineProcess" && witness.body?.id === "ReplayFlow"), true);
  assert.equal(world.allWitnesses().some(witness => witness.process === "dsl.source.annotate" && witness.body?.target === "ReplayFlow"), true);
});

test("requestTypeDefine and requestMessageDefine emit real DESIRE witnesses for canonical surface interaction support", () => {
  const world = createWorld();
  const typeResult = requestTypeDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ReplayTitle",
      role: "state",
      valueType: "text",
      initial: "Initial title"
    }
  });
  assert.equal(typeResult.ok, true);
  assert.equal(typeResult.type.id, "ReplayTitle");
  assert.equal(typeResult.witness?.process, "desire.defineType");

  const messageResult = requestMessageDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ReplayToggle",
      role: "event",
      writes: {
        ReplayTitle: "Updated title"
      }
    }
  });
  assert.equal(messageResult.ok, true);
  assert.equal(messageResult.message.id, "ReplayToggle");
  assert.equal(messageResult.witness?.process, "desire.defineMessage");
});

test("requestProcessDefine rejects malformed and duplicate process docs", () => {
  const world = createWorld();

  const malformed = requestProcessDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: []
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.status, 400);

  const created = requestProcessDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "ReplayFlow" }
  });
  assert.equal(created.ok, true);

  const duplicate = requestProcessDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "ReplayFlow" }
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.status, 409);
});

test("requestProjectionDefine emits a real DESIRE projection witness and source annotation", () => {
  const world = createWorld();
  const result = requestProjectionDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ReplayProjection",
      context: "frontend",
      projectionKind: "detail",
      source: "ReplayFlow",
      props: { layout: "stack" }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.projection.id, "ReplayProjection");
  assert.equal(result.witness?.process, "desire.defineProjection");
  assert.equal(world.allWitnesses().some(witness => witness.process === "desire.defineProjection" && witness.body?.id === "ReplayProjection"), true);
  assert.equal(world.allWitnesses().some(witness => witness.process === "dsl.source.annotate" && witness.body?.target === "ReplayProjection"), true);
});

test("requestProjectionDefine rejects malformed and duplicate projection docs", () => {
  const world = createWorld();

  const malformed = requestProjectionDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: []
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.status, 400);

  const created = requestProjectionDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "ReplayProjection" }
  });
  assert.equal(created.ok, true);

  const duplicate = requestProjectionDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { id: "ReplayProjection" }
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.status, 409);
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
      defaultScreen: "login",
      routeState: {
        process: "ReplayFlow",
        state: "ReplayActiveRoute"
      }
    },
    ...routeSupport()
  });
  assert.equal(okRoute.ok, true);
  assert.equal(okRoute.route.params.rootSurface, "ReplayRoot");
  assert.equal(okRoute.route.params.defaultScreen, "login");
  assert.deepEqual(okRoute.route.params.routeState, {
    process: "ReplayFlow",
    state: "ReplayActiveRoute"
  });

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

test("route.create lowers page.surface rootSurface refs and rejects hidden canonical root surfaces", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[surface]]
actor = "system"
id = "ReplayRoot"
surfaceKind = "app-root"
context = "ctx.source"

[[surface]]
actor = "system"
id = "HiddenRoot"
surfaceKind = "auth-screen"
context = "ctx.source"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "replaySurface"
target = "ReplayRoot"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "replaySurface"
target = "ReplayRoot"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "replaySurface"
name = "replaySurface"
`);

  const okRoute = requestBootstrapRouteDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "replay_surface_import_route",
      context: "ctx.target",
      path: "/imported-surface",
      method: "GET",
      handler: "page.surface",
      servesRef: "replaySurface",
      rootSurfaceRef: "replaySurface",
      defaultScreen: "login",
      routeState: {
        process: "ReplayFlow",
        state: "ReplayActiveRoute"
      }
    },
    ...routeSupport()
  });
  assert.equal(okRoute.ok, true);
  assert.equal(okRoute.route.serves, "ReplayRoot");
  assert.equal(okRoute.route.params.rootSurface, "ReplayRoot");
  assert.equal(okRoute.route.params.defaultScreen, "login");
  assert.deepEqual(okRoute.route.params.routeState, {
    process: "ReplayFlow",
    state: "ReplayActiveRoute"
  });

  const hiddenCanonical = requestBootstrapRouteDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "hidden_surface_route",
      context: "ctx.target",
      path: "/hidden-surface",
      method: "GET",
      handler: "page.surface",
      servesRef: "replaySurface",
      rootSurface: "HiddenRoot"
    },
    ...routeSupport()
  });
  assert.equal(hiddenCanonical.ok, false);
  assert.equal(hiddenCanonical.status, 400);
  assert.match(hiddenCanonical.error, /route root surface id targets HiddenRoot.*not visible in authoring context ctx\.target/);
});
