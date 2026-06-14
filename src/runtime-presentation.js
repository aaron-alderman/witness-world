import { SHARED_SURFACE_KIT_CSS } from "./runtime-surface-kit.js";

const DEFAULT_PAGE_ID = "todo_app_widget";
const relation = (from, rel, to, meta = {}) => ({ op: "relation", from, rel, to, meta });

const THEME_PRESETS = {
  bootstrap: {
    pageBackground: "linear-gradient(180deg, #f7f2eb 0%, #efe9df 100%)",
    surface: "#fffdf8",
    surfaceStrong: "#f6ede1",
    border: "#d9d2c7",
    accent: "#7a4d2a",
    ink: "#1f1b17",
    muted: "#6a635b",
    button: "#7a4d2a",
    buttonInk: "#fffdf8",
    input: "#ffffff",
    stateDone: "#4d7b3a",
    stateRunning: "#9a7c22",
    stateSkipped: "#7b7b7b",
    statePending: "#d2d2d2",
    stateFailed: "#b53a30",
    stateFailedSurface: "#fff5f5",
    stateFailedInk: "#7a2821",
    statusOkSurface: "#eef8ef",
    statusOkBorder: "#cde6cf",
    statusOkInk: "#265f31",
    statusErrorSurface: "#fff1f1",
    statusErrorBorder: "#f1c9c9",
    statusErrorInk: "#8a2e2e",
    codeSurface: "#1f1f1f",
    codeInk: "#f7f1e3"
  },
  paper: {
    pageBackground: "linear-gradient(180deg, #f7f2e8 0%, #efe7d7 100%)",
    surface: "#fffaf0",
    surfaceStrong: "#f4ebda",
    border: "#d6c6ad",
    accent: "#6e7d42",
    ink: "#2d261f",
    muted: "#6d6257",
    button: "#f7f1e5",
    buttonInk: "#2d261f",
    input: "#fffdf8",
    stateDone: "#3f7d3a",
    stateRunning: "#9a7c22",
    stateSkipped: "#7b7b7b",
    statePending: "#d2d2d2",
    stateFailed: "#b53a30",
    stateFailedSurface: "#fff5f5",
    stateFailedInk: "#7a2821",
    statusOkSurface: "#eef8ef",
    statusOkBorder: "#cde6cf",
    statusOkInk: "#265f31",
    statusErrorSurface: "#fff1f1",
    statusErrorBorder: "#f1c9c9",
    statusErrorInk: "#8a2e2e",
    codeSurface: "#1f1f1f",
    codeInk: "#f7f1e3"
  },
  straw: {
    pageBackground: "linear-gradient(180deg, #f4ecd8 0%, #e9dcc0 100%)",
    surface: "#fbf5e6",
    surfaceStrong: "#efe3c8",
    border: "#cfbe98",
    accent: "#8a6e39",
    ink: "#312617",
    muted: "#75674d",
    button: "#f6eddc",
    buttonInk: "#312617",
    input: "#fffaf1",
    stateDone: "#55753c",
    stateRunning: "#9b7a2e",
    stateSkipped: "#84755d",
    statePending: "#d1c5b4",
    stateFailed: "#b55b45",
    stateFailedSurface: "#fff3ef",
    stateFailedInk: "#7d3627",
    statusOkSurface: "#f0f7ea",
    statusOkBorder: "#d3e4c3",
    statusOkInk: "#36592d",
    statusErrorSurface: "#fff0ea",
    statusErrorBorder: "#eecbbd",
    statusErrorInk: "#8a4132",
    codeSurface: "#241f18",
    codeInk: "#f8f1e2"
  },
  moss: {
    pageBackground: "linear-gradient(180deg, #edf2e6 0%, #dde7d4 100%)",
    surface: "#f8fbf3",
    surfaceStrong: "#e8f0dd",
    border: "#b7c59d",
    accent: "#58713d",
    ink: "#25301f",
    muted: "#5f6c56",
    button: "#eef4e5",
    buttonInk: "#25301f",
    input: "#fcfff9",
    stateDone: "#3f7d47",
    stateRunning: "#8a7b2f",
    stateSkipped: "#72806f",
    statePending: "#c6d1be",
    stateFailed: "#a34b42",
    stateFailedSurface: "#fff4f3",
    stateFailedInk: "#6f2d28",
    statusOkSurface: "#edf8ef",
    statusOkBorder: "#c7dfca",
    statusOkInk: "#285834",
    statusErrorSurface: "#fff1f1",
    statusErrorBorder: "#ebc9c9",
    statusErrorInk: "#7b3434",
    codeSurface: "#1d241c",
    codeInk: "#eef6ea"
  }
};

