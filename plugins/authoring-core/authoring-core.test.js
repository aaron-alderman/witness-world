import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { bindContextName, importContextName, moduleProjectors } from "../../src/modules.js";
import {
  resolveStewardshipTargetInput,
  requestPackageRevisionDefine,
  requestPackagePatchDefine,
  requestPackageDependencyDefine,
  requestPackageTransformerDefine
} from "./authoring-core-processes.js";
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
  "collection.create",
  "process.create",
  "type.create",
  "projection.create",
  "message.create",
  "boundary.create",
  "policy.create",
  "package.create",
  "packageRevision.create",
  "packageRevision.publish",
  "packagePatch.create",
  "packageNamespace.create",
  "packageDependency.create",
  "packageTransformer.create",
  "frontend.migrateLegacy",
  "frontend.upliftLegacy",
  "widgets.create",
  "widgets.update",
  "widgets.replace",
  "widgets.replace.rollback",
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
  "requestCollectionDefine",
  "requestProcessDefine",
  "requestTypeDefine",
  "requestProjectionDefine",
  "requestMessageDefine",
  "requestBoundaryDefine",
  "requestPolicyDefine",
  "requestPackageDefine",
  "requestPackageRevisionDefine",
  "requestPackageRevisionPublish",
  "requestPackagePatchDefine",
  "requestPackageNamespaceDefine",
  "requestPackageDependencyDefine",
  "requestPackageTransformerDefine",
  "requestBootstrapRouteDefine",
  "requestBootstrapServeDefine",
  "requestBootstrapFrontendMigrateLegacy",
  "requestBootstrapFrontendUpliftLegacy",
  "requestWidgetDefine",
  "requestWidgetUpdate",
  "requestWidgetReplace",
  "requestWidgetReplaceRollback"
];

function stewardshipTargetResolutionWorld() {
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

[[context]]
actor = "system"
id = "ctx.hidden"

[[serverRunner]]
actor = "system"
id = "local_server"
context = "ctx.target"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[serverRunner]]
actor = "system"
id = "hidden_server"
context = "ctx.hidden"
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
  return world;
}

function packageAuthoringRefWorld() {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[context]]
actor = "system"
id = "ctx.hidden"

[[package]]
actor = "system"
id = "package.plugin.source"
label = "Source"
packageKind = "plugin"

[[package]]
actor = "system"
id = "package.plugin.local"
label = "Local"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.source.v1"
package = "package.plugin.source"
version = "0.1.0"
status = "published"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.source.v2"
package = "package.plugin.source"
version = "0.2.0"
status = "review"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.local.v1"
package = "package.plugin.local"
version = "1.0.0"
status = "published"

[[packageNamespace]]
actor = "system"
context = "ctx.source"
name = "sourceNs"
package = "package.plugin.source"
revision = "packageRevision.plugin.source.v1"

[[packageNamespace]]
actor = "system"
context = "ctx.source"
name = "sourceNsV2"
package = "package.plugin.source"
revision = "packageRevision.plugin.source.v2"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourcePackage"
target = "package.plugin.source"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceRevision"
target = "packageRevision.plugin.source.v1"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceRevisionV2"
target = "packageRevision.plugin.source.v2"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceNamespace"
target = "packageNamespace:ctx.source:sourceNs"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceNamespaceV2"
target = "packageNamespace:ctx.source:sourceNsV2"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourcePackage"
target = "package.plugin.source"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceRevision"
target = "packageRevision.plugin.source.v1"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceRevisionV2"
target = "packageRevision.plugin.source.v2"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceNamespace"
target = "packageNamespace:ctx.source:sourceNs"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceNamespaceV2"
target = "packageNamespace:ctx.source:sourceNsV2"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourcePackage"
name = "importedPackage"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceRevision"
name = "importedRevision"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceRevisionV2"
name = "importedRevisionV2"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceNamespace"
name = "importedNamespace"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceNamespaceV2"
name = "importedNamespaceV2"

[[contextBinding]]
actor = "system"
context = "ctx.target"
name = "localPackage"
target = "package.plugin.local"

[[contextBinding]]
actor = "system"
context = "ctx.target"
name = "localRevision"
target = "packageRevision.plugin.local.v1"

[[contextBinding]]
actor = "system"
context = "ctx.hidden"
name = "hiddenRevision"
target = "packageRevision.plugin.source.v1"

