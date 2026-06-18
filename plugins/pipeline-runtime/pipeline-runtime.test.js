import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import {
  createIdentity,
  defineAuthRole,
  grantIdentityActorAssumption,
  grantIdentityRole,
  setAppFeatureAccessPolicy
} from "../../src/modules.js";
import { createRuntimeSessionServices } from "../../src/runtime-session-services.js";
import { sessionCookieHeader } from "../../src/runtime-http-utils.js";
import { handlerCatalog } from "./handler-catalog.js";
import { createPipelineRuntimeHandlers } from "./handlers.js";
import runtimeModule from "./runtime.js";

test("pipeline runtime exposes the platform-config demo handlers and no plugin-owned routes", () => {
  assert.deepEqual(handlerCatalog.authorableHandlers, [
    "pipeline.platform-config.snapshot",
    "pipeline.platform-config.secret.read",
    "pipeline.platform-config.secret.create",
    "pipeline.platform-config.secret.write",
    "pipeline.platform-config.secret.delete",
    "pipeline.platform-config.datasource.read",
    "pipeline.platform-config.datasource.create",
    "pipeline.platform-config.datasource.update",
    "pipeline.platform-config.datasource.delete",
    "pipeline.platform-config.datasource.test",
    "pipeline.platform-config.access.identity.read",
    "pipeline.platform-config.access.identity.update",
    "pipeline.platform-config.access.feature.read",
    "pipeline.platform-config.access.feature.update",
    "pipeline.platform-config.access.grant.create",
    "pipeline.platform-config.access.grant.revoke",
    "pipeline.platform-config.access.session.assume",
    "pipeline.platform-config.access.session.direct",
    "pipeline.script.run"
  ]);
  assert.deepEqual(handlerCatalog.pageHandlers, []);
  assert.deepEqual(runtimeModule.routes, []);
  assert.equal(runtimeModule.bundleId, "bundle-pipeline-runtime");
  assert.deepEqual(runtimeModule.desireExtensions.rvmForms.map(entry => entry.kind), [
    "sync",
    "sync_output",
    "input_transform",
    "output_transform",
    "input_mapping",
    "output_mapping",
    "pipeline_test"
  ]);
  assert.equal(
    runtimeModule.providers.some(provider =>
      provider?.kind === "coreHook" && provider?.id === "sessionOpenResponsePayload"
    ),
    true
  );
});

test("pipeline runtime session-open response hook hydrates platform-config routes only", async () => {
  const world = createWorld();
  createIdentity(world, {
    actor: "bootstrap",
    id: "identity.aaron",
    identityActor: "aaron",
    label: "Aaron",
    username: "aaron",
    password: "pw",
    displayName: "Aaron A."
  });
  defineAuthRole(world, { actor: "bootstrap", id: "platform_admin", label: "Platform Admin" });
  grantIdentityRole(world, { actor: "bootstrap", identityId: "identity.aaron", roleId: "platform_admin" });
  const hook = runtimeModule.providers.find(provider => provider?.id === "sessionOpenResponsePayload")?.hook;
  assert.equal(typeof hook, "function");

  const appContext = {
    secretStore: { listMetadata: async () => [] },
    dbSql: { listDatasources: () => [] }
  };
  const directSession = {
    authenticatedIdentity: "identity.aaron",
    authenticatedActor: "aaron",
    effectiveIdentity: "identity.aaron",
    effectiveActor: "aaron",
    authorityMode: "direct"
  };

  assert.equal(await hook({
    world,
    appContext,
    session: directSession,
    syncedSession: directSession,
    resumeRouteKey: "home"
  }), null);

  const hydrated = await hook({
    world,
    appContext,
    session: directSession,
    syncedSession: directSession,
    resumeRouteKey: "platform-config-access"
  });
  assert.equal(Array.isArray(hydrated.identities), true);
  assert.equal(Array.isArray(hydrated.authorityActors), true);
  assert.equal(hydrated.PlatformConfigAuthorityEffectiveActor, "aaron");
});

