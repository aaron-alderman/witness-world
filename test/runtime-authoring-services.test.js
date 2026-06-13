import assert from "node:assert/strict";
import test from "node:test";
import { createThing, createWorld, projectors, relation, thing } from "../src/kernel.js";
import { canMutateTarget } from "../src/kernel.js";
import { createServerRunner, moduleProjectors } from "../src/modules.js";
import { requestBootstrapContextDefine } from "../plugins/authoring-core/authoring-core-processes.js";
import {
  requestBootstrapProposalApprove,
  requestBootstrapProposalCreate
} from "../plugins/proposals/proposal-processes.js";
import {
  createAuthoringBundleServices,
  createRuntimeAuthorityServices
} from "../src/runtime-authoring-services.js";
import { todoState } from "../plugins/demo/projections.js";

test("runtime authority services expose bootstrap access and target/context gates independently of bundle proposal execution", () => {
  const world = createWorld();
  let rows = [];
  const services = createRuntimeAuthorityServices({
    world,
    backendHost: "backendHost",
    currentIdentityIndex: () => ({ rows, byId: {}, byUsername: {} })
  });

  assert.deepEqual(services.requireBootstrapActor(null), {
    ok: true,
    actor: "backendHost",
    bootstrapException: true
  });
  assert.deepEqual(services.ensureContextAuthority("backendHost", null), {
    ok: true,
    status: 200,
    reason: null
  });

  rows = [{ id: "identity.aaron", actor: "aaron" }];
  assert.deepEqual(services.requireBootstrapActor(null), {
    ok: false,
    status: 401,
    reason: "sign in to edit bootstrap state"
  });
});

test("authoring bundle services approve todo proposals through the shared proposal executor", async () => {
  const world = createWorld();
  requestBootstrapContextDefine(world, {
    actor: "frontendHost",
    backendHost: "backendHost",
    body: {
      id: "frontend",
      label: "Frontend",
      owner: "frontendHost",
      stewardsJson: JSON.stringify(["aaron"])
    }
  });
  const services = createAuthoringBundleServices({
    world,
    backendHost: "backendHost",
    currentIdentityIndex: () => ({
      rows: [
        { id: "identity.aaron", actor: "aaron" },
        { id: "identity.callan", actor: "callan" }
      ],
      byId: {},
      byUsername: {}
    }),
    supportedHandlerSets: [],
    supportedHandlers: ["page.home"],
    supportedFrontendOps: [],
    mcpToolNames: () => []
  });

  requestBootstrapProposalCreate(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "proposal.todo.create.1",
      targetProcess: "todo.create",
      targetKind: "context",
      targetId: "frontend",
      bodyJson: JSON.stringify({ title: "Shared via proposal" }),
      reason: "Need a shared todo"
    }
  });
  await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.todo.create.1",
    executeTarget: services.executeBootstrapProposal("aaron")
  });
  const created = todoState(world.allWitnesses()).find(todo => todo.title === "Shared via proposal");
  assert.ok(created);
  assert.equal(canMutateTarget(world, "aaron", created.id).ok, true);
  assert.equal(canMutateTarget(world, "callan", created.id).ok, false);

  requestBootstrapProposalCreate(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "proposal.todo.update.1",
      targetProcess: "todo.update",
      targetKind: "todo",
      targetId: created.id,
      bodyJson: JSON.stringify({ id: created.id, done: true }),
      reason: "Mark it done"
    }
  });
  await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.todo.update.1",
    executeTarget: services.executeBootstrapProposal("aaron")
  });
  assert.equal(todoState(world.allWitnesses()).find(todo => todo.id === created.id)?.done, true);

  requestBootstrapProposalCreate(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "proposal.todo.delete.1",
      targetProcess: "todo.delete",
      targetKind: "todo",
      targetId: created.id,
      bodyJson: JSON.stringify({ id: created.id }),
      reason: "Remove it"
    }
  });
  await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.todo.delete.1",
    executeTarget: services.executeBootstrapProposal("aaron")
  });
  assert.equal(todoState(world.allWitnesses()).some(todo => todo.id === created.id), false);
  const proposals = world.project(moduleProjectors.proposals);
  assert.equal(proposals.filter(row => row.status === "approved").length, 3);
});

