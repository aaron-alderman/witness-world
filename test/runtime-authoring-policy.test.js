import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AUTHORING_MODE_MCP_ONLY,
  AUTHORING_MODE_UNCONSTRAINED,
  blockedDirectMutationResponse,
  buildBlockedAuthoringHandoff,
  buildRuntimeAuthoringCapabilityMatrix,
  createRuntimeAuthoringPolicy,
  defaultRuntimeAuthoringMode
} from "../src/runtime-authoring-policy.js";

test("authoring policy defaults constrain non-serve startup modes and leave serve unconstrained", () => {
  assert.equal(defaultRuntimeAuthoringMode({ runtimeStartupMode: "serve" }), AUTHORING_MODE_UNCONSTRAINED);
  assert.equal(defaultRuntimeAuthoringMode({ runtimeStartupMode: "bootstrap" }), AUTHORING_MODE_MCP_ONLY);
  assert.equal(defaultRuntimeAuthoringMode({ runtimeStartupMode: "desktop" }), AUTHORING_MODE_MCP_ONLY);
});

test("mcp-only authoring policy exposes plugin.authoring as the canonical write path", () => {
  const policy = createRuntimeAuthoringPolicy({ mode: AUTHORING_MODE_MCP_ONLY });

  assert.equal(policy.mode, AUTHORING_MODE_MCP_ONLY);
  assert.equal(policy.llmWritePath, "plugin.authoring");
  assert.equal(policy.authoringBundleIds.includes("plugin.authoring"), true);
  assert.equal(policy.allowedHandlerIds.includes("frontendProgram.create"), false);
  assert.equal(policy.allowedHandlerIds.includes("surface.create"), true);
  assert.equal(policy.allowedHandlerIds.includes("collection.create"), true);
  assert.equal(policy.allowedHandlerIds.includes("process.create"), true);
  assert.equal(policy.allowedHandlerIds.includes("type.create"), true);
  assert.equal(policy.allowedHandlerIds.includes("projection.create"), true);
  assert.equal(policy.allowedHandlerIds.includes("message.create"), true);
  assert.equal(policy.allowedHandlerIds.includes("boundary.create"), true);
  assert.equal(policy.allowedHandlerIds.includes("policy.create"), true);
  assert.equal(policy.allowedHandlerIds.includes("frontend.upliftLegacy"), true);
  assert.equal(policy.publicMcpActions.includes("collection.create"), true);
  assert.equal(policy.publicMcpActions.includes("process.create"), true);
  assert.equal(policy.publicMcpActions.includes("type.create"), true);
  assert.equal(policy.publicMcpActions.includes("projection.create"), true);
  assert.equal(policy.publicMcpActions.includes("message.create"), true);
  assert.equal(policy.publicMcpActions.includes("boundary.create"), true);
  assert.equal(policy.publicMcpActions.includes("policy.create"), true);
  assert.equal(policy.publicMcpActions.includes("frontend.upliftLegacy"), true);
  assert.equal(policy.publicMcpActions.includes("widget.create"), false);
  assert.equal(policy.legacyMcpActions.includes("frontendProgram.create"), true);
  assert.equal(policy.proposalAccess, "read_only");
  assert.equal(policy.forbiddenMutations.includes("custom browser runtime files"), true);
  assert.equal(policy.stopOnLimitation, true);
});

test("authoring capability matrix reports page.surface pathway semantics separately", () => {
  const matrix = buildRuntimeAuthoringCapabilityMatrix(createRuntimeAuthoringPolicy({ mode: AUTHORING_MODE_MCP_ONLY }));
  const pageSurface = matrix.runtimeConsumers["page.surface"];

  assert.equal(matrix.baseline.publicFrontendModel.includes("boundary"), true);
  assert.equal(matrix.baseline.publicFrontendModel.includes("policy"), true);
  assert.equal(matrix.baseline.publicFrontendModel.includes("collection"), true);
  assert.equal(matrix.publicAuthoringConcepts.collection.publicAction, "collection.create");
  assert.equal(matrix.publicAuthoringConcepts.boundary.publicAction, "boundary.create");
  assert.equal(matrix.publicAuthoringConcepts.policy.publicAction, "policy.create");
  assert.equal(matrix.publicAuthoringConcepts.frontendLegacyUplift.publicAction, "frontend.upliftLegacy");
  assert.equal(pageSurface.status, "supported");
  assert.equal(pageSurface.pairings.surface, "supported");
  assert.equal(pageSurface.pairings.collection, "supported");
  assert.equal(pageSurface.pairings.process, "supported");
  assert.equal(pageSurface.pairings.projection, "supported");
  assert.equal(pageSurface.pathwaySemantics.blockedResetHost.status, "supported");
  assert.equal(pageSurface.pathwaySemantics.staticSurfaceProjection.status, "supported");
  assert.equal(pageSurface.pathwaySemantics.routeSelectedSurface.status, "supported");
  assert.equal(pageSurface.pathwaySemantics.surfaceProjectionPairing.status, "supported");
  assert.equal(pageSurface.pathwaySemantics.urlToRouteState.status, "supported");
  assert.equal(pageSurface.pathwaySemantics.interactionToRouteState.status, "supported");
  assert.equal(pageSurface.pathwaySemantics.routeStateToUrl.status, "supported");
  assert.equal(pageSurface.pathwaySemantics.sameDocumentSurfaceRefresh.status, "supported");
  assert.equal(pageSurface.pathwaySemantics.routingCluster.status, "supported");
  assert.equal(pageSurface.pathwaySemantics.interactiveSurfaceExecution.status, "supported");
});

test("blocked direct mutation response returns the structured blocked handoff shape", () => {
  const response = blockedDirectMutationResponse({
    attemptedAuthoringPath: "/api/runtime/app-sources",
    goal: "edit app sources through the runtime host",
    minimumHumanAction: "use plugin.authoring or hand off to the human platform lane",
    proof: ["policy forbids direct runtime/file fallback mutation"]
  });

  assert.equal(response.error, "blocked by MCP-authoring-only policy");
  assert.equal(response.authoringPolicy.mode, AUTHORING_MODE_MCP_ONLY);
  assert.deepEqual(Object.keys(buildBlockedAuthoringHandoff()).sort(), [
    "attemptedAuthoringPath",
    "goal",
    "limitationType",
    "minimumHumanAction",
    "missingPrimitive",
    "proof"
  ]);
  assert.equal(response.blockedHandoff.attemptedAuthoringPath, "/api/runtime/app-sources");
  assert.equal(response.blockedHandoff.limitationType, "policy");
  assert.match(response.blockedHandoff.missingPrimitive, /policy forbids direct runtime\/file fallback mutation/);
});

test("constitutional policy doc and DESIRE-SPA both state the constrained authoring rule", async () => {
  const [policyDoc, desireSpa] = await Promise.all([
    readFile(path.join(process.cwd(), "docs", "LLM-AUTHORING-POLICY.md"), "utf8"),
    readFile(path.join(process.cwd(), "docs", "DESIRE-SPA.md"), "utf8")
  ]);

  assert.match(policyDoc, /plugin\.authoring/i);
  assert.match(policyDoc, /Blocked means stop, not improvise/i);
  assert.match(policyDoc, /custom JS\/TS runtime fallback artifacts/i);
  assert.match(desireSpa, /LLM-AUTHORING-POLICY\.md/);
  assert.match(desireSpa, /blocked handoff/i);
});