const MATERIAL_TOKENS = {
  linen: {
    panelShadow: "0 12px 24px rgba(74, 58, 31, 0.08)",
    overlayShadow: "0 16px 36px rgba(45, 33, 18, 0.16)",
    panelRadius: "12px",
    textureOpacity: "0.06"
  },
  wood: {
    panelShadow: "0 14px 30px rgba(74, 45, 17, 0.12)",
    overlayShadow: "0 18px 42px rgba(58, 33, 11, 0.2)",
    panelRadius: "10px",
    textureOpacity: "0.1"
  },
  stone: {
    panelShadow: "0 16px 34px rgba(45, 45, 45, 0.12)",
    overlayShadow: "0 20px 46px rgba(38, 38, 38, 0.22)",
    panelRadius: "14px",
    textureOpacity: "0.04"
  }
};

const TYPOGRAPHY_TOKENS = {
  sans: {
    bodyFont: 'system-ui, sans-serif',
    headingFont: 'system-ui, sans-serif'
  },
  serif: {
    bodyFont: 'Georgia, "Times New Roman", serif',
    headingFont: 'Georgia, "Times New Roman", serif'
  },
  mono: {
    bodyFont: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
    headingFont: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'
  }
};

const LAYOUT_TOKENS = Object.freeze({
  space1: "4px",
  space2: "8px",
  space3: "12px",
  space4: "16px",
  space5: "24px",
  space6: "32px",
  radiusSm: "6px",
  radiusMd: "8px",
  radiusLg: "10px",
  radiusPill: "999px",
  motionFast: "120ms ease-out",
  motionMedium: "180ms ease",
  motionSlow: "280ms ease"
});

export const PAGE_PRESENTATION_REGION_CLASSNAMES = Object.freeze({
  header: "presentation-shell-header",
  main: "presentation-main-region",
  auxiliary: "presentation-auxiliary-region",
  column: "presentation-column"
});

