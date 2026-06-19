import assert from "node:assert/strict";
import test from "node:test";
import { defineCapability, moduleProjectors } from "../src/modules.js";
import { evaluateCapabilityCompatibility } from "../src/capability-compatibility.js";
import { createWorld } from "../src/kernel.js";

test("capability compatibility evaluator returns structured compatible status with migration notes", () => {
  const world = createWorld();
  defineCapability(world, {
    actor: "system",
    id: "notes.sidebar",
    label: "Notes Sidebar",
    placement: ["context", "routePage"],
    dependsOn: ["capability.base"],
    compatibility: {
      minimumRuntimeProfile: "authoring",
      authorityAssumptions: ["capability.install.approve"],
      dependencyConstraints: {
        requiresInstalledCapabilities: ["capability.richtext"]
      },
      migrationNotes: ["refresh page shell after install"]
    }
  });
  defineCapability(world, {
    actor: "system",
    id: "capability.base",
    label: "Base",
    placement: ["context"]
  });
  defineCapability(world, {
    actor: "system",
    id: "capability.richtext",
    label: "Rich Text",
    placement: ["context"]
  });

  const capability = world.project(moduleProjectors.capabilityIndex).byId["notes.sidebar"];
  const report = evaluateCapabilityCompatibility(capability, {
    target: "ctx.notes",
    targetKind: "context",
    installedCapabilities: ["capability.base", "capability.richtext"],
    activeRuntimeProfile: "full",
    grantedAuthorities: ["capability.install.approve"]
  });

  assert.equal(report.status, "compatible");
  assert.equal(report.compatible, true);
  assert.deepEqual(report.reasons, []);
  assert.deepEqual(report.warnings, []);
  assert.deepEqual(report.migrationNotes, ["refresh page shell after install"]);
});

test("capability compatibility evaluator reports blocked and incompatible reasons with machine-readable codes", () => {
  const report = evaluateCapabilityCompatibility({
    id: "notes.sidebar",
    placement: ["context"],
    dependsOn: ["capability.base"],
    compatibility: {
      minimumRuntimeProfile: "authoring",
      dependencyConstraints: {
        requiresInstalledCapabilities: ["capability.richtext"]
      }
    }
  }, {
    target: "home_page",
    targetKind: "routePage",
    installedCapabilities: [],
    activeRuntimeProfile: "minimal"
  });

  assert.equal(report.status, "incompatible");
  assert.deepEqual(
    report.reasons.map(entry => entry.code),
    ["target-kind-incompatible", "dependency-missing", "runtime-profile-incompatible"]
  );
  assert.deepEqual(report.reasons[1].missingDependencies, ["capability.base", "capability.richtext"]);
});
