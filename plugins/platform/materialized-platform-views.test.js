import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/kernel.js";
import { createMaterializedView } from "../../src/modules.js";
import { createMaterializedViewRegistry } from "../../src/materialized-views.js";
import { createResourceProbeCollector } from "../../src/resource-probes.js";
import { readPlatformGitBoundaryState } from "./platform-model.js";
import { readDeclaredPlatformSliceView } from "./materialized-platform-views.js";

function createAppContext(world, extra = {}) {
  return {
    project: projector => world.project(projector, {
      observations: world.allObservations()
    }),
    materializedViews: createMaterializedViewRegistry({
      world,
      probeCollector: createResourceProbeCollector()
    }),
    ...extra
  };
}

test("platform telemetry view signature ignores its own materialized view state and probe rows", async () => {
  const world = createWorld();
  createMaterializedView(world, {
    actor: "adam",
    id: "platform.view.telemetry",
    kind: "platformSlice",
    sliceKey: "telemetry",
    modelView: "telemetry",
    ttlMs: 1000,
    sourceProjectors: ["materializedViewStates", "resourceProbeOperations"]
  });
  const appContext = createAppContext(world);
  let builds = 0;

  const readTelemetry = () => readDeclaredPlatformSliceView(world, appContext, {
    sliceKey: "telemetry",
    modelView: "telemetry",
    request: {
      id: `req-${builds + 1}`,
      actor: "adam",
      path: "/api/platform-model?view=telemetry",
      view: "telemetry"
    },
    buildPlatformSliceImpl: async () => ({
      build: ++builds,
      sliceKey: "telemetry"
    })
  });

  const first = await readTelemetry();
  const second = await readTelemetry();

  assert.deepEqual(first, { build: 1, sliceKey: "telemetry" });
  assert.deepEqual(second, { build: 1, sliceKey: "telemetry" });
  assert.equal(builds, 1);
  assert.equal(
    world.allObservations().some(row =>
      row.process === "materializedView.read"
      && row.body?.id === "platform.view.telemetry"
    ),
    true
  );
  assert.equal(
    world.allObservations().some(row =>
      row.process === "runtime.resourceProbe.operation"
      && row.body?.materializedViewId === "platform.view.telemetry"
    ),
    true
  );
});

test("platform materialized view signatures ignore their own read and probe observations", async () => {
  const world = createWorld();
  createMaterializedView(world, {
    actor: "adam",
    id: "platform.view.telemetry",
    kind: "platformSlice",
    sliceKey: "telemetry",
    modelView: "telemetry",
    ttlMs: 1000,
    sourceWitnessProcesses: ["materializedView.read", "runtime.resourceProbe.operation"]
  });
  const appContext = createAppContext(world);
  let builds = 0;

  const readTelemetry = () => readDeclaredPlatformSliceView(world, appContext, {
    sliceKey: "telemetry",
    modelView: "telemetry",
    request: {
      id: `req-${builds + 1}`,
      actor: "adam",
      path: "/api/platform-model?view=telemetry",
      view: "telemetry"
    },
    buildPlatformSliceImpl: async () => ({
      build: ++builds,
      sliceKey: "telemetry"
    })
  });

  const first = await readTelemetry();
  const second = await readTelemetry();

  assert.deepEqual(first, { build: 1, sliceKey: "telemetry" });
  assert.deepEqual(second, { build: 1, sliceKey: "telemetry" });
  assert.equal(builds, 1);
});

test("platform telemetry view skips inventory and git dependency reads when the slice does not require them", async () => {
  const world = createWorld();
  createMaterializedView(world, {
    actor: "adam",
    id: "platform.view.telemetry",
    kind: "platformSlice",
    sliceKey: "telemetry",
    modelView: "telemetry",
    ttlMs: 1000
  });
  const calls = {
    inventory: 0,
    gitState: 0,
    gitToken: 0
  };
  const appContext = createAppContext(world, {
    platformDependencyService: {
      async readInventoryTokenSnapshot() {
        calls.inventory += 1;
        return { tokens: {}, details: {} };
      },
      async readGitBoundaryState() {
        calls.gitState += 1;
        return { remotes: [], refs: [], currentBranchName: null };
      },
      async readGitBoundaryToken() {
        calls.gitToken += 1;
        return { token: "git:none", detail: { kind: "gitBoundary" } };
      }
    }
  });

  await readDeclaredPlatformSliceView(world, appContext, {
    sliceKey: "telemetry",
    modelView: "telemetry",
    request: {
      id: "req-telemetry-skip",
      actor: "adam",
      path: "/api/platform-model?view=telemetry",
      view: "telemetry"
    },
    buildPlatformSliceImpl: async () => ({
      build: 1,
      sliceKey: "telemetry"
    })
  });

  assert.equal(calls.inventory, 0);
  assert.equal(calls.gitState, 0);
  assert.equal(calls.gitToken, 0);
});