test("pipeline runtime handlers render the page and return a stub script response", async () => {
  const json = [];
  const handlers = runtimeModule.createHandlers({
    world: { observe() {} },
    backendHost: "backendHost",
    sendJson: (res, status, body) => json.push({ res, status, body }),
    readJson: async () => ({
      scriptName: "demo",
      datasourceId: "pg_main",
      payload: { run: true }
    })
  });

  await handlers["pipeline.script.run"]({
    req: {},
    res: {},
    requestActor: "aaron",
    appContext: { serverRunnerId: "engentus_server" }
  });
  assert.equal(json.length, 1);
  assert.equal(json[0].status, 200);
  assert.equal(json[0].body.stub, true);
  assert.match(json[0].body.summary, /would run against datasource "pg_main"/);
  assert.equal(json[0].body.request.datasourceId, "pg_main");
});

test("pipeline platform-config snapshot presents human-readable table content", async () => {
  const json = [];
  const handlers = runtimeModule.createHandlers({
    world: {
      observe() {},
      project(projector) {
        if (projector === moduleProjectors.identities) return [];
        if (projector === moduleProjectors.identityRoleGrantIndex) return { byIdentity: {} };
        if (projector === moduleProjectors.appFeatureAccessPolicies) return [];
        if (projector === moduleProjectors.authRoles) return [];
        return [];
      }
    },
    backendHost: "backendHost",
    sendJson: (res, status, body) => json.push({ res, status, body }),
    readJson: async () => ({ secretQuery: "", datasourceQuery: "" })
  });

  await handlers["pipeline.platform-config.snapshot"]({
    req: {},
    res: {},
    requestActor: "aaron",
    appContext: {
      secretStore: {
        listMetadata: async () => [{
          id: "secret_alpha",
          title: "Primary Postgres Password",
          status: "ready",
          hasValue: true,
          updatedAt: "2026-06-17T00:00:00.000Z"
        }]
      },
      dbSql: {
        listDatasources: () => [{
          id: "pg_main",
          title: "Primary Postgres",
          provider: "postgres",
          status: "ready",
          lastTestResult: "succeeded",
          updatedAt: "2026-06-17T00:00:00.000Z"
        }]
      }
    }
  });

  assert.equal(json.length, 1);
  assert.equal(json[0].status, 200);
  assert.equal(json[0].body.secrets[0].hasValueText, "Stored");
  assert.equal(json[0].body.secrets[0].updatedAtTitle, "2026-06-17T00:00:00.000Z");
  assert.equal(typeof json[0].body.secrets[0].updatedAtText, "string");
  assert.equal(json[0].body.datasources[0].providerText, "Postgres");
  assert.equal(json[0].body.datasources[0].lastTestResultText, "succeeded");
  assert.equal(json[0].body.datasources[0].updatedAtTitle, "2026-06-17T00:00:00.000Z");
  assert.equal(json[0].body.PlatformConfigAccessRolesHint, "No roles are currently defined.");
});

test("pipeline platform-config snapshot exposes the live auth role catalog", async () => {
  const json = [];
  const world = createWorld();
  defineAuthRole(world, { actor: "aaron", id: "engentus_user", label: "Engentus User", description: "Standard operator" });
  defineAuthRole(world, { actor: "aaron", id: "platform_admin", label: "Platform Admin", description: "Platform control" });
  const handlers = createPipelineRuntimeHandlers({
    world,
    backendHost: "backendHost",
    sendJson: (_res, status, body) => json.push({ status, body }),
    readJson: async () => ({})
  });

  await handlers["pipeline.platform-config.snapshot"]({
    req: {},
    res: {},
    requestActor: "aaron",
    appContext: {
      secretStore: { listMetadata: async () => [] },
      dbSql: { listDatasources: () => [] }
    }
  });

  assert.equal(json.length, 1);
  assert.equal(json[0].status, 200);
  assert.deepEqual(json[0].body.authRoles.map(row => row.id), ["engentus_user", "platform_admin"]);
  assert.equal(json[0].body.authRoles[0].label, "Engentus User");
  assert.equal(json[0].body.PlatformConfigAccessRolesHint, "Available roles: engentus_user, platform_admin");
});

