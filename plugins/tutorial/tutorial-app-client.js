import { renderGuidanceClient as renderCoreGuidanceClient } from "../../src/runtime-guidance-client.js";
import { tutorialDefinition } from "./tutorials.js";

function guidanceConfigWithDefinition(guidanceConfig) {
  if (guidanceConfig?.definition && typeof guidanceConfig.definition === "object") {
    return guidanceConfig;
  }
  const definition = tutorialDefinition(guidanceConfig?.id);
  return definition ? { ...(guidanceConfig || {}), definition } : null;
}

export function renderGuidanceClient(guidanceConfig) {
  return renderCoreGuidanceClient(guidanceConfigWithDefinition(guidanceConfig));
}

export const renderTutorialClient = renderGuidanceClient;
