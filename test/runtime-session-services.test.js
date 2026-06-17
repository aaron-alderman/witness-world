import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeSessionServices } from "../src/runtime-session-services.js";

test("runtime session services create, shape, sync, and clear guidance session state with tutorial aliases", () => {
  const sessionStore = new Map();
  const services = createRuntimeSessionServices({ sessionStore });
  const identity = {
    id: "identity.aaron",
    actor: "aaron",
    label: "Aaron",
    displayName: "Aaron A.",
    jobTitle: "Lead Engineer",
    initials: "AA",
    roles: ["engentus_user"],
    featureAccess: {
      "engentus.home": "granted",
      "engentus.platform_config": "granted"
    },
    homeContext: "ctx.platform",
    homePerspective: "aaron:workspace"
  };

  const session = services.createSessionForIdentity(identity);
  assert.equal(sessionStore.has(session.id), true);
  assert.equal(Object.keys(session).includes("tutorialProgress"), false);
  assert.equal(session.tutorialProgress, session.guidanceProgress);
  const shapedSession = services.sessionResponseShape(session);
  assert.equal(shapedSession.authenticated, true);
  assert.equal(shapedSession.identity, "identity.aaron");
  assert.equal(shapedSession.actor, "aaron");
  assert.equal(shapedSession.authenticatedIdentity, "identity.aaron");
  assert.equal(shapedSession.authenticatedActor, "aaron");
  assert.equal(shapedSession.effectiveIdentity, "identity.aaron");
  assert.equal(shapedSession.effectiveActor, "aaron");
  assert.equal(shapedSession.authorityMode, "direct");
  assert.equal(shapedSession.assumptionGrantId, null);
  assert.equal(shapedSession.label, "Aaron");
  assert.equal(shapedSession.authenticatedLabel, "Aaron");
  assert.equal(shapedSession.effectiveLabel, "Aaron");
  assert.equal(shapedSession.displayName, "Aaron A.");
  assert.equal(shapedSession.jobTitle, "Lead Engineer");
  assert.equal(shapedSession.initials, "AA");
  assert.deepEqual(shapedSession.profile, {
    displayName: "Aaron A.",
    jobTitle: "Lead Engineer",
    initials: "AA"
  });
  assert.deepEqual(shapedSession.authenticatedProfile, {
    displayName: "Aaron A.",
    jobTitle: "Lead Engineer",
    initials: "AA"
  });
  assert.deepEqual(shapedSession.effectiveProfile, {
    displayName: "Aaron A.",
    jobTitle: "Lead Engineer",
    initials: "AA"
  });
  assert.deepEqual(shapedSession.roles, ["engentus_user"]);
  assert.deepEqual(shapedSession.featureAccess, {
    "engentus.home": "granted",
    "engentus.platform_config": "granted"
  });
  assert.equal(shapedSession.featureAccess__engentus_home, "granted");
  assert.equal(shapedSession.featureAccess__engentus_platform_config, "granted");
  assert.equal(shapedSession.homeContext, "ctx.platform");
  assert.equal(shapedSession.perspective, "aaron:workspace");
  assert.equal(shapedSession.authenticatedHomeContext, "ctx.platform");
  assert.equal(shapedSession.authenticatedPerspective, "aaron:workspace");
  assert.equal(shapedSession.effectiveHomeContext, "ctx.platform");
  assert.equal(shapedSession.effectivePerspective, "aaron:workspace");

  assert.equal(services.guidanceProgressFor(session, "todo-from-scratch"), null);
  assert.equal(services.tutorialProgressFor(session, "todo-from-scratch"), null);
  services.setGuidanceProgress(session, "todo-from-scratch", { stepId: "identity:create" });
  assert.deepEqual(services.guidanceProgressFor(session, "todo-from-scratch"), { stepId: "identity:create" });
  assert.deepEqual(services.tutorialProgressFor(session, "todo-from-scratch"), { stepId: "identity:create" });
  services.setTutorialProgress(session, "todo-from-scratch", null);
  assert.equal(services.guidanceProgressFor(session, "todo-from-scratch"), null);
  assert.equal(services.tutorialProgressFor(session, "todo-from-scratch"), null);

  const synced = services.syncSessionIdentity(session, {
    ...identity,
    actor: "aaron.updated",
    label: "Aaron Updated",
    homeContext: "ctx.updated",
    homePerspective: "aaron:updated"
  });
  assert.equal(synced.authenticatedActor, "aaron.updated");
  assert.equal(synced.label, "Aaron Updated");
  assert.equal(sessionStore.get(session.id).label, "Aaron Updated");
  assert.equal(sessionStore.get(session.id).tutorialProgress, sessionStore.get(session.id).guidanceProgress);
  const resynced = services.syncSessionAuthSummary(sessionStore.get(session.id), {
    authenticatedIdentity: { id: "identity.aaron", actor: "aaron.updated" },
    authenticatedActor: "aaron.updated",
    effectiveIdentity: { id: "identity.aaron", label: "Aaron Updated" },
    effectiveActor: "aaron.updated",
    authorityMode: "direct",
    profile: {
      displayName: "Aaron Admin",
      jobTitle: "Platform Admin",
      initials: "AX"
    },
    roles: ["engentus_user", "platform_admin"],
    featureAccess: {
      "engentus.home": "granted",
      "engentus.platform_config": "granted",
      "engentus.mill_force": "locked"
    }
  });
  const shaped = services.sessionResponseShape(resynced);
  assert.deepEqual(shaped.profile, {
    displayName: "Aaron Admin",
    jobTitle: "Platform Admin",
    initials: "AX"
  });
  assert.deepEqual(shaped.roles, ["engentus_user", "platform_admin"]);
  assert.equal(shaped.featureAccess__engentus_mill_force, "locked");
});