`);
  return world;
}

test("authoring-core plugin owns generic authoring routes and handlers", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
  const bundle = bundles["bundle-authoring-core"];

  assert.equal(manifest.id, "plugin.authoring-core");
  assert.deepEqual(manifest.activatesBundles, ["bundle-authoring-core"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.deepEqual(bundle.handlerCatalog.dispatchHandlers, AUTHORING_CORE_HANDLER_IDS);
  assert.equal(bundle.routes.some(route => route.path === "/api/contexts" && route.handler === "context.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/surfaces" && route.handler === "surface.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/collections" && route.handler === "collection.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/processes" && route.handler === "process.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/types" && route.handler === "type.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/projections" && route.handler === "projection.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/messages" && route.handler === "message.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/boundaries" && route.handler === "boundary.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/policies" && route.handler === "policy.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/packages" && route.handler === "package.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/package-revisions" && route.handler === "packageRevision.create"), true);
  assert.equal(bundle.routes.some(route => String(route.pattern) === String(/^\/api\/package-revisions\/([^/]+)\/publish$/) && route.handler === "packageRevision.publish"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/package-patches" && route.handler === "packagePatch.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/package-namespaces" && route.handler === "packageNamespace.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/package-dependencies" && route.handler === "packageDependency.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/package-transformers" && route.handler === "packageTransformer.create"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/frontend-migrations/legacy" && route.handler === "frontend.migrateLegacy"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/frontend-uplifts/legacy" && route.handler === "frontend.upliftLegacy"), true);
  assert.equal(bundle.routes.some(route => route.path === "/api/widgets" && route.handler === "widgets.create"), true);
  assert.equal(bundle.routes.some(route => String(route.pattern) === String(/^\/api\/widgets\/([^/]+)\/replace$/) && route.handler === "widgets.replace"), true);
  assert.equal(bundle.routes.some(route => String(route.pattern) === String(/^\/api\/widgets\/([^/]+)\/replace\/rollback$/) && route.handler === "widgets.replace.rollback"), true);
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
    "surface.define",
    "collection.define",
    "process.define",
    "type.define",
    "projection.define",
    "message.define",
    "package.define",
    "packageRevision.define",
    "packageRevision.publish",
    "packagePatch.define",
    "packageNamespace.define",
    "packageDependency.define",
    "packageTransformer.define",
    "widget.define",
    "widget.update",
    "route.define",
    "serve.define"
  ]) {
    assert.equal(proposalTargetSource.includes(`case "${targetProcess}"`), true);
  }

  const unsupported = await executeAuthoringCoreProposalTarget({
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

test("stewardship target resolution explicitly classifies covered canonical-id sugar", () => {
  const world = stewardshipTargetResolutionWorld();

  const local = resolveStewardshipTargetInput(world, {
    context: "ctx.target",
    target: "local_server"
  });
  assert.equal(local.ok, true);
  assert.equal(local.target, "local_server");
  assert.equal(local.canonicalIdPolicyClass, "same-context-convenience");

  const imported = resolveStewardshipTargetInput(world, {
    context: "ctx.target",
    target: "source_server"
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.target, "source_server");
  assert.equal(imported.canonicalIdPolicyClass, "imported-target-reference");

  const legacy = resolveStewardshipTargetInput(world, {
    context: "ctx.target",
    target: "backendHost"
  });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.target, "backendHost");
  assert.equal(legacy.canonicalIdPolicyClass, "legacy-only-path");

  const hidden = resolveStewardshipTargetInput(world, {
    context: "ctx.target",
    target: "hidden_server"
  });
  assert.equal(hidden.ok, false);
  assert.match(hidden.error, /not visible in authoring context ctx\.target/);
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

test("authoring-core stewardship proposal targets lower target refs before target authority checks", async () => {
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
  const result = await executeAuthoringCoreProposalTarget({
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

test("authoring-core package process helpers resolve contextual refs and reject hidden or ambiguous names", () => {
  const world = packageAuthoringRefWorld();

  const localRevision = requestPackageRevisionDefine(world, {
    actor: "aaron",
    body: {
      context: "ctx.target",
      id: "packageRevision.plugin.local.v2",
      packageRef: "localPackage",
      version: "1.1.0",
      status: "draft"
    }
  });
  assert.equal(localRevision.ok, true);
  assert.equal(localRevision.packageRevision.package, "package.plugin.local");

  const importedPatch = requestPackagePatchDefine(world, {
    actor: "aaron",
    body: {
      context: "ctx.target",
      packageRef: "importedPackage",
      revisionRef: "importedRevision",
      path: "plugins/source/plugin.json",
      operation: "replace",
      sourceLanguage: "json",
      body: { id: "plugin.source" }
    }
  });
  assert.equal(importedPatch.ok, true);
  assert.equal(importedPatch.packagePatch.package, "package.plugin.source");
  assert.equal(importedPatch.packagePatch.revision, "packageRevision.plugin.source.v1");

  const importedDependency = requestPackageDependencyDefine(world, {
    actor: "aaron",
    body: {
      context: "ctx.target",
      sourcePackageRef: "importedPackage",
      sourceRevisionRef: "importedRevision",
      targetKind: "package",
      targetRef: "localPackage"
    }
  });
  assert.equal(importedDependency.ok, true);
  assert.equal(importedDependency.packageDependency.sourcePackage, "package.plugin.source");
  assert.equal(importedDependency.packageDependency.sourceRevision, "packageRevision.plugin.source.v1");
  assert.equal(importedDependency.packageDependency.targetId, "package.plugin.local");

  const importedTransformer = requestPackageTransformerDefine(world, {
    actor: "aaron",
    body: {
      context: "ctx.target",
      id: "packageTransformer.source.v1-to-v2",
      packageRef: "importedPackage",
      sourceRevisionRef: "importedRevision",
      targetNamespaceRef: "importedNamespaceV2"
    }
  });
  assert.equal(importedTransformer.ok, true);
  assert.equal(importedTransformer.packageTransformer.package, "package.plugin.source");
  assert.equal(importedTransformer.packageTransformer.sourceRevision, "packageRevision.plugin.source.v1");
  assert.equal(importedTransformer.packageTransformer.targetNamespace, "packageNamespace:ctx.source:sourceNsV2");

  const hidden = requestPackageDependencyDefine(world, {
    actor: "aaron",
    body: {
      context: "ctx.target",
      sourceRevisionRef: "hiddenRevision",
      targetKind: "package",
      targetRef: "localPackage"
    }
  });
  assert.equal(hidden.ok, false);
  assert.equal(hidden.status, 400);
  assert.match(hidden.error, /name not visible in context/i);

  importContextName(world, {
    actor: "system",
    context: "ctx.target",
    sourceContext: "ctx.source",
    exportName: "sourceRevision",
    name: "dupRevision"
  });
  bindContextName(world, {
    actor: "system",
    context: "ctx.target",
    name: "dupRevision",
    target: "packageRevision.plugin.local.v1"
  });
  const ambiguous = requestPackageDependencyDefine(world, {
    actor: "aaron",
    body: {
      context: "ctx.target",
      sourceRevisionRef: "dupRevision",
      targetKind: "package",
      targetRef: "localPackage"
    }
  });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.status, 400);
  assert.match(ambiguous.error, /ambiguously/i);
});

test("authoring-core package handlers lower contextual refs before target authority checks", async () => {
  const world = packageAuthoringRefWorld();
  const seenTargets = [];
  const sent = [];
  const bodies = [
    {
      context: "ctx.target",
      id: "packageRevision.plugin.source.v3",
      packageRef: "importedPackage",
      version: "0.3.0"
    },
    {
      context: "ctx.target",
      idRef: "importedRevision",
      emittedBundleHash: "bundle123"
    },
    {
      context: "ctx.target",
      packageRef: "importedPackage",
      revisionRef: "importedRevision",
      path: "plugins/source/runtime.js",
      operation: "replace",
      sourceLanguage: "js",
      body: { export: "next" }
    },
    {
      context: "ctx.target",
      sourcePackageRef: "importedPackage",
      sourceRevisionRef: "importedRevision",
      targetKind: "package",
      targetRef: "localPackage"
    },
    {
      context: "ctx.target",
      packageRef: "importedPackage",
      sourceRevisionRef: "importedRevision",
      targetRevisionRef: "importedRevisionV2"
    }
  ];
  const handlers = bundles["bundle-authoring-core"].createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async () => bodies.shift(),
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: (_actor, target) => {
        seenTargets.push(target);
        return { ok: false, status: 403, reason: "forbidden target" };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    },
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });

  await handlers["packageRevision.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["packageRevision.publish"]({ req: {}, res: {}, requestActor: "callan", params: {} });
  await handlers["packagePatch.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["packageDependency.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["packageTransformer.create"]({ req: {}, res: {}, requestActor: "callan" });

  assert.equal(sent.some(entry => entry.kind === "gate"), false);
  assert.deepEqual(seenTargets, [
    "package.plugin.source",
    "packageRevision.plugin.source.v1",
    "packageRevision.plugin.source.v1",
    "packageRevision.plugin.source.v1",
    "packageRevision.plugin.source.v2"
  ]);
  assert.deepEqual(sent.map(entry => entry.status), [202, 202, 202, 202, 202]);
  assert.deepEqual(
    sent.map(entry => ({
      targetProcess: entry.body.proposal.targetProcess,
      targetKind: entry.body.proposal.targetKind,
      targetId: entry.body.proposal.targetId
    })),
    [
      { targetProcess: "packageRevision.define", targetKind: "package", targetId: "package.plugin.source" },
      { targetProcess: "packageRevision.publish", targetKind: "packageRevision", targetId: "packageRevision.plugin.source.v1" },
      { targetProcess: "packagePatch.define", targetKind: "packageRevision", targetId: "packageRevision.plugin.source.v1" },
      { targetProcess: "packageDependency.define", targetKind: "packageRevision", targetId: "packageRevision.plugin.source.v1" },
      { targetProcess: "packageTransformer.define", targetKind: "packageRevision", targetId: "packageRevision.plugin.source.v2" }
    ]
  );
});

test("authoring-core package proposal targets lower contextual refs before authority checks", async () => {
  const world = packageAuthoringRefWorld();
  const seenTargets = [];
  const run = (proposal, body) => executeAuthoringCoreProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal,
    body,
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: (_actor, target) => {
      seenTargets.push(target);
      return { ok: true };
    }
  });

  assert.equal((await run(
    { targetProcess: "packageRevision.define" },
    { context: "ctx.target", id: "packageRevision.plugin.source.v3", packageRef: "importedPackage", version: "0.3.0", status: "draft" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "packageRevision.publish" },
    { context: "ctx.target", idRef: "importedRevisionV2", emittedBundleHash: "bundle123" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "packagePatch.define" },
    { context: "ctx.target", packageRef: "importedPackage", revisionRef: "importedRevision", path: "plugins/source/runtime.js", operation: "replace", sourceLanguage: "js", body: { export: "next" } }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "packageDependency.define" },
    { context: "ctx.target", sourcePackageRef: "importedPackage", sourceRevisionRef: "importedRevision", targetKind: "package", targetRef: "localPackage" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "packageTransformer.define" },
    { context: "ctx.target", id: "packageTransformer.source.v1-to-v2b", packageRef: "importedPackage", sourceRevisionRef: "importedRevision", targetRevisionRef: "importedRevisionV2" }
  ))?.ok, true);

  assert.deepEqual(seenTargets, [
    "package.plugin.source",
    "packageRevision.plugin.source.v2",
    "packageRevision.plugin.source.v1",
    "packageRevision.plugin.source.v1",
    "packageRevision.plugin.source.v2"
  ]);
});

test("authoring-core context and stewardship handlers create proposals instead of dead-end 403s", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.root"

[[context]]
actor = "system"
id = "ctx.shared"
`);

  const seenContextTargets = [];
  const seenTargetAuthorities = [];
  const sent = [];
  const bodies = [
    { id: "ctx.child", label: "Child", parent: "ctx.root" },
    { id: "pers.shared", context: "ctx.shared" },
    { context: "ctx.shared", name: "backendNode", target: "backendHost" },
    { context: "ctx.shared", name: "backendNode", target: "backendHost" },
    { context: "ctx.shared", name: "backendNode", target: "backendHost" },
    { context: "ctx.shared", name: "backendNode", target: "backendHost" },
    { context: "ctx.shared", sourceContext: "ctx.source", exportName: "backendNode", name: "sharedBackend" },
    { context: "ctx.shared", sourceContext: "ctx.source", exportName: "backendNode", name: "sharedBackend" },
    { steward: "callan", context: "ctx.shared", target: "ctx.shared", targetKind: "context" },
    { steward: "callan", context: "ctx.shared", target: "ctx.shared", targetKind: "context" }
  ];
  const handlers = bundles["bundle-authoring-core"].createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async () => bodies.shift(),
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: (_actor, target) => {
        seenContextTargets.push(target);
        return { ok: false, status: 403, reason: "forbidden context" };
      },
      ensureTargetAuthority: (_actor, target) => {
        seenTargetAuthorities.push(target);
        return { ok: false, status: 403, reason: "forbidden target" };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    },
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });

  await handlers["context.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["perspective.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["contextBinding.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["contextBinding.remove"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["contextExport.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["contextExport.remove"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["contextImport.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["contextImport.remove"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["stewardship.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["stewardship.remove"]({ req: {}, res: {}, requestActor: "callan" });

  assert.equal(sent.some(entry => entry.kind === "gate"), false);
  assert.deepEqual(seenTargetAuthorities, ["ctx.root", "ctx.shared", "ctx.shared"]);
  assert.deepEqual(seenContextTargets, [
    "ctx.shared",
    "ctx.shared",
    "ctx.shared",
    "ctx.shared",
    "ctx.shared",
    "ctx.shared",
    "ctx.shared"
  ]);
  assert.deepEqual(sent.map(entry => entry.status), [202, 202, 202, 202, 202, 202, 202, 202, 202, 202]);
  assert.deepEqual(
    sent.map(entry => ({
      targetProcess: entry.body.proposal.targetProcess,
      targetKind: entry.body.proposal.targetKind,
      targetId: entry.body.proposal.targetId
    })),
    [
      { targetProcess: "context.define", targetKind: "context", targetId: "ctx.root" },
      { targetProcess: "perspective.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "context.bind", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "context.unbind", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "context.export", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "context.unexport", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "context.import", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "context.unimport", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "stewardship.grant", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "stewardship.revoke", targetKind: "context", targetId: "ctx.shared" }
    ]
  );
});

test("authoring-core proposal targets execute context and stewardship writes through shared helpers", async () => {
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
id = "ctx.root"
`);

  const run = (proposal, body) => executeAuthoringCoreProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal,
    body,
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });

  assert.equal((await run(
    { targetProcess: "context.define", targetId: "ctx.root" },
    { id: "ctx.shared", label: "Shared", parent: "ctx.root" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "context.define", targetId: "ctx.shared" },
    { id: "ctx.child", label: "Child", parent: "ctx.shared" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "perspective.define", targetId: "ctx.shared" },
    { id: "pers.shared", context: "ctx.shared" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "context.bind", targetId: "ctx.shared" },
    { context: "ctx.shared", name: "backendNode", target: "backendHost" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "context.export", targetId: "ctx.shared" },
    { context: "ctx.shared", name: "backendNode", target: "backendHost" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "context.import", targetId: "ctx.child" },
    { context: "ctx.child", sourceContext: "ctx.shared", exportName: "backendNode", name: "sharedBackend" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "stewardship.grant", targetId: "ctx.shared" },
    { steward: "callan", context: "ctx.shared", target: "ctx.shared", targetKind: "context" }
  ))?.ok, true);

  assert.equal(world.project(moduleProjectors.contexts).some(row =>
    row.id === "ctx.shared" && row.parent === "ctx.root"
  ), true);
  assert.equal(world.project(moduleProjectors.contexts).some(row =>
    row.id === "ctx.child" && row.parent === "ctx.shared"
  ), true);
  assert.equal(world.project(moduleProjectors.perspectives).some(row =>
    row.id === "pers.shared" && row.context === "ctx.shared"
  ), true);
  assert.equal(world.project(moduleProjectors.contextBindings).some(row =>
    row.context === "ctx.shared" && row.name === "backendNode" && row.target === "backendHost"
  ), true);
  assert.equal(world.project(moduleProjectors.contextExports).some(row =>
    row.context === "ctx.shared" && row.name === "backendNode" && row.target === "backendHost"
  ), true);
  assert.equal(world.project(moduleProjectors.contextImports).some(row =>
    row.context === "ctx.child" && row.sourceContext === "ctx.shared" && row.exportName === "backendNode" && row.name === "sharedBackend"
  ), true);
  assert.equal(world.project(moduleProjectors.stewardships).some(row =>
    row.steward === "callan" && row.target === "ctx.shared"
  ), true);

  assert.equal((await run(
    { targetProcess: "context.unimport", targetId: "ctx.child" },
    { context: "ctx.child", sourceContext: "ctx.shared", exportName: "backendNode", name: "sharedBackend" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "context.unexport", targetId: "ctx.shared" },
    { context: "ctx.shared", name: "backendNode", target: "backendHost" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "context.unbind", targetId: "ctx.shared" },
    { context: "ctx.shared", name: "backendNode", target: "backendHost" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "stewardship.revoke", targetId: "ctx.shared" },
    { steward: "callan", context: "ctx.shared", target: "ctx.shared", targetKind: "context" }
  ))?.ok, true);

  assert.equal(world.project(moduleProjectors.contextImports).some(row =>
    row.context === "ctx.child" && row.sourceContext === "ctx.shared" && row.exportName === "backendNode" && row.name === "sharedBackend"
  ), false);
  assert.equal(world.project(moduleProjectors.contextExports).some(row =>
    row.context === "ctx.shared" && row.name === "backendNode" && row.target === "backendHost"
  ), false);
  assert.equal(world.project(moduleProjectors.contextBindings).some(row =>
    row.context === "ctx.shared" && row.name === "backendNode" && row.target === "backendHost"
  ), false);
  assert.equal(world.project(moduleProjectors.stewardships).some(row =>
    row.steward === "callan" && row.target === "ctx.shared"
  ), false);
});

test("authoring-core DESIRE noun handlers create proposals instead of dead-end 403s", async () => {
  const world = createWorld();
  const seenContexts = [];
  const sent = [];
  const bodies = [
    { id: "ReplayRoot", surfaceKind: "app-root", context: "ctx.shared" },
    { id: "ReplayCollection", context: "ctx.shared" },
    { id: "ReplayFlow", context: "ctx.shared", state: ["Mode"], handles: ["Clicked"], emits: ["ModeChanged"], rules: [] },
    { id: "ReplayState", context: "ctx.shared", role: "state", valueType: "text" },
    { id: "ReplayProjection", context: "ctx.shared", projectionKind: "detail", source: "ReplayFlow" },
    { id: "ReplayMessage", context: "ctx.shared", role: "event", writes: {} },
    { id: "ReplayBoundary", context: "ctx.shared", capabilities: [], operations: [] },
    { id: "ReplayPolicy", context: "ctx.shared", subject: "ReplayFlow", stateField: "ReplayState", policyOutcomes: {} }
  ];
  const handlers = bundles["bundle-authoring-core"].createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async () => bodies.shift(),
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: (_actor, target) => {
        seenContexts.push(target);
        return { ok: false, status: 403, reason: "forbidden context" };
      },
      ensureTargetAuthority: () => ({ ok: true })
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    },
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });

  await handlers["surface.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["collection.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["process.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["type.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["projection.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["message.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["boundary.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["policy.create"]({ req: {}, res: {}, requestActor: "callan" });

  assert.equal(sent.some(entry => entry.kind === "gate"), false);
  assert.deepEqual(seenContexts, ["ctx.shared", "ctx.shared", "ctx.shared", "ctx.shared", "ctx.shared", "ctx.shared", "ctx.shared", "ctx.shared"]);
  assert.deepEqual(sent.map(entry => entry.status), [202, 202, 202, 202, 202, 202, 202, 202]);
  assert.deepEqual(
    sent.map(entry => ({
      targetProcess: entry.body.proposal.targetProcess,
      targetKind: entry.body.proposal.targetKind,
      targetId: entry.body.proposal.targetId
    })),
    [
      { targetProcess: "surface.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "collection.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "process.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "type.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "projection.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "message.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "boundary.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "policy.define", targetKind: "context", targetId: "ctx.shared" }
    ]
  );
});

test("authoring-core proposal targets execute DESIRE noun writes through shared helpers", async () => {
  const world = createWorld();
  const run = (proposal, body) => executeAuthoringCoreProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal,
    body,
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });

  assert.equal((await run(
    { targetProcess: "surface.define", targetId: "ctx.shared" },
    { id: "ReplayRoot", surfaceKind: "app-root", context: "ctx.shared" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "collection.define", targetId: "ctx.shared" },
    { id: "ReplayCollection", context: "ctx.shared" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "process.define", targetId: "ctx.shared" },
    { id: "ReplayFlow", context: "ctx.shared", state: ["Mode"], handles: ["Clicked"], emits: ["ModeChanged"], rules: [] }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "type.define", targetId: "ctx.shared" },
    { id: "ReplayState", context: "ctx.shared", role: "state", valueType: "text", initial: "idle" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "projection.define", targetId: "ctx.shared" },
    { id: "ReplayProjection", context: "ctx.shared", projectionKind: "detail", source: "ReplayFlow" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "message.define", targetId: "ctx.shared" },
    { id: "ReplayMessage", context: "ctx.shared", role: "event", writes: {} }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "boundary.define", targetId: "ctx.shared" },
    { id: "ReplayBoundary", context: "ctx.shared", capabilities: [], operations: [] }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "policy.define", targetId: "ctx.shared" },
    { id: "ReplayPolicy", context: "ctx.shared", subject: "ReplayFlow", stateField: "ReplayState", policyOutcomes: {} }
  ))?.ok, true);

  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.defineSurface" && witness.body?.id === "ReplayRoot"
  ), true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.defineProcess" && witness.body?.id === "ReplayFlow"
  ), true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.defineType" && witness.body?.id === "ReplayState"
  ), true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.defineProjection" && witness.body?.id === "ReplayProjection"
  ), true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.defineMessage" && witness.body?.id === "ReplayMessage"
  ), true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.defineBoundary" && witness.body?.id === "ReplayBoundary"
  ), true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.definePolicy" && witness.body?.id === "ReplayPolicy"
  ), true);
});

test("authoring-core package noun handlers create proposals instead of dead-end 403s", async () => {
  const world = createWorld();
  const seenContexts = [];
  const seenTargets = [];
  const sent = [];
  const bodies = [
    { id: "package.plugin.inspect", context: "ctx.shared", label: "Inspect", packageKind: "plugin" },
    { id: "packageRevision.plugin.inspect.v1", package: "package.plugin.inspect", version: "0.1.0" },
    { emittedBundleHash: "bundle123" },
    { package: "package.plugin.inspect", revision: "packageRevision.plugin.inspect.v1", path: "plugins/inspect/plugin.json", operation: "replace", sourceLanguage: "json", body: { id: "plugin.inspect" } },
    { context: "ctx.shared", name: "inspectLocal", package: "package.plugin.inspect", revision: "packageRevision.plugin.inspect.v1" },
    { sourcePackage: "package.plugin.inspect", sourceRevision: "packageRevision.plugin.inspect.v1", targetKind: "capability", targetId: "dom.render" },
    { package: "package.plugin.inspect", sourceRevision: "packageRevision.plugin.inspect.v1", targetRevision: "packageRevision.plugin.inspect.v1" }
  ];
  const handlers = bundles["bundle-authoring-core"].createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async () => bodies.shift(),
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: (_actor, target) => {
        seenContexts.push(target);
        return { ok: false, status: 403, reason: "forbidden context" };
      },
      ensureTargetAuthority: (_actor, target) => {
        seenTargets.push(target);
        return { ok: false, status: 403, reason: "forbidden target" };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    },
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });

  await handlers["package.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["packageRevision.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["packageRevision.publish"]({ req: {}, res: {}, requestActor: "callan", params: { id: "packageRevision.plugin.inspect.v1" } });
  await handlers["packagePatch.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["packageNamespace.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["packageDependency.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["packageTransformer.create"]({ req: {}, res: {}, requestActor: "callan" });

  assert.equal(sent.some(entry => entry.kind === "gate"), false);
  assert.deepEqual(seenContexts, ["ctx.shared", "ctx.shared"]);
  assert.deepEqual(seenTargets, [
    "package.plugin.inspect",
    "packageRevision.plugin.inspect.v1",
    "packageRevision.plugin.inspect.v1",
    "packageRevision.plugin.inspect.v1",
    "packageRevision.plugin.inspect.v1"
  ]);
  assert.deepEqual(sent.map(entry => entry.status), [202, 202, 202, 202, 202, 202, 202]);
  assert.deepEqual(
    sent.map(entry => ({
      targetProcess: entry.body.proposal.targetProcess,
      targetKind: entry.body.proposal.targetKind,
      targetId: entry.body.proposal.targetId
    })),
    [
      { targetProcess: "package.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "packageRevision.define", targetKind: "package", targetId: "package.plugin.inspect" },
      { targetProcess: "packageRevision.publish", targetKind: "packageRevision", targetId: "packageRevision.plugin.inspect.v1" },
      { targetProcess: "packagePatch.define", targetKind: "packageRevision", targetId: "packageRevision.plugin.inspect.v1" },
      { targetProcess: "packageNamespace.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "packageDependency.define", targetKind: "packageRevision", targetId: "packageRevision.plugin.inspect.v1" },
      { targetProcess: "packageTransformer.define", targetKind: "packageRevision", targetId: "packageRevision.plugin.inspect.v1" }
    ]
  );
});

test("authoring-core proposal targets execute package noun writes through shared helpers", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.shared"
`);
  const run = (proposal, body) => executeAuthoringCoreProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal,
    body,
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });

  assert.equal((await run(
    { targetProcess: "package.define", targetId: "ctx.shared" },
    { id: "package.plugin.inspect", context: "ctx.shared", label: "Inspect", packageKind: "plugin", exports: [{ id: "surface.world" }] }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "packageRevision.define", targetId: "package.plugin.inspect" },
    { id: "packageRevision.plugin.inspect.v1", package: "package.plugin.inspect", version: "0.1.0", status: "draft" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "packageRevision.publish", targetId: "packageRevision.plugin.inspect.v1" },
    { id: "packageRevision.plugin.inspect.v1", emittedBundleHash: "bundle123", manifest: { pluginId: "plugin.inspect" } }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "packagePatch.define", targetId: "packageRevision.plugin.inspect.v1" },
    { package: "package.plugin.inspect", revision: "packageRevision.plugin.inspect.v1", path: "plugins/inspect/plugin.json", operation: "replace", sourceLanguage: "json", body: { id: "plugin.inspect" } }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "packageNamespace.define", targetId: "ctx.shared" },
    { context: "ctx.shared", name: "inspectLocal", package: "package.plugin.inspect", revision: "packageRevision.plugin.inspect.v1" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "packageDependency.define", targetId: "packageRevision.plugin.inspect.v1" },
    { sourcePackage: "package.plugin.inspect", sourceRevision: "packageRevision.plugin.inspect.v1", targetKind: "capability", targetId: "dom.render" }
  ))?.ok, true);
  assert.equal((await run(
    { targetProcess: "packageTransformer.define", targetId: "packageRevision.plugin.inspect.v1" },
    { id: "packageTransformer.inspect.v1", package: "package.plugin.inspect", sourceRevision: "packageRevision.plugin.inspect.v1", targetRevision: "packageRevision.plugin.inspect.v1", remainingGlue: ["rename remaining runtimePlugin installs"] }
  ))?.ok, true);

  assert.equal(world.project(moduleProjectors.packageIndex).byId["package.plugin.inspect"]?.id, "package.plugin.inspect");
  assert.equal(world.project(moduleProjectors.packageRevisionIndex).byId["packageRevision.plugin.inspect.v1"]?.package, "package.plugin.inspect");
  assert.equal(world.project(moduleProjectors.packageRevisionIndex).byId["packageRevision.plugin.inspect.v1"]?.status, "published");
  assert.equal(world.project(moduleProjectors.packageRevisionIndex).byId["packageRevision.plugin.inspect.v1"]?.emittedBundleHash, "bundle123");
  assert.equal(world.project(moduleProjectors.packagePatchIndex).byRevision["packageRevision.plugin.inspect.v1"]?.length, 1);
  assert.equal(world.project(moduleProjectors.packageNamespaceIndex).byContextName["ctx.shared\u0000inspectLocal"]?.package, "package.plugin.inspect");
  assert.equal(world.project(moduleProjectors.packageDependencyIndex).bySourceRevision["packageRevision.plugin.inspect.v1"]?.length, 1);
  assert.equal(world.project(moduleProjectors.packageTransformerIndex).byId["packageTransformer.inspect.v1"]?.package, "package.plugin.inspect");
});

