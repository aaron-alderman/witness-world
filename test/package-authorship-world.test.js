import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessDocs, applyWitnessToml, parseWitnessToml } from "../src/dsl.js";
import {
  defineComputeModule,
  defineComputeModuleSmokeTest,
  definePackageMaterializedFile,
  markPackageMaterializedFileDeleted,
  moduleProjectors,
  publishPackageRevision
} from "../src/modules.js";
import { materializeCanonicalPackageBundle } from "../src/package-authorship.js";
import {
  materializeCanonicalPackageBundleFromProject,
  packageApplyPreviewRowsFromProject,
  packageConvergenceFromProject,
  previewPackageRevisionApplyFromProject
} from "../src/package-authorship-world.js";

test("WTOML package authorship declarations produce first-class package nouns in world state", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[[context]]
actor = "system"
id = "ctx.packages"

[[package]]
actor = "system"
id = "package.plugin.inspect"
context = "ctx.packages"
label = "Inspect"
packageKind = "plugin"
version = "0.1.0"
description = "Inspect package"
defaultNamespace = "inspect"
exports = [{ id = "surface.world" }, { id = "surface.process" }]
compatibleRuntimeProfiles = ["full", "minimal"]

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "draft"

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"
path = ".\\\\plugins\\\\inspect\\\\plugin.json"
operation = "replace"
sourceLanguage = "json"
nextHash = "abc123"
body = { id = "plugin.inspect", displayName = "Inspect" }

[[packageNamespace]]
actor = "system"
context = "ctx.packages"
name = "inspectLocal"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageDependency]]
actor = "system"
sourcePackage = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
targetKind = "capability"
targetId = "dom.render"
versionRange = "*"
runtimeProfiles = ["full"]
`).map(doc => ({ ...doc, file: "C:/demo/package-authorship.wtoml" }));
  applyWitnessDocs(world, docs);

  const packageRow = world.project(moduleProjectors.packageIndex).byId["package.plugin.inspect"];
  assert.ok(packageRow);
  assert.equal(packageRow.context, "ctx.packages");
  assert.equal(packageRow.packageKind, "plugin");
  assert.equal(packageRow.defaultNamespace, "inspect");
  assert.deepEqual(packageRow.compatibleRuntimeProfiles, ["full", "minimal"]);
  assert.deepEqual(packageRow.exports.map(row => row.id), ["surface.process", "surface.world"]);
  assert.equal(world.project(moduleProjectors.objectContexts).get("package.plugin.inspect"), "ctx.packages");

  const revisionRow = world.project(moduleProjectors.packageRevisionIndex).byId["packageRevision.plugin.inspect.v1"];
  assert.ok(revisionRow);
  assert.equal(revisionRow.package, "package.plugin.inspect");
  assert.equal(revisionRow.status, "draft");

  const patchRows = world.project(moduleProjectors.packagePatches);
  assert.equal(patchRows.length, 1);
  assert.equal(patchRows[0].package, "package.plugin.inspect");
  assert.equal(patchRows[0].revision, "packageRevision.plugin.inspect.v1");
  assert.equal(patchRows[0].path, "plugins/inspect/plugin.json");
  assert.match(patchRows[0].id, /^packagePatch:[0-9a-f]{64}$/);

  const namespaceRow = world.project(moduleProjectors.packageNamespaceIndex).byContextName["ctx.packages\u0000inspectLocal"];
  assert.ok(namespaceRow);
  assert.equal(namespaceRow.id, "packageNamespace:ctx.packages:inspectLocal");
  assert.equal(namespaceRow.package, "package.plugin.inspect");
  assert.equal(namespaceRow.revision, "packageRevision.plugin.inspect.v1");
  assert.equal(world.project(moduleProjectors.modules).get(namespaceRow.id), "packageNamespace");
  assert.equal(world.project(moduleProjectors.objectContexts).get(namespaceRow.id), "ctx.packages");

  const dependencyRows = world.project(moduleProjectors.packageDependencies);
  assert.deepEqual(dependencyRows, [{
    id: "packageDependency:packageRevision.plugin.inspect.v1:capability:dom.render",
    sourcePackage: "package.plugin.inspect",
    sourceRevision: "packageRevision.plugin.inspect.v1",
    targetKind: "capability",
    targetId: "dom.render",
    versionRange: "*",
    compatibility: null,
    runtimeProfiles: ["full"]
  }]);

  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "dsl.source.annotate"
    && witness.body?.target === "package.plugin.inspect"
    && witness.body?.section === "package"
  ), true);
});

test("projected package nouns feed the canonical WTOML bundle serializer", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
context = "ctx.packages"
label = "Inspect"
packageKind = "plugin"
version = "0.1.0"
description = "Inspect package"
defaultNamespace = "inspect"
exports = [{ id = "surface.world" }]

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "draft"
manifest = { pluginId = "plugin.inspect" }

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"
path = "plugins/inspect/plugin.json"
operation = "replace"
sourceLanguage = "json"
nextHash = "abc123"
body = { id = "plugin.inspect", activatesBundles = ["bundle-inspect"] }

[[packageNamespace]]
actor = "system"
context = "ctx.packages"
name = "inspectLocal"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageDependency]]
actor = "system"
sourcePackage = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
targetKind = "capability"
targetId = "dom.render"
`);

  const packageRow = world.project(moduleProjectors.packageIndex).byId["package.plugin.inspect"];
  const revisionRow = world.project(moduleProjectors.packageRevisionIndex).byId["packageRevision.plugin.inspect.v1"];
  const patchRows = world.project(moduleProjectors.packagePatchIndex).byRevision["packageRevision.plugin.inspect.v1"];
  const namespaceRows = world.project(moduleProjectors.packageNamespaces);
  const dependencyRows = world.project(moduleProjectors.packageDependencyIndex).bySourceRevision["packageRevision.plugin.inspect.v1"];
  const bundle = materializeCanonicalPackageBundle({
    packageRecord: packageRow,
    revisionRecord: revisionRow,
    patches: patchRows,
    namespaces: namespaceRows,
    dependencies: dependencyRows
  });

  assert.deepEqual(bundle.files.map(file => file.path), [
    "package.wtoml",
    "revision.wtoml",
    "patches/0001-plugins-inspect-plugin-json.wtoml",
    "namespaces/0001-ctx-packages-inspectlocal.wtoml",
    "dependencies/0001-capability-dom-render.wtoml"
  ]);
  assert.match(bundle.bundleHash, /^[0-9a-f]{64}$/);

  const packageDocs = parseWitnessToml(bundle.files[0].content);
  assert.equal(packageDocs[0].kind, "package");
  assert.equal(packageDocs[0].values.id, "package.plugin.inspect");
  assert.equal(packageDocs[0].values.context, "ctx.packages");
  const revisionDocs = parseWitnessToml(bundle.files[1].content);
  assert.equal(revisionDocs[0].kind, "packageRevision");
  assert.equal(revisionDocs[0].values.package, "package.plugin.inspect");
  const patchDocs = parseWitnessToml(bundle.files[2].content);
  assert.equal(patchDocs[0].kind, "packagePatch");
  assert.equal(patchDocs[0].values.revision, "packageRevision.plugin.inspect.v1");
  const namespaceDocs = parseWitnessToml(bundle.files[3].content);
  assert.equal(namespaceDocs[0].kind, "packageNamespace");
  assert.equal(namespaceDocs[0].values.name, "inspectLocal");
  const dependencyDocs = parseWitnessToml(bundle.files[4].content);
  assert.equal(dependencyDocs[0].kind, "packageDependency");
  assert.equal(dependencyDocs[0].values.sourceRevision, "packageRevision.plugin.inspect.v1");
});

