import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, createThing, relation } from "../src/kernel.js";
import { createModuleProjectorContext, moduleProjectors, registerModuleProjectors } from "../src/modules.js";

test("module projector registrations are scoped and idempotent", () => {
  const assets = () => [{ id: "asset.shared" }];
  const unregisterOne = registerModuleProjectors("test.one", { assets });
  const unregisterTwo = registerModuleProjectors("test.two", { assets });

  try {
    assert.deepEqual(moduleProjectors.assets([]), [{ id: "asset.shared" }]);
    unregisterOne();
    unregisterOne();
    assert.deepEqual(moduleProjectors.assets([]), [{ id: "asset.shared" }]);
  } finally {
    unregisterOne();
    unregisterTwo();
  }

  assert.deepEqual(moduleProjectors.assets([]), []);
});

test("module projector registrations reject conflicting active implementations", () => {
  const assets = () => [{ id: "asset.first" }];
  const conflictingAssets = () => [{ id: "asset.second" }];
  const unregister = registerModuleProjectors("test.first", { assets });

  try {
    assert.throws(
      () => registerModuleProjectors("test.second", { assets: conflictingAssets }),
      /module projector assets is already registered by test\.first with a different implementation/
    );
    assert.deepEqual(moduleProjectors.assets([]), [{ id: "asset.first" }]);
  } finally {
    unregister();
  }

  assert.deepEqual(moduleProjectors.assets([]), []);
});

test("world projection context isolates optional module projectors per world", () => {
  const alphaContext = createModuleProjectorContext({
    assets: () => [{ id: "asset.alpha" }]
  }, { owner: "alpha" });
  const betaContext = createModuleProjectorContext({
    assets: () => [{ id: "asset.beta" }]
  }, { owner: "beta" });
  const alphaWorld = createWorld({ projectionContext: alphaContext });
  const betaWorld = createWorld({ projectionContext: betaContext });

  assert.deepEqual(alphaWorld.project(moduleProjectors.assets), [{ id: "asset.alpha" }]);
  assert.deepEqual(betaWorld.project(moduleProjectors.assets), [{ id: "asset.beta" }]);
  assert.deepEqual(alphaWorld.project(moduleProjectors.assets, { projectionContext: betaContext }), [{ id: "asset.beta" }]);
});

test("projection context wins over legacy global projector registration", () => {
  const unregister = registerModuleProjectors("test.global", {
    assets: () => [{ id: "asset.global" }]
  });
  const context = createModuleProjectorContext({
    assets: () => [{ id: "asset.context" }]
  }, { owner: "context" });
  const world = createWorld({ projectionContext: context });

  try {
    assert.deepEqual(createWorld().project(moduleProjectors.assets), [{ id: "asset.global" }]);
    assert.deepEqual(world.project(moduleProjectors.assets), [{ id: "asset.context" }]);
  } finally {
    unregister();
  }

  assert.deepEqual(createWorld().project(moduleProjectors.assets), []);
});

test("nested delegated module projectors forward projection context", () => {
  const notifications = (witnesses, options) => [{
    id: "notification.demo",
    jobRunner: moduleProjectors.jobIndex(witnesses, options).byId["job.demo"]?.serverRunner ?? null
  }];
  const context = createModuleProjectorContext({
    jobIndex: () => ({
      rows: [{ id: "job.demo", serverRunner: "runner.context" }],
      byId: { "job.demo": { id: "job.demo", serverRunner: "runner.context" } }
    }),
    notifications
  }, { owner: "nested" });
  const world = createWorld({ projectionContext: context });

  assert.deepEqual(world.project(moduleProjectors.notifications), [{
    id: "notification.demo",
    jobRunner: "runner.context"
  }]);
});

