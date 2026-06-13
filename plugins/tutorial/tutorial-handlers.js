import { tutorialDefinition, normalizeTutorialProgress } from "./tutorials.js";

export function createTutorialBundleHandlers({
  sendJson,
  readJson,
  tutorialProgressFor,
  setTutorialProgress
}) {
  return {
    "tutorial.progress.read": async ({ res, params, requestSession }) => {
      const tutorialId = params.tutorialId || "";
      const definition = tutorialDefinition(tutorialId);
      const stored = tutorialProgressFor(requestSession, tutorialId);
      sendJson(res, 200, { tutorialId, progress: definition ? normalizeTutorialProgress(definition, stored) : stored });
    },

    "tutorial.progress.write": async ({ req, res, params, requestSession }) => {
      const tutorialId = params.tutorialId || "";
      if (!requestSession?.id) {
        sendJson(res, 200, { tutorialId, progress: null, localOnly: true });
        return;
      }
      const definition = tutorialDefinition(tutorialId);
      if (!definition) {
        sendJson(res, 404, { error: "tutorial not found", tutorialId });
        return;
      }
      const body = await readJson(req);
      const progress = body && typeof body === "object" ? normalizeTutorialProgress(definition, { tutorialId, ...body }) : null;
      if (progress?.stepId && !definition.steps.some(step => step.id === progress.stepId)) {
        sendJson(res, 400, { error: "unknown tutorial step", tutorialId, stepId: progress.stepId });
        return;
      }
      setTutorialProgress(requestSession, tutorialId, progress);
      sendJson(res, 200, { tutorialId, progress: tutorialProgressFor(requestSession, tutorialId) });
    },

    "tutorial.progress.delete": async ({ res, params, requestSession }) => {
      const tutorialId = params.tutorialId || "";
      if (!requestSession?.id) {
        sendJson(res, 200, { tutorialId, ok: true, localOnly: true });
        return;
      }
      setTutorialProgress(requestSession, tutorialId, null);
      sendJson(res, 200, { tutorialId, ok: true });
    }
  };
}
