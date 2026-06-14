import { normalizeGuidanceProgress } from "./runtime-guidance-model.js";

function normalizeGuidanceDefinitionEntry(entry = {}, providerId = "guidanceDefinitions") {
  const id = typeof entry?.id === "string" ? entry.id.trim() : "";
  if (!id) {
    throw new Error(`guidance definition provider ${providerId} must expose id`);
  }
  const definition = entry?.definition && typeof entry.definition === "object"
    ? entry.definition
    : entry;
  return {
    id,
    definition,
    title: typeof entry?.title === "string" && entry.title.trim() ? entry.title.trim() : (definition?.title ?? id),
    defaultForBootstrap: entry?.defaultForBootstrap === true
  };
}

function normalizeStarterBlueprintEntry(entry = {}, providerId = "starterBlueprints") {
  const id = typeof entry?.id === "string" ? entry.id.trim() : "";
  if (!id) {
    throw new Error(`starter blueprint provider ${providerId} must expose id`);
  }
  const blueprint = entry?.blueprint && typeof entry.blueprint === "object"
    ? entry.blueprint
    : entry;
  return {
    id,
    blueprint,
    title: typeof entry?.title === "string" && entry.title.trim() ? entry.title.trim() : id,
    defaultForBootstrap: entry?.defaultForBootstrap === true
  };
}

export function guidanceDefinitions(runtimeContributions = null) {
  return Array.isArray(runtimeContributions?.guidanceDefinitions)
    ? runtimeContributions.guidanceDefinitions
    : [];
}

export function guidanceDefinitionById(runtimeContributions = null, guidanceId = "") {
  const id = typeof guidanceId === "string" ? guidanceId.trim() : "";
  if (!id) return null;
  if (runtimeContributions?.guidanceDefinitionIndex instanceof Map) {
    return runtimeContributions.guidanceDefinitionIndex.get(id) ?? null;
  }
  return guidanceDefinitions(runtimeContributions).find(entry => entry.id === id) ?? null;
}

export function starterBlueprints(runtimeContributions = null) {
  return Array.isArray(runtimeContributions?.starterBlueprints)
    ? runtimeContributions.starterBlueprints
    : [];
}

export function starterBlueprintById(runtimeContributions = null, blueprintId = "") {
  const id = typeof blueprintId === "string" ? blueprintId.trim() : "";
  if (!id) return null;
  if (runtimeContributions?.starterBlueprintIndex instanceof Map) {
    return runtimeContributions.starterBlueprintIndex.get(id) ?? null;
  }
  return starterBlueprints(runtimeContributions).find(entry => entry.id === id) ?? null;
}

export function preferredBootstrapGuidance(runtimeContributions = null) {
  return guidanceDefinitions(runtimeContributions).find(entry => entry.defaultForBootstrap)
    ?? guidanceDefinitionById(runtimeContributions, "todo-from-scratch")
    ?? guidanceDefinitions(runtimeContributions)[0]
    ?? null;
}

export function preferredBootstrapStarter(runtimeContributions = null) {
  return starterBlueprints(runtimeContributions).find(entry => entry.defaultForBootstrap)
    ?? starterBlueprintById(runtimeContributions, "todo-starter")
    ?? starterBlueprints(runtimeContributions)[0]
    ?? null;
}

export function guidanceConfigForSession({
  requestSession,
  tutorialProgressFor,
  guidanceProgressFor,
  runtimeContributions = null,
  guidanceId = null,
  surface = null
} = {}) {
  const readProgress = guidanceProgressFor ?? tutorialProgressFor ?? (() => null);
  const entry = guidanceId
    ? guidanceDefinitionById(runtimeContributions, guidanceId)
    : preferredBootstrapGuidance(runtimeContributions);
  if (!entry?.definition) return null;
  if (!readProgress(requestSession, entry.id)) return null;
  return {
    id: entry.id,
    title: entry.title,
    definition: entry.definition,
    surfacePage: surface?.page ?? null,
    surfaceContext: surface?.context ?? null,
    surfaceRouteId: surface?.routeId ?? null,
    surfaceRootWidgetId: surface?.rootWidgetId ?? null,
    surfaceProgramId: surface?.frontendProgramId ?? null
  };
}

export const appGuidanceConfigForSession = guidanceConfigForSession;
export const appTutorialConfigForSession = guidanceConfigForSession;

function progressIdFromParams(params = {}) {
  return typeof params?.guidanceId === "string" && params.guidanceId.trim()
    ? params.guidanceId.trim()
    : (typeof params?.tutorialId === "string" ? params.tutorialId.trim() : "");
}

export function createGuidanceBundleHandlers({
  sendJson,
  readJson,
  tutorialProgressFor,
  setTutorialProgress,
  guidanceProgressFor,
  setGuidanceProgress,
  runtimeContributions = null
} = {}) {
  const readProgress = guidanceProgressFor ?? tutorialProgressFor ?? (() => null);
  const writeProgress = setGuidanceProgress ?? setTutorialProgress ?? (() => null);
  return {
    "guidance.progress.read": async ({ res, params, requestSession }) => {
      const guidanceId = progressIdFromParams(params);
      const entry = guidanceDefinitionById(runtimeContributions, guidanceId);
      if (!entry?.definition) {
        sendJson(res, 404, { error: "guidance not found", guidanceId });
        return;
      }
      const stored = readProgress(requestSession, guidanceId);
      sendJson(res, 200, {
        guidanceId,
        tutorialId: guidanceId,
        progress: normalizeGuidanceProgress(entry.definition, stored)
      });
    },

    "guidance.progress.write": async ({ req, res, params, requestSession }) => {
      const guidanceId = progressIdFromParams(params);
      const entry = guidanceDefinitionById(runtimeContributions, guidanceId);
      if (!entry?.definition) {
        sendJson(res, 404, { error: "guidance not found", guidanceId });
        return;
      }
      if (!requestSession?.id) {
        sendJson(res, 200, { guidanceId, tutorialId: guidanceId, progress: null, localOnly: true });
        return;
      }
      const body = await readJson(req);
      const progress = body && typeof body === "object"
        ? normalizeGuidanceProgress(entry.definition, { tutorialId: guidanceId, guidanceId, ...body })
        : null;
      if (progress?.stepId && !entry.definition.steps.some(step => step.id === progress.stepId)) {
        sendJson(res, 400, { error: "unknown guidance step", guidanceId, stepId: progress.stepId });
        return;
      }
      writeProgress(requestSession, guidanceId, progress);
      sendJson(res, 200, {
        guidanceId,
        tutorialId: guidanceId,
        progress: readProgress(requestSession, guidanceId)
      });
    },

    "guidance.progress.delete": async ({ res, params, requestSession }) => {
      const guidanceId = progressIdFromParams(params);
      const entry = guidanceDefinitionById(runtimeContributions, guidanceId);
      if (!entry?.definition) {
        sendJson(res, 404, { error: "guidance not found", guidanceId });
        return;
      }
      if (!requestSession?.id) {
        sendJson(res, 200, { guidanceId, tutorialId: guidanceId, ok: true, localOnly: true });
        return;
      }
      writeProgress(requestSession, guidanceId, null);
      sendJson(res, 200, { guidanceId, tutorialId: guidanceId, ok: true });
    }
  };
}

export {
  normalizeGuidanceDefinitionEntry,
  normalizeStarterBlueprintEntry
};
