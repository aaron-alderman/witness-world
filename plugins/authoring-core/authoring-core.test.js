import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { moduleProjectors } from "../../src/modules.js";
import { bundles } from "./runtime.js";
import { executeAuthoringCoreProposalTarget } from "./authoring-core-proposal-targets.js";

const AUTHORING_CORE_HANDLER_IDS = [
  "identity.create",
  "identity.update",
  "context.create",
  "perspective.create",
  "contextBinding.create",
  "contextBinding.remove",
  "contextExport.create",
  "contextExport.remove",
  "contextImport.create",
  "contextImport.remove",
  "stewardship.create",
  "stewardship.remove",
  "surface.create",
  "process.create",
  "type.create",
  "projection.create",
  "message.create",
  "widgets.create",
  "widgets.update",
  "route.create",
  "serve.create"
];

const AUTHORING_CORE_PROCESS_EXPORTS = [
  "requestBootstrapIdentityDefine",
  "requestBootstrapIdentityUpdate",
  "requestBootstrapContextDefine",
  "requestBootstrapPerspectiveDefine",
  "requestBootstrapContextBindingCreate",
  "requestBootstrapContextBindingRemove",
  "requestBootstrapContextExportCreate",
  "requestBootstrapContextExportRemove",
  "requestBootstrapContextImportCreate",
  "requestBootstrapContextImportRemove",
  "requestBootstrapStewardshipGrant",
  "requestBootstrapStewardshipRevoke",
  "requestSurfaceDefine",
  "requestProcessDefine",
  "requestTypeDefine",
  "requestProjectionDefine",
  "requestMessageDefine",
  "requestBootstrapRouteDefine",
  "requestBootstrapServeDefine",
  "requestWidgetDefine",
  "requestWidgetUpdate"
];

test("authoring-core plugin owns generic authoring routes and handlers", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
  const bundle = bundles["bundle-authoring-core"];

  assert.equal(manifest.id, "plugin.authoring-core");
  assert.deepEqual(manifest.activatesBundles, ["bundle-authoring-core"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.deepEqual(bundle.handlerCatalog.dispatchHandlers, AUTHORING_CORE_HANDLER_IDS);
  assert.equal(bundle.routes.some(route => route.path === "/api/contexts" && route.handler === "context.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/surfaces" && route.handler === "surface.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/processes" && route.handler === "process.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/types" && route.handler === "type.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/projections" && route.handler === "projection.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/messages" && route.handler === "message.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/widgets" && route.handler === "widgets.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/routes" && route.handler === "route.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/serve-mounts" && route.handler === "serve.create"), true);

  const handlers = bundle.createHandlers({
    world: createWorld(),
    backendHost: "backendHost",
    readJson: async () => ({}),
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" },
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: () => ({ ok: true })
    },
    sendGateFailure() {},
    sendJson() {},
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });
  for (const handlerId of AUTHORING_CORE_HANDLER_IDS) {
    assert.equal(typeof handlers[handlerId], "function");
  }
});

test("authoring-core plugin owns generic authoring process helpers", async () => {
  const processesSource = await readFile(new URL("./authoring-core-processes.js", import.meta.url), "utf8");
  const proposalTargetSource = await readFile(new URL("./authoring-core-proposal-targets.js", import.meta.url), "utf8");
  const metaManifest = JSON.parse(await readFile(new URL("../authoring/plugin.json", import.meta.url), "utf8"));

  for (const exportName of AUTHORING_CORE_PROCESS_EXPORTS) {
    assert.equal(processesSource.includes(`export function ${exportName}`), true);
  }
  await assert.rejects(readFile(new URL("../../src/bootstrap-authoring.js", import.meta.url), "utf8"));
  assert.equal(metaManifest.runtime, undefined);
  assert.equal(metaManifest.activatesBundles, undefined);
  assert.equal(metaManifest.dependsOnPlugins.includes("plugin.authoring-core"), true);
  for (const targetProcess of [
    "identity.update",
    "context.define",
    "context.bind",
    "context.unbind",
    "context.export",
    "context.unexport",
    "context.import",
    "context.unimport",
    "perspective.define",
    "stewardship.grant",
    "stewardship.revoke",
    "widget.define",
    "widget.update",
    "route.define",
    "serve.define"
  ]) {
    assert.equal(proposalTargetSource.includes(`case "${targetProcess}"`), true);
  }

  const unsupported = executeAuthoringCoreProposalTarget({
    world: createWorld(),
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "not.authoringCore" },
    body: {},
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });
  assert.equal(unsupported, null);
});

test("authoring-core stewardship handlers lower target refs before target authority checks", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceRunner"
name = "importedRunner"
`);

  const seenTargets = [];
  const sent = [];
  const handlers = bundles["bundle-authoring-core"].createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async () => ({
      steward: "callan",
      context: "ctx.target",
      targetRef: "importedRunner",
      targetKind: "serverRunner"
    }),
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: (_actor, target) => {
        seenTargets.push(target);
        return { ok: true };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ gate });
    },
    sendJson(_res, status, body) {
      sent.push({ status, body });
    },
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });

  await handlers["stewardship.create"]({ req: {}, res: {}, requestActor: "aaron" });

  assert.deepEqual(seenTargets, ["source_server"]);
  assert.equal(sent[0]?.status, 201);
  assert.equal(world.project(moduleProjectors.stewardships).some(row =>
    row.steward === "callan" && row.target === "source_server"
  ), true);
});

test("authoring-core stewardship proposal targets lower target refs before target authority checks", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceRunner"
name = "importedRunner"
`);

  const seenTargets = [];
  const result = executeAuthoringCoreProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "stewardship.grant" },
    body: {
      steward: "callan",
      context: "ctx.target",
      targetRef: "importedRunner",
      targetKind: "serverRunner"
    },
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: (_actor, target) => {
      seenTargets.push(target);
      return { ok: true };
    }
  });

  assert.deepEqual(seenTargets, ["source_server"]);
  assert.equal(result?.ok, true);
  assert.equal(world.project(moduleProjectors.stewardships).some(row =>
    row.steward === "callan" && row.target === "source_server"
  ), true);
});