test("pipeline platform-config snapshot exposes authority tuple, actor options, and grants", async () => {
  const json = [];
  const world = createWorld();
  createIdentity(world, {
    actor: "bootstrap",
    id: "identity.aaron",
    identityActor: "aaron",
    label: "Aaron",
    username: "aaron",
    password: "pw",
    displayName: "Aaron A."
  });
  createIdentity(world, {
    actor: "bootstrap",
    id: "identity.callan",
    identityActor: "callan",
    label: "Callan",
    username: "callan",
    password: "pw",
    displayName: "Callan C."
  });
  grantIdentityActorAssumption(world, {
    actor: "bootstrap",
    identityId: "identity.aaron",
    targetActor: "callan"
  });
  const handlers = createPipelineRuntimeHandlers({
    world,
    backendHost: "backendHost",
    sendJson: (_res, status, body) => json.push({ status, body }),
    readJson: async () => ({})
  });

  await handlers["pipeline.platform-config.snapshot"]({
    req: {},
    res: {},
    requestActor: "aaron",
    requestSession: {
      authenticatedIdentity: "identity.aaron",
      authenticatedActor: "aaron",
      effectiveIdentity: "identity.callan",
      effectiveActor: "callan",
      authorityMode: "assumed",
      assumptionGrantId: "identity.aaron=>callan"
    },
    appContext: {
      secretStore: { listMetadata: async () => [] },
      dbSql: { listDatasources: () => [] }
    }
  });

  assert.equal(json[0].status, 200);
  assert.equal(json[0].body.PlatformConfigAuthorityAuthenticatedIdentity, "identity.aaron");
  assert.equal(json[0].body.PlatformConfigAuthorityEffectiveActor, "callan");
  assert.equal(json[0].body.PlatformConfigAuthorityMode, "assumed");
  assert.equal(json[0].body.PlatformConfigAuthorityAssumptionGrantId, "identity.aaron=>callan");
  assert.match(json[0].body.PlatformConfigAuthoritySummary, /Authenticated identity: identity\.aaron/);
  assert.equal(json[0].body.PlatformConfigAssumeIdentityId, "identity.aaron");
  assert.equal(json[0].body.PlatformConfigAssumeTargetActor, "callan");
  assert.match(json[0].body.PlatformConfigAssumeSummary, /Currently acting as callan via identity\.aaron=>callan\./);
  assert.deepEqual(json[0].body.authorityActors.map(row => row.actor), ["aaron", "callan"]);
  assert.equal(json[0].body.authorityGrants[0].id, "identity.aaron=>callan");
  assert.equal(json[0].body.authorityGrants[0].sourceIdentityLabel, "Aaron A.");
  assert.equal(json[0].body.authorityGrants[0].statusText, "Active");
});

test("pipeline platform-config identity access handlers round-trip canonical role lists", async () => {
  const json = [];
  const world = createWorld();
  defineAuthRole(world, { actor: "aaron", id: "engentus_user", label: "Engentus User" });
  defineAuthRole(world, { actor: "aaron", id: "platform_admin", label: "Platform Admin" });
  createIdentity(world, {
    actor: "aaron",
    id: "identity.aaron",
    identityActor: "aaron",
    label: "Aaron",
    username: "aaron",
    password: "pw",
    displayName: "Aaron A."
  });
  grantIdentityRole(world, { actor: "aaron", identityId: "identity.aaron", roleId: "engentus_user" });
  const handlers = createPipelineRuntimeHandlers({
    world,
    backendHost: "backendHost",
    sendJson: (_res, status, body) => json.push({ status, body }),
    readJson: async () => ({ roles: ["platform_admin", "engentus_user", "platform_admin"] })
  });

  await handlers["pipeline.platform-config.access.identity.read"]({
    req: {},
    res: {},
    params: { id: "identity.aaron" },
    requestActor: "aaron",
    appContext: {
      secretStore: { listMetadata: async () => [] },
      dbSql: { listDatasources: () => [] }
    }
  });

  assert.deepEqual(json[0].body.PlatformConfigAccessIdentityRoles, ["engentus_user"]);

  await handlers["pipeline.platform-config.access.identity.update"]({
    req: {},
    res: {},
    params: { id: "identity.aaron" },
    requestActor: "aaron",
    appContext: {
      secretStore: { listMetadata: async () => [] },
      dbSql: { listDatasources: () => [] }
    }
  });

  assert.equal(json[1].status, 200);
  assert.deepEqual(json[1].body.PlatformConfigAccessIdentityRoles, ["engentus_user", "platform_admin"]);
  assert.deepEqual(world.project(moduleProjectors.identityRoleGrantIndex).byIdentity["identity.aaron"], ["engentus_user", "platform_admin"]);
});