test("authoring bundle services approve asset attachment proposals through the shared proposal executor", async () => {
  const world = createWorld();
  requestBootstrapContextDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ctx.shared",
      label: "Shared",
      owner: "aaron"
    }
  });
  createThing(world, { actor: "system", id: "asset.shared" });
  createThing(world, { actor: "system", id: "thing.shared" });
  world.emit({
    process: "seed.shared.attachment",
    actor: "system",
    claims: [
      relation("asset.shared", "hasModuleKind", "asset"),
      relation("asset.shared", "inContext", "ctx.shared"),
      relation("thing.shared", "inContext", "ctx.shared")
    ],
    body: {}
  });
  const services = createAuthoringBundleServices({
    world,
    backendHost: "backendHost",
    currentIdentityIndex: () => ({
      rows: [
        { id: "identity.aaron", actor: "aaron" },
        { id: "identity.callan", actor: "callan" }
      ],
      byId: {},
      byUsername: {}
    }),
    supportedHandlerSets: [],
    supportedHandlers: ["page.home"],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    mcpToolNames: () => []
  });

  requestBootstrapProposalCreate(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "proposal.asset.attach.1",
      targetProcess: "asset.attach",
      targetKind: "thing",
      targetId: "asset.shared",
      bodyJson: JSON.stringify({ asset: "asset.shared", target: "thing.shared" }),
      reason: "Attach the shared asset"
    }
  });
  await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.asset.attach.1",
    executeTarget: services.executeBootstrapProposal("aaron")
  });
  assert.deepEqual(world.project(moduleProjectors.assets).find(row => row.id === "asset.shared")?.attachedTo, ["thing.shared"]);

  requestBootstrapProposalCreate(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "proposal.asset.detach.1",
      targetProcess: "asset.detach",
      targetKind: "thing",
      targetId: "asset.shared",
      bodyJson: JSON.stringify({ asset: "asset.shared", target: "thing.shared" }),
      reason: "Detach the shared asset"
    }
  });
  await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.asset.detach.1",
    executeTarget: services.executeBootstrapProposal("aaron")
  });
  assert.deepEqual(world.project(moduleProjectors.assets).find(row => row.id === "asset.shared")?.attachedTo, []);
});

test("authoring bundle services approve shared canvas thing proposals through the shared proposal executor", async () => {
  const world = createWorld();
  requestBootstrapContextDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ctx.shared",
      label: "Shared",
      owner: "aaron"
    }
  });
  createThing(world, { actor: "system", id: "perspective.shared" });
  world.emit({
    process: "seed.shared.canvas.perspective",
    actor: "system",
    claims: [
      relation("perspective.shared", "hasModuleKind", "perspective"),
      relation("perspective.shared", "inContext", "ctx.shared"),
      relation("aaron", "owns", "perspective.shared")
    ],
    body: {}
  });
  const services = createAuthoringBundleServices({
    world,
    backendHost: "backendHost",
    currentIdentityIndex: () => ({
      rows: [
        { id: "identity.aaron", actor: "aaron" },
        { id: "identity.callan", actor: "callan" }
      ],
      byId: {},
      byUsername: {}
    }),
    supportedHandlerSets: [],
    supportedHandlers: ["page.home"],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    mcpToolNames: () => []
  });

  requestBootstrapProposalCreate(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "proposal.canvas.createThing.1",
      targetProcess: "canvas.createThing",
      targetKind: "context",
      targetId: "ctx.shared",
      bodyJson: JSON.stringify({ perspective: "perspective.shared", context: "ctx.shared", name: "Shared Proposal Thing", x: 50, y: 60 }),
      reason: "Create a shared canvas thing"
    }
  });
  await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.canvas.createThing.1",
    executeTarget: services.executeBootstrapProposal("aaron")
  });
  const createdWitness = world.allWitnesses().findLast(w => w.process === "canvas.createThing");
  assert.ok(createdWitness);
  assert.equal(createdWitness.body.context, "ctx.shared");
  assert.equal(canMutateTarget(world, "aaron", createdWitness.body.thing).ok, true);
  assert.equal(canMutateTarget(world, "callan", createdWitness.body.thing).ok, false);
});

