import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { moduleProjectors } from "../src/modules.js";
import {
  createAuthoringBundleServices,
  createRuntimeAuthorityServices
} from "../src/runtime-authoring-services.js";

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

test("authoring bundle services allow bootstrap access before the first identity and execute proposals through the bundled executor", () => {
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

  const proposalResult = services.executeBootstrapProposal("backendHost")({
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