test("authoring-core widget handlers create proposals instead of dead-end 403s for governed routes", async () => {
  const world = createWorld();
  const seenContextTargets = [];
  const seenWidgetTargets = [];
  const sent = [];
  const handlers = bundles["bundle-authoring-core"].createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async req => req.body ?? {},
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: (_actor, target) => {
        seenContextTargets.push(target);
        return { ok: false, status: 403, reason: "forbidden context" };
      },
      ensureTargetAuthority: (_actor, target) => {
        seenWidgetTargets.push(target);
        return { ok: false, status: 403, reason: "forbidden target" };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    },
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });

  await handlers["widgets.create"]({
    req: { body: { id: "shared_note", kind: "Text", text: "Hello", context: "ctx.shared" } },
    res: {},
    requestActor: "callan"
  });
  await handlers["widgets.create"]({
    req: { body: { id: "child_note", kind: "Text", text: "Hello", parent: "page_root" } },
    res: {},
    requestActor: "callan"
  });
  await handlers["widgets.update"]({
    req: { body: { text: "Updated", reason: "Shared title should change" } },
    res: {},
    requestActor: "callan",
    params: { id: "shared_note" }
  });
  await handlers["widgets.replace"]({
    req: { body: { kind: "Paragraph", text: "Replaced", reason: "Shared widget should evolve" } },
    res: {},
    requestActor: "callan",
    params: { id: "shared_note" }
  });
  await handlers["widgets.replace.rollback"]({
    req: { body: { reason: "Restore the previous shared widget" } },
    res: {},
    requestActor: "callan",
    params: { id: "shared_note" }
  });

  assert.equal(sent.some(entry => entry.kind === "gate"), false);
  assert.deepEqual(seenContextTargets, ["ctx.shared"]);
  assert.deepEqual(seenWidgetTargets, ["page_root", "shared_note", "shared_note", "shared_note"]);
  assert.deepEqual(sent.map(entry => entry.status), [202, 202, 202, 202, 202]);
  assert.deepEqual(
    sent.map(entry => ({
      targetProcess: entry.body.proposal.targetProcess,
      targetKind: entry.body.proposal.targetKind,
      targetId: entry.body.proposal.targetId,
      statusMessage: entry.body.statusMessage,
      reason: entry.body.proposal.reason,
      body: entry.body.proposal.body
    })),
    [
      { targetProcess: "widget.define", targetKind: "context", targetId: "ctx.shared", statusMessage: "Proposed widget for review.", reason: "Create a widget through witnessed proposal", body: { id: "shared_note", kind: "Text", text: "Hello", context: "ctx.shared" } },
      { targetProcess: "widget.define", targetKind: "widget", targetId: "page_root", statusMessage: "Proposed widget for review.", reason: "Create a child widget through witnessed proposal", body: { id: "child_note", kind: "Text", text: "Hello", parent: "page_root" } },
      { targetProcess: "widget.update", targetKind: "widget", targetId: "shared_note", statusMessage: "Proposed widget update for review.", reason: "Shared title should change", body: { id: "shared_note", text: "Updated" } },
      { targetProcess: "widget.replace", targetKind: "widget", targetId: "shared_note", statusMessage: "Proposed widget replacement for review.", reason: "Shared widget should evolve", body: { id: "shared_note", kind: "Paragraph", text: "Replaced" } },
      { targetProcess: "widget.replace.rollback", targetKind: "widget", targetId: "shared_note", statusMessage: "Proposed widget replacement rollback for review.", reason: "Restore the previous shared widget", body: { id: "shared_note" } }
    ]
  );
});

