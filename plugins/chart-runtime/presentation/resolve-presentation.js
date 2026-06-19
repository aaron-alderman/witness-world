import {
  FINAL_CHROME_DEFAULTS,
  FINAL_TYPOGRAPHY_DEFAULTS,
  normalizePresentation
} from "./chart-chrome.js";

const CHROME_CSS_VARS = Object.freeze({
  gridStroke: "--chart-grid-stroke",
  axisStroke: "--chart-axis-stroke",
  tickStroke: "--chart-tick-stroke",
  tickLabelFill: "--chart-tick-label-fill",
  axisLabelFill: "--chart-axis-label-fill",
  titleFill: "--chart-title-fill",
  annotationFill: "--chart-annotation-fill",
  polarGridStroke: "--chart-polar-grid-stroke",
  discBackground: "--chart-disc-background",
  discShellStroke: "--chart-disc-shell-stroke",
  discCenterFill: "--chart-disc-center-fill"
});

const TYPOGRAPHY_CSS_VARS = Object.freeze({
  bodyFontFamily: "--chart-body-font-family",
  headingFontFamily: "--chart-heading-font-family"
});

const CHROME_PROP_KEYS = Object.freeze({
  gridStroke: "gridStroke",
  axisStroke: "axisStroke",
  tickStroke: "tickStroke",
  tickLabelFill: "tickLabelFill",
  axisLabelFill: "axisLabelFill",
  titleFill: "titleFill",
  annotationFill: "annotationFill",
  polarGridStroke: "polarGridStroke",
  discBackground: "discBackground",
  discShellStroke: "shellStroke",
  discCenterFill: "centerFill"
});

const TYPOGRAPHY_PROP_KEYS = Object.freeze({
  bodyFontFamily: "bodyFontFamily",
  headingFontFamily: "headingFontFamily"
});

const PAGE_THEME_CHROME_FALLBACKS = Object.freeze({
  gridStroke: "--surface-bg",
  axisStroke: "--surface-border",
  tickStroke: "--surface-strong",
  tickLabelFill: "--muted",
  axisLabelFill: "--muted",
  titleFill: "--ink",
  annotationFill: "--ink",
  polarGridStroke: "--surface-strong",
  discBackground: "--page-bg",
  discShellStroke: "--surface-border",
  discCenterFill: "--surface-strong"
});

const PAGE_THEME_TYPOGRAPHY_FALLBACKS = Object.freeze({
  bodyFontFamily: "--body-font",
  headingFontFamily: "--heading-font"
});

function readCssVar(style, name) {
  if (!style || typeof style.getPropertyValue !== "function") return "";
  return String(style.getPropertyValue(name) ?? "").trim();
}

function currentStyleFor(node) {
  if (!node || typeof globalThis.getComputedStyle !== "function") return null;
  try {
    return globalThis.getComputedStyle(node);
  } catch {
    return null;
  }
}

function rootStyleFor(node) {
  const root = node?.ownerDocument?.documentElement ?? globalThis.document?.documentElement ?? null;
  return currentStyleFor(root);
}

function pickCssValues(style, cssVars = {}) {
  const values = {};
  for (const [key, cssVar] of Object.entries(cssVars)) {
    const value = readCssVar(style, cssVar);
    if (value) values[key] = value;
  }
  return values;
}

function pickPropValues(props = {}, keys = {}) {
  const values = {};
  for (const [targetKey, propKey] of Object.entries(keys)) {
    const value = props?.[propKey];
    if (typeof value === "string" && value.trim()) values[targetKey] = value.trim();
  }
  return values;
}

function resolveChrome(container, view = {}) {
  const style = currentStyleFor(container);
  const rootStyle = rootStyleFor(container);
  return {
    ...pickCssValues(rootStyle, PAGE_THEME_CHROME_FALLBACKS),
    ...pickCssValues(style, CHROME_CSS_VARS),
    ...pickPropValues(view.props, CHROME_PROP_KEYS),
    ...(view.chrome ?? {})
  };
}

function resolveTypography(container, view = {}) {
  const style = currentStyleFor(container);
  const rootStyle = rootStyleFor(container);
  return {
    ...pickCssValues(rootStyle, PAGE_THEME_TYPOGRAPHY_FALLBACKS),
    ...pickCssValues(style, TYPOGRAPHY_CSS_VARS),
    ...pickPropValues(view.props, TYPOGRAPHY_PROP_KEYS),
    ...(view.typography ?? {})
  };
}

export function resolvePresentationView(view = {}, container = null) {
  const resolved = {
    ...(view ?? {}),
    chrome: resolveChrome(container, view),
    typography: resolveTypography(container, view)
  };
  return normalizePresentation(resolved);
}

export {
  CHROME_CSS_VARS,
  TYPOGRAPHY_CSS_VARS,
  CHROME_PROP_KEYS,
  TYPOGRAPHY_PROP_KEYS,
  PAGE_THEME_CHROME_FALLBACKS,
  PAGE_THEME_TYPOGRAPHY_FALLBACKS,
  FINAL_CHROME_DEFAULTS,
  FINAL_TYPOGRAPHY_DEFAULTS
};