test("optional backend module projectors are inactive until owning plugins register them", () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  createThing(world, { actor: "system", id: "db.main" });
  createThing(world, { actor: "system", id: "search.main" });
  createThing(world, { actor: "system", id: "job.demo" });
  createThing(world, { actor: "system", id: "notification.demo" });
  createThing(world, { actor: "system", id: "outbound.demo" });
  createThing(world, { actor: "system", id: "webhook.demo" });
  createThing(world, { actor: "system", id: "oauth.flow.demo" });
  createThing(world, { actor: "system", id: "oauth.link.demo" });
  createThing(world, { actor: "system", id: "mcp.demo" });
  createThing(world, { actor: "system", id: "asset.demo" });
  createThing(world, { actor: "system", id: "asset.target" });
  world.emit({
    process: "defineSqlDatasource",
    actor: "system",
    claims: [
      relation("db.main", "hasModuleKind", "sqlDatasource"),
      relation("db.main", "hasTitle", "Main Database")
    ],
    body: { id: "db.main" }
  });
  world.emit({
    process: "db.sql.datasource.configured",
    actor: "system",
    body: {
      id: "db.main",
      serverRunner: "runner.demo",
      provider: "sqlite",
      datasourceName: "main"
    }
  });
  world.emit({
    process: "db.sql.query",
    actor: "system",
    body: {
      id: "op.query.1",
      serverRunner: "runner.demo",
      datasourceId: "db.main",
      provider: "sqlite",
      kind: "query",
      rowCount: 2
    }
  });
  world.emit({
    process: "defineSearchIndex",
    actor: "system",
    claims: [
      relation("search.main", "hasModuleKind", "searchIndex"),
      relation("search.main", "hasTitle", "Main Search")
    ],
    body: { id: "search.main" }
  });
  world.emit({
    process: "search.index.query",
    actor: "system",
    body: {
      id: "search.main",
      serverRunner: "runner.demo",
      provider: "memory",
      name: "main",
      documentCount: 4
    }
  });
  world.emit({
    process: "defineJob",
    actor: "system",
    claims: [
      relation("job.demo", "hasModuleKind", "job"),
      relation("job.demo", "hasTitle", "Demo Job")
    ],
    body: { id: "job.demo" }
  });
  world.emit({
    process: "jobs.queue.enqueue",
    actor: "system",
    body: {
      id: "job.demo",
      serverRunner: "runner.demo",
      handler: "notify.email.deliver"
    }
  });
  world.emit({
    process: "defineNotification",
    actor: "system",
    claims: [
      relation("notification.demo", "hasModuleKind", "notification"),
      relation("notification.demo", "hasTitle", "Demo Notification")
    ],
    body: { id: "notification.demo" }
  });
  world.emit({
    process: "notify.email.enqueue",
    actor: "system",
    body: {
      id: "notification.demo",
      to: "user@example.com",
      subject: "Hello",
      jobId: "job.demo"
    }
  });
  world.emit({
    process: "defineOutboundRequest",
    actor: "system",
    claims: [
      relation("outbound.demo", "hasModuleKind", "outboundRequest"),
      relation("outbound.demo", "hasTitle", "Demo Outbound")
    ],
    body: { id: "outbound.demo" }
  });
  world.emit({
    process: "http.outbound.succeeded",
    actor: "system",
    body: {
      id: "outbound.demo",
      serverRunner: "runner.demo",
      target: "Example",
      url: "stub://echo"
    }
  });
  world.emit({
    process: "defineWebhookDelivery",
    actor: "system",
    claims: [
      relation("webhook.demo", "hasModuleKind", "webhookDelivery"),
      relation("webhook.demo", "hasTitle", "Demo Webhook")
    ],
    body: { id: "webhook.demo" }
  });
  world.emit({
    process: "webhook.inbound.accepted",
    actor: "system",
    body: {
      id: "webhook.demo",
      serverRunner: "runner.demo",
      target: "stripe",
      deliveryId: "evt_1",
      jobId: "job.demo"
    }
  });
  world.emit({
    process: "defineOauthFlow",
    actor: "system",
    claims: [
      relation("oauth.flow.demo", "hasModuleKind", "oauthFlow"),
      relation("oauth.flow.demo", "hasTitle", "Demo OAuth Flow")
    ],
    body: { id: "oauth.flow.demo" }
  });
  world.emit({
    process: "defineOauthLink",
    actor: "system",
    claims: [
      relation("oauth.link.demo", "hasModuleKind", "oauthLink"),
      relation("oauth.link.demo", "hasTitle", "Demo OAuth Link")
    ],
    body: { id: "oauth.link.demo" }
  });
  world.emit({
    process: "auth.oauth.start",
    actor: "system",
    body: {
      id: "oauth.flow.demo",
      provider: "stub",
      state: "state-1"
    }
  });
  world.emit({
    process: "auth.oauth.link",
    actor: "system",
    body: {
      id: "oauth.flow.demo",
      linkId: "oauth.link.demo",
      provider: "stub",
      providerAccountId: "acct-1"
    }
  });
  world.emit({
    process: "defineMcpServer",
    actor: "system",
    claims: [
      relation("mcp.demo", "hasModuleKind", "mcpServer"),
      relation("mcp.demo", "usesServerRunner", "runner.demo"),
      relation("mcp.demo", "supportsTransport", "stdio"),
      relation("mcp.demo", "exposesMcpTool", "world.read", {
        actingMode: "service",
        scopeContexts: ["ctx.demo"],
        scopeTargets: []
      })
    ],
    body: {
      id: "mcp.demo",
      serverRunner: "runner.demo",
      transports: ["stdio"]
    }
  });
  world.emit({
    process: "defineAsset",
    actor: "system",
    claims: [
      relation("asset.demo", "hasModuleKind", "asset"),
      relation("asset.demo", "hasTitle", "Demo Asset"),
      relation("asset.target", "attachedAsset", "asset.demo")
    ],
    body: { id: "asset.demo" }
  });
  world.emit({
    process: "asset.upload",
    actor: "system",
    body: {
      id: "asset.demo",
      originalName: "demo.txt",
      contentUrl: "/api/assets/asset.demo/content"
    }
  });

  assert.deepEqual(world.project(moduleProjectors.sqlDatasources), []);
  assert.deepEqual(world.project(moduleProjectors.sqlOperations), []);
  assert.deepEqual(world.project(moduleProjectors.sqlDatasourceIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.sqlDatasourceIndex).byId), []);
  assert.deepEqual(world.project(moduleProjectors.sqlOperationIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.sqlOperationIndex).byId), []);
  assert.deepEqual(world.project(moduleProjectors.searchIndexes), []);
  assert.deepEqual(world.project(moduleProjectors.searchIndexIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.searchIndexIndex).byId), []);
  assert.deepEqual(world.project(moduleProjectors.jobs), []);
  assert.deepEqual(world.project(moduleProjectors.jobIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.jobIndex).byId), []);
  assert.deepEqual(world.project(moduleProjectors.notifications), []);
  assert.deepEqual(world.project(moduleProjectors.notificationIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.notificationIndex).byId), []);
  assert.deepEqual(world.project(moduleProjectors.outboundRequests), []);
  assert.deepEqual(world.project(moduleProjectors.outboundRequestIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.outboundRequestIndex).byId), []);
  assert.deepEqual(world.project(moduleProjectors.webhookDeliveries), []);
  assert.deepEqual(world.project(moduleProjectors.webhookDeliveryIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.webhookDeliveryIndex).byId), []);
  assert.deepEqual(world.project(moduleProjectors.oauthFlows), []);
  assert.deepEqual(world.project(moduleProjectors.oauthFlowIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.oauthFlowIndex).byId), []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.oauthFlowIndex).byState), []);
  assert.deepEqual(world.project(moduleProjectors.oauthLinks), []);
  assert.deepEqual(world.project(moduleProjectors.oauthLinkIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.oauthLinkIndex).byId), []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.oauthLinkIndex).byProviderAccount), []);
  assert.deepEqual(world.project(moduleProjectors.mcpServers), []);
  assert.deepEqual(world.project(moduleProjectors.mcpServerIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.mcpServerIndex).byId), []);
  assert.deepEqual(world.project(moduleProjectors.mcpToolInstalls), []);
  assert.deepEqual(world.project(moduleProjectors.mcpToolInstallIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.mcpToolInstallIndex).byServer), []);
  assert.deepEqual(world.project(moduleProjectors.assets), []);
  assert.deepEqual(world.project(moduleProjectors.assetIndex).rows, []);
  assert.deepEqual(Object.keys(world.project(moduleProjectors.assetIndex).byId), []);
});