test("package bundle projection helper materializes revision-scoped canonical bundle from world state", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.packages"

[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"
path = "plugins/inspect/plugin.json"
operation = "replace"
sourceLanguage = "json"
body = { id = "plugin.inspect" }

[[packageNamespace]]
actor = "system"
context = "ctx.packages"
name = "inspectLocal"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageDependency]]
actor = "system"
sourcePackage = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
targetKind = "capability"
targetId = "dom.render"
`);

  const bundle = materializeCanonicalPackageBundleFromProject(projector => world.project(projector), {
    revisionId: "packageRevision.plugin.inspect.v1"
  });

  assert.equal(bundle.revisionRecord.id, "packageRevision.plugin.inspect.v1");
  assert.equal(bundle.packageRecord.id, "package.plugin.inspect");
  assert.equal(bundle.namespaces.length, 1);
  assert.equal(bundle.dependencies.length, 1);
  assert.deepEqual(bundle.files.map(file => file.path), [
    "package.wtoml",
    "revision.wtoml",
    "patches/0001-plugins-inspect-plugin-json.wtoml",
    "namespaces/0001-ctx-packages-inspectlocal.wtoml",
    "dependencies/0001-capability-dom-render.wtoml"
  ]);
});

test("package bundle projection includes active materialized compute files and excludes deleted rows", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.compute"

[[package]]
actor = "system"
id = "package.compute.health"
context = "ctx.compute"
label = "Health Compute"
packageKind = "compute"

[[packageRevision]]
actor = "system"
id = "packageRevision.compute.health.v1"
package = "package.compute.health"
version = "0.1.0"
`);
  defineComputeModule(world, {
    actor: "system",
    id: "engentus.health.classify",
    context: "ctx.compute",
    source: "app/modules/health-classify/assembly/index.ts",
    hostOperation: "engentus.pipeline.health.classify"
  });
  definePackageMaterializedFile(world, {
    actor: "system",
    package: "package.compute.health",
    revision: "packageRevision.compute.health.v1",
    path: "app/modules/health-classify/assembly/index.ts",
    content: "export function invoke(): void {}",
    sourceLanguage: "assemblyscript"
  });
  const smoke = defineComputeModuleSmokeTest(world, {
    actor: "system",
    id: "smoke.health.low-risk",
    module: "engentus.health.classify",
    package: "package.compute.health",
    revision: "packageRevision.compute.health.v1",
    hostOperation: "engentus.pipeline.health.classify",
    request: { score: 1 },
    expected: { ok: true }
  });
  definePackageMaterializedFile(world, {
    actor: "system",
    package: "package.compute.health",
    revision: "packageRevision.compute.health.v1",
    path: "app/modules/engentus-health-classify/smoke/smoke-health-low-risk.json",
    content: JSON.stringify({
      schema: "world.computeModuleSmokeTest.v1",
      id: smoke.body.id,
      module: smoke.body.module,
      hostOperation: smoke.body.hostOperation,
      request: smoke.body.request,
      expected: smoke.body.expected
    }, null, 2),
    sourceLanguage: "json"
  });

  let bundle = materializeCanonicalPackageBundleFromProject(projector => world.project(projector), {
    revisionId: "packageRevision.compute.health.v1"
  });
  assert.equal(bundle.files.some(file => file.path === "materialized/app/modules/health-classify/assembly/index.ts"), true);
  assert.equal(bundle.files.some(file => file.path === "materialized/app/modules/engentus-health-classify/smoke/smoke-health-low-risk.json"), true);

  markPackageMaterializedFileDeleted(world, {
    actor: "system",
    package: "package.compute.health",
    revision: "packageRevision.compute.health.v1",
    path: "app/modules/health-classify/assembly/index.ts",
    content: "export function invoke(): void {}",
    sourceLanguage: "assemblyscript"
  });
  bundle = materializeCanonicalPackageBundleFromProject(projector => world.project(projector), {
    revisionId: "packageRevision.compute.health.v1"
  });
  assert.equal(bundle.files.some(file => file.path === "materialized/app/modules/health-classify/assembly/index.ts"), false);
  assert.equal(world.project(moduleProjectors.packageMaterializedFileHistory).some(row => row.deletedAt), true);

  definePackageMaterializedFile(world, {
    actor: "system",
    package: "package.compute.health",
    revision: "packageRevision.compute.health.v1",
    path: "app/modules/health-classify/assembly/index.ts",
    content: "export function invoke(): void { return; }",
    sourceLanguage: "assemblyscript"
  });
  bundle = materializeCanonicalPackageBundleFromProject(projector => world.project(projector), {
    revisionId: "packageRevision.compute.health.v1"
  });
  const sourceFiles = bundle.files.filter(file => file.path === "materialized/app/modules/health-classify/assembly/index.ts");
  assert.equal(sourceFiles.length, 1);
  assert.match(sourceFiles[0].content, /return/);
  assert.equal(world.project(moduleProjectors.packageMaterializedFileHistory).filter(row => row.path === "app/modules/health-classify/assembly/index.ts").length, 3);
});

