import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import {
  createIdentity,
  defineAuthRole,
  grantIdentityActorAssumption,
  grantIdentityRole,
  moduleProjectors,
  revokeIdentityActorAssumption,
  setAppFeatureAccessPolicy
} from "../src/modules.js";
import {
  authSummaryForAuthority,
  identityActorAssumptionGrantHistory,
  evaluateRouteAccess,
  resolveSessionAuthorityForIdentity
} from "../src/runtime-authz.js";

function seedAuthorityWorld() {
  const world = createWorld();
  createIdentity(world, {
    actor: "system",
    id: "identity.aaron",
    identityActor: "aaron",
    label: "Aaron",
    username: "aaron",
    password: "aaron",
    displayName: "Aaron A.",
    jobTitle: "Lead Engineer",
    initials: "AA",
    homeContext: "ctx.aaron",
    homePerspective: "aaron:workspace"
  });
  createIdentity(world, {
    actor: "system",
    id: "identity.callan",
    identityActor: "callan",
    label: "Callan",
    username: "callan",
    password: "callan",
    displayName: "Callan C.",
    jobTitle: "Reliability Engineer",
    initials: "CC",
    homeContext: "ctx.callan",
    homePerspective: "callan:workspace"
  });
  defineAuthRole(world, {
    actor: "system",
    id: "engentus_user",
    label: "Engentus User"
  });
  grantIdentityRole(world, {
    actor: "system",
    identityId: "identity.callan",
    roleId: "engentus_user"
  });
  setAppFeatureAccessPolicy(world, {
    actor: "system",
    featureId: "engentus.goodman",
    requireAuth: true,
    allowedRoles: ["engentus_user"],
    guestBehavior: "login",
    deniedBehavior: "403"
  });
  return world;
}

test("identity-actor assumption grants project and index by identity and target actor", () => {
  const world = seedAuthorityWorld();
  grantIdentityActorAssumption(world, {
    actor: "system",
    identityId: "identity.aaron",
    targetActor: "callan"
  });
  grantIdentityActorAssumption(world, {
    actor: "system",
    identityId: "identity.aaron",
    targetActor: "ops-bot"
  });
  let index = world.project(moduleProjectors.identityActorAssumptionGrantIndex);
  assert.deepEqual(index.byIdentity["identity.aaron"].map(row => row.targetActor), ["callan", "ops-bot"]);
  assert.equal(index.byTargetActor.callan[0].identityId, "identity.aaron");
  assert.equal(index.byPair["identity.aaron=>callan"].id, "identity.aaron=>callan");

  revokeIdentityActorAssumption(world, {
    actor: "system",
    identityId: "identity.aaron",
    targetActor: "ops-bot"
  });
  index = world.project(moduleProjectors.identityActorAssumptionGrantIndex);
  assert.equal(index.byPair["identity.aaron=>ops-bot"], undefined);
  assert.deepEqual(index.byIdentity["identity.aaron"].map(row => row.targetActor), ["callan"]);
});

test("identity-actor assumption grant history preserves active and revoked provenance", () => {
  const world = seedAuthorityWorld();
  grantIdentityActorAssumption(world, {
    actor: "system",
    identityId: "identity.aaron",
    targetActor: "callan"
  });
  revokeIdentityActorAssumption(world, {
    actor: "system",
    identityId: "identity.aaron",
    targetActor: "callan"
  });
  const history = identityActorAssumptionGrantHistory(world, {
    grantId: "identity.aaron=>callan"
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].active, false);
  assert.equal(history[0].status, "revoked");
  assert.equal(history[0].grantedBy, "system");
  assert.equal(history[0].revokedBy, "system");
  assert.equal(typeof history[0].grantedWitnessId, "string");
  assert.equal(typeof history[0].revokedWitnessId, "string");
});

test("resolveSessionAuthorityForIdentity allows only explicit identity to actor assumptions", () => {
  const world = seedAuthorityWorld();
  const identity = world.project(moduleProjectors.identityIndex).byId["identity.aaron"];
  const denied = resolveSessionAuthorityForIdentity(world, identity, { assumeActor: "callan" });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);

  grantIdentityActorAssumption(world, {
    actor: "system",
    identityId: "identity.aaron",
    targetActor: "callan"
  });
  const allowed = resolveSessionAuthorityForIdentity(world, identity, { assumeActor: "callan" });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.authorityMode, "assumed");
  assert.equal(allowed.authenticatedIdentity.id, "identity.aaron");
  assert.equal(allowed.authenticatedActor, "aaron");
  assert.equal(allowed.effectiveIdentity.id, "identity.callan");
  assert.equal(allowed.effectiveActor, "callan");
  assert.equal(allowed.assumptionGrantId, "identity.aaron=>callan");
});

