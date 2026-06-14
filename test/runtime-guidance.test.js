import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { collectActiveRuntimeContributions } from "../src/runtime-active-contributions.js";
import {
  createGuidanceBundleHandlers,
  guidanceConfigForSession,
  preferredBootstrapGuidance,
  preferredBootstrapStarter
} from "../src/runtime-guidance.js";

test("runtime guidance contributions normalize definition and starter entries into core registries", () => {
  const runtimeContributions = collectActiveRuntimeContributions({
    bundles: [{
      id: "bundle-guidance-test",
      contributes: {
        providers: [
          {
            kind: "guidanceDefinitions",
            definitions: [{
              id: "guide.alpha",
              definition: { id: "guide.alpha", title: "Alpha Guide", steps: [{ id: "step.alpha" }] },
              defaultForBootstrap: true
            }]
          },
          {
            kind: "starterBlueprints",
            blueprints: [{
              id: "starter.alpha",
              blueprint: { id: "starter.alpha", requestPlan: [] },
              defaultForBootstrap: true
            }]
          }
        ]
      }
    }]
  });

  assert.equal(runtimeContributions.guidanceDefinitions.length, 1);
  assert.equal(runtimeContributions.guidanceDefinitions[0].title, "Alpha Guide");
  assert.deepEqual(runtimeContributions.guidanceDefinitions[0].definition.steps, [{ id: "step.alpha" }]);
  assert.equal(runtimeContributions.starterBlueprints.length, 1);
  assert.deepEqual(runtimeContributions.starterBlueprints[0].blueprint, { id: "starter.alpha", requestPlan: [] });
  assert.equal(preferredBootstrapGuidance(runtimeContributions)?.id, "guide.alpha");
  assert.equal(preferredBootstrapStarter(runtimeContributions)?.id, "starter.alpha");
});

test("guidance session config resolves the active guidance with surface metadata", () => {
  const runtimeContributions = collectActiveRuntimeContributions({
    bundles: [{
      id: "bundle-guidance-test",
      contributes: {
        providers: [{
          kind: "guidanceDefinitions",
          definitions: [{
            id: "guide.alpha",
            title: "Alpha Guide",
            definition: { id: "guide.alpha", title: "Alpha Guide", steps: [{ id: "step.alpha" }] },
            defaultForBootstrap: true
          }]
        }]
      }
    }]
  });

  const config = guidanceConfigForSession({
    requestSession: { id: "session.alpha" },
    tutorialProgressFor: () => ({ stepId: "step.alpha" }),
    runtimeContributions,
    surface: {
      page: "bootstrap",
      context: "frontend",
      routeId: "route.bootstrap",
      rootWidgetId: "bootstrap_root",
      frontendProgramId: "bootstrap_program"
    }
  });

  assert.deepEqual(config, {
    id: "guide.alpha",
    title: "Alpha Guide",
    definition: { id: "guide.alpha", title: "Alpha Guide", steps: [{ id: "step.alpha" }] },
    surfacePage: "bootstrap",
    surfaceContext: "frontend",
    surfaceRouteId: "route.bootstrap",
    surfaceRootWidgetId: "bootstrap_root",
    surfaceProgramId: "bootstrap_program"
  });
});

test("guidance session config prefers the canonical guidance progress reader", () => {
  const runtimeContributions = collectActiveRuntimeContributions({
    bundles: [{
      id: "bundle-guidance-test",
      contributes: {
        providers: [{
          kind: "guidanceDefinitions",
          definitions: [{
            id: "guide.alpha",
            title: "Alpha Guide",
            definition: { id: "guide.alpha", title: "Alpha Guide", steps: [{ id: "step.alpha" }] },
            defaultForBootstrap: true
          }]
        }]
      }
    }]
  });

  const config = guidanceConfigForSession({
    requestSession: { id: "session.alpha" },
    tutorialProgressFor: () => null,
    guidanceProgressFor: () => ({ stepId: "step.alpha" }),
    runtimeContributions
  });

  assert.equal(config?.id, "guide.alpha");
  assert.equal(config?.title, "Alpha Guide");
});