test("authoring-core route and serve handlers create proposals instead of dead-end 403s", async () => {
  const world = createWorld();
  const sent = [];
  const seenTargets = [];
  const handlers = bundles["bundle-authoring-core"].createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async req => req.body ?? {},
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: () => ({ ok: false, status: 403, reason: "forbidden context" }),
      ensureTargetAuthority: (_actor, target) => {
        seenTargets.push(target);
        return { ok: false, status: 403, reason: "forbidden target" };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    },
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });

  await handlers["route.create"]({
    req: { body: { id: "landing_route", context: "ctx.shared", path: "/landing", method: "GET", handler: "page.surface" } },
    res: {},
    requestActor: "callan"
  });
  await handlers["serve.create"]({
    req: { body: { context: "ctx.shared", serverRunner: "runner.shared", route: "landing_route" } },
    res: {},
    requestActor: "callan"
  });
  await handlers["serve.create"]({
    req: { body: { context: "ctx.shared", route: "landing_route" } },
    res: {},
    requestActor: "callan"
  });

  assert.equal(sent.some(entry => entry.kind === "gate"), false);
  assert.deepEqual(seenTargets, ["runner.shared"]);
  assert.deepEqual(sent.map(entry => entry.status), [202, 202, 202]);
  assert.deepEqual(
    sent.map(entry => ({
      targetProcess: entry.body.proposal.targetProcess,
      targetKind: entry.body.proposal.targetKind,
      targetId: entry.body.proposal.targetId
    })),
    [
      { targetProcess: "route.define", targetKind: "context", targetId: "ctx.shared" },
      { targetProcess: "serve.define", targetKind: "serverRunner", targetId: "runner.shared" },
      { targetProcess: "serve.define", targetKind: "context", targetId: "ctx.shared" }
    ]
  );
});

