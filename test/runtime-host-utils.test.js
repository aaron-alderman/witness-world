import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createWorld, projectors } from "../src/kernel.js";
import {
  declareBackendHost,
  declareFrontendHost,
  hostCapabilities,
  resolveServerRunner,
  resolveStartupRunner,
  resolveStorageConfig
} from "../src/runtime-host-utils.js";
import { moduleProjectors } from "../src/modules.js";

function createHostWorld({
  capabilityInstalls = [],
  currentRelations = [],
  serverRunners = [],
  witnesses = []
} = {}) {
  const emitted = [];
  return {
    emit(entry) {
      emitted.push(entry);
      return entry;
    },
    allWitnesses() {
      return witnesses;
    },
    project(projector) {
      if (projector === moduleProjectors.capabilityInstalls) return capabilityInstalls;
      if (projector === moduleProjectors.serverRunners) return serverRunners;
      if (projector === projectors.currentRelations) return currentRelations;
      return [];
    },
    get emitted() {
      return emitted;
    }
  };
}

test("runtime host utils declare backend and frontend hosts from runtime profiles", () => {
  const world = createWorld();

  const backend = declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  const frontend = declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  assert.equal(backend[0].process, "declareBackendHost");
  assert.equal(frontend[0].process, "declareFrontendHost");
  assert.equal(world.allWitnesses().some(entry => entry.process === "declareBackendHost"), true);
  assert.equal(world.allWitnesses().some(entry => entry.process === "declareFrontendHost"), true);
});

test("runtime host utils merge installed and legacy host capabilities", () => {
  const world = createHostWorld({
    capabilityInstalls: [
      { target: "backendHost", targetKind: "host", capability: "http.serve" }
    ],
    currentRelations: [
      { from: "backendHost", rel: "hostCapability", to: "jobs.queue" },
      { from: "backendHost", rel: "contextCapability", to: "search.index" }
    ]
  });

  assert.deepEqual([...hostCapabilities(world, "backendHost")].sort(), [
    "http.serve",
    "jobs.queue",
    "search.index"
  ]);
});

test("runtime host utils resolve server runners and bootstrap fallback", () => {
  const noRunnersWorld = createHostWorld({
    capabilityInstalls: [
      { target: "backendHost", targetKind: "host", capability: "http.serve" },
      { target: "frontendHost", targetKind: "host", capability: "dom.render" }
    ]
  });
  assert.deepEqual(resolveStartupRunner(noRunnersWorld), {
    ok: true,
    runner: {
      id: "__bootstrap__",
      backendHost: "backendHost",
      frontendHost: "frontendHost",
      handlerSet: null,
      actors: null,
      storage: null,
      allowActorHeader: false,
      bootstrapOnly: true
    }
  });

  const oneRunnerWorld = createHostWorld({
    serverRunners: [{ id: "runner-1" }]
  });
  assert.deepEqual(resolveServerRunner(oneRunnerWorld), { ok: true, runner: { id: "runner-1" } });

  const manyRunnerWorld = createHostWorld({
    serverRunners: [{ id: "runner-1" }, { id: "runner-2" }]
  });
  assert.deepEqual(resolveServerRunner(manyRunnerWorld), {
    ok: false,
    reason: "multiple server runners defined",
    body: { serverRunners: ["runner-1", "runner-2"] }
  });
});

test("runtime host utils resolve relative storage roots", () => {
  assert.deepEqual(resolveStorageConfig({
    assetsRoot: "assets",
    empty: "",
    notString: 1
  }, "/runtime"), {
    assetsRoot: path.resolve("/runtime", "assets")
  });
});
