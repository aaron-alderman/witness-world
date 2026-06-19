import { projectors } from "../../src/kernel.js";
import { normalizeAuthorityTuple } from "../../src/runtime-authz.js";

export const PLATFORM_POLICY_TARGET_ID = "plugin.platform";

export const PLATFORM_AUTHORITY_POLICY_ROWS = Object.freeze([
  Object.freeze({
    id: "authorityPolicy:platform.read.general",
    policyKey: "platform.read.general",
    title: "Platform General Read",
    requiredAuthority: "platform.read.general",
    accessClass: "read",
    sensitivity: "general",
    summary: "Allows authenticated platform actors to inspect overview, workflow, knowledge, model, and compatibility surfaces.",
    source: "platform-policy"
  }),
  Object.freeze({
    id: "authorityPolicy:platform.read.sensitive",
    policyKey: "platform.read.sensitive",
    title: "Platform Sensitive Read",
    requiredAuthority: "platform.read.sensitive",
    accessClass: "read",
    sensitivity: "sensitive",
    summary: "Restricts verification, telemetry, defects, governance, and security surfaces to platform stewards or operators.",
    source: "platform-policy"
  }),
  Object.freeze({
    id: "authorityPolicy:platform.write.steward",
    policyKey: "platform.write.steward",
    title: "Platform Steward Write",
    requiredAuthority: "platform.write.steward",
    accessClass: "write",
    sensitivity: "governed",
    summary: "Allows platform stewards to create, stage, validate, and propose platform-scoped work without executing high-risk actions.",
    source: "platform-policy"
  }),
  Object.freeze({
    id: "authorityPolicy:platform.execute.operator",
    policyKey: "platform.execute.operator",
    title: "Platform Operator Execute",
    requiredAuthority: "platform.execute.operator",
    accessClass: "execute",
    sensitivity: "high-risk",
    summary: "Restricts high-risk execution, publication, test, and proposal review actions to platform operators.",
    source: "platform-policy"
  })
]);

const PLATFORM_POLICY_BY_KEY = Object.freeze(Object.fromEntries(
  PLATFORM_AUTHORITY_POLICY_ROWS.map(row => [row.policyKey, row])
));

const PLATFORM_SENSITIVE_MODEL_VIEWS = new Set([
  "verificationOverview",
  "verificationStatus",
  "verificationRuns",
  "verificationRuntime",
  "artifacts",
  "sessions",
  "telemetry",
  "defects",
  "governance",
  "security",
  "gates",
  "testGates",
  "testRedGreen",
  "testRuns",
  "candidateSnapshots",
  "runtimeRevisions"
]);

const PLATFORM_MUTATION_POLICY_BY_HANDLER = Object.freeze({
  "platform.branch.create": "platform.write.steward",
  "platform.branch.push": "platform.execute.operator",
  "platform.branch.ship": "platform.execute.operator",
  "platform.changeSet.create": "platform.write.steward",
  "platform.changeSet.edit": "platform.write.steward",
  "platform.changeSet.removeEdit": "platform.write.steward",
  "platform.changeSet.validate": "platform.write.steward",
  "platform.changeSet.apply": "platform.execute.operator",
  "platform.changeSet.reject": "platform.write.steward",
  "platform.changeSet.abandon": "platform.write.steward",
  "platform.testRun.create": "platform.execute.operator",
  "platform.proposal.create": "platform.write.steward",
  "platform.proposal.approve": "platform.execute.operator",
  "platform.proposal.reject": "platform.execute.operator"
});

const PLATFORM_GENERAL_READ_HANDLERS = new Set([
  "platform.gaps.read",
  "platform.branch.list",
  "platform.branch.read",
  "platform.changeSet.list",
  "platform.changeSet.read"
]);

const PLATFORM_SENSITIVE_READ_HANDLERS = new Set([
  "platform.testRun.read",
  "platform.testRun.events",
  "platform.testArtifact.content",
  "platform.artifact.content"
]);

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function decisionNodeIdForWitness(witness) {
  return witness?.id ? `authorityDecision:${String(witness.id)}` : null;
}