test("authoring-core frontend legacy migration handler creates proposals instead of dead-end 403s", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "home_route"
path = "/"
serves = "home_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "login_page", frontendProgram = "login_program" }

[[widget]]
actor = "system"
id = "login_page"
kind = "Page"
props = { title = "Login" }

[[widget]]
actor = "system"
id = "login_form"
kind = "Form"
props = { }

[[widget]]
actor = "system"
id = "email_input"
kind = "Input"
props = { name = "email" }

[[widget]]
actor = "system"
id = "submit_button"
kind = "Button"
props = { text = "Sign in", type = "submit" }

[[attachWidget]]
actor = "system"
parent = "login_page"
child = "login_form"
order = 0

[[attachWidget]]
actor = "system"
parent = "login_form"
child = "email_input"
order = 0

[[attachWidget]]
actor = "system"
parent = "login_form"
child = "submit_button"
order = 1

[[frontendProgram]]
actor = "system"
id = "login_program"
rootWidget = "login_page"

[[frontendStep]]
actor = "system"
program = "login_program"
event = "submit:login_form"
order = 0
op = "readForm"
params = { widget = "login_form", into = "credentials" }
`);

  const seenTargets = [];
  const sent = [];
  const handlers = bundles["bundle-authoring-core"].createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async req => req.body ?? {},
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: (_actor, target) => {
        seenTargets.push(target);
        return { ok: false, status: 403, reason: "forbidden target" };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    },
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });

  await handlers["frontend.migrateLegacy"]({
    req: { body: { requestedBy: "callan" } },
    res: {},
    requestActor: "callan"
  });

  assert.equal(sent.some(entry => entry.kind === "gate"), false);
  assert.deepEqual(seenTargets, ["home_route"]);
  assert.equal(sent[0]?.status, 202);
  assert.equal(sent[0]?.body.proposal.targetProcess, "frontend.migrateLegacy");
  assert.equal(sent[0]?.body.proposal.targetKind, "route");
  assert.equal(sent[0]?.body.proposal.targetId, "home_route");
  assert.equal(sent[0]?.body.preview.pending.some(row => row.routeId === "home_route"), true);
});

test("authoring-core frontend legacy migration handler rewrites routes through the shared helper", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "home_route"
path = "/"
serves = "home_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "page_root", frontendProgram = "landing_program" }
`);

  const sent = [];
  const handlers = bundles["bundle-authoring-core"].createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async req => req.body ?? {},
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: () => ({ ok: true })
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    },
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });

  await handlers["frontend.migrateLegacy"]({
    req: { body: {} },
    res: {},
    requestActor: "callan"
  });

  assert.equal(sent[0]?.status, 200);
  assert.equal(sent[0]?.body.previewAfter.pending.length, 0);
  assert.equal(world.project(moduleProjectors.routes).find(row => row.id === "home_route")?.handler, "page.surface");
});

