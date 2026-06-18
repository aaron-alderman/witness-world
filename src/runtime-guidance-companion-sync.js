import { buildRuntimeIssueSuggestions } from "./runtime-guidance-runtime-issue-suggestions.js";
import {
  normalizeGuidanceSuggestionsForCompanion,
  rankCompanionSuggestions
} from "./runtime-guidance-companion-suggestions.js";

export function renderSourceryCompanionSyncFactory() {
  return String.raw`
    const normalizeGuidanceSuggestionsForCompanion = ${normalizeGuidanceSuggestionsForCompanion.toString()};
    const rankCompanionSuggestions = ${rankCompanionSuggestions.toString()};
    const syncSourceryCompanionShell = ${syncSourceryCompanionShell.toString()};
    const bindSourceryCompanionSuggestionActions = ${bindSourceryCompanionSuggestionActions.toString()};
  `;
}

export function syncSourceryCompanionShell({
  windowTarget = globalThis?.window || globalThis,
  documentTarget = globalThis?.document || null,
  enabled = true,
  inspection = null,
  issueLedger = null,
  guidanceSuggestions = [],
  guidanceState = null,
  suggestionLimit = 3
} = {}) {
  const shell = windowTarget?.__sourceryCompanionShell;
  if (!shell) return null;
  if (inspection) shell.inspection = inspection;
  if (issueLedger) {
    shell.issueLedger = issueLedger;
  }
  const issues = issueLedger?.list?.() ?? inspection?.issues ?? [];
  const issueSuggestions = buildRuntimeIssueSuggestions({ issues, inspection, limit: suggestionLimit });
  shell.setExtraSuggestions(rankCompanionSuggestions({
    issueSuggestions,
    guidanceSuggestions,
    limit: suggestionLimit
  }));
  if (guidanceState) shell.updateGuidanceState(guidanceState);
  shell.render();
  return shell;
}

export function bindSourceryCompanionSuggestionActions({
  windowTarget = globalThis?.window || globalThis,
  runSuggestion = async () => false
} = {}) {
  const shell = windowTarget?.__sourceryCompanionShell;
  if (!shell?.setSuggestionRunner || shell.__suggestionRunnerBound) return () => {};
  shell.setSuggestionRunner(runSuggestion);
  shell.__suggestionRunnerBound = true;
  return () => {
    shell.setSuggestionRunner(null);
    shell.__suggestionRunnerBound = false;
  };
}