import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
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