test("authoring-core frontend legacy uplift handler creates proposals instead of dead-end 403s", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "home_route"
path = "/"
serves = "home_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "page_root" }
`);

  const seenTargets = [];
  const sent = [];
  const handlers = bundles["bundle-authoring-core"].createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async req => req.body ?? {},
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: (_actor, target) => {
        seenTargets.push(target);
        return { ok: false, status: 403, reason: "forbidden target" };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    },
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });

  await handlers["frontend.upliftLegacy"]({
    req: { body: { requestedBy: "callan" } },
    res: {},
    requestActor: "callan"
  });

  assert.equal(sent.some(entry => entry.kind === "gate"), false);
  assert.deepEqual(seenTargets, ["home_route"]);
  assert.equal(sent[0]?.status, 202);
  assert.equal(sent[0]?.body.proposal.targetProcess, "frontend.upliftLegacy");
  assert.equal(sent[0]?.body.proposal.targetKind, "route");
  assert.equal(sent[0]?.body.proposal.targetId, "home_route");
  assert.equal(sent[0]?.body.preview.compatibilityMode, "bridge-active");
  assert.equal(Array.isArray(sent[0]?.body.preview.pending), true);
});

test("authoring-core frontend legacy uplift handler rewrites supported routes onto native page.surface", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "home_route"
path = "/"
serves = "home_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "login_page", frontendProgram = "login_program" }

[[widget]]
actor = "system"
id = "login_page"
kind = "Page"
props = { title = "Login" }

[[widget]]
actor = "system"
id = "login_form"
kind = "Form"
props = { }

[[widget]]
actor = "system"
id = "email_input"
kind = "Input"
props = { name = "email" }

[[widget]]
actor = "system"
id = "submit_button"
kind = "Button"
props = { text = "Sign in", type = "submit" }

[[attachWidget]]
actor = "system"
parent = "login_page"
child = "login_form"
order = 0

[[attachWidget]]
actor = "system"
parent = "login_form"
child = "email_input"
order = 0

[[attachWidget]]
actor = "system"
parent = "login_form"
child = "submit_button"
order = 1

[[frontendProgram]]
actor = "system"
id = "login_program"
rootWidget = "login_page"

[[frontendStep]]
actor = "system"
program = "login_program"
event = "submit:login_form"
order = 0
op = "readForm"
params = { widget = "login_form", into = "credentials" }
`);

  const sent = [];
  const handlers = bundles["bundle-authoring-core"].createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async req => req.body ?? {},
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureIdentityAuthority: () => ({ ok: true }),
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: () => ({ ok: true })
    },
    sendGateFailure(_res, gate) {
      sent.push({ kind: "gate", gate });
    },
    sendJson(_res, status, body) {
      sent.push({ kind: "json", status, body });
    },
    syncSessionIdentity: () => null,
    sessionResponseShape: session => session,
    supportedHandlers: [],
    supportedHandlerMetadata: {}
  });

  await handlers["frontend.upliftLegacy"]({
    req: { body: {} },
    res: {},
    requestActor: "callan"
  });

  assert.equal(sent[0]?.status, 200);
  assert.equal(sent[0]?.body.previewAfter.blocked.length, 0);
  assert.equal(sent[0]?.body.previewAfter.pending.length, 0);
  assert.equal(world.project(moduleProjectors.routes).find(row => row.id === "home_route")?.handler, "page.surface");
  assert.equal(world.project(moduleProjectors.routes).find(row => row.id === "home_route")?.params?.rootSurface, "legacyUplift.home_route.surface.root");
});

