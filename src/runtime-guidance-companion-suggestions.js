export function normalizeGuidanceSuggestionsForCompanion(suggestions = []) {
  return (Array.isArray(suggestions) ? suggestions : []).map(suggestion => ({
    ...suggestion,
    severity: suggestion?.severity || "info",
    explain: suggestion?.explain || suggestion?.body || ""
  }));
}

export function rankCompanionSuggestions({
  issueSuggestions = [],
  guidanceSuggestions = [],
  limit = 3
} = {}) {
  const cap = Math.max(0, Number(limit) || 0);
  const issues = Array.isArray(issueSuggestions) ? issueSuggestions : [];
  const guidance = normalizeGuidanceSuggestionsForCompanion(guidanceSuggestions);
  if (!cap) return [];
  const ranked = [...issues, ...guidance];
  return ranked.slice(0, cap);
}