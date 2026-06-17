import { moduleProjectors } from "./modules.js";

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

function trimString(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function normalizeAuthorityIdentityId(value) {
  if (value && typeof value === "object") return trimString(value.id);
  return trimString(value);
}

export function normalizeAuthorityMode(value) {
  const mode = trimString(value);
  if (mode === "assumed" || mode === "service") return mode;
  return "direct";
}

export function normalizeAuthorityTuple(authority = {}, {
  allowAliases = false
} = {}) {
  const directActor = typeof authority === "string" ? trimString(authority) : "";
  const aliasIdentity = allowAliases ? normalizeAuthorityIdentityId(authority?.identity) : "";
  const aliasActor = allowAliases ? trimString(authority?.actor) : "";
  const authorityMode = normalizeAuthorityMode(authority?.authorityMode);
  let authenticatedIdentity = normalizeAuthorityIdentityId(authority?.authenticatedIdentity) || aliasIdentity;
  let authenticatedActor = trimString(authority?.authenticatedActor) || aliasActor || directActor;
  let effectiveIdentity = normalizeAuthorityIdentityId(authority?.effectiveIdentity) || aliasIdentity;
  let effectiveActor = trimString(authority?.effectiveActor) || aliasActor || directActor;
  if (!effectiveActor && authenticatedActor) effectiveActor = authenticatedActor;
  if (!authenticatedActor && effectiveActor && authorityMode !== "assumed") authenticatedActor = effectiveActor;
  if (!effectiveIdentity && effectiveActor && authenticatedActor && effectiveActor === authenticatedActor && authenticatedIdentity) {
    effectiveIdentity = authenticatedIdentity;
  }
  if (!authenticatedIdentity && authorityMode !== "assumed" && effectiveIdentity && effectiveActor && authenticatedActor && effectiveActor === authenticatedActor) {
    authenticatedIdentity = effectiveIdentity;
  }
  return {
    authenticatedIdentity: authenticatedIdentity || null,
    authenticatedActor: authenticatedActor || null,
    effectiveIdentity: effectiveIdentity || null,
    effectiveActor: effectiveActor || null,
    authorityMode,
    assumptionGrantId: trimString(authority?.assumptionGrantId) || null
  };
}

export function identityForActor(identityIndex, actor) {
  if (!actor) return null;
  return identityIndex?.byActor?.[actor]?.[0] ?? null;
}

export function rolesForIdentity(identityRoleGrantIndex, identityId) {
  if (!identityId) return [];
  return uniqueStrings(identityRoleGrantIndex?.byIdentity?.[identityId] ?? []);
}

export function authProfileForIdentity(identity = null) {
  return {
    displayName: identity?.displayName ?? identity?.label ?? null,
    jobTitle: identity?.jobTitle ?? null,
    initials: identity?.initials ?? null
  };
}

export function identityActorAssumptionGrantFor(identityActorAssumptionGrantIndex, identityId, targetActor) {
  if (!identityId || !targetActor) return null;
  return identityActorAssumptionGrantIndex?.byPair?.[`${String(identityId)}=>${String(targetActor)}`] ?? null;
}

export function identityActorAssumptionGrantHistory(world, {
  identityId = null,
  targetActor = null,
  grantId = null
} = {}) {
  const normalizedIdentityId = trimString(identityId);
  const normalizedTargetActor = trimString(targetActor);
  const normalizedGrantId = trimString(grantId);
  const rowsById = new Map();
  const witnesses = typeof world?.allWitnesses === "function" ? world.allWitnesses() : [];
  for (let index = 0; index < witnesses.length; index += 1) {
    const witness = witnesses[index];
    const process = trimString(witness?.process);
    if (process !== "grantIdentityActorAssumption" && process !== "revokeIdentityActorAssumption") continue;
    const bodyIdentityId = trimString(witness?.body?.identityId);
    const bodyTargetActor = trimString(witness?.body?.targetActor);
    if (!bodyIdentityId || !bodyTargetActor) continue;
    const id = trimString(witness?.body?.id) || `${bodyIdentityId}=>${bodyTargetActor}`;
    if (normalizedGrantId && id !== normalizedGrantId) continue;
    if (normalizedIdentityId && bodyIdentityId !== normalizedIdentityId) continue;
    if (normalizedTargetActor && bodyTargetActor !== normalizedTargetActor) continue;
    const prior = rowsById.get(id) ?? {
      id,
      identityId: bodyIdentityId,
      targetActor: bodyTargetActor,
      active: false,
      status: "revoked",
      grantedWitnessId: null,
      grantedBy: null,
      grantedOrder: null,
      revokedWitnessId: null,
      revokedBy: null,
      revokedOrder: null,
      lastWitnessId: null,
      lastActor: null,
      lastOrder: null
    };
    const next = {
      ...prior,
      id,
      identityId: bodyIdentityId,
      targetActor: bodyTargetActor,
      lastWitnessId: witness.id,
      lastActor: witness.actor ?? null,
      lastOrder: index
    };
    if (process === "grantIdentityActorAssumption") {
      next.active = true;
      next.status = "active";
      next.grantedWitnessId = witness.id;
      next.grantedBy = witness.actor ?? null;
      next.grantedOrder = index;
    } else {
      next.active = false;
      next.status = "revoked";
      next.revokedWitnessId = witness.id;
      next.revokedBy = witness.actor ?? null;
      next.revokedOrder = index;
    }
    rowsById.set(id, next);
  }
  return [...rowsById.values()].sort((left, right) =>
    String(left.identityId).localeCompare(String(right.identityId))
    || String(left.targetActor).localeCompare(String(right.targetActor))
  );
}

export function evaluateFeaturePolicy(policy, { authenticated = false, roles = [] } = {}) {
  if (!policy) {
    return {
      ok: true,
      access: authenticated ? "granted" : "login",
      status: authenticated ? 200 : 401,
      reason: null
    };
  }
  const normalizedRoles = new Set(uniqueStrings(roles));
  const allowedRoles = uniqueStrings(policy.allowedRoles ?? []);
  if (policy.requireAuth === true && !authenticated) {
    return {
      ok: false,
      access: policy.guestBehavior === "allow" ? "granted" : "login",
      status: 401,
      reason: "sign in first"
    };
  }
  const allowedByRole = !allowedRoles.length || allowedRoles.some(roleId => normalizedRoles.has(roleId));
  if (!allowedByRole) {
    return {
      ok: false,
      access: policy.visibilityMode === "hidden" ? "hidden" : "locked",
      status: String(policy.deniedBehavior ?? "403") === "404" ? 404 : 403,
      reason: String(policy.deniedBehavior ?? "403") === "404" ? "not found" : "forbidden"
    };
  }
  return {
    ok: true,
    access: "granted",
    status: 200,
    reason: null
  };
}

export function featureAccessMap(featurePolicyIndex, { authenticated = false, roles = [] } = {}) {
  const out = {};
  for (const policy of featurePolicyIndex?.rows ?? []) {
    out[policy.featureId] = evaluateFeaturePolicy(policy, { authenticated, roles }).access;
  }
  return out;
}

function authorityProfileIdentity({ authenticatedIdentity = null, effectiveIdentity = null } = {}) {
  return effectiveIdentity ?? authenticatedIdentity ?? null;
}

export function authSummaryForAuthority(world, authority = {}) {
  const identityIndex = world.project(moduleProjectors.identityIndex);
  const roleGrantIndex = world.project(moduleProjectors.identityRoleGrantIndex);
  const identityActorAssumptionGrantIndex = world.project(moduleProjectors.identityActorAssumptionGrantIndex);
  const featurePolicyIndex = world.project(moduleProjectors.appFeatureAccessPolicyIndex);
  const normalized = normalizeAuthorityTuple(authority, { allowAliases: true });
  const authenticatedActor = normalized.authenticatedActor;
  const effectiveActor = normalized.effectiveActor;
  const authorityMode = normalized.authorityMode;
  const authenticatedIdentity = normalized.authenticatedIdentity
    ? identityIndex?.byId?.[normalized.authenticatedIdentity] ?? null
    : (authenticatedActor ? identityForActor(identityIndex, authenticatedActor) : null);
  const effectiveIdentity = normalized.effectiveIdentity
    ? identityIndex?.byId?.[normalized.effectiveIdentity] ?? null
    : (effectiveActor ? identityForActor(identityIndex, effectiveActor) : null);
  const roles = effectiveIdentity ? rolesForIdentity(roleGrantIndex, effectiveIdentity.id) : [];
  const authenticated = Boolean(authenticatedActor && effectiveActor);
  const assumptionGrant = authorityMode === "assumed" && authenticatedIdentity && effectiveActor
    ? identityActorAssumptionGrantFor(identityActorAssumptionGrantIndex, authenticatedIdentity.id, effectiveActor)
    : null;
  const profileIdentity = authorityProfileIdentity({
    authenticatedIdentity,
    effectiveIdentity
  });
  return {
    authenticatedIdentity,
    authenticatedActor,
    effectiveIdentity,
    effectiveActor,
    authorityMode,
    assumptionGrantId: normalized.assumptionGrantId ?? assumptionGrant?.id ?? null,
    identity: effectiveIdentity ?? authenticatedIdentity ?? null,
    actor: effectiveActor ?? null,
    roles,
    profile: authProfileForIdentity(profileIdentity),
    featureAccess: featureAccessMap(featurePolicyIndex, {
      authenticated,
      roles
    })
  };
}

export function authSummaryForActor(world, actor) {
  return authSummaryForAuthority(world, { authenticatedActor: actor, effectiveActor: actor, authorityMode: "direct" });
}

export function resolveSessionAuthorityForIdentity(world, identity, { assumeActor = null } = {}) {
  const identityIndex = world.project(moduleProjectors.identityIndex);
  const assumptionGrantIndex = world.project(moduleProjectors.identityActorAssumptionGrantIndex);
  const authenticatedIdentity = identity?.id ? (identityIndex?.byId?.[identity.id] ?? identity) : null;
  const authenticatedActor = String(authenticatedIdentity?.actor ?? "").trim() || null;
  const requestedActor = String(assumeActor ?? "").trim() || null;
  if (!authenticatedIdentity || !authenticatedActor) {
    return {
      ok: false,
      status: 500,
      reason: "identity missing authenticated actor"
    };
  }
  if (!requestedActor || requestedActor === authenticatedActor) {
    const directSummary = authSummaryForAuthority(world, {
      authenticatedIdentity: authenticatedIdentity.id,
      authenticatedActor,
      effectiveActor: authenticatedActor,
      effectiveIdentity: authenticatedIdentity.id,
      authorityMode: "direct",
      assumptionGrantId: null
    });
    return {
      ok: true,
      ...directSummary
    };
  }
  const grant = identityActorAssumptionGrantFor(assumptionGrantIndex, authenticatedIdentity.id, requestedActor);
  if (!grant) {
    return {
      ok: false,
      status: 403,
      reason: "assumption denied",
      authenticatedIdentity,
      authenticatedActor,
      effectiveActor: requestedActor
    };
  }
  const assumedSummary = authSummaryForAuthority(world, {
    authenticatedIdentity: authenticatedIdentity.id,
    authenticatedActor,
    effectiveActor: requestedActor,
    authorityMode: "assumed",
    assumptionGrantId: grant.id
  });
  return {
    ok: true,
    ...assumedSummary
  };
}

export function routeFeaturePolicy(world, route = null) {
  const featureId = typeof route?.params?.auth?.featureId === "string"
    ? route.params.auth.featureId.trim()
    : "";
  if (!featureId) return { featureId: null, policy: null };
  const featurePolicyIndex = world.project(moduleProjectors.appFeatureAccessPolicyIndex);
  return {
    featureId,
    policy: featurePolicyIndex?.byFeatureId?.[featureId] ?? null
  };
}

export function evaluateRouteAccess(world, route = null, actor = null) {
  const summary = authSummaryForAuthority(world, actor);
  const { featureId, policy } = routeFeaturePolicy(world, route);
  if (!featureId) {
    return {
      ok: true,
      actor: summary.actor,
      identity: summary.identity,
      authenticatedIdentity: summary.authenticatedIdentity,
      authenticatedActor: summary.authenticatedActor,
      effectiveIdentity: summary.effectiveIdentity,
      effectiveActor: summary.effectiveActor,
      authorityMode: summary.authorityMode,
      assumptionGrantId: summary.assumptionGrantId,
      profile: summary.profile,
      roles: summary.roles,
      featureAccess: {},
      featureId: null,
      policy: null,
      access: summary.effectiveActor ? "granted" : "login",
      status: 200,
      reason: null
    };
  }
  const decision = evaluateFeaturePolicy(policy, {
    authenticated: Boolean(summary.authenticatedIdentity && summary.effectiveActor),
    roles: summary.roles
  });
  return {
    ...decision,
    actor: summary.actor,
    identity: summary.identity,
    authenticatedIdentity: summary.authenticatedIdentity,
    authenticatedActor: summary.authenticatedActor,
    effectiveIdentity: summary.effectiveIdentity,
    effectiveActor: summary.effectiveActor,
    authorityMode: summary.authorityMode,
    assumptionGrantId: summary.assumptionGrantId,
    profile: summary.profile,
    roles: summary.roles,
    featureAccess: summary.featureAccess,
    featureId,
    policy
  };
}