test("authoring bundle services approve shared canvas batch proposals through the shared proposal executor", async () => {
  const world = createWorld();
  requestBootstrapContextDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ctx.shared",
      label: "Shared",
      owner: "aaron"
    }
  });
  const perspectiveWitness = world.emit({
    process: "seed.shared.batch.perspective",
    actor: "system",
    claims: [
      relation("perspective.shared", "hasModuleKind", "perspective"),
      relation("perspective.shared", "inContext", "ctx.shared"),
      relation("aaron", "owns", "perspective.shared")
    ],
    body: {}
  });
  const thingWitness = world.emit({
    process: "seed.shared.batch.thing",
    actor: "system",
    claims: [
      thing("thing.shared"),
      relation("thing.shared", "inContext", "ctx.shared"),
      relation("thing.shared", "hasTitle", "Shared Node"),
      relation("aaron", "owns", "thing.shared"),
      thing("instance.shared"),
      relation("instance.shared", "hasModuleKind", "projectionInstance"),
      relation("instance.shared", "proxies", "thing.shared"),
      relation("perspective.shared", "contains", "instance.shared"),
      relation("instance.shared", "hasGeometry", "geometry", { x: 0, y: 0, w: 160, h: 56 })
    ],
    body: {}
  });
  assert.ok(perspectiveWitness && thingWitness);

  const services = createAuthoringBundleServices({
    world,
    backendHost: "backendHost",
    currentIdentityIndex: () => ({
      rows: [
        { id: "identity.aaron", actor: "aaron" },
        { id: "identity.callan", actor: "callan" }
      ],
      byId: {},
      byUsername: {}
    }),
    supportedHandlerSets: [],
    supportedHandlers: ["page.home"],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    mcpToolNames: () => []
  });

  requestBootstrapProposalCreate(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "proposal.canvas.batch.1",
      targetProcess: "canvas.batch",
      targetKind: "context",
      targetId: "ctx.shared",
      bodyJson: JSON.stringify({
        perspective: "perspective.shared",
        context: "ctx.shared",
        moves: [{ instance: "instance.shared", x: 100, y: 110 }]
      }),
      reason: "Adjust shared canvas layout"
    }
  });
  await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.canvas.batch.1",
    executeTarget: services.executeBootstrapProposal("aaron")
  });
  const geometry = world.project(projectors.currentRelations).find(r => r.from === "instance.shared" && r.rel === "hasGeometry");
  assert.deepEqual(geometry?.meta, { x: 100, y: 110, w: 160, h: 56 });
});

test("authoring bundle services approve shared canvas duplicate and removeMany proposals through the shared proposal executor", async () => {
  const world = createWorld();
  requestBootstrapContextDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ctx.shared",
      label: "Shared",
      owner: "aaron"
    }
  });
  world.emit({
    process: "seed.shared.instance.ops",
    actor: "system",
    claims: [
      relation("perspective.shared", "hasModuleKind", "perspective"),
      relation("perspective.shared", "inContext", "ctx.shared"),
      relation("aaron", "owns", "perspective.shared"),
      thing("thing.shared"),
      relation("thing.shared", "inContext", "ctx.shared"),
      relation("thing.shared", "hasTitle", "Shared Node"),
      relation("aaron", "owns", "thing.shared"),
      thing("instance.shared"),
      relation("instance.shared", "hasModuleKind", "projectionInstance"),
      relation("instance.shared", "proxies", "thing.shared"),
      relation("perspective.shared", "contains", "instance.shared"),
      relation("instance.shared", "hasGeometry", "geometry", { x: 0, y: 0, w: 160, h: 56 })
    ],
    body: {}
  });
  const services = createAuthoringBundleServices({
    world,
    backendHost: "backendHost",
    currentIdentityIndex: () => ({
      rows: [
        { id: "identity.aaron", actor: "aaron" },
        { id: "identity.callan", actor: "callan" }
      ],
      byId: {},
      byUsername: {}
    }),
    supportedHandlerSets: [],
    supportedHandlers: ["page.home"],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    mcpToolNames: () => []
  });

  requestBootstrapProposalCreate(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "proposal.canvas.duplicate.1",
      targetProcess: "canvas.duplicate",
      targetKind: "context",
      targetId: "ctx.shared",
      bodyJson: JSON.stringify({
        perspective: "perspective.shared",
        context: "ctx.shared",
        instance: "instance.shared",
        x: 48,
        y: 64
      }),
      reason: "Duplicate the shared node"
    }
  });
  await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.canvas.duplicate.1",
    executeTarget: services.executeBootstrapProposal("aaron")
  });
  const duplicateWitness = world.allWitnesses().findLast(w => w.process === "canvas.duplicate");
  assert.ok(duplicateWitness);
  assert.deepEqual(world.project(projectors.currentRelations).find(r => r.from === duplicateWitness.body.instance && r.rel === "hasGeometry")?.meta, {
    x: 48,
    y: 64,
    w: 160,
    h: 56
  });

  requestBootstrapProposalCreate(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "proposal.canvas.removeMany.1",
      targetProcess: "canvas.removeMany",
      targetKind: "context",
      targetId: "ctx.shared",
      bodyJson: JSON.stringify({
        perspective: "perspective.shared",
        context: "ctx.shared",
        instances: ["instance.shared", duplicateWitness.body.instance]
      }),
      reason: "Remove the shared duplicates"
    }
  });
  await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.canvas.removeMany.1",
    executeTarget: services.executeBootstrapProposal("aaron")
  });
  const contains = world.project(projectors.currentRelations).filter(r => r.from === "perspective.shared" && r.rel === "contains");
  assert.deepEqual(contains, []);
});