test("authoring-core proposal targets execute route and serve writes through shared helpers", async () => {
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
id = "ctx.shared"

[[serverRunner]]
actor = "system"
id = "runner.shared"
context = "ctx.shared"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[surface]]
actor = "system"
id = "ReplayRoot"
surfaceKind = "app-root"
context = "ctx.shared"
`);

  const route = await executeAuthoringCoreProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "route.define", targetId: "ctx.shared" },
    body: {
      id: "landing_route",
      context: "ctx.shared",
      path: "/landing",
      serves: "ReplayRoot",
      method: "GET",
      handler: "page.surface",
      rootSurface: "ReplayRoot"
    },
    supportedHandlers: ["page.surface"],
    supportedHandlerMetadata: {
      "page.surface": {
        routeKind: "page",
        methods: ["GET"]
      }
    },
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });

  assert.equal(route?.ok, true);
  assert.equal(world.project(moduleProjectors.routes).some(row =>
    row.id === "landing_route"
    && row.context === "ctx.shared"
    && row.serves === "ReplayRoot"
    && row.params?.rootSurface === "ReplayRoot"
  ), true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "route.define"
    && witness.actor === "aaron"
    && witness.body?.route?.id === "landing_route"
  ), true);

  const serve = await executeAuthoringCoreProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "serve.define", targetId: "runner.shared" },
    body: {
      context: "ctx.shared",
      serverRunner: "runner.shared",
      route: "landing_route"
    },
    supportedHandlers: ["page.surface"],
    supportedHandlerMetadata: {
      "page.surface": {
        routeKind: "page",
        methods: ["GET"]
      }
    },
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });

  assert.equal(serve?.ok, true);
  assert.equal(world.project(moduleProjectors.servedRoutes).some(row =>
    row.id === "landing_route" && row.serverRunner === "runner.shared"
  ), true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "serve.define"
    && witness.actor === "aaron"
    && witness.body?.serverRunner === "runner.shared"
    && witness.body?.route === "landing_route"
  ), true);
});

test("authoring-core proposal targets execute frontend legacy migration through the shared helper", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "home_route"
path = "/"
serves = "home_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "page_root" }
`);

  const seenTargets = [];
  const result = await executeAuthoringCoreProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "frontend.migrateLegacy", targetId: "home_route" },
    body: {},
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: (_actor, target) => {
      seenTargets.push(target);
      return { ok: true };
    }
  });

  assert.deepEqual(seenTargets, ["home_route"]);
  assert.equal(result?.ok, true);
  assert.equal(result?.witnessIds.length, 1);
  assert.equal(world.project(moduleProjectors.routes).find(row => row.id === "home_route")?.handler, "page.surface");
});

