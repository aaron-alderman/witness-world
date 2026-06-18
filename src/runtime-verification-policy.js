const DEFAULT_BASELINE_SCOPE = "gate+environment+runtimeProfile";

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function integerOrDefault(value, fallback, { minimum = 0 } = {}) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < minimum) return fallback;
  return numeric;
}

function booleanOrDefault(value, fallback) {
  if (value === true || value === false) return value;
  const normalized = optionalText(value)?.toLowerCase() ?? "";
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeDefaults(raw = {}) {
  return {
    startup: booleanOrDefault(raw.startup, true),
    watch: booleanOrDefault(raw.watch, true),
    onChangeSet: booleanOrDefault(raw.onChangeSet, true),
    priority: integerOrDefault(raw.priority, 100),
    maxConcurrency: integerOrDefault(raw.maxConcurrency, 1, { minimum: 1 }),
    cpuBudget: integerOrDefault(raw.cpuBudget, 1, { minimum: 1 }),
    regressionMinDeltaMs: integerOrDefault(raw.regressionMinDeltaMs, 500),
    regressionMinDeltaPct: integerOrDefault(raw.regressionMinDeltaPct, 25),
    baselineScope: optionalText(raw.baselineScope) ?? DEFAULT_BASELINE_SCOPE
  };
}

function normalizeGateOverlay(raw = {}) {
  const gateId = optionalText(raw.gateId);
  if (!gateId) return null;
  const normalized = {
    gateId,
    enabled: booleanOrDefault(raw.enabled, true),
    startup: booleanOrDefault(raw.startup, true),
    watch: booleanOrDefault(raw.watch, true),
    onChangeSet: booleanOrDefault(raw.onChangeSet, true),
    priority: integerOrDefault(raw.priority, 100),
    executionClass: optionalText(raw.executionClass),
    exclusive: booleanOrDefault(raw.exclusive, false),
    requiresCleanWorkspace: booleanOrDefault(raw.requiresCleanWorkspace, false),
    timeoutMs: raw.timeoutMs == null ? null : integerOrDefault(raw.timeoutMs, null)
  };
  return normalized;
}

function normalizeOverride(raw = {}) {
  const runtimeProfile = optionalText(raw.runtimeProfile);
  if (!runtimeProfile) return null;
  return {
    runtimeProfile,
    defaults: normalizeDefaults(raw.defaults && typeof raw.defaults === "object" ? raw.defaults : {})
  };
}

function legacyRuntimeConfigInputs(runtimeConfig = {}) {
  const platform = runtimeConfig?.platform;
  const testMonitor = platform && typeof platform === "object" ? platform.testMonitor : null;
  if (!testMonitor || typeof testMonitor !== "object") {
    return {
      hasLegacyKeys: false,
      enabled: true,
      watchFs: true,
      watchDebounceMs: 150,
      maxAutoRunsPerCycle: 6
    };
  }
  return {
    hasLegacyKeys: Object.keys(testMonitor).length > 0,
    enabled: booleanOrDefault(testMonitor.enabled, true),
    watchFs: booleanOrDefault(testMonitor.watchFs, true),
    watchDebounceMs: integerOrDefault(testMonitor.watchDebounceMs, 150),
    maxAutoRunsPerCycle: integerOrDefault(testMonitor.maxAutoRunsPerCycle, 6, { minimum: 1 })
  };
}

function authoredVerificationBlock(serverRunner = null) {
  const values = serverRunner?.values;
  const verification = values?.verification;
  return verification && typeof verification === "object" ? verification : null;
}

export function resolveRunnerVerificationPolicy({
  serverRunner = null,
  runtimeProfile = null,
  runtimeConfig = {}
} = {}) {
  const runnerId = optionalText(serverRunner?.id) ?? null;
  const profile = optionalText(runtimeProfile) ?? null;
  const authored = authoredVerificationBlock(serverRunner);
  const legacy = legacyRuntimeConfigInputs(runtimeConfig);
  const diagnostics = [];
  let enabled = true;
  let defaults = normalizeDefaults();
  let gateOverlays = [];
  let source = "synthesized";

  if (authored) {
    source = "authored";
    enabled = booleanOrDefault(authored.enabled, true);
    defaults = normalizeDefaults(authored.defaults && typeof authored.defaults === "object" ? authored.defaults : {});
    gateOverlays = (Array.isArray(authored.gate) ? authored.gate : [])
      .map(normalizeGateOverlay)
      .filter(Boolean);
    const override = (Array.isArray(authored.override) ? authored.override : [])
      .map(normalizeOverride)
      .find(row => row?.runtimeProfile === profile);
    if (override) defaults = { ...defaults, ...override.defaults };
  } else {
    enabled = legacy.enabled;
    defaults = {
      ...normalizeDefaults(),
      startup: true,
      watch: true,
      onChangeSet: true,
      maxConcurrency: 1,
      cpuBudget: 1
    };
    diagnostics.push({
      id: `verificationPolicyDiagnostic:${runnerId || "runner"}:${profile || "profile"}:synthesized`,
      severity: "info",
      code: "verification_policy_synthesized",
      message: "Verification policy was synthesized because serverRunner.verification is not authored."
    });
  }

  if (legacy.hasLegacyKeys) {
    diagnostics.push({
      id: `verificationPolicyDiagnostic:${runnerId || "runner"}:${profile || "profile"}:legacy-runtime-config`,
      severity: "warning",
      code: "legacy_test_monitor_runtime_config",
      message: "Legacy platform.testMonitor.* runtimeConfig keys were detected. Author serverRunner.verification in app.wtoml instead."
    });
  }

  return {
    enabled,
    source,
    serverRunnerId: runnerId,
    runtimeProfile: profile,
    defaults,
    gateOverlays,
    compatibility: {
      watchFs: legacy.watchFs,
      watchDebounceMs: legacy.watchDebounceMs,
      maxAutoRunsPerCycle: legacy.maxAutoRunsPerCycle,
      legacyRuntimeConfigPresent: legacy.hasLegacyKeys
    },
    diagnostics
  };
}

function inferExecutionClass(gate = {}) {
  const environment = optionalText(gate.environment);
  const protectedObjects = Array.isArray(gate.protectedObjects) ? gate.protectedObjects.map(String) : [];
  if (protectedObjects.includes("testEnvironment:platform-candidate-snapshot")) return "candidate_snapshot";
  if (environment === "local-browser") return "browser_session";
  return "child_process";
}

export function resolveVerificationGatePolicy(policy = null, gate = null) {
  const gateId = optionalText(gate?.id);
  if (!gateId) return null;
  const defaults = policy?.defaults ?? normalizeDefaults();
  const overlay = (policy?.gateOverlays ?? []).find(row => row.gateId === gateId) ?? null;
  const executionClass = overlay?.executionClass ?? inferExecutionClass(gate);
  const effective = {
    id: `verificationPolicy:${policy?.serverRunnerId || "runner"}:${policy?.runtimeProfile || "profile"}:${gateId}`,
    serverRunnerId: policy?.serverRunnerId ?? null,
    runtimeProfile: policy?.runtimeProfile ?? null,
    gateId,
    source: policy?.source ?? "synthesized",
    enabled: policy?.enabled !== false && (overlay?.enabled ?? true),
    startup: overlay?.startup ?? defaults.startup,
    watch: overlay?.watch ?? defaults.watch,
    onChangeSet: overlay?.onChangeSet ?? defaults.onChangeSet,
    priority: overlay?.priority ?? defaults.priority,
    maxConcurrency: defaults.maxConcurrency,
    cpuBudget: defaults.cpuBudget,
    regressionMinDeltaMs: defaults.regressionMinDeltaMs,
    regressionMinDeltaPct: defaults.regressionMinDeltaPct,
    baselineScope: defaults.baselineScope,
    executionClass,
    exclusive: overlay?.exclusive ?? false,
    requiresCleanWorkspace: overlay?.requiresCleanWorkspace ?? false,
    timeoutMs: overlay?.timeoutMs ?? (gate?.timeoutMs ?? null),
    diagnostics: []
  };
  if (executionClass === "in_process" && optionalText(gate?.command)) {
    effective.enabled = false;
    effective.diagnostics.push({
      id: `${effective.id}:unsupported-in-process`,
      severity: "error",
      code: "unsupported_in_process_shell_gate",
      gateId,
      message: "Shell-command-discovered gates cannot use executionClass=in_process in this tranche."
    });
  }
  return effective;
}
