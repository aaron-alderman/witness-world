import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { moduleProjectors } from "../../src/modules.js";
import {
  requestBootstrapCapabilityDefine,
  requestBootstrapCapabilityInstall,
  resolveCapabilityTargetInput
} from "./capability-processes.js";
import { bundleId, createHandlers, handlerCatalog, routes } from "./runtime.js";
import { executeCapabilityAuthoringProposalTarget } from "./capability-proposal-targets.js";

function installTargetResolutionWorld() {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[context]]
actor = "system"
id = "ctx.hidden"

[[serverRunner]]
actor = "system"
id = "local_server"
context = "ctx.target"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[serverRunner]]
actor = "system"
id = "hidden_server"
context = "ctx.hidden"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceRunner"
name = "importedRunner"
`);
  return world;
}

test("capability-authoring plugin owns capability authoring routes and handlers", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.capability-authoring");
  assert.deepEqual(manifest.activatesBundles, ["bundle-capability-authoring"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.equal(bundleId, "bundle-capability-authoring");
  assert.deepEqual(handlerCatalog.dispatchHandlers, [
    "capability.create",
    "capability.install",
    "capability.remove"
  ]);
  assert.equal(routes.some(route => route.path === "/api/capabilities" && route.handler === "capability.create"), true);
  assert.equal(routes.some(route => route.path === "/api/capability-installs" && route.handler === "capability.install"), true);
  assert.equal(routes.some(route => route.method === "DELETE" && route.handler === "capability.remove"), true);

  const handlers = createHandlers({
    world: createWorld(),
    backendHost: "backendHost",
    readJson: async () => ({}),
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" },
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: () => ({ ok: true })
    },
    sendGateFailure() {},
    sendJson() {}
  });
  assert.equal(typeof handlers["capability.create"], "function");
  assert.equal(typeof handlers["capability.install"], "function");
  assert.equal(typeof handlers["capability.remove"], "function");
});

test("capability-authoring plugin owns process helpers and proposal targets", async () => {
  const processesSource = await readFile(new URL("./capability-processes.js", import.meta.url), "utf8");
  const proposalTargetSource = await readFile(new URL("./capability-proposal-targets.js", import.meta.url), "utf8");
  const authoringMeta = JSON.parse(await readFile(new URL("../authoring/plugin.json", import.meta.url), "utf8"));

  assert.equal(processesSource.includes("export function requestBootstrapCapabilityDefine"), true);
  assert.equal(processesSource.includes("export function requestBootstrapCapabilityInstall"), true);
  assert.equal(processesSource.includes("export function requestBootstrapCapabilityRemove"), true);
  assert.equal(proposalTargetSource.includes("case \"capability.define\""), true);
  assert.equal(proposalTargetSource.includes("case \"capability.install\""), true);
  assert.equal(proposalTargetSource.includes("case \"capability.remove\""), true);
  await assert.rejects(readFile(new URL("../../src/bootstrap-authoring.js", import.meta.url), "utf8"));
  assert.equal(authoringMeta.runtime, undefined);
  assert.equal(authoringMeta.activatesBundles, undefined);
  assert.equal(authoringMeta.dependsOnPlugins.includes("plugin.capability-authoring"), true);

  const unsupported = executeCapabilityAuthoringProposalTarget({
    world: createWorld(),
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "not.capability" },
    body: {},
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });
  assert.equal(unsupported, null);
});

test("capability target resolution explicitly classifies covered canonical-id sugar", () => {
  const world = installTargetResolutionWorld();

  const local = resolveCapabilityTargetInput(world, {
    context: "ctx.target",
    target: "local_server",
    targetKind: "serverRunner"
  });
  assert.equal(local.ok, true);
  assert.equal(local.target, "local_server");
  assert.equal(local.canonicalIdPolicyClass, "same-context-convenience");

  const imported = resolveCapabilityTargetInput(world, {
    context: "ctx.target",
    target: "source_server",
    targetKind: "serverRunner"
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.target, "source_server");
  assert.equal(imported.canonicalIdPolicyClass, "imported-target-reference");

  const legacy = resolveCapabilityTargetInput(world, {
    context: "ctx.target",
    target: "backendHost",
    targetKind: "serverRunner"
  });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.target, "backendHost");
  assert.equal(legacy.canonicalIdPolicyClass, "legacy-only-path");

  const hidden = resolveCapabilityTargetInput(world, {
    context: "ctx.target",
    target: "hidden_server",
    targetKind: "serverRunner"
  });
  assert.equal(hidden.ok, false);
  assert.match(hidden.error, /not visible in authoring context ctx\.target/);
});

test("capability authoring handlers lower target refs before target authority checks", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceRunner"
name = "importedRunner"

[[capability]]
actor = "system"
id = "notes.sidebar"
label = "Notes Sidebar"
placement = ["serverRunner"]
`);

  const seenTargets = [];
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async () => ({
      capability: "notes.sidebar",
      context: "ctx.target",
      targetRef: "importedRunner",
      targetKind: "serverRunner"
    }),
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: (_actor, target) => {
        seenTargets.push(target);
        return { ok: true };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ gate });
    },
    sendJson(_res, status, body) {
      sent.push({ status, body });
    }
  });

  await handlers["capability.install"]({ req: {}, res: {}, requestActor: "aaron" });

  assert.deepEqual(seenTargets, ["source_server"]);
  assert.equal(sent[0]?.status, 201);
  assert.equal(world.project(moduleProjectors.capabilityInstalls).some(row =>
    row.capability === "notes.sidebar"
    && row.target === "source_server"
    && row.targetKind === "serverRunner"
  ), true);
});

