import { TODO_TUTORIAL_ID, todoStarterBlueprint, todoTutorialDefinition } from "./tutorials.js";

export function appTutorialConfigForSession({
  requestSession,
  tutorialProgressFor,
  tutorialId = TODO_TUTORIAL_ID,
  surface = null
}) {
  return tutorialProgressFor(requestSession, tutorialId)
    ? {
        id: tutorialId,
        surfacePage: surface?.page ?? null,
        surfaceContext: surface?.context ?? null,
        surfaceRouteId: surface?.routeId ?? null,
        surfaceRootWidgetId: surface?.rootWidgetId ?? null,
        surfaceProgramId: surface?.frontendProgramId ?? null
      }
    : null;
}

export function bootstrapTutorialPageData() {
  return {
    tutorial: todoTutorialDefinition(),
    blueprint: todoStarterBlueprint()
  };
}