test("auth summary and route access evaluate from the effective actor", () => {
  const world = seedAuthorityWorld();
  grantIdentityActorAssumption(world, {
    actor: "system",
    identityId: "identity.aaron",
    targetActor: "callan"
  });
  const summary = authSummaryForAuthority(world, {
    authenticatedIdentity: "identity.aaron",
    authenticatedActor: "aaron",
    effectiveActor: "callan",
    authorityMode: "assumed",
    assumptionGrantId: "identity.aaron=>callan"
  });
  assert.equal(summary.authenticatedIdentity.id, "identity.aaron");
  assert.equal(summary.effectiveIdentity.id, "identity.callan");
  assert.deepEqual(summary.roles, ["engentus_user"]);
  assert.equal(summary.featureAccess["engentus.goodman"], "granted");

  const routeDecision = evaluateRouteAccess(world, {
    params: {
      auth: {
        featureId: "engentus.goodman"
      }
    }
  }, {
    authenticatedIdentity: "identity.aaron",
    authenticatedActor: "aaron",
    effectiveActor: "callan",
    authorityMode: "assumed",
    assumptionGrantId: "identity.aaron=>callan"
  });
  assert.equal(routeDecision.ok, true);
  assert.equal(routeDecision.effectiveActor, "callan");
  assert.equal(routeDecision.authenticatedIdentity.id, "identity.aaron");
  assert.equal(routeDecision.effectiveIdentity.id, "identity.callan");
});

test("authenticated identity may assume an actor without a backing identity", () => {
  const world = seedAuthorityWorld();
  grantIdentityActorAssumption(world, {
    actor: "system",
    identityId: "identity.aaron",
    targetActor: "ops-bot"
  });
  setAppFeatureAccessPolicy(world, {
    actor: "system",
    featureId: "ops.console",
    requireAuth: true,
    allowedRoles: [],
    guestBehavior: "login",
    deniedBehavior: "403"
  });
  const decision = evaluateRouteAccess(world, {
    params: {
      auth: {
        featureId: "ops.console"
      }
    }
  }, {
    authenticatedIdentity: "identity.aaron",
    authenticatedActor: "aaron",
    effectiveActor: "ops-bot",
    authorityMode: "assumed",
    assumptionGrantId: "identity.aaron=>ops-bot"
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.authenticatedIdentity.id, "identity.aaron");
  assert.equal(decision.effectiveIdentity, null);
  assert.equal(decision.effectiveActor, "ops-bot");
});

test("service-mode authority uses the same tuple model and resolves from the effective actor", () => {
  const world = seedAuthorityWorld();
  grantIdentityRole(world, {
    actor: "system",
    identityId: "identity.aaron",
    roleId: "engentus_user"
  });
  const summary = authSummaryForAuthority(world, {
    authenticatedActor: "aaron",
    effectiveActor: "aaron",
    authorityMode: "service"
  });
  assert.equal(summary.authorityMode, "service");
  assert.equal(summary.authenticatedIdentity.id, "identity.aaron");
  assert.equal(summary.effectiveIdentity.id, "identity.aaron");
  assert.equal(summary.effectiveActor, "aaron");
  assert.equal(summary.featureAccess["engentus.goodman"], "granted");
});

test("auth summary prefers canonical tuple fields over compatibility aliases", () => {
  const world = seedAuthorityWorld();
  const summary = authSummaryForAuthority(world, {
    identity: "identity.legacy",
    actor: "legacy-actor",
    authenticatedIdentity: "identity.aaron",
    authenticatedActor: "aaron",
    effectiveIdentity: "identity.callan",
    effectiveActor: "callan",
    authorityMode: "assumed",
    assumptionGrantId: "identity.aaron=>callan"
  });
  assert.equal(summary.authenticatedIdentity.id, "identity.aaron");
  assert.equal(summary.authenticatedActor, "aaron");
  assert.equal(summary.effectiveIdentity.id, "identity.callan");
  assert.equal(summary.effectiveActor, "callan");
});
