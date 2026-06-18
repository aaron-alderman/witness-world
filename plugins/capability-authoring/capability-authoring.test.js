import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { moduleProjectors } from "../../src/modules.js";
import { bundleId, createHandlers, handlerCatalog, routes } from "./runtime.js";
import { executeCapabilityAuthoringProposalTarget } from "./capability-proposal-targets.js";

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
