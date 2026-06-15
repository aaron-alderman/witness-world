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
  "surface.create",
  "process.create",
  "type.create",
  "projection.create",
  "message.create",
  "route.create",
  "serve.create",
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

export const MCP_ONLY_PUBLIC_MCP_ACTIONS = Object.freeze([
  "identity.create",
  "identity.update",
  "context.create",
  "contextBinding.create",
  "contextBinding.remove",
  "contextExport.create",
  "contextExport.remove",
  "contextImport.create",
  "contextImport.remove",
  "perspective.create",
  "stewardship.create",
  "stewardship.remove",
  "surface.create",
  "process.create",
  "type.create",
  "projection.create",
  "message.create",
  "route.create",
  "serve.create",
  "serverRunner.create",
  "capability.create",
  "capability.install",
  "capability.remove",
  "mcpServer.create",
  "mcpTool.install",
  "mcpTool.remove"
]);

export const MCP_ONLY_LEGACY_MCP_ACTIONS = Object.freeze([
  "widget.create",
  "widget.update",
  "frontendProgram.create",
  "frontendStep.create"
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
  "limitationType",
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
    limitationType: blockedHandoff.limitationType ?? null,
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
  limitationType = "platform",
  goal = null,
  attemptedAuthoringPath = null,
  missingPrimitive = null,
  minimumHumanAction = null,
  proof = []
} = {}) {
  return {
    limitationType,
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
    publicMcpActions: normalizedMode === AUTHORING_MODE_MCP_ONLY
      ? [...MCP_ONLY_PUBLIC_MCP_ACTIONS]
      : [],
    legacyMcpActions: normalizedMode === AUTHORING_MODE_MCP_ONLY
      ? [...MCP_ONLY_LEGACY_MCP_ACTIONS]
      : [],
    proposalAccess: normalizedMode === AUTHORING_MODE_MCP_ONLY ? "read_only" : "normal",
    forbiddenMutations: normalizedMode === AUTHORING_MODE_MCP_ONLY
      ? [...MCP_ONLY_FORBIDDEN_MUTATIONS]
      : [],
    stopOnLimitation: normalizedMode === AUTHORING_MODE_MCP_ONLY,
    canonicalFrontendModel: ["surface", "process", "projection", "capability"],
    loweringLayer: "DESIRE+",
    interactiveStateOwner: "process",
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
    limitationType: "policy",
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

function capabilityState({
  publicAction = null,
  publicActions = [],
  runtimeConsumers = [],
  status = "supported",
  limitationType = null,
  reason = null
} = {}) {
  return {
    public: status !== "legacy_only",
    status,
    publicAction,
    publicActions: [...publicActions],
    runtimeConsumers: [...runtimeConsumers],
    limitationType,
    reason
  };
}

export function buildRuntimeAuthoringCapabilityMatrix(policy = null) {
  const normalizedPolicy = cloneRuntimeAuthoringPolicy(policy);
  return {
    mode: normalizedPolicy.mode,
    baseline: {
      publicFrontendModel: [...(normalizedPolicy.canonicalFrontendModel ?? [])],
      loweringLayer: normalizedPolicy.loweringLayer,
      interactiveStateOwner: normalizedPolicy.interactiveStateOwner
    },
    publicAuthoringConcepts: {
      surface: capabilityState({
        publicAction: "surface.create",
        runtimeConsumers: ["page.surface"],
        status: "supported"
      }),
      process: capabilityState({
        publicAction: "process.create",
        runtimeConsumers: [],
        status: "supported"
      }),
      projection: capabilityState({
        publicAction: "projection.create",
        runtimeConsumers: [],
        status: "supported"
      }),
      type: capabilityState({
        publicAction: "type.create",
        runtimeConsumers: ["page.surface"],
        status: "supported"
      }),
      message: capabilityState({
        publicAction: "message.create",
        runtimeConsumers: ["page.surface"],
        status: "supported"
      }),
      capability: capabilityState({
        publicActions: ["capability.create", "capability.install", "capability.remove"],
        runtimeConsumers: ["runtime capability resolution"],
        status: "supported"
      }),
      widget: capabilityState({
        publicActions: ["widget.create", "widget.update"],
        runtimeConsumers: ["page.home"],
        status: "legacy_only",
        reason: "widgets remain available only on the explicit legacy widget-program path"
      }),
      frontendProgram: capabilityState({
        publicAction: "frontendProgram.create",
        runtimeConsumers: ["page.home"],
        status: "legacy_only",
        reason: "frontend programs remain runnable only through the legacy widget-page host"
      }),
      frontendStep: capabilityState({
        publicAction: "frontendStep.create",
        runtimeConsumers: ["page.home"],
        status: "legacy_only",
        reason: "frontend steps remain runnable only through the legacy widget-page host"
      })
    },
    runtimeConsumers: {
      "page.surface": {
        consumes: ["surface", "process", "projection"],
        status: "supported",
        staticProjection: "supported",
        interactiveProjection: "supported",
        pairings: {
          surface: "supported",
          process: "supported",
          projection: "supported"
        },
        limitationType: null,
        reason: null
      },
      "page.home": {
        consumes: ["widget", "frontendProgram"],
        status: "legacy_only",
        reason: "page.home remains the legacy widget-program runtime path"
      }
    },
    pairings: [
      {
        authoring: ["surface"],
        runtime: "page.surface",
        status: "supported"
      },
      {
        authoring: ["surface", "process", "projection"],
        runtime: "page.surface",
        status: "supported"
      },
      {
        authoring: ["widget", "frontendProgram", "frontendStep"],
        runtime: "page.home",
        status: "legacy_only",
        reason: "legacy widget-program execution remains available only outside the constrained public MCP baseline"
      }
    ],
    constrainedMcp: {
      publicActions: [...normalizedPolicy.publicMcpActions],
      legacyHiddenActions: [...normalizedPolicy.legacyMcpActions],
      directHandlerAllowlist: [...normalizedPolicy.allowedHandlerIds]
    }
  };
}
