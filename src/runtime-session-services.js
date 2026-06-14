import { randomUUID } from "node:crypto";

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
    return attachTutorialProgressAlias(requestSession, guidanceProgress);
  };

  const createSessionForIdentity = identity => {
    const sessionId = randomUUID();
    const guidanceProgress = {};
    const session = {
      id: sessionId,
      identity: identity.id,
      actor: identity.actor,
      label: identity.label,
      homeContext: identity.homeContext ?? null,
      perspective: identity.homePerspective ?? null,
      guidanceProgress
    };
    const syncedSession = attachTutorialProgressAlias(session, guidanceProgress);
    sessionStore.set(sessionId, syncedSession);
    return syncedSession;
  };

  const sessionResponseShape = session => ({
    authenticated: true,
    identity: session.identity,
    actor: session.actor,
    label: session.label,
    homeContext: session.homeContext ?? null,
    perspective: session.perspective ?? null
  });

  const syncSessionIdentity = (requestSession, identity) => {
    if (!requestSession?.id || !identity || requestSession.identity !== identity.id) return requestSession ?? null;
    const nextSession = syncGuidanceProgressAlias({
      ...requestSession,
      actor: identity.actor,
      label: identity.label,
      homeContext: identity.homeContext ?? null,
      perspective: identity.homePerspective ?? null
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
    guidanceProgressFor,
    setGuidanceProgress,
    tutorialProgressFor: guidanceProgressFor,
    setTutorialProgress: setGuidanceProgress
  };
}
