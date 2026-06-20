function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function booleanOrDefault(value, fallback) {
  if (value === true || value === false) return value;
  const normalized = optionalText(value)?.toLowerCase() ?? "";
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

const RELEASE_CHANNEL_DEFAULTS = Object.freeze({
  "releaseChannel:local": Object.freeze({
    postureId: "local",
    decisionMode: "warn",
    requireApprovedProposal: false,
    requireFreshPassingVerification: false,
    requireDocsFresh: false,
    requireNoBlockingDefects: false,
    requireNoOpenRegressions: false,
    requireLatestPush: true,
    requireBranchUpToDate: true,
    recordDecisionHistory: true
  }),
  "releaseChannel:preview": Object.freeze({
    postureId: "preview",
    decisionMode: "block",
    requireApprovedProposal: true,
    requireFreshPassingVerification: true,
    requireDocsFresh: true,
    requireNoBlockingDefects: true,
    requireNoOpenRegressions: true,
    requireLatestPush: true,
    requireBranchUpToDate: true,
    recordDecisionHistory: true
  }),
  "releaseChannel:staging": Object.freeze({
    postureId: "staging",
    decisionMode: "block",
    requireApprovedProposal: true,
    requireFreshPassingVerification: true,
    requireDocsFresh: true,
    requireNoBlockingDefects: true,
    requireNoOpenRegressions: true,
    requireLatestPush: true,
    requireBranchUpToDate: true,
    recordDecisionHistory: true
  }),
  "releaseChannel:production": Object.freeze({
    postureId: "production",
    decisionMode: "block",
    requireApprovedProposal: true,
    requireFreshPassingVerification: true,
    requireDocsFresh: true,
    requireNoBlockingDefects: true,
    requireNoOpenRegressions: true,
    requireLatestPush: true,
    requireBranchUpToDate: true,
    recordDecisionHistory: true
  })
});

function normalizeDefaults(raw = {}) {
  return {
    postureId: optionalText(raw.postureId) ?? null,
    decisionMode: optionalText(raw.decisionMode) === "warn" ? "warn" : "block",
    requireApprovedProposal: booleanOrDefault(raw.requireApprovedProposal, true),
    requireFreshPassingVerification: booleanOrDefault(raw.requireFreshPassingVerification, true),
    requireDocsFresh: booleanOrDefault(raw.requireDocsFresh, true),
    requireNoBlockingDefects: booleanOrDefault(raw.requireNoBlockingDefects, true),
    requireNoOpenRegressions: booleanOrDefault(raw.requireNoOpenRegressions, true),
    requireLatestPush: booleanOrDefault(raw.requireLatestPush, true),
    requireBranchUpToDate: booleanOrDefault(raw.requireBranchUpToDate, true),
    recordDecisionHistory: booleanOrDefault(raw.recordDecisionHistory, true)
  };
}

function normalizeReleaseChannelOverlay(raw = {}) {
  const releaseChannelId = optionalText(raw.releaseChannelId);
  if (!releaseChannelId) return null;
  return {
    releaseChannelId,
    postureId: optionalText(raw.postureId),
    decisionMode: optionalText(raw.decisionMode) === "warn" ? "warn" : (optionalText(raw.decisionMode) === "block" ? "block" : null),
    requireApprovedProposal: raw.requireApprovedProposal == null ? null : booleanOrDefault(raw.requireApprovedProposal, true),
    requireFreshPassingVerification: raw.requireFreshPassingVerification == null ? null : booleanOrDefault(raw.requireFreshPassingVerification, true),
    requireDocsFresh: raw.requireDocsFresh == null ? null : booleanOrDefault(raw.requireDocsFresh, true),
    requireNoBlockingDefects: raw.requireNoBlockingDefects == null ? null : booleanOrDefault(raw.requireNoBlockingDefects, true),
    requireNoOpenRegressions: raw.requireNoOpenRegressions == null ? null : booleanOrDefault(raw.requireNoOpenRegressions, true),
    requireLatestPush: raw.requireLatestPush == null ? null : booleanOrDefault(raw.requireLatestPush, true),
    requireBranchUpToDate: raw.requireBranchUpToDate == null ? null : booleanOrDefault(raw.requireBranchUpToDate, true),
    recordDecisionHistory: raw.recordDecisionHistory == null ? null : booleanOrDefault(raw.recordDecisionHistory, true)
  };
}

function authoredPromotionBlock(serverRunner = null) {
  const values = serverRunner?.values;
  const promotion = values?.promotion;
  return promotion && typeof promotion === "object" ? promotion : null;
}

export function resolveRunnerPromotionPolicy({
  serverRunner = null,
  runtimeProfile = null
} = {}) {
  const runnerId = optionalText(serverRunner?.id) ?? null;
  const profile = optionalText(runtimeProfile) ?? null;
  const authored = authoredPromotionBlock(serverRunner);
  const diagnostics = [];
  let source = "synthesized";
  let defaults = normalizeDefaults(RELEASE_CHANNEL_DEFAULTS["releaseChannel:preview"]);
  let releaseChannelOverlays = [];

  if (authored) {
    source = "authored";
    defaults = normalizeDefaults(authored.defaults && typeof authored.defaults === "object" ? authored.defaults : {});
    releaseChannelOverlays = (Array.isArray(authored.releaseChannel) ? authored.releaseChannel : [])
      .map(normalizeReleaseChannelOverlay)
      .filter(Boolean);
  } else {
    diagnostics.push({
      id: `promotionPolicyDiagnostic:${runnerId || "runner"}:${profile || "profile"}:synthesized`,
      severity: "info",
      code: "promotion_policy_synthesized",
      message: "Promotion posture was synthesized because serverRunner.promotion is not authored."
    });
  }

  return {
    source,
    serverRunnerId: runnerId,
    runtimeProfile: profile,
    defaults,
    releaseChannelOverlays,
    diagnostics
  };
}

export function resolvePromotionPosture(policy = null, releaseChannelId = null) {
  const normalizedReleaseChannelId = optionalText(releaseChannelId);
  const channelDefaults = RELEASE_CHANNEL_DEFAULTS[normalizedReleaseChannelId] ?? RELEASE_CHANNEL_DEFAULTS["releaseChannel:preview"];
  const defaults = {
    ...normalizeDefaults(channelDefaults),
    ...(policy?.defaults ?? {})
  };
  const overlay = (policy?.releaseChannelOverlays ?? []).find(row => row.releaseChannelId === normalizedReleaseChannelId) ?? null;
  return {
    id: `promotionPosture:${policy?.serverRunnerId || "runner"}:${policy?.runtimeProfile || "profile"}:${normalizedReleaseChannelId || "releaseChannel"}`,
    serverRunnerId: policy?.serverRunnerId ?? null,
    runtimeProfile: policy?.runtimeProfile ?? null,
    releaseChannelId: normalizedReleaseChannelId,
    postureId: overlay?.postureId ?? defaults.postureId ?? optionalText(normalizedReleaseChannelId)?.replace("releaseChannel:", "") ?? "preview",
    decisionMode: overlay?.decisionMode ?? defaults.decisionMode ?? "block",
    requireApprovedProposal: overlay?.requireApprovedProposal ?? defaults.requireApprovedProposal,
    requireFreshPassingVerification: overlay?.requireFreshPassingVerification ?? defaults.requireFreshPassingVerification,
    requireDocsFresh: overlay?.requireDocsFresh ?? defaults.requireDocsFresh,
    requireNoBlockingDefects: overlay?.requireNoBlockingDefects ?? defaults.requireNoBlockingDefects,
    requireNoOpenRegressions: overlay?.requireNoOpenRegressions ?? defaults.requireNoOpenRegressions,
    requireLatestPush: overlay?.requireLatestPush ?? defaults.requireLatestPush,
    requireBranchUpToDate: overlay?.requireBranchUpToDate ?? defaults.requireBranchUpToDate,
    recordDecisionHistory: overlay?.recordDecisionHistory ?? defaults.recordDecisionHistory,
    policySource: policy?.source ?? "synthesized",
    status: policy?.source === "authored" ? "authored" : "synthesized"
  };
}