test("capability authoring handlers create proposals instead of dead-end 403s for governed routes", async () => {
  const world = createWorld();
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async req => req.body ?? {},
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureContextAuthority: () => ({ ok: false, status: 403, reason: "forbidden context" }),
      ensureTargetAuthority: () => ({ ok: false, status: 403, reason: "forbidden target" })
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    }
  });

  await handlers["capability.create"]({
    req: { body: { id: "notes.sidebar", context: "ctx.shared" } },
    res: {},
    requestActor: "callan"
  });
  await handlers["capability.install"]({
    req: { body: { capability: "notes.sidebar", target: "ctx.shared", targetKind: "context" } },
    res: {},
    requestActor: "callan"
  });
  await handlers["capability.remove"]({
    req: { body: { capability: "notes.sidebar", target: "ctx.shared", targetKind: "context" } },
    res: {},
    requestActor: "callan"
  });

  assert.equal(sent.some(entry => entry.kind === "gate"), false);
  assert.deepEqual(sent.map(entry => entry.status), [202, 202, 202]);
  assert.deepEqual(
    sent.map(entry => ({
      targetProcess: entry.body.proposal.targetProcess,
      targetKind: entry.body.proposal.targetKind,
      targetId: entry.body.proposal.targetId
    })),
    [
      { targetProcess: "capability.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "capability.install", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "capability.remove", targetKind: "context", targetId: "ctx.shared" }
    ]
  );
});

