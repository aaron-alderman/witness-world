import { guidanceConfigForSession } from "../../src/runtime-guidance.js";
import { TODO_TUTORIAL_ID } from "./tutorials.js";

export function appGuidanceConfigForSession({
  requestSession,
  guidanceProgressFor,
  tutorialProgressFor,
  guidanceId = null,
  tutorialId = TODO_TUTORIAL_ID,
  surface = null
}) {
  return guidanceConfigForSession({
    requestSession,
    guidanceProgressFor,
    tutorialProgressFor,
    guidanceId: guidanceId ?? tutorialId,
    surface
  });
}

export const appTutorialConfigForSession = appGuidanceConfigForSession;