test("guidance handlers accept tutorial-progress compatibility params while using canonical guidance ids", async () => {
  const runtimeContributions = collectActiveRuntimeContributions({
    bundles: [{
      id: "bundle-guidance-test",
      contributes: {
        providers: [{
          kind: "guidanceDefinitions",
          definitions: [{
            id: "guide.alpha",
            definition: { id: "guide.alpha", steps: [{ id: "step.alpha" }, { id: "step.beta" }] }
          }]
        }]
      }
    }]
  });
  const progressBySession = new Map();
  const responses = [];
  const keyFor = (sessionId, guidanceId) => `${sessionId}\u0000${guidanceId}`;
  const handlers = createGuidanceBundleHandlers({
    sendJson: (_res, status, body) => responses.push({ status, body }),
    readJson: async () => ({ stepId: "step.beta", hidden: false }),
    tutorialProgressFor: (requestSession, guidanceId) => progressBySession.get(keyFor(requestSession?.id, guidanceId)) ?? null,
    setTutorialProgress: (requestSession, guidanceId, progress) => {
      const key = keyFor(requestSession?.id, guidanceId);
      if (progress == null) progressBySession.delete(key);
      else progressBySession.set(key, progress);
    },
    runtimeContributions
  });

  await handlers["guidance.progress.write"]({
    req: {},
    res: {},
    params: { tutorialId: "guide.alpha" },
    requestSession: { id: "session.alpha" }
  });
  await handlers["guidance.progress.read"]({
    res: {},
    params: { tutorialId: "guide.alpha" },
    requestSession: { id: "session.alpha" }
  });
  await handlers["guidance.progress.delete"]({
    res: {},
    params: { tutorialId: "guide.alpha" },
    requestSession: { id: "session.alpha" }
  });

  assert.deepEqual(responses.map(entry => entry.status), [200, 200, 200]);
  assert.equal(responses[0].body.guidanceId, "guide.alpha");
  assert.equal(responses[0].body.tutorialId, "guide.alpha");
  assert.equal(responses[0].body.progress.stepId, "step.beta");
  assert.equal(responses[1].body.progress.stepId, "step.beta");
  assert.deepEqual(responses[2].body, { guidanceId: "guide.alpha", tutorialId: "guide.alpha", ok: true });
});

test("core guidance helpers stay guidance-first at the canonical factory boundary", async () => {
  const guidanceSource = await readFile(new URL("../src/runtime-guidance.js", import.meta.url), "utf8");
  const coreHandlersSource = await readFile(new URL("../src/runtime-core-handlers.js", import.meta.url), "utf8");
  const bootstrapStateSource = await readFile(new URL("../src/runtime-guidance-bootstrap-client.js", import.meta.url), "utf8");
  const bootstrapControllerSource = await readFile(new URL("../src/runtime-guidance-bootstrap-controller-client.js", import.meta.url), "utf8");

  assert.equal(guidanceSource.includes('import { normalizeGuidanceProgress } from "./runtime-guidance-model.js";'), true);
  assert.equal(guidanceSource.includes("normalizeTutorialProgress(entry.definition"), false);
  assert.equal(coreHandlersSource.includes("function widgetPageGuidanceSurface"), true);
  assert.equal(coreHandlersSource.includes("function widgetPageTutorialSurface"), false);
  assert.equal(bootstrapStateSource.includes("export function renderBootstrapGuidanceStateFactory() {"), true);
  assert.equal(bootstrapStateSource.includes("export function renderBootstrapTutorialStateFactory() {"), true);
  assert.equal(bootstrapStateSource.includes("return renderBootstrapGuidanceStateFactory();"), true);
  assert.equal(bootstrapStateSource.includes("const createBootstrapGuidanceStateRuntime = (env) => {"), true);
  assert.equal(bootstrapStateSource.includes("const createBootstrapTutorialStateRuntime = createBootstrapGuidanceStateRuntime;"), true);
  assert.equal(bootstrapControllerSource.includes("export function renderBootstrapGuidanceControllerFactory() {"), true);
  assert.equal(bootstrapControllerSource.includes("export function renderBootstrapTutorialControllerFactory() {"), true);
  assert.equal(bootstrapControllerSource.includes("return renderBootstrapGuidanceControllerFactory();"), true);
  assert.equal(bootstrapControllerSource.includes("const createBootstrapGuidanceController = (env) => {"), true);
  assert.equal(bootstrapControllerSource.includes("const createBootstrapTutorialController = createBootstrapGuidanceController;"), true);
});
