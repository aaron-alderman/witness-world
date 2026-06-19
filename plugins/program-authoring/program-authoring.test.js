import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import {
  activateBackendProgramVersion,
  defineBackendProgram,
  defineBackendProgramVersion,
  defineBackendProgramVersionTransition
} from "../../src/backend-programs.js";
import { bundleId, createHandlers, handlerCatalog, routes } from "./runtime.js";
import { executeProgramAuthoringProposalTarget } from "./program-proposal-targets.js";

const PROGRAM_HANDLER_IDS = [
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
  assert.equal(routes.some(route => route.path === "/api/frontend-programs"), false);
  assert.equal(routes.some(route => route.path === "/api/frontend-steps"), false);
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
  assert.equal(sent[0].kind, "json");
  assert.equal(sent[0].status, 202);
  assert.equal(sent[0].body.proposal.targetProcess, "backendProgramVersion.define");
  assert.equal(sent[0].body.proposal.targetKind, "backendProgram");
  assert.equal(sent[0].body.proposal.targetId, "todo.todos.list");
});

test("program authoring handlers create proposals instead of dead-end 403s for governed routes", async () => {
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
    },
    supportedFrontendOps: [],
    supportedBackendOps: []
  });

  await handlers["backendProgram.create"]({
    req: { body: { soul: "todo.todos.list", label: "Todo", context: "ctx.shared" } },
    res: {},
    requestActor: "callan"
  });
  await handlers["backendStep.create"]({
    req: { body: { version: "todo.todos.list.v1", event: "request", op: "response.json" } },
    res: {},
    requestActor: "callan"
  });
  await handlers["backendProgramVersions.activate"]({
    req: { body: { version: "todo.todos.list.v2" } },
    res: {},
    requestActor: "callan",
    params: { soul: "todo.todos.list" }
  });
  await handlers["backendProgramVersions.rollback"]({
    req: { body: {} },
    res: {},
    requestActor: "callan",
    params: { soul: "todo.todos.list" }
  });

  assert.equal(sent.some(entry => entry.kind === "gate"), false);
  assert.deepEqual(sent.map(entry => entry.status), [202, 202, 202, 202]);
  assert.deepEqual(
    sent.map(entry => ({
      targetProcess: entry.body.proposal.targetProcess,
      targetKind: entry.body.proposal.targetKind,
      targetId: entry.body.proposal.targetId
    })),
    [
      { targetProcess: "backendProgram.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "backendStep.define", targetKind: "backendProgramVersion", targetId: "todo.todos.list.v1" },
      { targetProcess: "backendProgramVersion.activate", targetKind: "backendProgram", targetId: "todo.todos.list" },
      { targetProcess: "backendProgramVersion.rollback", targetKind: "backendProgram", targetId: "todo.todos.list" }
    ]
  );
});

test("program proposal targets execute backend program version activate and rollback through the shared helpers", async () => {
  const world = createWorld();
  defineBackendProgram(world, {
    actor: "system",
    soul: "todo.todos.list",
    label: "Todo",
    context: "ctx.shared",
    owner: "system"
  });
  defineBackendProgramVersion(world, {
    actor: "system",
    soul: "todo.todos.list",
    version: "todo.todos.list.v1",
    index: 0,
    context: "ctx.shared",
    owner: "system"
  });
  defineBackendProgramVersion(world, {
    actor: "system",
    soul: "todo.todos.list",
    version: "todo.todos.list.v2",
    index: 1,
    context: "ctx.shared",
    owner: "system"
  });
  defineBackendProgramVersionTransition(world, {
    actor: "system",
    soul: "todo.todos.list",
    from: "todo.todos.list.v1",
    to: "todo.todos.list.v2",
    strategy: "compatible",
    owner: "system"
  });
  activateBackendProgramVersion(world, {
    actor: "system",
    soul: "todo.todos.list",
    version: "todo.todos.list.v1"
  });

  const activated = executeProgramAuthoringProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "backendProgramVersion.activate", targetId: "todo.todos.list" },
    body: { soul: "todo.todos.list", version: "todo.todos.list.v2" },
    supportedFrontendOps: [],
    supportedBackendOps: [],
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });
  assert.equal(activated?.ok, true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "activateBackendProgramVersion"
    && witness.actor === "aaron"
    && witness.body?.soul === "todo.todos.list"
    && witness.body?.version === "todo.todos.list.v2"
  ), true);

  const rolledBack = executeProgramAuthoringProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "backendProgramVersion.rollback", targetId: "todo.todos.list" },
    body: { soul: "todo.todos.list" },
    supportedFrontendOps: [],
    supportedBackendOps: [],
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });
  assert.equal(rolledBack?.ok, true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "backendProgramVersion.rollback"
    && witness.actor === "aaron"
    && witness.body?.soul === "todo.todos.list"
  ), true);
});