test("runtime session services preserve actor-canonical assumed authority tuples", () => {
  const sessionStore = new Map();
  const services = createRuntimeSessionServices({ sessionStore });
  const authenticatedIdentity = {
    id: "identity.aaron",
    actor: "aaron",
    label: "Aaron",
    displayName: "Aaron A.",
    jobTitle: "Lead Engineer",
    initials: "AA",
    homeContext: "ctx.aaron",
    homePerspective: "aaron:workspace"
  };
  const effectiveIdentity = {
    id: "identity.callan",
    actor: "callan",
    label: "Callan",
    displayName: "Callan C.",
    jobTitle: "Reliability Engineer",
    initials: "CC",
    homeContext: "ctx.callan",
    homePerspective: "callan:workspace"
  };
  const session = services.createSessionForIdentity(authenticatedIdentity, {
    authorityMode: "assumed",
    effectiveActor: "callan",
    effectiveIdentity,
    assumptionGrantId: "identity.aaron=>callan",
    roles: ["engentus_user"],
    featureAccess: {
      "engentus.home": "granted"
    }
  });
  const shaped = services.sessionResponseShape(session);
  assert.equal(shaped.authenticatedIdentity, "identity.aaron");
  assert.equal(shaped.authenticatedActor, "aaron");
  assert.equal(shaped.effectiveIdentity, "identity.callan");
  assert.equal(shaped.effectiveActor, "callan");
  assert.equal(shaped.identity, "identity.callan");
  assert.equal(shaped.actor, "callan");
  assert.equal(shaped.authorityMode, "assumed");
  assert.equal(shaped.assumptionGrantId, "identity.aaron=>callan");
  assert.deepEqual(shaped.authenticatedProfile, {
    displayName: "Aaron A.",
    jobTitle: "Lead Engineer",
    initials: "AA"
  });
  assert.deepEqual(shaped.effectiveProfile, {
    displayName: "Callan C.",
    jobTitle: "Reliability Engineer",
    initials: "CC"
  });
  assert.equal(shaped.homeContext, "ctx.callan");
  assert.equal(shaped.perspective, "callan:workspace");
  assert.equal(shaped.authenticatedHomeContext, "ctx.aaron");
  assert.equal(shaped.authenticatedPerspective, "aaron:workspace");
  assert.equal(shaped.effectiveHomeContext, "ctx.callan");
  assert.equal(shaped.effectivePerspective, "callan:workspace");
});

test("runtime session services preserve service authority tuples while keeping compatibility aliases effective-side", () => {
  const sessionStore = new Map();
  const services = createRuntimeSessionServices({ sessionStore });
  const serviceIdentity = {
    id: "identity.ops",
    actor: "ops-bot",
    label: "Ops Bot",
    displayName: "Ops Bot",
    initials: "OB"
  };
  const session = services.createSessionForIdentity(serviceIdentity, {
    authorityMode: "service",
    effectiveActor: "ops-bot",
    effectiveIdentity: null
  });
  const shaped = services.sessionResponseShape(session);
  assert.equal(shaped.authenticatedIdentity, "identity.ops");
  assert.equal(shaped.authenticatedActor, "ops-bot");
  assert.equal(shaped.effectiveIdentity, "identity.ops");
  assert.equal(shaped.effectiveActor, "ops-bot");
  assert.equal(shaped.authorityMode, "service");
  assert.equal(shaped.identity, "identity.ops");
  assert.equal(shaped.actor, "ops-bot");
});