test("pipeline platform-config feature access handlers accept canonical arrays, reject unknown roles, and preserve CSV compatibility", async () => {
  const world = createWorld();
  defineAuthRole(world, { actor: "aaron", id: "engentus_user", label: "Engentus User" });
  defineAuthRole(world, { actor: "aaron", id: "platform_admin", label: "Platform Admin" });
  setAppFeatureAccessPolicy(world, {
    actor: "aaron",
    featureId: "goodman",
    label: "Goodman",
    appId: "engentus",
    visibilityMode: "normal",
    allowedRoles: ["engentus_user"]
  });

  const json = [];
  let readBody = { allowedRoles: ["platform_admin", "engentus_user", "platform_admin"] };
  const handlers = createPipelineRuntimeHandlers({
    world,
    backendHost: "backendHost",
    sendJson: (_res, status, body) => json.push({ status, body }),
    readJson: async () => readBody
  });
  const appContext = {
    secretStore: { listMetadata: async () => [] },
    dbSql: { listDatasources: () => [] }
  };

  await handlers["pipeline.platform-config.access.feature.update"]({
    req: {},
    res: {},
    params: { id: "goodman" },
    requestActor: "aaron",
    appContext
  });

  assert.equal(json[0].status, 200);
  assert.deepEqual(json[0].body.PlatformConfigAccessFeatureAllowedRoles, ["platform_admin", "engentus_user"]);
  assert.deepEqual(world.project(moduleProjectors.appFeatureAccessPolicyIndex).byFeatureId.goodman.allowedRoles, ["platform_admin", "engentus_user"]);

  readBody = { allowedRoles: ["unknown_role"] };
  await handlers["pipeline.platform-config.access.feature.update"]({
    req: {},
    res: {},
    params: { id: "goodman" },
    requestActor: "aaron",
    appContext
  });
  assert.equal(json[1].status, 400);
  assert.match(json[1].body.error, /unknown roles: unknown_role/);

  readBody = { allowedRolesCsv: "engentus_user, platform_admin, engentus_user" };
  await handlers["pipeline.platform-config.access.feature.update"]({
    req: {},
    res: {},
    params: { id: "goodman" },
    requestActor: "aaron",
    appContext
  });
  assert.equal(json[2].status, 200);
  assert.deepEqual(json[2].body.PlatformConfigAccessFeatureAllowedRoles, ["engentus_user", "platform_admin"]);
});

test("pipeline platform-config authority grant handlers create, reject duplicate active grants, and revoke", async () => {
  const world = createWorld();
  createIdentity(world, {
    actor: "bootstrap",
    id: "identity.aaron",
    identityActor: "aaron",
    label: "Aaron",
    username: "aaron",
    password: "pw",
    displayName: "Aaron A."
  });
  createIdentity(world, {
    actor: "bootstrap",
    id: "identity.callan",
    identityActor: "callan",
    label: "Callan",
    username: "callan",
    password: "pw",
    displayName: "Callan C."
  });

  const json = [];
  let readBody = { identityId: "identity.aaron", targetActor: "callan" };
  const handlers = createPipelineRuntimeHandlers({
    world,
    backendHost: "backendHost",
    sendJson: (_res, status, body) => json.push({ status, body }),
    readJson: async () => readBody
  });
  const appContext = {
    secretStore: { listMetadata: async () => [] },
    dbSql: { listDatasources: () => [] }
  };

  await handlers["pipeline.platform-config.access.grant.create"]({
    req: {},
    res: {},
    requestActor: "aaron",
    requestSession: {
      authenticatedIdentity: "identity.aaron",
      authenticatedActor: "aaron",
      effectiveIdentity: "identity.aaron",
      effectiveActor: "aaron",
      authorityMode: "direct"
    },
    appContext
  });

  assert.equal(json[0].status, 200);
  assert.equal(json[0].body.PlatformConfigGrantSelectedId, "identity.aaron=>callan");
  assert.equal(json[0].body.authorityGrants[0].statusText, "Active");

  await handlers["pipeline.platform-config.access.grant.create"]({
    req: {},
    res: {},
    requestActor: "aaron",
    requestSession: {
      authenticatedIdentity: "identity.aaron",
      authenticatedActor: "aaron",
      effectiveIdentity: "identity.aaron",
      effectiveActor: "aaron",
      authorityMode: "direct"
    },
    appContext
  });

  assert.equal(json[1].status, 409);
  assert.match(json[1].body.error, /active grant already exists/);

  await handlers["pipeline.platform-config.access.grant.revoke"]({
    req: {},
    res: {},
    params: { grantId: "identity.aaron=>callan" },
    requestActor: "aaron",
    requestSession: {
      authenticatedIdentity: "identity.aaron",
      authenticatedActor: "aaron",
      effectiveIdentity: "identity.aaron",
      effectiveActor: "aaron",
      authorityMode: "direct"
    },
    appContext
  });

  assert.equal(json[2].status, 200);
  assert.equal(json[2].body.PlatformConfigGrantSelectedId, "identity.aaron=>callan");
  assert.equal(json[2].body.authorityGrants[0].statusText, "Revoked");
});

