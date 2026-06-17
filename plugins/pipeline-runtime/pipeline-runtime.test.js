import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import {
  createIdentity,
  defineAuthRole,
  grantIdentityRole,
  setAppFeatureAccessPolicy
} from "../../src/modules.js";
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
    "pipeline.script.run"
  ]);
  assert.deepEqual(handlerCatalog.pageHandlers, []);
  assert.deepEqual(runtimeModule.routes, []);
  assert.equal(runtimeModule.bundleId, "bundle-pipeline-runtime");
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
