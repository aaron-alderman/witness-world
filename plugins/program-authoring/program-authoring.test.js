import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { bundleId, createHandlers, handlerCatalog, routes } from "./runtime.js";
import { executeProgramAuthoringProposalTarget } from "./program-proposal-targets.js";

const PROGRAM_HANDLER_IDS = [
  "frontendProgram.create",
  "frontendStep.create",
  "backendProgram.create",
  "backendProgramVersion.create",
  "backendStep.create",
  "backendProgramVersions.activate",
  "backendProgramVersions.rollback"
];

const PROGRAM_PROCESS_EXPORTS = [
  "requestBootstrapFrontendProgramDefine",
  "requestBootstrapFrontendStepDefine",
  "requestBootstrapBackendProgramDefine",
  "requestBootstrapBackendProgramVersionDefine",
  "requestBootstrapBackendStepDefine",
  "requestBootstrapBackendProgramVersionActivate",
  "requestBootstrapBackendProgramVersionRollback"
];

test("program-authoring plugin owns program authoring routes and handlers", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.program-authoring");
  assert.deepEqual(manifest.activatesBundles, ["bundle-program-authoring"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.equal(bundleId, "bundle-program-authoring");
  assert.deepEqual(handlerCatalog.dispatchHandlers, PROGRAM_HANDLER_IDS);
  assert.equal(routes.some(route => route.path === "/api/frontend-programs" && route.handler === "frontendProgram.create"), true);
  assert.equal(routes.some(route => route.path === "/api/frontend-steps" && route.handler === "frontendStep.create"), true);
  assert.equal(routes.some(route => route.path === "/api/backend-programs" && route.handler === "backendProgram.create"), true);
  assert.equal(routes.some(route => route.path === "/api/backend-program-versions" && route.handler === "backendProgramVersion.create"), true);
  assert.equal(routes.some(route => route.path === "/api/backend-steps" && route.handler === "backendStep.create"), true);
  assert.equal(routes.some(route => route.handler === "backendProgramVersions.activate"), true);
  assert.equal(routes.some(route => route.handler === "backendProgramVersions.rollback"), true);

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
    sendJson() {},
    supportedFrontendOps: [],
    supportedBackendOps: []
  });
  for (const handlerId of PROGRAM_HANDLER_IDS) {
    assert.equal(typeof handlers[handlerId], "function");
  }
});

test("program-authoring plugin owns process helpers and proposal targets", async () => {
  const processesSource = await readFile(new URL("./program-processes.js", import.meta.url), "utf8");
  const proposalTargetSource = await readFile(new URL("./program-proposal-targets.js", import.meta.url), "utf8");
  const authoringMeta = JSON.parse(await readFile(new URL("../authoring/plugin.json", import.meta.url), "utf8"));

  for (const exportName of PROGRAM_PROCESS_EXPORTS) {
    assert.equal(processesSource.includes(`export function ${exportName}`), true);
  }
  await assert.rejects(readFile(new URL("../../src/bootstrap-authoring.js", import.meta.url), "utf8"));
  for (const targetProcess of [
    "frontendProgram.define",
    "frontendStep.define",
    "backendProgram.define",
    "backendProgramVersion.define",
    "backendStep.define",
    "backendProgramVersion.activate",
    "backendProgramVersion.rollback"
  ]) {
    assert.equal(proposalTargetSource.includes(`case "${targetProcess}"`), true);
  }
  assert.equal(authoringMeta.runtime, undefined);
  assert.equal(authoringMeta.activatesBundles, undefined);
  assert.equal(authoringMeta.dependsOnPlugins.includes("plugin.program-authoring"), true);

  const unsupported = executeProgramAuthoringProposalTarget({
    world: createWorld(),
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "not.program" },
    body: {},
    supportedFrontendOps: [],
    supportedBackendOps: [],
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });
  assert.equal(unsupported, null);
});

test("backend program version create checks target authority against soul", async () => {
  const world = createWorld();
  const seenTargets = [];
  const seenJson = [];
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async () => {
      const body = { soul: "todo.todos.list", version: "todo.todos.list.v1", index: 0, context: "backend" };
      seenJson.push(body);
      return body;
    },
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" },
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: (actor, target) => {
        seenTargets.push({ actor, target });
        return { ok: false, status: 403, reason: "forbidden" };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    },
    supportedFrontendOps: [],
    supportedBackendOps: []
  });

  await handlers["backendProgramVersion.create"]({ req: {}, res: {}, requestActor: "aaron" });

  assert.deepEqual(seenJson, [{ soul: "todo.todos.list", version: "todo.todos.list.v1", index: 0, context: "backend" }]);
  assert.deepEqual(seenTargets, [{ actor: "aaron", target: "todo.todos.list" }]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, "gate");
  assert.equal(sent[0].gate.reason, "forbidden");
});
