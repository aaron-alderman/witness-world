import { TODO_TUTORIAL_ID, todoStarterBlueprint, todoTutorialDefinition } from "./tutorials.js";

export function appTutorialConfigForSession({
  requestSession,
  tutorialProgressFor,
  tutorialId = TODO_TUTORIAL_ID
}) {
  return tutorialProgressFor(requestSession, tutorialId) ? { id: tutorialId } : null;
}

export function bootstrapTutorialPageData() {
  return {
    tutorial: todoTutorialDefinition(),
    blueprint: todoStarterBlueprint()
  };
}