test("pipeline platform-config session switching opens assumed sessions and returns to direct mode", async () => {
  const world = createWorld();
  createIdentity(world, {
    actor: "bootstrap",
    id: "identity.aaron",
    identityActor: "aaron",
    label: "Aaron",
    username: "aaron",
    password: "aaron",
    displayName: "Aaron A."
  });
  createIdentity(world, {
    actor: "bootstrap",
    id: "identity.callan",
    identityActor: "callan",
    label: "Callan",
    username: "callan",
    password: "callan",
    displayName: "Callan C."
  });
  grantIdentityActorAssumption(world, {
    actor: "bootstrap",
    identityId: "identity.aaron",
    targetActor: "callan"
  });

  const sessionStore = new Map();
  const sessionServices = createRuntimeSessionServices({ sessionStore });
  const json = [];
  let readBody = { identityId: "identity.aaron", targetActor: "callan" };
  const handlers = createPipelineRuntimeHandlers({
    world,
    backendHost: "backendHost",
    sendJson: (_res, status, body, headers) => json.push({ status, body, headers }),
    readJson: async () => readBody,
    sessionStore,
    sessionCookieHeader,
    ...sessionServices
  });
  const appContext = {
    secretStore: { listMetadata: async () => [] },
    dbSql: { listDatasources: () => [] }
  };
  const directSession = sessionServices.createSessionForIdentity({
    id: "identity.aaron",
    actor: "aaron",
    username: "aaron",
    password: "aaron",
    label: "Aaron",
    displayName: "Aaron A."
  });

  await handlers["pipeline.platform-config.access.session.assume"]({
    req: {},
    res: {},
    requestActor: "aaron",
    requestSession: directSession,
    appContext
  });

  assert.equal(json[0].status, 200);
  assert.equal(json[0].body.PlatformConfigAuthorityMode, "assumed");
  assert.equal(json[0].body.PlatformConfigAuthorityAuthenticatedIdentity, "identity.aaron");
  assert.equal(json[0].body.PlatformConfigAuthorityEffectiveActor, "callan");
  assert.equal(json[0].body.EngentusSessionActor, "callan");
  assert.match(json[0].body.PlatformConfigAssumeSummary, /Opened assumed session for aaron as callan\./);
  assert.equal(typeof json[0].headers?.["set-cookie"], "string");
  assert.equal(sessionStore.has(directSession.id), false);

  const assumedSessionId = String(json[0].headers["set-cookie"]).split(";")[0].split("=")[1];
  const assumedSession = sessionStore.get(assumedSessionId);
  assert.equal(assumedSession?.effectiveActor, "callan");
  assert.equal(assumedSession?.authorityMode, "assumed");

  readBody = {};
  await handlers["pipeline.platform-config.access.session.direct"]({
    req: {},
    res: {},
    requestActor: "callan",
    requestSession: assumedSession,
    appContext
  });

  assert.equal(json[1].status, 200);
  assert.equal(json[1].body.PlatformConfigAuthorityMode, "direct");
  assert.equal(json[1].body.PlatformConfigAuthorityEffectiveActor, "aaron");
  assert.equal(json[1].body.EngentusSessionActor, "aaron");
  assert.match(json[1].body.PlatformConfigAssumeSummary, /Returned to direct session for aaron\./);
  assert.equal(typeof json[1].headers?.["set-cookie"], "string");
  assert.equal(sessionStore.has(assumedSession.id), false);
});
