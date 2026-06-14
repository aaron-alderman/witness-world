import {
  preferredBootstrapGuidance,
  preferredBootstrapStarter
} from "../../src/runtime-guidance.js";

export function buildBootstrapContributionState(runtimeContributions = null) {
  return {
    guidanceDefinitions: runtimeContributions?.guidanceDefinitions ?? [],
    starterBlueprints: runtimeContributions?.starterBlueprints ?? [],
    activeBootstrapGuidance: preferredBootstrapGuidance(runtimeContributions),
    activeStarterBlueprint: preferredBootstrapStarter(runtimeContributions)
  };
}
