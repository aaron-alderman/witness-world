export const AUTHORING_MODE_UNCONSTRAINED = "unconstrained";
export const AUTHORING_MODE_MCP_ONLY = "mcp_only";

export const MCP_ONLY_AUTHORING_BUNDLE_IDS = Object.freeze([
  "plugin.authoring",
  "plugin.authoring-core",
  "plugin.program-authoring",
  "plugin.server-runner-authoring",
  "plugin.capability-authoring",
  "plugin.mcp-authoring",
  "plugin.proposals"
]);

export const MCP_ONLY_ALLOWED_HANDLER_IDS = Object.freeze([
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
  "widgets.create",
  "widgets.update",
  "route.create",
  "serve.create",
  "frontendProgram.create",
  "frontendStep.create",
  "serverRunner.create",
  "runtimePlugin.install",
  "runtimePlugin.remove",
  "capability.create",
  "capability.install",
  "capability.remove",
  "mcpServer.create",
  "mcpTool.install",
  "mcpTool.remove"
]);

export const MCP_ONLY_FORBIDDEN_MUTATIONS = Object.freeze([
  "repo-tracked file edits outside plugin.authoring flows",
  "generated JS/TS runtime fallback artifacts",
  "direct src/ platform edits",
  "direct plugins/ runtime edits",
  "custom browser runtime files",
  "custom presenter/controller/client files",
  "automatic proposal creation",
  "runtime app-source POST edits"
]);

export const BLOCKED_HANDOFF_FIELDS = Object.freeze([
  "goal",
  "attemptedAuthoringPath",
  "missingPrimitive",
  "minimumHumanAction",
  "proof"
]);

function uniqueStrings(values = []) {
  return [...new Set((values ?? []).map(value => String(value || "").trim()).filter(Boolean))];
}

function cloneBlockedHandoff(blockedHandoff = null) {
  if (!blockedHandoff || typeof blockedHandoff !== "object") return null;
  return {
    goal: blockedHandoff.goal ?? null,
    attemptedAuthoringPath: blockedHandoff.attemptedAuthoringPath ?? null,
    missingPrimitive: blockedHandoff.missingPrimitive ?? null,
    minimumHumanAction: blockedHandoff.minimumHumanAction ?? null,
    proof: Array.isArray(blockedHandoff.proof) ? [...blockedHandoff.proof] : []
  };
}

export function defaultRuntimeAuthoringMode({ runtimeStartupMode = "serve" } = {}) {
  return runtimeStartupMode === "serve"
    ? AUTHORING_MODE_UNCONSTRAINED
    : AUTHORING_MODE_MCP_ONLY;
}

export function buildBlockedAuthoringHandoff({
  goal = null,
  attemptedAuthoringPath = null,
  missingPrimitive = null,
  minimumHumanAction = null,
  proof = []
} = {}) {
  return {
    goal,
    attemptedAuthoringPath,
    missingPrimitive,
    minimumHumanAction,
    proof: Array.isArray(proof) ? [...proof].map(item => String(item)) : []
  };
}

export function createRuntimeAuthoringPolicy({
  mode = AUTHORING_MODE_UNCONSTRAINED,
  blockedHandoff = null
} = {}) {
  const normalizedMode = mode === AUTHORING_MODE_MCP_ONLY
    ? AUTHORING_MODE_MCP_ONLY
    : AUTHORING_MODE_UNCONSTRAINED;
  return {
    mode: normalizedMode,
    llmWritePath: normalizedMode === AUTHORING_MODE_MCP_ONLY ? "plugin.authoring" : null,
    authoringBundleIds: normalizedMode === AUTHORING_MODE_MCP_ONLY
      ? [...MCP_ONLY_AUTHORING_BUNDLE_IDS]
      : [],
    allowedHandlerIds: normalizedMode === AUTHORING_MODE_MCP_ONLY
      ? [...MCP_ONLY_ALLOWED_HANDLER_IDS]
      : [],
    proposalAccess: normalizedMode === AUTHORING_MODE_MCP_ONLY ? "read_only" : "normal",
    forbiddenMutations: normalizedMode === AUTHORING_MODE_MCP_ONLY
      ? [...MCP_ONLY_FORBIDDEN_MUTATIONS]
      : [],
    stopOnLimitation: normalizedMode === AUTHORING_MODE_MCP_ONLY,
    blockedHandoffFields: [...BLOCKED_HANDOFF_FIELDS],
    blockedHandoff: cloneBlockedHandoff(blockedHandoff),
    status: blockedHandoff ? "blocked" : "ready",
    humanReviewRequired: normalizedMode === AUTHORING_MODE_MCP_ONLY
  };
}

export function cloneRuntimeAuthoringPolicy(policy = null) {
  return createRuntimeAuthoringPolicy({
    mode: policy?.mode,
    blockedHandoff: cloneBlockedHandoff(policy?.blockedHandoff ?? null)
  });
}

export function blockedDirectMutationResponse({
  attemptedAuthoringPath,
  goal,
  minimumHumanAction,
  proof = []
} = {}) {
  const blockedHandoff = buildBlockedAuthoringHandoff({
    goal,
    attemptedAuthoringPath,
    missingPrimitive: "authoring-mode policy forbids direct runtime/file fallback mutation",
    minimumHumanAction,
    proof
  });
  return {
    error: "blocked by MCP-authoring-only policy",
    blockedHandoff,
    authoringPolicy: createRuntimeAuthoringPolicy({
      mode: AUTHORING_MODE_MCP_ONLY,
      blockedHandoff
    })
  };
}

export function allowedHandlerIdSetForPolicy(policy = null) {
  return new Set(uniqueStrings(policy?.allowedHandlerIds ?? []));
}
