import { randomUUID } from "node:crypto";
import {
  normalizeAuthorityTuple
} from "./runtime-authz.js";

function sanitizeFeatureAccessKey(featureId) {
  return String(featureId ?? "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function flattenFeatureAccess(featureAccess = {}) {
  const out = {};
  for (const [featureId, access] of Object.entries(featureAccess ?? {})) {
    const suffix = sanitizeFeatureAccessKey(featureId);
    if (!suffix) continue;
    out[`featureAccess__${suffix}`] = access;
  }
  return out;
}

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function profileShape({
  displayName = null,
  jobTitle = null,
  initials = null
} = {}) {
  return {
    displayName: displayName ?? null,
    jobTitle: jobTitle ?? null,
    initials: initials ?? null
  };
}

function labelForPrincipal(principal = null, fallbackActor = null) {
  return principal?.label ?? (fallbackActor ? String(fallbackActor) : null);
}

function normalizeSessionAuthority(session = {}) {
  return normalizeAuthorityTuple(session, { allowAliases: true });
}

export function createRuntimeSessionServices({ sessionStore }) {
  const attachTutorialProgressAlias = (requestSession, guidanceProgress) => {
    if (!requestSession || typeof requestSession !== "object") return requestSession ?? null;
    requestSession.guidanceProgress = guidanceProgress;
    Object.defineProperty(requestSession, "tutorialProgress", {
      configurable: true,
      enumerable: false,
      get() {
        return requestSession.guidanceProgress;
      },
      set(value) {
        requestSession.guidanceProgress = value;
      }
    });
    return requestSession;
  };

  const syncGuidanceProgressAlias = requestSession => {
    if (!requestSession || typeof requestSession !== "object") return requestSession ?? null;
    const guidanceProgress = requestSession.guidanceProgress && typeof requestSession.guidanceProgress === "object"
      ? requestSession.guidanceProgress
      : (requestSession.tutorialProgress && typeof requestSession.tutorialProgress === "object"
          ? requestSession.tutorialProgress
          : {});
    const normalizedAuthority = normalizeSessionAuthority(requestSession);
    const normalizedSession = attachTutorialProgressAlias({
      ...requestSession,
      ...normalizedAuthority,
      identity: normalizedAuthority.effectiveIdentity ?? null,
      actor: normalizedAuthority.effectiveActor ?? null
    }, guidanceProgress);
    return normalizedSession;
  };

  const createSessionForIdentity = (identity, authority = {}) => {
    const sessionId = randomUUID();
    const guidanceProgress = {};
    const authenticatedIdentity = trimString(identity?.id) || null;
    const authenticatedActor = trimString(identity?.actor) || null;
    const hasExplicitEffectiveIdentity = authority.effectiveIdentity !== undefined && authority.effectiveIdentity !== null && authority.effectiveIdentity !== "";
    const normalizedAuthority = normalizeAuthorityTuple({
      authenticatedIdentity,
      authenticatedActor,
      effectiveIdentity: authority.effectiveIdentity?.id ?? authority.effectiveIdentity ?? null,
      effectiveActor: authority.effectiveActor ?? null,
      authorityMode: authority.authorityMode,
      assumptionGrantId: authority.assumptionGrantId
    });
    const effectivePrincipal = authority.effectiveIdentity && typeof authority.effectiveIdentity === "object"
      ? authority.effectiveIdentity
      : (!hasExplicitEffectiveIdentity && normalizedAuthority.effectiveActor === normalizedAuthority.authenticatedActor ? identity : null);
    const effectiveIdentity = normalizedAuthority.effectiveIdentity
      ?? (!hasExplicitEffectiveIdentity && normalizedAuthority.effectiveActor === normalizedAuthority.authenticatedActor
        ? authenticatedIdentity
        : null);
    const session = {
      id: sessionId,
      authorityMode: normalizedAuthority.authorityMode,
      authenticatedIdentity: normalizedAuthority.authenticatedIdentity,
      authenticatedActor: normalizedAuthority.authenticatedActor,
      effectiveIdentity: effectiveIdentity || null,
      effectiveActor: normalizedAuthority.effectiveActor,
      assumptionGrantId: normalizedAuthority.assumptionGrantId,
      identity: effectiveIdentity || null,
      actor: normalizedAuthority.effectiveActor || null,
      label: labelForPrincipal(effectivePrincipal, normalizedAuthority.effectiveActor),
      displayName: effectivePrincipal?.displayName ?? null,
      jobTitle: effectivePrincipal?.jobTitle ?? null,
      initials: effectivePrincipal?.initials ?? null,
      homeContext: effectivePrincipal?.homeContext ?? identity?.homeContext ?? null,
      perspective: effectivePrincipal?.homePerspective ?? identity?.homePerspective ?? null,
      roles: Array.isArray(authority.roles) ? [...authority.roles] : (Array.isArray(identity.roles) ? [...identity.roles] : []),
      featureAccess: authority.featureAccess && typeof authority.featureAccess === "object"
        ? { ...authority.featureAccess }
        : (identity.featureAccess && typeof identity.featureAccess === "object"
            ? { ...identity.featureAccess }
            : {}),
      authenticatedProfile: profileShape({
        displayName: identity?.displayName ?? null,
        jobTitle: identity?.jobTitle ?? null,
        initials: identity?.initials ?? null
      }),
      effectiveProfile: profileShape({
        displayName: effectivePrincipal?.displayName ?? null,
        jobTitle: effectivePrincipal?.jobTitle ?? null,
        initials: effectivePrincipal?.initials ?? null
      }),
      authenticatedLabel: labelForPrincipal(identity, normalizedAuthority.authenticatedActor),
      effectiveLabel: labelForPrincipal(effectivePrincipal, normalizedAuthority.effectiveActor),
      authenticatedHomeContext: identity?.homeContext ?? null,
      authenticatedPerspective: identity?.homePerspective ?? null,
      effectiveHomeContext: effectivePrincipal?.homeContext ?? identity?.homeContext ?? null,
      effectivePerspective: effectivePrincipal?.homePerspective ?? identity?.homePerspective ?? null,
      guidanceProgress
    };
    const syncedSession = attachTutorialProgressAlias(syncGuidanceProgressAlias(session), guidanceProgress);
    sessionStore.set(sessionId, syncedSession);
    return syncedSession;
  };

  const sessionResponseShape = session => {
    const normalized = syncGuidanceProgressAlias(session);
    return {
      authenticated: true,
      identity: normalized.identity ?? null,
      actor: normalized.actor ?? null,
      authenticatedIdentity: normalized.authenticatedIdentity ?? null,
      authenticatedActor: normalized.authenticatedActor ?? null,
      effectiveIdentity: normalized.effectiveIdentity ?? null,
      effectiveActor: normalized.effectiveActor ?? null,
      authorityMode: normalized.authorityMode ?? "direct",
      assumptionGrantId: normalized.assumptionGrantId ?? null,
      label: normalized.label ?? null,
      authenticatedLabel: normalized.authenticatedLabel ?? null,
      effectiveLabel: normalized.effectiveLabel ?? null,
      displayName: normalized.displayName ?? null,
      jobTitle: normalized.jobTitle ?? null,
      initials: normalized.initials ?? null,
      profile: profileShape({
        displayName: normalized.displayName ?? null,
        jobTitle: normalized.jobTitle ?? null,
        initials: normalized.initials ?? null
      }),
      authenticatedProfile: profileShape(normalized.authenticatedProfile ?? {}),
      effectiveProfile: profileShape(normalized.effectiveProfile ?? {}),
      roles: Array.isArray(normalized.roles) ? [...normalized.roles] : [],
      featureAccess: normalized.featureAccess && typeof normalized.featureAccess === "object"
        ? { ...normalized.featureAccess }
        : {},
      ...flattenFeatureAccess(normalized.featureAccess),
      homeContext: normalized.homeContext ?? null,
      perspective: normalized.perspective ?? null,
      authenticatedHomeContext: normalized.authenticatedHomeContext ?? null,
      authenticatedPerspective: normalized.authenticatedPerspective ?? null,
      effectiveHomeContext: normalized.effectiveHomeContext ?? null,
      effectivePerspective: normalized.effectivePerspective ?? null
    };
  };

  const syncSessionIdentity = (requestSession, identity) => {
    if (!requestSession?.id || !identity) return requestSession ?? null;
    const normalized = syncGuidanceProgressAlias(requestSession);
    const nextSession = syncGuidanceProgressAlias({ ...normalized });
    if (normalized.authenticatedIdentity === identity.id) {
      nextSession.authenticatedActor = identity.actor;
      nextSession.authenticatedProfile = profileShape({
        displayName: identity.displayName ?? null,
        jobTitle: identity.jobTitle ?? null,
        initials: identity.initials ?? null
      });
      nextSession.authenticatedLabel = identity.label ?? nextSession.authenticatedLabel ?? null;
      nextSession.authenticatedHomeContext = identity.homeContext ?? null;
      nextSession.authenticatedPerspective = identity.homePerspective ?? null;
      if (normalized.authorityMode !== "assumed") {
        nextSession.actor = identity.actor;
        nextSession.effectiveActor = identity.actor;
      }
    }
    if (normalized.effectiveIdentity === identity.id || (!normalized.effectiveIdentity && normalized.effectiveActor === identity.actor)) {
      nextSession.identity = identity.id;
      nextSession.effectiveIdentity = identity.id;
      nextSession.actor = normalized.effectiveActor ?? identity.actor;
      nextSession.label = identity.label;
      nextSession.displayName = identity.displayName ?? null;
      nextSession.jobTitle = identity.jobTitle ?? null;
      nextSession.initials = identity.initials ?? null;
      nextSession.homeContext = identity.homeContext ?? null;
      nextSession.perspective = identity.homePerspective ?? null;
      nextSession.effectiveProfile = profileShape({
        displayName: identity.displayName ?? null,
        jobTitle: identity.jobTitle ?? null,
        initials: identity.initials ?? null
      });
      nextSession.effectiveLabel = identity.label ?? nextSession.effectiveLabel ?? null;
      nextSession.effectiveHomeContext = identity.homeContext ?? null;
      nextSession.effectivePerspective = identity.homePerspective ?? null;
    }
    sessionStore.set(nextSession.id, nextSession);
    return nextSession;
  };

  const syncSessionAuthSummary = (requestSession, summary = {}) => {
    if (!requestSession?.id) return requestSession ?? null;
    const normalized = syncGuidanceProgressAlias(requestSession);
    const normalizedSummary = normalizeAuthorityTuple({
      authenticatedIdentity: summary.authenticatedIdentity?.id ?? summary.authenticatedIdentity ?? null,
      authenticatedActor: summary.authenticatedActor ?? null,
      effectiveIdentity: summary.effectiveIdentity?.id ?? summary.effectiveIdentity ?? null,
      effectiveActor: summary.effectiveActor ?? null,
      authorityMode: summary.authorityMode ?? normalized.authorityMode ?? "direct",
      assumptionGrantId: summary.assumptionGrantId ?? normalized.assumptionGrantId ?? null
    });
    const nextSession = syncGuidanceProgressAlias({
      ...normalized,
      actor: normalizedSummary.effectiveActor ?? normalized.actor ?? null,
      identity: normalizedSummary.effectiveIdentity ?? normalized.identity ?? null,
      authenticatedIdentity: normalizedSummary.authenticatedIdentity ?? normalized.authenticatedIdentity ?? null,
      authenticatedActor: normalizedSummary.authenticatedActor ?? normalized.authenticatedActor ?? null,
      effectiveIdentity: normalizedSummary.effectiveIdentity ?? normalized.effectiveIdentity ?? null,
      effectiveActor: normalizedSummary.effectiveActor ?? normalized.effectiveActor ?? null,
      authorityMode: normalizedSummary.authorityMode,
      assumptionGrantId: normalizedSummary.assumptionGrantId,
      label: summary.effectiveIdentity?.label ?? normalized.label ?? null,
      displayName: summary.profile?.displayName ?? requestSession.displayName ?? null,
      jobTitle: summary.profile?.jobTitle ?? requestSession.jobTitle ?? null,
      initials: summary.profile?.initials ?? requestSession.initials ?? null,
      roles: Array.isArray(summary.roles) ? [...summary.roles] : (Array.isArray(normalized.roles) ? [...normalized.roles] : []),
      featureAccess: summary.featureAccess && typeof summary.featureAccess === "object"
        ? { ...summary.featureAccess }
        : (normalized.featureAccess && typeof normalized.featureAccess === "object" ? { ...normalized.featureAccess } : {}),
      profile: undefined,
      effectiveProfile: profileShape({
        displayName: summary.profile?.displayName ?? normalized.displayName ?? null,
        jobTitle: summary.profile?.jobTitle ?? normalized.jobTitle ?? null,
        initials: summary.profile?.initials ?? normalized.initials ?? null
      }),
      effectiveLabel: summary.effectiveIdentity?.label ?? normalized.effectiveLabel ?? normalized.label ?? null
    });
    sessionStore.set(nextSession.id, nextSession);
    return nextSession;
  };

  const guidanceProgressFor = (requestSession, guidanceId) => {
    const session = syncGuidanceProgressAlias(requestSession);
    return session?.guidanceProgress?.[guidanceId] ?? null;
  };
  const setGuidanceProgress = (requestSession, guidanceId, progress) => {
    if (!requestSession?.id) return null;
    const session = syncGuidanceProgressAlias(requestSession);
    if (progress == null) delete session.guidanceProgress[guidanceId];
    else session.guidanceProgress[guidanceId] = progress;
    sessionStore.set(session.id, session);
    return session.guidanceProgress[guidanceId] ?? null;
  };

  return {
    createSessionForIdentity,
    sessionResponseShape,
    syncSessionIdentity,
    syncSessionAuthSummary,
    guidanceProgressFor,
    setGuidanceProgress,
    tutorialProgressFor: guidanceProgressFor,
    setTutorialProgress: setGuidanceProgress
  };
}