function platformPolicyRow(policyKey) {
  return PLATFORM_POLICY_BY_KEY[policyKey] ?? null;
}

export function normalizePlatformAuthority({ requestActor = null, requestSession = null } = {}) {
  const normalized = normalizeAuthorityTuple(requestSession ?? {}, { allowAliases: true });
  const fallbackActor = trimString(requestActor);
  return {
    authenticatedIdentity: normalized.authenticatedIdentity ?? null,
    authenticatedActor: normalized.authenticatedActor || fallbackActor || null,
    effectiveIdentity: normalized.effectiveIdentity ?? null,
    effectiveActor: normalized.effectiveActor || fallbackActor || normalized.authenticatedActor || null,
    authorityMode: normalized.authorityMode || "direct",
    assumptionGrantId: normalized.assumptionGrantId ?? null
  };
}

function isPlatformSteward(world, actor) {
  const effectiveActor = trimString(actor);
  if (!effectiveActor || !world?.project) return false;
  const owners = world.project(projectors.owners);
  const stewards = world.project(projectors.stewards);
  return owners.get(PLATFORM_POLICY_TARGET_ID) === effectiveActor || stewards.get(PLATFORM_POLICY_TARGET_ID)?.has(effectiveActor) === true;
}

export function policyForPlatformRead({ handlerId = null, modelView = null } = {}) {
  const normalizedHandler = trimString(handlerId);
  if (PLATFORM_GENERAL_READ_HANDLERS.has(normalizedHandler)) return "platform.read.general";
  if (PLATFORM_SENSITIVE_READ_HANDLERS.has(normalizedHandler)) return "platform.read.sensitive";
  if (normalizedHandler === "platform.model.read" || normalizedHandler === "platform.page.read" || normalizedHandler === "page.platform") {
    return PLATFORM_SENSITIVE_MODEL_VIEWS.has(trimString(modelView))
      ? "platform.read.sensitive"
      : "platform.read.general";
  }
  return null;
}

export function policyForPlatformMutation(handlerId) {
  return PLATFORM_MUTATION_POLICY_BY_HANDLER[trimString(handlerId)] ?? null;
}

function operatorGate(requireBootstrapActor, effectiveActor) {
  if (typeof requireBootstrapActor !== "function") {
    return { ok: false, status: 503, reason: "bootstrap authoring services are not available" };
  }
  return requireBootstrapActor(effectiveActor);
}

function platformStewardAllowed(world, effectiveActor, requireBootstrapActor) {
  const gate = operatorGate(requireBootstrapActor, effectiveActor);
  if (gate.ok) return true;
  return isPlatformSteward(world, effectiveActor);
}

function decisionReason({
  allowed = false,
  policyKey = "",
  effectiveActor = null,
  authenticatedActor = null,
  authorityMode = "direct",
  operatorOk = false
} = {}) {
  switch (policyKey) {
    case "platform.read.general":
      return allowed
        ? (effectiveActor || authenticatedActor
          ? `authenticated actor ${effectiveActor || authenticatedActor} may read general platform surfaces`
          : "general platform surfaces remain readable without a resolved actor")
        : "general platform reads are denied";
    case "platform.read.sensitive":
      return allowed
        ? `${operatorOk ? "operator" : "platform steward"} ${effectiveActor || authenticatedActor} may read sensitive platform surfaces`
        : "platform steward or operator authority is required for sensitive platform reads";
    case "platform.write.steward":
      return allowed
        ? `${operatorOk ? "operator" : "platform steward"} ${effectiveActor || authenticatedActor} may mutate staged platform state`
        : "platform steward authority is required for staged platform mutations";
    case "platform.execute.operator":
      return allowed
        ? `bootstrap operator ${effectiveActor || authenticatedActor} may execute high-risk platform actions`
        : "platform operator authority is required for high-risk platform execution";
    default:
      return allowed
        ? `platform authority granted in ${authorityMode} mode`
        : "platform authority denied";
  }
}