test("package bundle projection helper includes namespace-scoped transformers that touch the selected revision namespace", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.alpha:inspectA"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.namespace-only"
package = "package.plugin.inspect"
sourceNamespace = "packageNamespace:ctx.alpha:inspectA"
targetNamespace = "packageNamespace:ctx.alpha:inspectA"
strategy = "namespace-alias"
status = "active"
mappings = [{ kind = "alias", from = "ctx.alpha:inspectA", to = "ctx.alpha:inspectA" }]

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"
transformer = "packageTransformer.inspect.namespace-only"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "namespaced" }
`);

  const bundle = materializeCanonicalPackageBundleFromProject(projector => world.project(projector), {
    revisionId: "packageRevision.plugin.inspect.v1"
  });

  assert.equal(bundle.transformers.length, 1);
  assert.equal(bundle.transformers[0].id, "packageTransformer.inspect.namespace-only");
  assert.equal(bundle.files.some(file => file.path === "transformers/0001-packagetransformer-inspect-namespace-only.wtoml"), true);
});

test("package revision apply preview helper exposes coexistence and convergence impact for the selected revision", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "published"
manifest = { pluginId = "plugin.inspect" }

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"
status = "review"
manifest = { pluginId = "plugin.inspect" }

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.alpha:inspectA"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.beta:inspectB"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.v1-to-v2"
package = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
sourceNamespace = "packageNamespace:ctx.alpha:inspectA"
targetRevision = "packageRevision.plugin.inspect.v2"
targetNamespace = "packageNamespace:ctx.beta:inspectB"
strategy = "follow-up-revision"
status = "active"
remainingGlue = ["rename remaining runtimePlugin installs"]

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
transformer = "packageTransformer.inspect.v1-to-v2"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "migrated" }
`);

  const preview = previewPackageRevisionApplyFromProject(projector => world.project(projector), {
    revisionId: "packageRevision.plugin.inspect.v2"
  });

  assert.equal(preview.kind, "packageRevisionApplyPreview");
  assert.equal(preview.status, "glue-required");
  assert.equal(preview.bundle.revisionRecord.id, "packageRevision.plugin.inspect.v2");
  assert.equal(preview.selectedRevision?.id, "packageRevision.plugin.inspect.v2");
  assert.deepEqual(
    preview.selectedNamespaces.map(row => row.id),
    ["packageNamespace:ctx.beta:inspectB"]
  );
  assert.deepEqual(
    preview.manifestPluginConflicts.map(row => row.id),
    ["packageManifestConflict:package.plugin.inspect:plugin.inspect"]
  );
  assert.deepEqual(
    preview.relatedTransformers.map(row => row.id),
    ["packageTransformer.inspect.v1-to-v2"]
  );
  assert.deepEqual(preview.remainingGlue, [{
    kind: "explicit-glue",
    transformerId: "packageTransformer.inspect.v1-to-v2",
    message: "rename remaining runtimePlugin installs"
  }]);
});