test("authoring bundle services approve shared canvas place proposals through the shared proposal executor", async () => {
  const world = createWorld();
  requestBootstrapContextDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ctx.shared",
      label: "Shared",
      owner: "aaron"
    }
  });
  world.emit({
    process: "seed.shared.place",
    actor: "system",
    claims: [
      relation("perspective.shared", "hasModuleKind", "perspective"),
      relation("perspective.shared", "inContext", "ctx.shared"),
      relation("aaron", "owns", "perspective.shared"),
      thing("thing.shared"),
      relation("thing.shared", "inContext", "ctx.shared"),
      relation("thing.shared", "hasTitle", "Shared Thing"),
      relation("aaron", "owns", "thing.shared")
    ],
    body: {}
  });
  const services = createAuthoringBundleServices({
    world,
    backendHost: "backendHost",
    currentIdentityIndex: () => ({
      rows: [
        { id: "identity.aaron", actor: "aaron" },
        { id: "identity.callan", actor: "callan" }
      ],
      byId: {},
      byUsername: {}
    }),
    supportedHandlerSets: [],
    supportedHandlers: ["page.home"],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    mcpToolNames: () => []
  });

  requestBootstrapProposalCreate(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "proposal.canvas.place.1",
      targetProcess: "canvas.place",
      targetKind: "context",
      targetId: "ctx.shared",
      bodyJson: JSON.stringify({
        perspective: "perspective.shared",
        context: "ctx.shared",
        thing: "thing.shared",
        x: 180,
        y: 220
      }),
      reason: "Place the shared thing again"
    }
  });
  await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.canvas.place.1",
    executeTarget: services.executeBootstrapProposal("aaron")
  });
  const placed = world.allWitnesses().findLast(w => w.process === "canvas.place");
  assert.ok(placed);
  assert.equal(placed.body.thing, "thing.shared");
  assert.deepEqual(world.project(projectors.currentRelations).find(r => r.from === placed.body.instance && r.rel === "hasGeometry")?.meta, {
    x: 180,
    y: 220,
    w: 160,
    h: 56
  });
});

test("authoring bundle services allow bootstrap access before the first identity and execute proposals through the bundled executor", async () => {
  const world = createWorld();
  let rows = [];
  const services = createAuthoringBundleServices({
    world,
    backendHost: "backendHost",
    currentIdentityIndex: () => ({ rows, byId: {}, byUsername: {} }),
    supportedHandlerSets: [],
    supportedHandlers: ["page.home"],
    supportedFrontendOps: [],
    mcpToolNames: () => []
  });

  assert.deepEqual(services.requireBootstrapActor(null), {
    ok: true,
    actor: "backendHost",
    bootstrapException: true
  });

  const proposalResult = await services.executeBootstrapProposal("backendHost")({
    targetProcess: "context.define",
    targetId: "ctx.demo",
    body: { id: "ctx.demo", label: "Demo Context" }
  });
  assert.equal(proposalResult.ok, true);
  assert.equal(world.project(moduleProjectors.contexts).some(row => row.id === "ctx.demo" && row.label === "Demo Context"), true);

  rows = [{ id: "identity.aaron", actor: "aaron" }];
  assert.deepEqual(services.requireBootstrapActor(null), {
    ok: false,
    status: 401,
    reason: "sign in to edit bootstrap state"
  });
});

test("authoring bundle services approve runtime plugin install proposals through the shared executor", async () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "backendHost" });
  createThing(world, { actor: "system", id: "frontendHost" });
  requestBootstrapContextDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ctx.runtime",
      label: "Runtime",
      owner: "aaron"
    }
  });
  const runnerResult = createServerRunner(world, {
    actor: "aaron",
    id: "runner-1",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    context: "ctx.runtime"
  });
  assert.ok(runnerResult);
  const services = createAuthoringBundleServices({
    world,
    backendHost: "backendHost",
    currentIdentityIndex: () => ({
      rows: [{ id: "identity.aaron", actor: "aaron" }],
      byId: {},
      byUsername: {}
    }),
    supportedHandlerSets: [],
    supportedHandlers: ["page.home"],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    mcpToolNames: () => [],
    getRuntimePluginCatalog: async () => ({
      packages: [{
        id: "plugin.inspect",
        validation: { ok: true, errors: [] },
        compatibility: { compatible: true, reasons: [] },
        execution: { executable: true }
      }]
    })
  });

  requestBootstrapProposalCreate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "proposal.runtimePlugin.install.1",
      targetProcess: "runtimePlugin.install",
      targetKind: "serverRunner",
      targetId: "runner-1",
      bodyJson: JSON.stringify({ serverRunner: "runner-1", plugin: "plugin.inspect" }),
      reason: "Enable inspect runtime plugin"
    }
  });

  const result = await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.runtimePlugin.install.1",
    executeTarget: services.executeBootstrapProposal("aaron")
  });

  assert.equal(result.ok, true);
  assert.equal(world.project(moduleProjectors.runtimePluginInstalls).some(row => row.serverRunner === "runner-1" && row.plugin === "plugin.inspect"), true);
});