function decisionAllowed({ world, policyKey, authority, requireBootstrapActor }) {
  const effectiveActor = trimString(authority?.effectiveActor);
  const operator = operatorGate(requireBootstrapActor, effectiveActor);
  const operatorOk = operator.ok === true;
  const stewardOk = platformStewardAllowed(world, effectiveActor, requireBootstrapActor);
  switch (policyKey) {
    case "platform.read.general":
      return { ok: true, operatorOk, stewardOk, operatorGate: operator };
    case "platform.read.sensitive":
      return { ok: stewardOk || operatorOk, operatorOk, stewardOk, operatorGate: operator };
    case "platform.write.steward":
      return { ok: stewardOk || operatorOk, operatorOk, stewardOk, operatorGate: operator };
    case "platform.execute.operator":
      return { ok: operatorOk, operatorOk, stewardOk, operatorGate: operator };
    default:
      return { ok: false, operatorOk, stewardOk, operatorGate: operator };
  }
}

export function evaluatePlatformPolicy(world, {
  requireBootstrapActor,
  requestActor = null,
  requestSession = null,
  handlerId = null,
  routeId = null,
  requestPath = null,
  modelView = null,
  targetObjectId = null,
  kind = "read",
  action = null
} = {}) {
  const authority = normalizePlatformAuthority({ requestActor, requestSession });
  const policyKey = kind === "mutation"
    ? policyForPlatformMutation(handlerId)
    : policyForPlatformRead({ handlerId, modelView });
  const policy = platformPolicyRow(policyKey);
  if (!policy) {
    return {
      ok: true,
      authority,
      policy: null,
      reason: "platform policy not required",
      operatorOk: false
    };
  }
  const decision = decisionAllowed({
    world,
    policyKey,
    authority,
    requireBootstrapActor
  });
  const reason = decisionReason({
    allowed: decision.ok,
    policyKey,
    effectiveActor: authority.effectiveActor,
    authenticatedActor: authority.authenticatedActor,
    authorityMode: authority.authorityMode,
    operatorOk: decision.operatorOk
  });
  return {
    ok: decision.ok,
    authority,
    policy,
    requiredAuthority: policy.requiredAuthority,
    operatorOk: decision.operatorOk,
    operatorGate: decision.operatorGate,
    stewardOk: decision.stewardOk,
    reason,
    body: {
      action: trimString(action) || trimString(handlerId) || (kind === "mutation" ? "platform.mutation" : "platform.read"),
      kind,
      handlerId: trimString(handlerId) || null,
      routeId: trimString(routeId) || null,
      requestPath: trimString(requestPath) || null,
      view: trimString(modelView) || null,
      targetObjectId: trimString(targetObjectId) || null,
      sessionId: trimString(requestSession?.id) || null,
      policyId: policy.id,
      requiredAuthority: policy.requiredAuthority,
      decision: decision.ok ? "allow" : "deny",
      reason,
      authenticatedIdentity: authority.authenticatedIdentity,
      authenticatedActor: authority.authenticatedActor,
      effectiveIdentity: authority.effectiveIdentity,
      effectiveActor: authority.effectiveActor,
      authorityMode: authority.authorityMode,
      assumptionGrantId: authority.assumptionGrantId,
      evaluatedAt: new Date().toISOString()
    }
  };
}

export function emitPlatformAuthorityDecision(world, evaluation) {
  const actor = evaluation?.authority?.effectiveActor || evaluation?.authority?.authenticatedActor || "platform.unknown";
  const witness = world.emit({
    process: "platform.authority.decision",
    actor,
    claims: [],
    body: evaluation?.body ?? {}
  });
  return {
    witness,
    decisionId: decisionNodeIdForWitness(witness)
  };
}

export function denyPlatformDecisionPayload(evaluation, decisionId) {
  return {
    error: "platform policy denied",
    policyId: evaluation?.policy?.id ?? null,
    decisionId: decisionId ?? null,
    requiredAuthority: evaluation?.requiredAuthority ?? null,
    reason: evaluation?.reason ?? "platform authority denied"
  };
}

export function authorityDecisionNodeId(decision) {
  if (!decision) return null;
  if (trimString(decision.id).startsWith("authorityDecision:")) return trimString(decision.id);
  return trimString(decision.id) ? `authorityDecision:${trimString(decision.id)}` : null;
}