test("authoring-core proposal targets execute frontend legacy uplift through the shared helper", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "home_route"
path = "/"
serves = "home_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "login_page", frontendProgram = "login_program" }

[[widget]]
actor = "system"
id = "login_page"
kind = "Page"
props = { title = "Login" }

[[widget]]
actor = "system"
id = "login_form"
kind = "Form"
props = { }

[[widget]]
actor = "system"
id = "email_input"
kind = "Input"
props = { name = "email" }

[[widget]]
actor = "system"
id = "submit_button"
kind = "Button"
props = { text = "Sign in", type = "submit" }

[[attachWidget]]
actor = "system"
parent = "login_page"
child = "login_form"
order = 0

[[attachWidget]]
actor = "system"
parent = "login_form"
child = "email_input"
order = 0

[[attachWidget]]
actor = "system"
parent = "login_form"
child = "submit_button"
order = 1

[[frontendProgram]]
actor = "system"
id = "login_program"
rootWidget = "login_page"

[[frontendStep]]
actor = "system"
program = "login_program"
event = "submit:login_form"
order = 0
op = "readForm"
params = { widget = "login_form", into = "credentials" }
`);

  const seenTargets = [];
  const result = await executeAuthoringCoreProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "frontend.upliftLegacy", targetId: "home_route" },
    body: {},
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: (_actor, target) => {
      seenTargets.push(target);
      return { ok: true };
    }
  });

  assert.deepEqual(seenTargets, ["home_route"]);
  assert.equal(result?.ok, true);
  assert.equal(result?.witnessIds.length, 1);
  assert.equal(world.project(moduleProjectors.routes).find(row => row.id === "home_route")?.handler, "page.surface");
  assert.equal(world.project(moduleProjectors.routes).find(row => row.id === "home_route")?.params?.rootSurface, "legacyUplift.home_route.surface.root");
});