test("package revision apply preview helper marks unresolved manifest collisions as blocked", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "published"
manifest = { pluginId = "plugin.inspect" }

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"
status = "review"
manifest = { pluginId = "plugin.inspect" }

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "blocked" }
`);

  const preview = previewPackageRevisionApplyFromProject(projector => world.project(projector), {
    revisionId: "packageRevision.plugin.inspect.v2"
  });

  assert.equal(preview.status, "blocked");
  assert.equal(preview.manifestPluginConflicts.length, 1);
  assert.equal(preview.manifestPluginConflicts[0].blocked, true);
  assert.match(preview.explanation, /manifest identity/i);
});

test("package revision apply preview helper keeps missing transformer work unplanned", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "published"
manifest = { pluginId = "plugin.inspect" }

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"
status = "review"
manifest = { pluginId = "plugin.inspect" }

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.alpha:inspectA"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.beta:inspectB"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
`);

  const preview = previewPackageRevisionApplyFromProject(projector => world.project(projector), {
    revisionId: "packageRevision.plugin.inspect.v2"
  });

  assert.equal(preview.status, "unplanned");
  assert.match(preview.explanation, /no authored transformer contract explains convergence yet/i);
});

test("package apply preview rows helper builds enriched preview rows and filters by revision-linked ids", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "published"
manifest = { pluginId = "plugin.inspect" }

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"
status = "review"
manifest = { pluginId = "plugin.inspect" }

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.alpha:inspectA"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.beta:inspectB"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.v1-to-v2"
package = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
sourceNamespace = "packageNamespace:ctx.alpha:inspectA"
targetRevision = "packageRevision.plugin.inspect.v2"
targetNamespace = "packageNamespace:ctx.beta:inspectB"
strategy = "follow-up-revision"
status = "active"
remainingGlue = ["rename remaining runtimePlugin installs"]

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
transformer = "packageTransformer.inspect.v1-to-v2"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "migrated" }
`);

  const rows = packageApplyPreviewRowsFromProject(projector => world.project(projector));
  assert.equal(rows.length, 2);
  const filtered = packageApplyPreviewRowsFromProject(projector => world.project(projector), {
    id: "packageTransformer.inspect.v1-to-v2"
  });
  assert.equal(filtered.length, 2);
  const targetPreview = filtered.find(row => row.revisionId === "packageRevision.plugin.inspect.v2");
  assert.ok(targetPreview);
  assert.equal(targetPreview.id, "packageApplyPreview:packageRevision.plugin.inspect.v2");
  assert.equal(targetPreview.status, "glue-required");
  assert.equal(targetPreview.bundleHash, targetPreview.bundle.bundleHash);
  assert.deepEqual(targetPreview.relatedTransformerIds, ["packageTransformer.inspect.v1-to-v2"]);
  assert.deepEqual(targetPreview.selectedNamespaceIds, ["packageNamespace:ctx.beta:inspectB"]);
});

test("package revision projection derives published state from publish witnesses", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "draft"
`);

  publishPackageRevision(world, {
    actor: "system",
    id: "packageRevision.plugin.inspect.v1",
    package: "package.plugin.inspect",
    version: "0.1.0",
    status: "published",
    emittedBundleHash: "bundle123",
    manifest: { pluginId: "plugin.inspect" }
  });

  const revisionRow = world.project(moduleProjectors.packageRevisionIndex).byId["packageRevision.plugin.inspect.v1"];
  assert.equal(revisionRow.status, "published");
  assert.equal(revisionRow.emittedBundleHash, "bundle123");
  assert.deepEqual(revisionRow.manifest, { pluginId: "plugin.inspect" });
});

