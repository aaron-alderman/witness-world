export const FINAL_CHROME_DEFAULTS = Object.freeze({
  gridStroke: "#f1f5f9",
  axisStroke: "#cbd5e1",
  tickStroke: "#e2e8f0",
  tickLabelFill: "#64748b",
  axisLabelFill: "#64748b",
  titleFill: "#0f172a",
  annotationFill: "#1e293b",
  polarGridStroke: "#e2e8f0",
  discBackground: "#0d1a2e",
  discShellStroke: "#64748b",
  discCenterFill: "#475569"
});

export const FINAL_TYPOGRAPHY_DEFAULTS = Object.freeze({
  bodyFontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headingFontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
});

function mergeDefinedStrings(base = {}, overrides = {}) {
  const next = { ...base };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (typeof value === "string" && value.trim()) next[key] = value.trim();
  }
  return next;
}

export function normalizePresentation(presentation = {}) {
  return {
    ...presentation,
    chrome: mergeDefinedStrings(FINAL_CHROME_DEFAULTS, presentation.chrome),
    typography: mergeDefinedStrings(FINAL_TYPOGRAPHY_DEFAULTS, presentation.typography)
  };
}
