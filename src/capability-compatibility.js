const RUNTIME_PROFILE_ORDER = Object.freeze(["minimal", "authoring", "full"]);

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).map(value => value.trim()).filter(Boolean))];
}

function normalizeDependencyConstraints(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const requiresInstalledCapabilities = uniqueStrings(
    raw.requiresInstalledCapabilities ?? raw.requiresCapabilities
  );
  const targetKinds = uniqueStrings(raw.targetKinds);
  if (!requiresInstalledCapabilities.length && !targetKinds.length) return null;
  return {
    requiresInstalledCapabilities,
    targetKinds
  };
}

export function normalizeCapabilityCompatibility(raw = null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const minimumRuntimeProfile = typeof raw.minimumRuntimeProfile === "string" && raw.minimumRuntimeProfile.trim()
    ? raw.minimumRuntimeProfile.trim()
    : null;
  const authorityAssumptions = uniqueStrings(raw.authorityAssumptions);
  const dependencyConstraints = normalizeDependencyConstraints(raw.dependencyConstraints);
  const migrationNotes = uniqueStrings(raw.migrationNotes);
  if (!minimumRuntimeProfile && !authorityAssumptions.length && !dependencyConstraints && !migrationNotes.length) {
    return null;
  }
  return {
    minimumRuntimeProfile,
    authorityAssumptions,
    dependencyConstraints,
    migrationNotes
  };
}

function runtimeProfileRank(profile) {
  const normalized = typeof profile === "string" ? profile.trim() : "";
  const index = RUNTIME_PROFILE_ORDER.indexOf(normalized);
  return index >= 0 ? index : null;
}

function reason(code, details = {}) {
  return { code, ...details };
}

export function evaluateCapabilityCompatibility(capability = {}, facts = {}) {
  const compatibility = normalizeCapabilityCompatibility(capability.compatibility);
  const placements = uniqueStrings(capability.placement);
  const dependsOn = uniqueStrings(capability.dependsOn);
  const targetKind = typeof facts.targetKind === "string" && facts.targetKind.trim()
    ? facts.targetKind.trim()
    : null;
  const installedCapabilities = uniqueStrings(facts.installedCapabilities);
  const grantedAuthorities = uniqueStrings(facts.grantedAuthorities);
  const reasons = [];
  const warnings = [];

  if (targetKind && placements.length && !placements.includes(targetKind)) {
    reasons.push(reason("target-kind-incompatible", {
      targetKind,
      allowedTargetKinds: placements
    }));
  }

  if (facts.targetExists === false) {
    reasons.push(reason("target-missing", {
      target: facts.target ?? null,
      targetKind
    }));
  }

  if (facts.targetValidation && facts.targetValidation.ok === false && facts.targetExists !== false) {
    reasons.push(reason("target-invalid", {
      target: facts.target ?? null,
      targetKind,
      detail: facts.targetValidation.reason ?? "target validation failed"
    }));
  }

  const requiredCapabilities = uniqueStrings([
    ...dependsOn,
    ...(compatibility?.dependencyConstraints?.requiresInstalledCapabilities ?? [])
  ]);
  const missingDependencies = requiredCapabilities.filter(id => !installedCapabilities.includes(id));
  if (missingDependencies.length) {
    reasons.push(reason("dependency-missing", {
      target: facts.target ?? null,
      targetKind,
      missingDependencies
    }));
  }

  const targetKindConstraints = compatibility?.dependencyConstraints?.targetKinds ?? [];
  if (targetKind && targetKindConstraints.length && !targetKindConstraints.includes(targetKind)) {
    reasons.push(reason("compatibility-target-kind-incompatible", {
      targetKind,
      allowedTargetKinds: targetKindConstraints
    }));
  }

  if (compatibility?.minimumRuntimeProfile) {
    if (facts.activeRuntimeProfile) {
      const actual = runtimeProfileRank(facts.activeRuntimeProfile);
      const minimum = runtimeProfileRank(compatibility.minimumRuntimeProfile);
      if (actual !== null && minimum !== null && actual < minimum) {
        reasons.push(reason("runtime-profile-incompatible", {
          activeRuntimeProfile: facts.activeRuntimeProfile,
          minimumRuntimeProfile: compatibility.minimumRuntimeProfile
        }));
      }
    } else {
      warnings.push(reason("runtime-profile-unverified", {
        minimumRuntimeProfile: compatibility.minimumRuntimeProfile
      }));
    }
  }

  if (compatibility?.authorityAssumptions?.length) {
    if (grantedAuthorities.length) {
      const missingAuthorityAssumptions = compatibility.authorityAssumptions.filter(value => !grantedAuthorities.includes(value));
      if (missingAuthorityAssumptions.length) {
        reasons.push(reason("authority-assumptions-unmet", {
          missingAuthorityAssumptions
        }));
      }
    } else {
      warnings.push(reason("authority-assumptions-unverified", {
        authorityAssumptions: compatibility.authorityAssumptions
      }));
    }
  }

  const incompatibleCodes = new Set([
    "target-kind-incompatible",
    "compatibility-target-kind-incompatible",
    "runtime-profile-incompatible"
  ]);
  const status = reasons.some(entry => incompatibleCodes.has(entry.code))
    ? "incompatible"
    : (reasons.length ? "blocked" : "compatible");

  return {
    capability: capability.id ?? null,
    target: facts.target ?? null,
    targetKind,
    compatibility,
    status,
    compatible: reasons.length === 0,
    reasons,
    warnings,
    migrationNotes: [...(compatibility?.migrationNotes ?? [])]
  };
}