test("capability authoring proposal targets lower target refs before authority checks", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceRunner"
name = "importedRunner"

[[capability]]
actor = "system"
id = "notes.sidebar"
label = "Notes Sidebar"
placement = ["serverRunner"]
`);

  const seenTargets = [];
  const result = executeCapabilityAuthoringProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "capability.install" },
    body: {
      capability: "notes.sidebar",
      context: "ctx.target",
      targetRef: "importedRunner",
      targetKind: "serverRunner"
    },
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: (_actor, target) => {
      seenTargets.push(target);
      return { ok: true };
    }
  });

  assert.deepEqual(seenTargets, ["source_server"]);
  assert.equal(result?.ok, true);
  assert.equal(world.project(moduleProjectors.capabilityInstalls).some(row =>
    row.capability === "notes.sidebar"
    && row.target === "source_server"
    && row.targetKind === "serverRunner"
  ), true);
});

test("capability proposal targets execute install and remove through the shared helpers", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[context]]
actor = "system"
id = "ctx.shared"

[[capability]]
actor = "system"
id = "notes.sidebar"
label = "Notes Sidebar"
placement = ["context"]
`);

  const installed = executeCapabilityAuthoringProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "capability.install", targetId: "ctx.shared" },
    body: {
      capability: "notes.sidebar",
      target: "ctx.shared",
      targetKind: "context"
    },
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });
  assert.equal(installed?.ok, true);
  assert.equal(world.project(moduleProjectors.capabilityInstalls).some(row =>
    row.capability === "notes.sidebar"
    && row.target === "ctx.shared"
    && row.targetKind === "context"
  ), true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "capability.install"
    && witness.actor === "aaron"
    && witness.body?.install?.capability === "notes.sidebar"
    && witness.body?.install?.target === "ctx.shared"
  ), true);

  const removed = executeCapabilityAuthoringProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "capability.remove", targetId: "ctx.shared" },
    body: {
      capability: "notes.sidebar",
      target: "ctx.shared",
      targetKind: "context"
    },
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });
  assert.equal(removed?.ok, true);
  assert.equal(world.project(moduleProjectors.capabilityInstalls).some(row =>
    row.capability === "notes.sidebar"
    && row.target === "ctx.shared"
    && row.targetKind === "context"
  ), false);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "capability.remove"
    && witness.actor === "aaron"
    && witness.body?.capability === "notes.sidebar"
    && witness.body?.target === "ctx.shared"
  ), true);
});

test("capability define accepts compatibility JSON and persists the normalized contract", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"
`);

  const result = requestBootstrapCapabilityDefine(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "notes.sidebar",
      label: "Notes Sidebar",
      version: "1.2.0",
      dependsOnJson: "[]",
      publicApiJson: "[]",
      configJson: "[]",
      internalsJson: "[]",
      authorityJson: "[]",
      placementJson: "[\"context\"]",
      compatibilityJson: JSON.stringify({
        minimumRuntimeProfile: "authoring",
        authorityAssumptions: ["capability.install.approve"],
        dependencyConstraints: {
          requiresInstalledCapabilities: ["capability.richtext"]
        },
        migrationNotes: ["refresh the notes shell"]
      })
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(world.project(moduleProjectors.capabilityIndex).byId["notes.sidebar"]?.compatibility, {
    minimumRuntimeProfile: "authoring",
    authorityAssumptions: ["capability.install.approve"],
    dependencyConstraints: {
      requiresInstalledCapabilities: ["capability.richtext"],
      targetKinds: []
    },
    migrationNotes: ["refresh the notes shell"]
  });
});

test("capability install failures surface structured compatibility reasons", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[context]]
actor = "system"
id = "ctx.shared"

[[capability]]
actor = "system"
id = "capability.base"
label = "Base"
placement = ["context"]

[[capability]]
actor = "system"
id = "notes.sidebar"
label = "Notes Sidebar"
placement = ["context"]
dependsOn = ["capability.base"]
compatibility = { minimumRuntimeProfile = "authoring", dependencyConstraints = { requiresInstalledCapabilities = ["capability.richtext"] }, migrationNotes = ["refresh the notes shell"] }
`);

  const result = requestBootstrapCapabilityInstall(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      capability: "notes.sidebar",
      target: "ctx.shared",
      targetKind: "context"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "capability dependencies are not installed on target");
  assert.deepEqual(result.witness.body.compatibility.reasons.map(entry => entry.code), ["dependency-missing"]);
  assert.deepEqual(result.witness.body.compatibility.reasons[0].missingDependencies, ["capability.base", "capability.richtext"]);
  assert.deepEqual(result.witness.body.compatibility.migrationNotes, ["refresh the notes shell"]);
});
