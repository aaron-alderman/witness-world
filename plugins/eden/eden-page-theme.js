const DEFAULT_PAGE_ID = "todo_app_widget";
const relation = (from, rel, to, meta = {}) => ({ op: "relation", from, rel, to, meta });

const THEME_PRESETS = {
  paper: {
    pageBackground: "linear-gradient(180deg, #f7f2e8 0%, #efe7d7 100%)",
    surface: "#fffaf0",
    surfaceStrong: "#f4ebda",
    border: "#d6c6ad",
    accent: "#6e7d42",
    ink: "#2d261f",
    muted: "#6d6257",
    button: "#f7f1e5",
    input: "#fffdf8"
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
    input: "#fffaf1"
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
    input: "#fcfff9"
  }
};

const MATERIAL_TOKENS = {
  linen: {
    panelShadow: "0 12px 24px rgba(74, 58, 31, 0.08)",
    panelRadius: "12px",
    textureOpacity: "0.06"
  },
  wood: {
    panelShadow: "0 14px 30px rgba(74, 45, 17, 0.12)",
    panelRadius: "10px",
    textureOpacity: "0.1"
  },
  stone: {
    panelShadow: "0 16px 34px rgba(45, 45, 45, 0.12)",
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

export function resolveEdenPageTheme(input = {}) {
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
      ...TYPOGRAPHY_TOKENS[typography]
    }
  };
}

export function projectEdenPageTheme(witnesses, {
  actor = null,
  pageId = DEFAULT_PAGE_ID
} = {}) {
  const theme = resolveEdenPageTheme();
  if (!actor) return { ...theme, pageId, owner: null };
  for (const witness of witnesses) {
    if (witness.process !== "edenPageTheme.set") continue;
    const body = witness.body ?? {};
    if (body.owner !== actor || body.pageId !== pageId) continue;
    return {
      ...resolveEdenPageTheme(body),
      pageId,
      owner: actor,
      updatedAt: body.updatedAt || null
    };
  }
  return { ...theme, pageId, owner: actor };
}

export function requestEdenPageThemeSet(world, {
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
  const next = resolveEdenPageTheme(body);
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