test("platform overview summary requests only the inventory classes declared for that slice", async () => {
  const world = createWorld();
  createMaterializedView(world, {
    actor: "adam",
    id: "platform.view.overview.summary",
    kind: "platformSlice",
    sliceKey: "overview",
    modelView: "summary",
    ttlMs: 1000
  });
  let capturedRequirements = null;
  const appContext = createAppContext(world, {
    platformDependencyService: {
      async readInventoryTokenSnapshot(requirements) {
        capturedRequirements = requirements;
        return { tokens: { pluginManifests: "plugins:v1" }, details: {} };
      }
    }
  });

  await readDeclaredPlatformSliceView(world, appContext, {
    sliceKey: "overview",
    modelView: "summary",
    request: {
      id: "req-overview-summary",
      actor: "adam",
      path: "/api/platform-model?area=overview&section=summary",
      view: "summary"
    },
    buildPlatformSliceImpl: async () => ({
      build: 1,
      sliceKey: "overview"
    })
  });

  assert.deepEqual(capturedRequirements, {
    docs: false,
    folders: false,
    knowledgeRelations: false,
    testInventory: false,
    pluginManifests: true,
    gitBoundary: false
  });
});

test("platform push view reuses one git-boundary read within a single cold request", async () => {
  const world = createWorld();
  createMaterializedView(world, {
    actor: "adam",
    id: "platform.view.pushes",
    kind: "platformSlice",
    sliceKey: "pushes",
    modelView: "pushes",
    ttlMs: 1000
  });
  let gitStateCalls = 0;
  const appContext = createAppContext(world, {
    platformDependencyService: {
      async readInventoryTokenSnapshot() {
        return { tokens: {}, details: {} };
      },
      async readGitBoundaryState() {
        gitStateCalls += 1;
        return {
          remotes: [{ id: "gitRemote:origin", name: "origin", remoteUrl: "https://example.com/repo.git", provider: "generic" }],
          refs: [{ id: "gitRef:refs/heads/main", refName: "refs/heads/main", shortName: "main", scope: "localBranch", objectId: "abc123" }],
          currentBranchName: "main"
        };
      }
    }
  });

  await readDeclaredPlatformSliceView(world, appContext, {
    sliceKey: "pushes",
    modelView: "pushes",
    request: {
      id: "req-pushes-cold",
      actor: "adam",
      path: "/api/platform-model?view=pushes",
      view: "pushes"
    },
    buildPlatformSliceImpl: async buildArgs => {
      await readPlatformGitBoundaryState({
        repoRoot: buildArgs.appContext?.platformGit?.repoRoot ?? null,
        appContext: buildArgs.appContext
      });
      return {
        build: 1,
        sliceKey: "pushes"
      };
    }
  });

  assert.equal(gitStateCalls, 1);
});

test("platform materialized views report the dependency class that forced a cold rebuild", async () => {
  const world = createWorld();
  createMaterializedView(world, {
    actor: "adam",
    id: "platform.view.pushes",
    kind: "platformSlice",
    sliceKey: "pushes",
    modelView: "pushes",
    ttlMs: 1000
  });
  let gitState = {
    remotes: [{ id: "gitRemote:origin", name: "origin", remoteUrl: "https://example.com/repo.git", provider: "generic" }],
    refs: [{ id: "gitRef:refs/heads/main", refName: "refs/heads/main", shortName: "main", scope: "localBranch", objectId: "abc123" }],
    currentBranchName: "main"
  };
  const baseAppContext = createAppContext(world, {
    materializedViews: createMaterializedViewRegistry({
      world,
      probeCollector: createResourceProbeCollector()
    }),
    platformDependencyService: {
      async readInventoryTokenSnapshot() {
        return { tokens: {}, details: {} };
      },
      async readGitBoundaryState() {
        return gitState;
      }
    }
  });

  const readPushes = (requestId, appContext = Object.create(baseAppContext)) => readDeclaredPlatformSliceView(world, appContext, {
    sliceKey: "pushes",
    modelView: "pushes",
    request: {
      id: requestId,
      actor: "adam",
      path: "/api/platform-model?view=pushes",
      view: "pushes"
    },
    buildPlatformSliceImpl: async () => ({
      build: requestId
    })
  });

  await readPushes("req-pushes-1", baseAppContext);
  gitState = {
    ...gitState,
    refs: [{ id: "gitRef:refs/heads/main", refName: "refs/heads/main", shortName: "main", scope: "localBranch", objectId: "def456" }]
  };
  await readPushes("req-pushes-2");

  const latestState = world.allObservations()
    .filter(row => row.process === "materializedView.read" && row.body?.id === "platform.view.pushes")
    .at(-1);
  assert.equal(latestState?.body?.cacheStatus, "miss");
  assert.equal(latestState?.body?.invalidationCause, "gitBoundary");
});
