import assert from "node:assert/strict";
import test from "node:test";
import { parseWitnessToml } from "../src/dsl.js";
import {
  createCanonicalPackagePatch,
  materializeCanonicalPackageBundle,
  normalizeCanonicalPath,
  serializeCanonicalWtomlDocument
} from "../src/package-authorship.js";

test("canonical package bundle serialization is deterministic across input ordering", () => {
  const sharedPackage = {
    id: "package.plugin.inspect",
    kind: "plugin",
    version: "0.1.0",
    displayName: "Inspect",
    description: "Inspect package",
    exports: [{ id: "surface.world" }, { id: "surface.process" }],
    permissions: ["world.read", "process.read"]
  };
  const sharedRevision = {
    id: "packageRevision.plugin.inspect.v1",
    version: "0.1.0",
    status: "draft",
    emittedBundleHash: "pending"
  };
  const sharedNamespace = {
    id: "packageNamespace:ctx.shared:inspectLocal",
    context: "ctx.shared",
    name: "inspectLocal",
    package: "package.plugin.inspect",
    revision: "packageRevision.plugin.inspect.v1"
  };
  const sharedDependency = {
    id: "packageDependency:packageRevision.plugin.inspect.v1:capability:dom.render",
    sourcePackage: "package.plugin.inspect",
    sourceRevision: "packageRevision.plugin.inspect.v1",
    targetKind: "capability",
    targetId: "dom.render",
    versionRange: "*"
  };
  const patchA = {
    path: "plugins/inspect/plugin.json",
    operation: "replace",
    sourceLanguage: "json",
    nextHash: "hash-next-a",
    body: {
      id: "plugin.inspect",
      displayName: "Inspect",
      activatesBundles: ["bundle-inspect"]
    }
  };
  const patchB = {
    path: ".\\plugins\\inspect\\runtime.js",
    operation: "replace",
    sourceLanguage: "js",
    nextHash: "hash-next-b",
    body: {
      entry: "./runtime.js",
      exports: [{ id: "runtime.inspect" }]
    }
  };

  const bundleA = materializeCanonicalPackageBundle({
    packageRecord: sharedPackage,
    revisionRecord: sharedRevision,
    patches: [patchB, patchA],
    namespaces: [sharedNamespace],
    dependencies: [sharedDependency],
    materializedFiles: [
      { path: "plugins\\inspect\\runtime.js", content: "export default {};\n" },
      { path: "plugins/inspect/plugin.json", content: "{\n  \"id\": \"plugin.inspect\"\n}\n" }
    ]
  });
  const bundleB = materializeCanonicalPackageBundle({
    packageRecord: {
      description: "Inspect package",
      permissions: ["world.read", "process.read"],
      displayName: "Inspect",
      version: "0.1.0",
      exports: [{ id: "surface.world" }, { id: "surface.process" }],
      kind: "plugin",
      id: "package.plugin.inspect"
    },
    revisionRecord: {
      status: "draft",
      emittedBundleHash: "pending",
      id: "packageRevision.plugin.inspect.v1",
      version: "0.1.0"
    },
    patches: [patchA, patchB],
    namespaces: [{
      package: "package.plugin.inspect",
      revision: "packageRevision.plugin.inspect.v1",
      name: "inspectLocal",
      context: "ctx.shared",
      id: "packageNamespace:ctx.shared:inspectLocal"
    }],
    dependencies: [{
      targetId: "dom.render",
      sourceRevision: "packageRevision.plugin.inspect.v1",
      targetKind: "capability",
      sourcePackage: "package.plugin.inspect",
      versionRange: "*",
      id: "packageDependency:packageRevision.plugin.inspect.v1:capability:dom.render"
    }],
    materializedFiles: {
      "plugins/inspect/plugin.json": "{\n  \"id\": \"plugin.inspect\"\n}\n",
      "plugins\\inspect\\runtime.js": "export default {};\n"
    }
  });

  assert.equal(bundleA.bundleHash, bundleB.bundleHash);
  assert.deepEqual(bundleA.files, bundleB.files);
  assert.deepEqual(
    bundleA.files.map(file => file.path),
    [
      "package.wtoml",
      "revision.wtoml",
      "patches/0001-plugins-inspect-plugin-json.wtoml",
      "patches/0002-plugins-inspect-runtime-js.wtoml",
      "namespaces/0001-ctx-shared-inspectlocal.wtoml",
      "dependencies/0001-capability-dom-render.wtoml",
      "materialized/plugins/inspect/plugin.json",
      "materialized/plugins/inspect/runtime.js"
    ]
  );
});

test("canonical package patches get content-addressed ids and normalized paths", () => {
  const left = createCanonicalPackagePatch({
    path: ".\\plugins\\inspect\\plugin.json",
    operation: "replace",
    sourceLanguage: "json",
    nextHash: "abc123",
    body: { id: "plugin.inspect", activatesBundles: ["bundle-inspect"] }
  }, {
    packageId: "package.plugin.inspect",
    revisionId: "packageRevision.plugin.inspect.v1"
  });
  const right = createCanonicalPackagePatch({
    path: "plugins/inspect/plugin.json",
    operation: "replace",
    sourceLanguage: "json",
    nextHash: "abc123",
    body: { activatesBundles: ["bundle-inspect"], id: "plugin.inspect" }
  }, {
    packageId: "package.plugin.inspect",
    revisionId: "packageRevision.plugin.inspect.v1"
  });

  assert.equal(left.id, right.id);
  assert.equal(left.path, "plugins/inspect/plugin.json");
  assert.equal(right.path, "plugins/inspect/plugin.json");
  assert.match(left.id, /^packagePatch:[0-9a-f]{64}$/);
});

test("canonical WTOML package documents keep identity fields first and remain parseable", () => {
  const source = serializeCanonicalWtomlDocument("packageRevision", {
    status: "draft",
    version: "0.1.0",
    package: "package.plugin.inspect",
    kind: "plugin",
    id: "packageRevision.plugin.inspect.v1",
    notes: {
      review: "pending",
      owner: "aaron"
    }
  });

  const lines = source.split("\n");
  assert.equal(lines[0], "[[packageRevision]]");
  assert.equal(lines[1], 'id = "packageRevision.plugin.inspect.v1"');
  assert.equal(lines[2], 'package = "package.plugin.inspect"');
  assert.equal(lines[3], 'kind = "plugin"');
  assert.equal(lines[4], 'version = "0.1.0"');
  assert.equal(lines[5], 'notes = { owner = "aaron", review = "pending" }');
  assert.equal(lines[6], 'status = "draft"');

  const docs = parseWitnessToml(source);
  assert.deepEqual(docs, [{
    kind: "packageRevision",
    line: 1,
    sectionStyle: "array",
    values: {
      id: "packageRevision.plugin.inspect.v1",
      package: "package.plugin.inspect",
      kind: "plugin",
      version: "0.1.0",
      notes: {
        owner: "aaron",
        review: "pending"
      },
      status: "draft"
    }
  }]);
});

test("canonical path normalization rejects empty paths", () => {
  assert.equal(normalizeCanonicalPath(".\\plugins\\inspect\\plugin.json"), "plugins/inspect/plugin.json");
  assert.throws(() => normalizeCanonicalPath(""), /path is required/);
});