test("package coexistence projection records divergent authored revisions and explicit namespace splits", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "published"
manifest = { pluginId = "plugin.inspect" }

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"
status = "review"
manifest = { pluginId = "plugin.inspect" }

[[packageNamespace]]
actor = "system"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
`);

  const coexistence = world.project(moduleProjectors.packageCoexistenceIndex).byPackage["package.plugin.inspect"];
  assert.ok(coexistence);
  assert.equal(coexistence.coexistenceMode, "coexisting");
  assert.deepEqual(coexistence.revisionIds, [
    "packageRevision.plugin.inspect.v1",
    "packageRevision.plugin.inspect.v2"
  ]);
  assert.deepEqual(coexistence.selectedRevisionIds, [
    "packageRevision.plugin.inspect.v1",
    "packageRevision.plugin.inspect.v2"
  ]);
  assert.equal(coexistence.revisions.find(row => row.id === "packageRevision.plugin.inspect.v1")?.selectedBy[0]?.context, "ctx.alpha");
  assert.equal(coexistence.revisions.find(row => row.id === "packageRevision.plugin.inspect.v2")?.selectedBy[0]?.context, "ctx.beta");
  assert.deepEqual(coexistence.manifestPluginConflicts, [{
    id: "packageManifestConflict:package.plugin.inspect:plugin.inspect",
    packageId: "package.plugin.inspect",
    manifestPluginId: "plugin.inspect",
    revisionIds: [
      "packageRevision.plugin.inspect.v1",
      "packageRevision.plugin.inspect.v2"
    ],
    namespaceIds: [
      "packageNamespace:ctx.alpha:inspectA",
      "packageNamespace:ctx.beta:inspectB"
    ],
    explicitSupersede: false,
    truthfulNamespaceSplit: true,
    blocked: false
  }]);
});

test("package convergence projection records authored transformer glue and convergence patches", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "published"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"
status = "review"

[[packageNamespace]]
actor = "system"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.v1-to-v2"
package = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
sourceNamespace = "packageNamespace:ctx.alpha:inspectA"
targetRevision = "packageRevision.plugin.inspect.v2"
targetNamespace = "packageNamespace:ctx.beta:inspectB"
strategy = "follow-up-revision"
status = "active"
mappings = [{ kind = "alias", from = "ctx.alpha:inspectA", to = "ctx.beta:inspectB" }]
remainingGlue = ["rename remaining runtimePlugin installs"]

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
transformer = "packageTransformer.inspect.v1-to-v2"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "migrated" }
`);

  const convergence = packageConvergenceFromProject(projector => world.project(projector), {
    id: "package.plugin.inspect"
  });

  assert.equal(convergence.length, 1);
  assert.equal(convergence[0].status, "glue-required");
  assert.deepEqual(convergence[0].transformerIds, ["packageTransformer.inspect.v1-to-v2"]);
  assert.deepEqual(convergence[0].convergencePatchIds, [convergence[0].convergencePatches[0].id]);
  assert.deepEqual(convergence[0].remainingGlue, [{
    kind: "explicit-glue",
    transformerId: "packageTransformer.inspect.v1-to-v2",
    message: "rename remaining runtimePlugin installs"
  }]);

  const bundle = materializeCanonicalPackageBundleFromProject(projector => world.project(projector), {
    revisionId: "packageRevision.plugin.inspect.v2"
  });
  assert.equal(bundle.transformers.length, 1);
  assert.equal(bundle.transformers[0].id, "packageTransformer.inspect.v1-to-v2");
  assert.deepEqual(
    bundle.namespaces.map(row => row.id),
    [
      "packageNamespace:ctx.alpha:inspectA",
      "packageNamespace:ctx.beta:inspectB"
    ]
  );
  assert.equal(bundle.files.some(file => file.path === "transformers/0001-packagetransformer-inspect-v1-to-v2.wtoml"), true);
  assert.equal(bundle.files.some(file => file.path === "namespaces/0001-ctx-alpha-inspecta.wtoml"), true);
  assert.equal(bundle.files.some(file => file.path === "namespaces/0002-ctx-beta-inspectb.wtoml"), true);
});
