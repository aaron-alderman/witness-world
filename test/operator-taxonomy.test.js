import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  OPERATOR_BROWSER_PROTOTYPE_FORM_MAPPINGS,
  OPERATOR_CANONICAL_DOMAINS,
  OPERATOR_CANONICAL_ROOTS,
  OPERATOR_LEGACY_BROWSE_GROUP_MAPPINGS,
  OPERATOR_SESSION_SIDECAR_FIELDS,
  OPERATOR_WORKBENCH_FORM_MAPPINGS
} from "../plugins/operator-workbench/canonical-model.js";
import { operatorWorkbenchRvmForms } from "../plugins/operator-workbench/desire-rvm.js";
import { buildOperatorTaxonomySnapshot } from "../scripts/operator-taxonomy.mjs";

function unique(values = []) {
  return [...new Set(values)];
}

test("canonical operator model roots and domains are internally consistent", () => {
  const rootIds = OPERATOR_CANONICAL_ROOTS.map(row => row.id);
  const domainRootIds = OPERATOR_CANONICAL_DOMAINS.map(row => row.rootId);
  const sidecarIds = OPERATOR_SESSION_SIDECAR_FIELDS.map(row => row.id);

  assert.deepEqual(rootIds, ["workbench", "things", "types", "relationships", "commands", "witnesses"]);
  assert.equal(unique(rootIds).length, rootIds.length);
  assert.equal(unique(sidecarIds).length, sidecarIds.length);
  for (const rootId of domainRootIds) {
    assert.equal(rootIds.includes(rootId), true, `unknown root reference: ${rootId}`);
  }
});

test("canonical workbench adapter mappings cover all exported operator plugin forms", () => {
  const exportedKinds = operatorWorkbenchRvmForms.map(form => form.kind).sort();
  const mappedKinds = OPERATOR_WORKBENCH_FORM_MAPPINGS.map(entry => entry.id).sort();
  assert.deepEqual(mappedKinds, exportedKinds);
});

test("canonical browser adapter mappings cover all live browser prototype block kinds", async () => {
  const source = await fs.readFile(path.resolve("examples", "operator", "browser", "operator.workbench.rvm"), "utf8");
  const liveKinds = unique(
    [...source.matchAll(/^([a-z_][a-z0-9_]*)\s+[A-Za-z_][A-Za-z0-9_.:-]*\s*\{$/gmu)].map(match => match[1])
  ).sort();
  const mappedKinds = OPERATOR_BROWSER_PROTOTYPE_FORM_MAPPINGS.map(entry => entry.id).sort();
  assert.deepEqual(mappedKinds, liveKinds);
});

test("canonical legacy browse mappings cover all current world and platform browse groups", async () => {
  const [tuiSource, browserExampleSource] = await Promise.all([
    fs.readFile(path.resolve("plugins", "operator-workbench", "tui-engine.js"), "utf8"),
    fs.readFile(path.resolve("examples", "operator", "browser", "operator.workbench.rvm"), "utf8")
  ]);
  const snapshot = buildOperatorTaxonomySnapshot({ tuiSource, browserExampleSource });
  const currentWorldKinds = snapshot.legacyBrowse.world.map(entry => entry.id).sort();
  const currentPlatformKinds = snapshot.legacyBrowse.platform.map(entry => entry.id).sort();
  const mappedWorldKinds = OPERATOR_LEGACY_BROWSE_GROUP_MAPPINGS
    .filter(entry => entry.projection === "world")
    .map(entry => entry.id)
    .sort();
  const mappedPlatformKinds = OPERATOR_LEGACY_BROWSE_GROUP_MAPPINGS
    .filter(entry => entry.projection === "platform")
    .map(entry => entry.id)
    .sort();

  assert.deepEqual(mappedWorldKinds, currentWorldKinds);
  assert.deepEqual(mappedPlatformKinds, currentPlatformKinds);
});

test("taxonomy snapshot exposes canonical roots before the current browse projection", async () => {
  const [tuiSource, browserExampleSource] = await Promise.all([
    fs.readFile(path.resolve("plugins", "operator-workbench", "tui-engine.js"), "utf8"),
    fs.readFile(path.resolve("examples", "operator", "browser", "operator.workbench.rvm"), "utf8")
  ]);
  const snapshot = buildOperatorTaxonomySnapshot({ tuiSource, browserExampleSource });

  assert.deepEqual(snapshot.canonical.roots.map(entry => entry.id), ["workbench", "things", "types", "relationships", "commands", "witnesses"]);
  assert.equal(snapshot.canonical.sessionSidecar.length > 0, true);
  assert.deepEqual(snapshot.legacyBrowse.root.map(entry => entry.id), ["workbench", "things", "types", "relationships", "commands", "witnesses"]);
});
