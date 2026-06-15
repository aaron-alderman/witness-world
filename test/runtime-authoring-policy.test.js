import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AUTHORING_MODE_MCP_ONLY,
  AUTHORING_MODE_UNCONSTRAINED,
  blockedDirectMutationResponse,
  buildBlockedAuthoringHandoff,
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
  assert.equal(policy.allowedHandlerIds.includes("frontendProgram.create"), true);
  assert.equal(policy.allowedHandlerIds.includes("surface.create"), true);
  assert.equal(policy.allowedHandlerIds.includes("widgets.update"), true);
  assert.equal(policy.proposalAccess, "read_only");
  assert.equal(policy.forbiddenMutations.includes("custom browser runtime files"), true);
  assert.equal(policy.stopOnLimitation, true);
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
    "minimumHumanAction",
    "missingPrimitive",
    "proof"
  ]);
  assert.equal(response.blockedHandoff.attemptedAuthoringPath, "/api/runtime/app-sources");
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
