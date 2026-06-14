import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBootstrapRuntimePluginPreviewSummary,
  buildBootstrapRuntimePluginReviewView,
  renderBootstrapRuntimePluginReviewViewFactory,
  runtimePluginReviewOptionLabel,
  runtimePluginReviewRows
} from "./bootstrap-runtime-plugin-review-view.js";

test("runtime plugin review view helpers expose package rows and option labels", () => {
  const review = {
    packages: [
      { plugin: "plugin.inspect", version: "1.0.0", statusBadges: ["installed"] }
    ]
  };

  assert.deepEqual(runtimePluginReviewRows(review), review.packages);
  assert.equal(
    runtimePluginReviewOptionLabel(review.packages[0]),
    "plugin.inspect [1.0.0] {installed}"
  );
});

test("runtime plugin review preview summary describes installable and blocked states", () => {
  assert.equal(buildBootstrapRuntimePluginPreviewSummary({
    review: { activeProfile: "full" },
    row: {
      installed: false,
      installable: true,
      dependencies: { direct: ["plugin.fs-blob"] },
      installPreview: {
        available: true,
        delta: { effectiveNoOp: true }
      }
    }
  }).includes("Installable on profile full."), true);

  assert.equal(buildBootstrapRuntimePluginPreviewSummary({
    review: { activeProfile: "full" },
    row: {
      installed: false,
      installable: false,
      blockingReasons: ["plugin package is metadata-only"],
      installPreview: { available: false }
    }
  }).includes("Blocked by: plugin package is metadata-only."), true);
});

test("runtime plugin review view builds detail HTML and note text for the selected plugin", () => {
  const view = buildBootstrapRuntimePluginReviewView({
    review: {
      serverRunner: "demo_server",
      selectedPluginId: "plugin.inspect",
      note: "Bootstrap/runtime plugin review shows authored runner intent only.",
      currentComposition: { profile: "full" },
      packages: [
        {
          plugin: "plugin.inspect",
          displayName: "Inspect Bundle Bridge",
          version: "0.1.0",
          statusBadges: ["installed", "no-op"],
          installed: true,
          installable: false,
          missingPackage: false,
          description: "Inspect plugin",
          execution: { executable: true },
          trust: { state: "unsigned" },
          metadata: { permissions: [], compatibleRuntimeProfiles: [], compatibleShells: [] },
          dependencies: { direct: [], missing: [], reverseDependents: [], blockingReasons: ["already installed"] },
          declaredManifestContributions: { capabilities: [], routes: [], surfaces: [], providers: [] },
          resolvedBundles: [],
          resolvedRuntimeContributions: { capabilities: [], routes: [], surfaces: [], handlerSets: [] },
          currentComposition: { profile: "full" },
          removePreview: {
            available: true,
            delta: {
              addedBundleIds: [],
              removedBundleIds: [],
              addedCapabilityIds: [],
              removedCapabilityIds: [],
              addedRoutes: [],
              removedRoutes: [],
              addedSurfaces: [],
              removedSurfaces: [],
              addedHandlerMetadata: [],
              removedHandlerMetadata: [],
              changedHandlerMetadata: [],
              effectiveNoOp: true
            }
          }
        }
      ]
    }
  });

  assert.equal(Array.isArray(view.detailItems), true);
  assert.equal(view.detailItems.some(item => item.title === "Operator Summary"), true);
  assert.equal(view.detailItems.some(item => item.title === "Inspect Bundle Bridge"), true);
  assert.equal(view.detailItems.some(item => item.title === "Remove Preview"), true);
  assert.equal(view.noteText.includes("Installed on profile"), true);
});

test("runtime plugin review view falls back to empty guidance when no runner or row exists", () => {
  const noRunner = buildBootstrapRuntimePluginReviewView({
    review: { serverRunner: null, packages: [], selectedPluginId: "" }
  });
  assert.equal(noRunner.detailItems[0].emptyText.includes("Create a server runner"), true);

  const noRow = buildBootstrapRuntimePluginReviewView({
    review: {
      serverRunner: "demo_server",
      packages: [],
      selectedPluginId: "plugin.inspect",
      note: "Runtime plugin review shows authored runner intent only."
    }
  });
  assert.equal(noRow.detailItems[0].emptyText.includes("No discovered plugin packages"), true);
});

test("runtime plugin review view factory exposes the shared browser helpers", () => {
  const factory = renderBootstrapRuntimePluginReviewViewFactory();
  assert.equal(factory.includes("const runtimePluginReviewRows ="), true);
  assert.equal(factory.includes("const runtimePluginReviewOptionLabel ="), true);
  assert.equal(factory.includes("const buildBootstrapRuntimePluginPreviewSummary ="), true);
  assert.equal(factory.includes("const buildBootstrapRuntimePluginReviewView ="), true);
});