export function renderPagePresentationChromeCss() {
  const classes = PAGE_PRESENTATION_REGION_CLASSNAMES;
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at top, rgba(255,255,255,0.42), transparent 36%),
        linear-gradient(180deg, rgba(255,255,255,var(--texture-opacity)) 0%, rgba(255,255,255,0) 24%),
        var(--page-bg);
      color: var(--ink);
    }
    header.${classes.header} {
      padding: 28px 32px 20px;
      border-bottom: 1px solid var(--surface-border);
      background: rgba(255,255,255,.72);
      backdrop-filter: blur(6px);
      position: sticky;
      top: 0;
      z-index: 4;
    }
    header.${classes.header} small {
      display: inline-block;
      text-transform: uppercase;
      letter-spacing: .16em;
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 8px;
    }
    header.${classes.header} h1 {
      margin: 0 0 8px;
      font-size: 2rem;
      line-height: 1.1;
    }
    header.${classes.header} p {
      margin: 0;
      max-width: 960px;
      color: var(--muted);
      line-height: 1.5;
    }
    main {
      max-width: 1320px;
      margin: 0 auto;
      padding: 24px 32px 40px;
      display: grid;
      grid-template-columns: 1.25fr .95fr;
      gap: 20px;
      align-items: start;
    }
    .${classes.column}, .column { display: grid; gap: 18px; align-content: start; }
    .${classes.main}, .${classes.auxiliary} { display: grid; gap: 18px; align-content: start; }
    .card {
      background: var(--surface-bg);
      border: 1px solid var(--surface-border);
      border-radius: 16px;
      padding: 18px;
      box-shadow: var(--surface-shadow);
    }
    .card h2 { margin: 0 0 10px; font-size: 1.15rem; }
    .card p { margin: 0 0 10px; color: var(--muted); line-height: 1.5; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 12%, white);
      color: var(--accent);
      padding: 5px 10px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .stack { display: grid; gap: 12px; }
    .grid { display: grid; gap: 10px; }
    .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .surface-status, .status { min-height: 1.2em; color: var(--accent); }
    .muted { color: var(--muted); }
    .note { border-left: 4px solid var(--accent); padding-left: 10px; }
    .kicker {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .12em;
      color: var(--muted);
      font-family: var(--mono);
    }
    .chapter-list { display: grid; gap: 6px; margin: 12px 0; }
    .chapter-item {
      display: grid;
      grid-template-columns: 18px 1fr;
      gap: 8px;
      align-items: start;
      font-size: 13px;
      color: var(--muted);
    }
    .chapter-item strong { color: var(--ink); }
    .chapter-dot {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      border: 1px solid var(--surface-border);
      background: white;
      margin-top: 2px;
    }
    .chapter-active .chapter-dot { background: var(--accent); border-color: var(--accent); }
    .chapter-done .chapter-dot { background: #3f7d47; border-color: #3f7d47; }
    .chapter-active strong, .chapter-done strong { color: var(--ink); }
    label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); }
    input, select, textarea, button { font: inherit; }
    input, select, textarea {
      width: 100%;
      border: 1px solid var(--surface-border);
      border-radius: 10px;
      padding: 10px 12px;
      background: var(--input-bg);
      color: var(--ink);
    }
    textarea {
      min-height: 96px;
      resize: vertical;
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.45;
    }
    button {
      border: 1px solid color-mix(in srgb, var(--accent) 75%, black);
      background: var(--button-bg);
      color: var(--ink);
      border-radius: 10px;
      padding: 10px 14px;
      cursor: pointer;
    }
    button.secondary { background: white; color: var(--accent); }
    button:disabled { opacity: .55; cursor: default; }
    .hide { display: none !important; }
    details summary { cursor: pointer; }
    @media (max-width: 1100px) {
      main { grid-template-columns: 1fr; }
    }
  `;
}

function stringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeThemeId(value) {
  const themeId = stringOrNull(value)?.toLowerCase() ?? "paper";
  return THEME_PRESETS[themeId] ? themeId : "paper";
}

function normalizeMaterial(value) {
  const material = stringOrNull(value)?.toLowerCase() ?? "linen";
  return MATERIAL_TOKENS[material] ? material : "linen";
}

function normalizeTypography(value) {
  const typography = stringOrNull(value)?.toLowerCase() ?? "sans";
  return TYPOGRAPHY_TOKENS[typography] ? typography : "sans";
}

function escapeHeadHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

export function resolvePagePresentationTheme(input = {}) {
  const themeId = normalizeThemeId(input.themeId);
  const material = normalizeMaterial(input.material);
  const typography = normalizeTypography(input.typography);
  return {
    themeId,
    material,
    typography,
    tokens: {
      ...THEME_PRESETS[themeId],
      ...MATERIAL_TOKENS[material],
      ...TYPOGRAPHY_TOKENS[typography],
      ...LAYOUT_TOKENS
    }
  };
}

export function renderPagePresentationCssVars(pageTheme = resolvePagePresentationTheme()) {
  const tokens = pageTheme?.tokens || resolvePagePresentationTheme().tokens;
  return `:root {
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --page-bg: ${tokens.pageBackground};
  --surface-bg: ${tokens.surface};
  --surface-strong: ${tokens.surfaceStrong};
  --surface-border: ${tokens.border};
  --surface-shadow: ${tokens.panelShadow};
  --accent: ${tokens.accent};
  --ink: ${tokens.ink};
  --muted: ${tokens.muted};
  --input-bg: ${tokens.input};
  --button-bg: ${tokens.button};
  --button-ink: ${tokens.buttonInk};
  --state-done: ${tokens.stateDone};
  --state-running: ${tokens.stateRunning};
  --state-skipped: ${tokens.stateSkipped};
  --state-pending: ${tokens.statePending};
  --state-failed: ${tokens.stateFailed};
  --state-failed-surface: ${tokens.stateFailedSurface};
  --state-failed-ink: ${tokens.stateFailedInk};
  --status-ok-surface: ${tokens.statusOkSurface};
  --status-ok-border: ${tokens.statusOkBorder};
  --status-ok-ink: ${tokens.statusOkInk};
  --status-error-surface: ${tokens.statusErrorSurface};
  --status-error-border: ${tokens.statusErrorBorder};
  --status-error-ink: ${tokens.statusErrorInk};
  --code-surface: ${tokens.codeSurface};
  --code-ink: ${tokens.codeInk};
  --space-1: ${tokens.space1};
  --space-2: ${tokens.space2};
  --space-3: ${tokens.space3};
  --space-4: ${tokens.space4};
  --space-5: ${tokens.space5};
  --space-6: ${tokens.space6};
  --radius-sm: ${tokens.radiusSm};
  --radius-md: ${tokens.radiusMd};
  --radius-lg: ${tokens.radiusLg};
  --radius-pill: ${tokens.radiusPill};
  --panel-radius: ${tokens.panelRadius};
  --elevation-panel: ${tokens.panelShadow};
  --elevation-overlay: ${tokens.overlayShadow};
  --motion-fast: ${tokens.motionFast};
  --motion-medium: ${tokens.motionMedium};
  --motion-slow: ${tokens.motionSlow};
  --texture-opacity: ${tokens.textureOpacity};
  --body-font: ${tokens.bodyFont};
  --heading-font: ${tokens.headingFont};
}`;
}

export function renderPagePresentationHead({
  title = "Witness App",
  pageTheme = resolvePagePresentationTheme(),
  extraCss = ""
} = {}) {
  return `<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHeadHtml(title)}</title>
  <style>
    ${renderPagePresentationCssVars(pageTheme)}
    ${SHARED_SURFACE_KIT_CSS}
    ${extraCss}
  </style>
