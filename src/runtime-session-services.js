import { randomUUID } from "node:crypto";

export function createRuntimeSessionServices({ sessionStore }) {
  const createSessionForIdentity = identity => {
    const sessionId = randomUUID();
    const session = {
      id: sessionId,
      identity: identity.id,
      actor: identity.actor,
      label: identity.label,
      homeContext: identity.homeContext ?? null,
      perspective: identity.homePerspective ?? null,
      tutorialProgress: {}
    };
    sessionStore.set(sessionId, session);
    return session;
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
    const nextSession = {
      ...requestSession,
      actor: identity.actor,
      label: identity.label,
      homeContext: identity.homeContext ?? null,
      perspective: identity.homePerspective ?? null
    };
    sessionStore.set(nextSession.id, nextSession);
    return nextSession;
  };

  const tutorialProgressFor = (requestSession, tutorialId) => requestSession?.tutorialProgress?.[tutorialId] ?? null;
  const setTutorialProgress = (requestSession, tutorialId, progress) => {
    if (!requestSession?.id) return null;
    requestSession.tutorialProgress = requestSession.tutorialProgress ?? {};
    if (progress == null) delete requestSession.tutorialProgress[tutorialId];
    else requestSession.tutorialProgress[tutorialId] = progress;
    sessionStore.set(requestSession.id, requestSession);
    return requestSession.tutorialProgress[tutorialId] ?? null;
  };

  return {
    createSessionForIdentity,
    sessionResponseShape,
    syncSessionIdentity,
    tutorialProgressFor,
    setTutorialProgress
  };
}