</head>`;
}

export function projectPagePresentationTheme(witnesses, {
  actor = null,
  pageId = DEFAULT_PAGE_ID
} = {}) {
  const theme = resolvePagePresentationTheme();
  if (!actor) return { ...theme, pageId, owner: null };
  for (const witness of witnesses) {
    if (witness.process !== "edenPageTheme.set") continue;
    const body = witness.body ?? {};
    if (body.owner !== actor || body.pageId !== pageId) continue;
    return {
      ...resolvePagePresentationTheme(body),
      pageId,
      owner: actor,
      updatedAt: body.updatedAt || null
    };
  }
  return { ...theme, pageId, owner: actor };
}

export function requestPagePresentationThemeSet(world, {
  actor,
  backendHost,
  pageId = DEFAULT_PAGE_ID,
  body
}) {
  if (!actor) {
    const witness = world.emit({
      process: "edenPageTheme.set.failed",
      actor: backendHost,
      claims: [],
      body: { reason: "sign in first", pageId }
    });
    return { ok: false, status: 401, error: "sign in first", witness };
  }
  const next = resolvePagePresentationTheme(body);
  const updatedAt = new Date().toISOString();
  const witness = world.emit({
    process: "edenPageTheme.set",
    actor,
    claims: [relation(actor, "editedProjection", pageId)],
    body: {
      owner: actor,
      pageId,
      themeId: next.themeId,
      material: next.material,
      typography: next.typography,
      updatedAt
    }
  });
  return {
    ok: true,
    status: 200,
    pageTheme: {
      ...next,
      pageId,
      owner: actor,
      updatedAt
    },
    witness
  };
}

export const resolveEdenPageTheme = resolvePagePresentationTheme;
export const renderEdenPageThemeCssVars = renderPagePresentationCssVars;
export const projectEdenPageTheme = projectPagePresentationTheme;
export const requestEdenPageThemeSet = requestPagePresentationThemeSet;
export { SHARED_SURFACE_KIT_CSS };
