import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { compileRvmFileToDesirePlus } from "../../../src/desire/index.js";
import {
  surfaceDomId,
  trimString as trimDomString
} from "../../../src/runtime-surface-dom-identity.js";
import {
  createWcssStylesheet,
  renderWcssStylesheet
} from "../../../src/uplift/wcss-grammar.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CANONICAL_WCSS_FILE = path.join(MODULE_DIR, "engentus-desired-v2.wcss");
const DEFAULT_SWITCH_MANIFEST_FILE = path.join(MODULE_DIR, "engentus-style-switch.json");
const REQUIRED_CORE_TOP_LEVEL_SECTIONS = ["tokens", "styles", "views", "application"];
const DEFAULT_BROWSER_BACKEND = "browser";
const KNOWN_STYLE_ASSETS = new Set(["shell", "chart"]);
const CANONICAL_TOKEN_DOMAINS = Object.freeze(["color", "size", "radius", "font", "shadow"]);
const CANONICAL_STYLE_DOMAINS = Object.freeze(["chrome", "interactive", "surface", "auth", "goodman", "platform", "chart"]);
const CANONICAL_SLICE_FAMILY_DOMAINS = Object.freeze({
  "shell-base": Object.freeze(["chrome", "interactive"]),
  auth: Object.freeze(["auth"]),
  home: Object.freeze(["chrome", "surface"]),
  goodman: Object.freeze(["chart", "chrome", "goodman", "surface"]),
  "mill-charge": Object.freeze(["chrome", "surface"]),
  "mill-force": Object.freeze(["chrome", "interactive", "surface"]),
  "platform-config": Object.freeze(["platform"]),
  "chart-pages": Object.freeze(["chart"])
});
const CANONICAL_SLICE_SEAM_PREFIXES = Object.freeze({
  "shell-base": "shell-base.",
  auth: "auth.",
  home: "home.",
  goodman: "goodman.",
  "mill-charge": "mill-charge.",
  "mill-force": "mill-force.",
  "platform-config": "platform.",
  "chart-pages": "chart-pages."
});
const STYLESHEET_TITLES = Object.freeze({
  shell: "Engentus shell theme grammar",
  chart: "Engentus chart theme grammar"
});

export const ENGENTUS_STYLE_THEME = "engentus";
export const ENGENTUS_GENERATED_STYLESHEET_PATHS = Object.freeze({
  shell: "/engentus/__generated/engentus-shell.css",
  chart: "/engentus/__generated/engentus-chart-pages.css"
});
const ENGENTUS_PREVIEWABLE_TOKEN_BINDINGS = Object.freeze({
  "color.chrome.bg": Object.freeze([{ asset: "shell", cssVariable: "--dk" }, { asset: "chart", cssVariable: "--dk" }]),
  "color.chrome.panel": Object.freeze([{ asset: "shell", cssVariable: "--mid" }, { asset: "chart", cssVariable: "--mid" }]),
  "color.chrome.edge": Object.freeze([{ asset: "shell", cssVariable: "--brd" }, { asset: "chart", cssVariable: "--brd" }]),
  "color.ink.primary": Object.freeze([{ asset: "shell", cssVariable: "--t1" }, { asset: "chart", cssVariable: "--t1" }]),
  "color.ink.secondary": Object.freeze([{ asset: "shell", cssVariable: "--t2" }, { asset: "chart", cssVariable: "--t2" }]),
  "color.ink.body": Object.freeze([{ asset: "shell", cssVariable: "--t3" }, { asset: "chart", cssVariable: "--t3" }]),
  "color.accent.cool": Object.freeze([{ asset: "shell", cssVariable: "--blue" }, { asset: "chart", cssVariable: "--blue" }]),
  "color.accent.cool.strong": Object.freeze([{ asset: "shell", cssVariable: "--blu2" }]),
  "color.accent.warm": Object.freeze([{ asset: "shell", cssVariable: "--ylw" }]),
  "color.success": Object.freeze([{ asset: "shell", cssVariable: "--grn" }]),
  "size.sidebar.width": Object.freeze([{ asset: "shell", cssVariable: "--sw" }]),
  "size.toolbar.height": Object.freeze([{ asset: "shell", cssVariable: "--th" }]),
  "size.scrubber.height": Object.freeze([{ asset: "shell", cssVariable: "--sch" }])
});
const ENGENTUS_PREVIEWABLE_STYLE_FIELD_BINDINGS = Object.freeze({
  "chrome.toolbar\u0000base\u0000layout.height": Object.freeze([{ asset: "shell", cssVariable: "--th" }])
});
const WCSS_AUTHORING_OPERATION_KINDS = Object.freeze([
  "token.create",
  "token.remove",
  "token.set",
  "token.reset",
  "style.create",
  "style.remove",
  "style.field.set",
  "style.field.reset",
  "style.state.create",
  "style.state.remove",
  "style.state_field.set",
  "style.state_field.reset",
  "slice.family.assign",
  "slice.family.unassign",
  "slice.seam.upsert",
  "slice.seam.remove"
]);
const WCSS_STYLE_FIELD_GROUPS = Object.freeze(["layout", "paint", "text", "ornament", "affordance"]);

function splitClassTokens(value) {
  if (typeof value !== "string") return [];
  return value.split(/\s+/).map(token => token.trim()).filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maybeUnquote(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function nameSegments(value) {
  return String(value ?? "")
    .split(".")
    .map(segment => segment.trim())
    .filter(Boolean);
}

function primaryNameDomain(value) {
  return nameSegments(value)[0] ?? null;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function addClassTokens(target, value) {
  for (const token of splitClassTokens(value)) target.add(token);
}

function addPropClassTokens(target, props = {}) {
  for (const [key, value] of Object.entries(props)) {
    if (key === "class" || key === "className" || key.endsWith("Class")) {
      addClassTokens(target, value);
    }
  }
}

function collectBindingClassTokens(binding, traits) {
  if (binding?.prop !== "className") return;
  const source = plainObject(binding.source);
  if (!source) return;
  addClassTokens(traits, source.default);
  const mapped = plainObject(source.map);
  if (!mapped) return;
  for (const value of Object.values(mapped)) addClassTokens(traits, value);
}

function collectOverrideProps(bindings = []) {
  const overrideProps = new Set();
  for (const binding of bindings) {
    if (binding?.prop === "className" || binding?.prop === "style") overrideProps.add(binding.prop);
  }
  return uniqueSorted([...overrideProps]);
}

function collectSurfaceTraits(surface) {
  const traits = new Set();
  addClassTokens(traits, surface.className);
  addClassTokens(traits, surface.props?.class);
  addClassTokens(traits, surface.props?.className);
  addPropClassTokens(traits, surface.props);
  for (const binding of surface.bindings ?? []) collectBindingClassTokens(binding, traits);
  return uniqueSorted([...traits]);
}

function ambientIdentityForSurface(surface) {
  return typeof surface?.name === "string" && surface.name.trim() ? surface.name.trim() : null;
}

function structuredIdentityForSurface(surface) {
  return typeof surface?.identity === "string" && surface.identity.trim()
    ? surface.identity.trim()
    : ambientIdentityForSurface(surface);
}

function selectorPresentationAnchor(selector) {
  return `selector:${selector}`;
}

function chartRouteToken(props = {}) {
  return splitClassTokens(props.bodyClass).find(token => token.startsWith("chart-page--")) ?? null;
}

function chartRouteName(props = {}) {
  const token = chartRouteToken(props);
  return token ? token.slice("chart-page--".length) : null;
}

function createSyntheticSurfaceRecord({
  identity,
  presentationAnchor,
  sourceFile,
  surfaceKind = "synthetic-surface",
  traits = []
}) {
  return {
    name: identity,
    ambientIdentity: identity,
    identity,
    surfaceKind,
    traits: uniqueSorted(traits),
    overrideProps: [],
    presentationAnchor,
    props: {},
    bindings: [],
    children: [],
    repeatTemplate: null,
    isTemplate: false,
    sourceFile
  };
}

function shellBaseTraitSurfaceRecord({
  identity,
  trait,
  sourceFile,
  selector = null
}) {
  return createSyntheticSurfaceRecord({
    identity,
    presentationAnchor: selectorPresentationAnchor(selector ?? `.${trait}`),
    sourceFile,
    surfaceKind: "shell-base-trait",
    traits: [trait]
  });
}

function shellBaseSupplementalSurfaceRecords(definition) {
  if (definition?.name !== "shell-base") return [];
  const sourceFile = definition.sourceFiles?.[0] ?? "shell-shared.rvm";
  const records = [
    createSyntheticSurfaceRecord({
      identity: "ShellBaseGlobalReset",
      presentationAnchor: selectorPresentationAnchor("*, *::before, *::after"),
      sourceFile,
      surfaceKind: "shell-base-foundation"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseThemeRoot",
      presentationAnchor: selectorPresentationAnchor(":root"),
      sourceFile,
      surfaceKind: "shell-base-foundation"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseDocumentBody",
      presentationAnchor: selectorPresentationAnchor("body"),
      sourceFile,
      surfaceKind: "shell-base-foundation"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseLinkSurface",
      presentationAnchor: selectorPresentationAnchor("a"),
      sourceFile,
      surfaceKind: "shell-base-foundation"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseToolbarBrandImage",
      presentationAnchor: selectorPresentationAnchor("#tb-brand img, .auth-brand img"),
      sourceFile,
      surfaceKind: "shell-base-foundation"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseToolbarBrandClickable",
      presentationAnchor: selectorPresentationAnchor("#tb-brand.clickable"),
      sourceFile,
      surfaceKind: "shell-base-toolbar"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseToolbarBrandClickableHover",
      presentationAnchor: selectorPresentationAnchor("#tb-brand.clickable:hover"),
      sourceFile,
      surfaceKind: "shell-base-toolbar"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseModeButtonOn",
      presentationAnchor: selectorPresentationAnchor(".mode-btn.on"),
      sourceFile,
      surfaceKind: "shell-base-toolbar"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseToolbarWindowButtonOn",
      presentationAnchor: selectorPresentationAnchor(".tbw.on"),
      sourceFile,
      surfaceKind: "shell-base-toolbar"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseSharedRouteViews",
      presentationAnchor: selectorPresentationAnchor("#view-goodman, #view-mill, #view-mill-force, #view-platform-config, #view-platform-config-secrets, #view-platform-config-datasources, #view-platform-config-scripts, #view-platform-config-access"),
      sourceFile,
      surfaceKind: "shell-base-layout"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseSharedBodies",
      presentationAnchor: selectorPresentationAnchor("#body, #mill-body, #mill-force-body, #platform-config-body, #platform-config-secrets-body, #platform-config-datasources-body, #platform-config-scripts-body, #platform-config-access-body"),
      sourceFile,
      surfaceKind: "shell-base-layout"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseSharedSidebars",
      presentationAnchor: selectorPresentationAnchor("#sb, #mill-sb, #mill-force-sb"),
      sourceFile,
      surfaceKind: "shell-base-layout"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseSharedFixedSidebars",
      presentationAnchor: selectorPresentationAnchor("#sb, #mill-sb"),
      sourceFile,
      surfaceKind: "shell-base-layout"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseSharedSidebarScrollRegion",
      presentationAnchor: selectorPresentationAnchor("#sb-scroll, #mill-sb-scroll, #mill-force-sb-scroll"),
      sourceFile,
      surfaceKind: "shell-base-layout"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseSharedSidebarScrollbar",
      presentationAnchor: selectorPresentationAnchor("#sb-scroll::-webkit-scrollbar, #mill-sb-scroll::-webkit-scrollbar, #mill-force-sb-scroll::-webkit-scrollbar"),
      sourceFile,
      surfaceKind: "shell-base-layout"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseSharedSidebarScrollbarThumb",
      presentationAnchor: selectorPresentationAnchor("#sb-scroll::-webkit-scrollbar-thumb, #mill-sb-scroll::-webkit-scrollbar-thumb, #mill-force-sb-scroll::-webkit-scrollbar-thumb"),
      sourceFile,
      surfaceKind: "shell-base-layout"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseMillViewer",
      presentationAnchor: selectorPresentationAnchor("#mill-main"),
      sourceFile,
      surfaceKind: "shell-base-chart-scaffold"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseMillForceChartArea",
      presentationAnchor: selectorPresentationAnchor("#mill-force-chart-area"),
      sourceFile,
      surfaceKind: "shell-base-chart-scaffold"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseMillForceChartFrame",
      presentationAnchor: selectorPresentationAnchor("#mill-force-chart-wrap iframe"),
      sourceFile,
      surfaceKind: "shell-base-chart-scaffold"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseChartOverlayCanvas",
      presentationAnchor: selectorPresentationAnchor(".chart-page__overlay-canvas"),
      sourceFile,
      surfaceKind: "shell-base-chart-scaffold"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseMonteCarloNumberInput",
      presentationAnchor: selectorPresentationAnchor(".mc-row input[type=number]"),
      sourceFile,
      surfaceKind: "shell-base-control"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseRunButtonGo",
      presentationAnchor: selectorPresentationAnchor(".rbtn.go"),
      sourceFile,
      surfaceKind: "shell-base-control"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseRunButtonGoDisabled",
      presentationAnchor: selectorPresentationAnchor(".rbtn.go:disabled"),
      sourceFile,
      surfaceKind: "shell-base-control"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseRunButtonPause",
      presentationAnchor: selectorPresentationAnchor(".rbtn.pause"),
      sourceFile,
      surfaceKind: "shell-base-control"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseRunButtonStop",
      presentationAnchor: selectorPresentationAnchor(".rbtn.stop"),
      sourceFile,
      surfaceKind: "shell-base-control"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseRunButtonDisabled",
      presentationAnchor: selectorPresentationAnchor(".rbtn:disabled"),
      sourceFile,
      surfaceKind: "shell-base-control"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseProgressFillReady",
      presentationAnchor: selectorPresentationAnchor(".prog-fill.ready"),
      sourceFile,
      surfaceKind: "shell-base-control"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseProgressFillRunning",
      presentationAnchor: selectorPresentationAnchor(".prog-fill.running"),
      sourceFile,
      surfaceKind: "shell-base-control"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseProgressFillPaused",
      presentationAnchor: selectorPresentationAnchor(".prog-fill.paused"),
      sourceFile,
      surfaceKind: "shell-base-control"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseProgressFillDone",
      presentationAnchor: selectorPresentationAnchor(".prog-fill.done"),
      sourceFile,
      surfaceKind: "shell-base-control"
    }),
    createSyntheticSurfaceRecord({
      identity: "ShellBaseProgressFillStopped",
      presentationAnchor: selectorPresentationAnchor(".prog-fill.stopped"),
      sourceFile,
      surfaceKind: "shell-base-control"
    })
  ];

  const traitRecords = [
    ["ShellBaseToolbarModePillTrait", "mode-pill"],
    ["ShellBaseToolbarModeButtonTrait", "mode-btn"],
    ["ShellBaseToolbarWindowButtonTrait", "tbw"],
    ["ShellBaseSiteSummaryTrait", "tb-site-summary"],
    ["ShellBaseUserProfileMenuItemTrait", "up-mi"],
    ["ShellBaseUserProfileMenuIconTrait", "up-mi-icon"],
    ["ShellBaseUserProfileMenuDividerTrait", "up-sep"],
    ["ShellBaseUserProfileMenuSignoutTrait", "up-mi-signout"],
    ["ShellBaseSharedSectionTrait", "ssec"],
    ["ShellBaseSharedSectionTitleTrait", "ssec-title"],
    ["ShellBaseMetricGroupTitleTrait", "metric-group-title"],
    ["ShellBaseSidebarListTrait", "sidebar-list"],
    ["ShellBaseMetricListTrait", "metric-list"],
    ["ShellBaseSidebarNoteTrait", "sidebar-note"],
    ["ShellBaseFloatingWindowTrait", "fw"],
    ["ShellBaseFloatingWindowTitlebarTrait", "fw-tb"],
    ["ShellBaseFloatingWindowTitleTrait", "fw-title"],
    ["ShellBaseFloatingWindowButtonTrait", "fw-btn"],
    ["ShellBaseFloatingWindowBodyTrait", "fw-body"],
    ["ShellBaseFloatingWindowResizeHandleTrait", "fw-rz"],
    ["ShellBaseStatsTableTrait", "stbl"],
    ["ShellBaseStatsTableNumberTrait", "num"],
    ["ShellBaseScenarioDotTrait", "sc-dot"],
    ["ShellBaseAnovaStatTrait", "anova-stat"],
    ["ShellBaseAnovaMetaTrait", "anova-meta"],
    ["ShellBaseAnovaKeyValueTrait", "anova-kv"],
    ["ShellBaseAnovaKeyTrait", "anova-k"],
    ["ShellBaseAnovaValueTrait", "anova-v"],
    ["ShellBaseAnovaSignificanceTrait", "anova-sig"],
    ["ShellBaseAnovaNoteTrait", "anova-note"],
    ["ShellBaseLegendRowTrait", "leg-row"],
    ["ShellBaseLegendSwatchTrait", "leg-sw"],
    ["ShellBaseInfoBoxTrait", "info-box"],
    ["ShellBaseInfoRowTrait", "info-row"],
    ["ShellBaseInfoValueTrait", "info-value"],
    ["ShellBaseMonteCarloRowTrait", "mc-row"],
    ["ShellBaseRunRowTrait", "run-row"],
    ["ShellBaseRunButtonTrait", "rbtn"],
    ["ShellBaseProgressTrackTrait", "prog-wrap"],
    ["ShellBaseProgressFillTrait", "prog-fill"],
    ["ShellBaseProgressLabelTrait", "prog-lbl"],
    ["ShellBaseSaveSimulationButtonTrait", "save-sim-btn"]
  ].map(([identity, trait]) => shellBaseTraitSurfaceRecord({
    identity,
    trait,
    sourceFile
  }));

  return [...records, ...traitRecords];
}

function chartSupplementalSurfaceRecords(record) {
  if (record.surfaceKind !== "chart") return [];
  const route = chartRouteName(record.props);
  if (!route) return [];

  const supplemental = [
    createSyntheticSurfaceRecord({
      identity: "ChartPageThemeRoot",
      presentationAnchor: selectorPresentationAnchor(":root"),
      sourceFile: record.sourceFile,
      surfaceKind: "chart-theme-root"
    }),
    createSyntheticSurfaceRecord({
      identity: "ChartPageHtmlDocument",
      presentationAnchor: selectorPresentationAnchor("html"),
      sourceFile: record.sourceFile,
      surfaceKind: "chart-document"
    }),
    createSyntheticSurfaceRecord({
      identity: "ChartPageBody",
      presentationAnchor: selectorPresentationAnchor("body.chart-page"),
      sourceFile: record.sourceFile,
      surfaceKind: "chart-document"
    }),
    createSyntheticSurfaceRecord({
      identity: "ChartPageViewport",
      presentationAnchor: selectorPresentationAnchor(".chart-page__viewport"),
      sourceFile: record.sourceFile,
      surfaceKind: "chart-viewport"
    }),
    createSyntheticSurfaceRecord({
      identity: "ChartPageHost",
      presentationAnchor: selectorPresentationAnchor(".chart-page__host"),
      sourceFile: record.sourceFile,
      surfaceKind: "chart-host"
    }),
    createSyntheticSurfaceRecord({
      identity: "ChartPageMountSurface",
      presentationAnchor: selectorPresentationAnchor(".chart-page__mount"),
      sourceFile: record.sourceFile,
      surfaceKind: "chart-mount"
    }),
    createSyntheticSurfaceRecord({
      identity: "ChartPageOverlayCanvasSurface",
      presentationAnchor: selectorPresentationAnchor(".chart-page__overlay-canvas"),
      sourceFile: record.sourceFile,
      surfaceKind: "chart-overlay"
    }),
    createSyntheticSurfaceRecord({
      identity: "ChartPageTooltipSurface",
      presentationAnchor: selectorPresentationAnchor(".chart-page__tooltip"),
      sourceFile: record.sourceFile,
      surfaceKind: "chart-tooltip"
    })
  ];

  if (route === "goodman") {
    supplemental.push(
      createSyntheticSurfaceRecord({
        identity: "GoodmanChartHost",
        presentationAnchor: selectorPresentationAnchor(".chart-page__host.chart-page__host--goodman"),
        sourceFile: record.sourceFile,
        surfaceKind: "chart-host"
      }),
      createSyntheticSurfaceRecord({
        identity: "GoodmanChartOverlayCanvas",
        presentationAnchor: trimDomString(record.props?.overlayCanvasId),
        sourceFile: record.sourceFile,
        surfaceKind: "chart-overlay"
      }),
      createSyntheticSurfaceRecord({
        identity: "GoodmanChartTooltip",
        presentationAnchor: trimDomString(record.props?.tooltipId),
        sourceFile: record.sourceFile,
        surfaceKind: "chart-tooltip"
      })
    );
  }

  if (route === "mill-charge") {
    supplemental.push(
      createSyntheticSurfaceRecord({
        identity: "MillChargeChartHost",
        presentationAnchor: selectorPresentationAnchor(".chart-page__host.chart-page__host--mill-charge"),
        sourceFile: record.sourceFile,
        surfaceKind: "chart-host"
      })
    );
  }

  if (route === "mill-force") {
    supplemental.push(
      createSyntheticSurfaceRecord({
        identity: "MillForceChartHost",
        presentationAnchor: selectorPresentationAnchor(".chart-page__host.chart-page__host--mill-force"),
        sourceFile: record.sourceFile,
        surfaceKind: "chart-host"
      }),
      createSyntheticSurfaceRecord({
        identity: `${record.identity}OverlayCanvas`,
        presentationAnchor: trimDomString(record.props?.overlayCanvasId),
        sourceFile: record.sourceFile,
        surfaceKind: "chart-overlay"
      }),
      createSyntheticSurfaceRecord({
        identity: `${record.identity}Tooltip`,
        presentationAnchor: trimDomString(record.props?.tooltipId),
        sourceFile: record.sourceFile,
        surfaceKind: "chart-tooltip"
      })
    );
  }

  return supplemental.filter(entry => entry.presentationAnchor);
}

function knownStyleAsset(assetName) {
  return KNOWN_STYLE_ASSETS.has(assetName);
}

function stylesheetTitle(assetName) {
  const title = STYLESHEET_TITLES[assetName] ?? null;
  if (!title) throw new Error(`Unknown Engentus stylesheet asset: ${assetName}`);
  return title;
}

function assetGroupNames(assetDefinition) {
  return (assetDefinition?.declarationGroups ?? []).map(group => group.name);
}

function assetGroupIndex(assetDefinition) {
  const index = new Map();
  for (const block of assetDefinition?.declarationGroups ?? []) {
    if (block?.kind === "group" && block.name) index.set(block.name, structuredClone(block));
  }
  return index;
}

function selectDeclarationBlocks(assetDefinition, groupNames) {
  const selected = new Set(groupNames);
  return (assetDefinition?.declarationGroups ?? [])
    .filter(block => selected.has(block.name))
    .map(block => structuredClone(block));
}

function stylesheetBanner() {
  return "Generated from examples/engentus/app/engentus-desired-v2.wcss";
}

function styleAssetName(asset) {
  return asset === "chart" ? "engentus-chart-pages.css" : "engentus-shell.css";
}

export function engentusGeneratedStylesheetPath(asset) {
  const route = ENGENTUS_GENERATED_STYLESHEET_PATHS[asset] ?? null;
  if (!route) throw new Error(`Unknown Engentus generated stylesheet asset: ${asset}`);
  return route;
}

function parseIndentedWcssDocument(text) {
  const root = { text: "<root>", line: 0, indent: -1, children: [] };
  const stack = [root];
  const lines = String(text ?? "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const leading = rawLine.match(/^\s*/)?.[0] ?? "";
    if (leading.includes("\t")) {
      throw new Error(`WCSS indentation uses tabs on line ${index + 1}`);
    }
    const indent = leading.length;
    if (indent % 2 !== 0) {
      throw new Error(`WCSS indentation must use 2-space steps on line ${index + 1}`);
    }
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (indent > parent.indent + 2) {
      throw new Error(`WCSS indentation skipped a level on line ${index + 1}`);
    }
    const node = {
      text: trimmed,
      line: index + 1,
      indent,
      children: []
    };
    parent.children.push(node);
    stack.push(node);
  }

  return root;
}

function childValue(node, prefix) {
  return maybeUnquote(String(node.text).slice(prefix.length).trim());
}

function directChildrenByPrefix(node, prefixes) {
  return node.children.filter(child => prefixes.some(prefix => child.text.startsWith(prefix)));
}

function matchesDirective(text, directive) {
  return text === directive || text.startsWith(`${directive} `);
}

function onlySection(root, name) {
  return root.children.find(child => child.text === name) ?? null;
}

function styleSection(root) {
  return onlySection(root, "styles") ?? onlySection(root, "laws");
}

function sectionStatus(root) {
  return {
    tokens: onlySection(root, "tokens"),
    styles: styleSection(root),
    views: onlySection(root, "views"),
    application: onlySection(root, "application"),
    lowering: onlySection(root, "lowering")
  };
}

function renderIndentedWcssNode(node, level = 0) {
  const lines = [`${"  ".repeat(level)}${node.text}`];
  for (const child of node.children ?? []) {
    lines.push(renderIndentedWcssNode(child, level + 1));
  }
  return lines.join("\n");
}

function buildTokenSectionNode(tokens = []) {
  return {
    text: "tokens",
    children: tokens.map(token => ({
      text: `${token.name} = ${token.value}`,
      children: []
    }))
  };
}

function buildFieldNodes(fields = []) {
  const directNodes = [];
  const groupedNodes = new Map();
  const groupOrder = [];
  for (const field of fields) {
    const path = String(field?.field ?? "").trim();
    const value = String(field?.value ?? "").trim();
    if (!path || !value) continue;
    const segments = path.split(".").filter(Boolean);
    if (segments.length <= 1) {
      directNodes.push({
        text: `${path} = ${value}`,
        children: []
      });
      continue;
    }
    const group = segments[0];
    const property = segments.slice(1).join(".");
    if (!groupedNodes.has(group)) {
      groupedNodes.set(group, []);
      groupOrder.push(group);
    }
    groupedNodes.get(group).push({
      text: `${property} = ${value}`,
      children: []
    });
  }
  return [
    ...directNodes,
    ...groupOrder.map(group => ({
      text: group,
      children: groupedNodes.get(group)
    }))
  ];
}

function buildStateNode(state) {
  return {
    text: `when ${state.name}`,
    children: buildFieldNodes(state.fields)
  };
}

function buildPartNode(part) {
  return {
    text: `part ${part.name}`,
    children: [
      ...buildFieldNodes(part.fields),
      ...(part.states ?? []).map(buildStateNode)
    ]
  };
}

function buildStyleNode(style) {
  return {
    text: `style ${style.name}`,
    children: [
      ...buildFieldNodes(style.fields),
      ...(style.states ?? []).map(buildStateNode),
      ...(style.parts ?? []).map(buildPartNode)
    ]
  };
}

function buildStyleSectionNode(styles = []) {
  return {
    text: "styles",
    children: styles.map(buildStyleNode)
  };
}

function buildSeamNode(seam) {
  const children = [{ text: `prop ${seam.prop}`, children: [] }];
  if (seam.values?.length) children.push({ text: `values ${seam.values.join(" ")}`, children: [] });
  if (seam.token) children.push({ text: `token ${seam.token}`, children: [] });
  for (const identity of seam.identities ?? []) children.push({ text: `identity ${identity}`, children: [] });
  for (const trait of seam.traits ?? []) children.push({ text: `trait ${trait}`, children: [] });
  if (seam.min != null) children.push({ text: `min ${seam.min}`, children: [] });
  if (seam.max != null) children.push({ text: `max ${seam.max}`, children: [] });
  for (const note of seam.notes ?? []) children.push({ text: `note ${note}`, children: [] });
  return {
    text: `seam ${seam.kind} ${seam.name}`,
    children
  };
}

function buildApplicationSectionNode(slices = []) {
  return {
    text: "application",
    children: slices.map(slice => ({
      text: `slice ${slice.name}`,
      children: [
        { text: `asset ${slice.asset}`, children: [] },
        ...(slice.sourceFiles ?? []).map(sourceFile => ({ text: `source ${sourceFile}`, children: [] })),
        ...(slice.identities ?? []).map(identity => ({ text: `identity ${identity}`, children: [] })),
        ...(slice.traits ?? []).map(trait => ({ text: `trait ${trait}`, children: [] })),
        ...(slice.families ?? []).map(family => ({ text: `family ${family}`, children: [] })),
        ...(slice.seams ?? []).map(buildSeamNode),
        ...(slice.notes ?? []).map(note => ({ text: `note ${note}`, children: [] }))
      ]
    }))
  };
}

function replaceTopLevelSectionNode(ast, sectionName, nextSectionNode) {
  const root = ast && typeof ast === "object" ? structuredClone(ast) : { text: "__root__", children: [] };
  const children = Array.isArray(root.children) ? [...root.children] : [];
  const index = children.findIndex(node => node?.text === sectionName);
  if (index === -1) children.push(nextSectionNode);
  else children[index] = nextSectionNode;
  root.children = children;
  return root;
}

function setTopLevelSectionNodes(ast, nextSections = {}) {
  let nextAst = ast;
  for (const [sectionName, sectionNode] of Object.entries(nextSections)) {
    if (!sectionNode) continue;
    nextAst = replaceTopLevelSectionNode(nextAst, sectionName, sectionNode);
  }
  return nextAst;
}

function parseTokenSection(node) {
  return node.children.map(child => {
    const equals = child.text.indexOf("=");
    if (equals === -1) {
      throw new Error(`Invalid token declaration on line ${child.line}: ${child.text}`);
    }
    return {
      name: child.text.slice(0, equals).trim(),
      value: child.text.slice(equals + 1).trim()
    };
  });
}

function isFieldAssignmentNode(node) {
  return typeof node?.text === "string" && node.text.includes("=");
}

function parseFieldAssignmentText(text, lineNumber, context) {
  const equals = text.indexOf("=");
  if (equals === -1) {
    throw new Error(`Invalid ${context} field on line ${lineNumber}: ${text}`);
  }
  const field = text.slice(0, equals).trim();
  const value = text.slice(equals + 1).trim();
  if (!field || !value) {
    throw new Error(`Invalid ${context} field on line ${lineNumber}: ${text}`);
  }
  return { field, value };
}

function collectStyleFieldEntries(nodes, context) {
  const fields = [];
  for (const node of nodes) {
    if (isFieldAssignmentNode(node)) {
      fields.push(parseFieldAssignmentText(node.text, node.line, context));
      continue;
    }
    if (node.text.startsWith("when ") || node.text.startsWith("part ")) continue;
    const group = node.text.trim();
    for (const child of node.children ?? []) {
      if (!isFieldAssignmentNode(child)) {
        throw new Error(`Unsupported nested ${context} directive on line ${child.line}: ${child.text}`);
      }
      const assignment = parseFieldAssignmentText(child.text, child.line, context);
      fields.push({
        field: `${group}.${assignment.field}`,
        value: assignment.value
      });
    }
  }
  return fields;
}

function parseStateBlock(node, context) {
  const name = childValue(node, "when ");
  if (!name) throw new Error(`State block is missing a name on line ${node.line}`);
  return {
    name,
    line: node.line,
    fields: collectStyleFieldEntries(node.children ?? [], `${context} state ${name}`)
  };
}

function parsePartBlock(node, context) {
  const name = childValue(node, "part ");
  if (!name) throw new Error(`Part block is missing a name on line ${node.line}`);
  return {
    name,
    line: node.line,
    fields: collectStyleFieldEntries(node.children ?? [], `${context} part ${name}`),
    states: (node.children ?? [])
      .filter(child => child.text.startsWith("when "))
      .map(child => parseStateBlock(child, `${context} part ${name}`))
  };
}

function parseStyleSection(node) {
  const styles = [];
  const seen = new Set();
  for (const child of directChildrenByPrefix(node, ["style ", "law "])) {
    const name = child.text.startsWith("style ")
      ? childValue(child, "style ")
      : childValue(child, "law ");
    if (!name) throw new Error(`Style declaration is missing a name on line ${child.line}`);
    if (seen.has(name)) throw new Error(`Duplicate style family ${name} on line ${child.line}`);
    seen.add(name);
    styles.push({
      name,
      line: child.line,
      fields: collectStyleFieldEntries(child.children ?? [], `style ${name}`),
      states: (child.children ?? [])
        .filter(entry => entry.text.startsWith("when "))
        .map(entry => parseStateBlock(entry, `style ${name}`)),
      parts: (child.children ?? [])
        .filter(entry => entry.text.startsWith("part "))
        .map(entry => parsePartBlock(entry, `style ${name}`))
    });
  }
  return styles;
}

function parseViewSection(node) {
  const views = [];
  const seen = new Set();
  for (const child of directChildrenByPrefix(node, ["view "])) {
    const name = childValue(child, "view ");
    if (!name) throw new Error(`View declaration is missing a name on line ${child.line}`);
    if (seen.has(name)) throw new Error(`Duplicate view ${name} on line ${child.line}`);
    seen.add(name);
    views.push({
      name,
      line: child.line
    });
  }
  return views;
}

function parseValuesList(text) {
  return uniqueSorted(
    String(text ?? "")
      .split(/[,\s]+/)
      .map(value => value.trim())
      .filter(Boolean)
  );
}

function parseNumericValue(text, lineNumber, label) {
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric ${label} on line ${lineNumber}: ${text}`);
  }
  return value;
}

function parseSeamNode(node) {
  const [, kind = "", name = ""] = node.text.match(/^seam\s+(\S+)\s+(.+)$/) ?? [];
  if (!kind || !name) throw new Error(`Invalid seam declaration on line ${node.line}: ${node.text}`);
  const seam = {
    kind,
    name: maybeUnquote(name),
    prop: null,
    token: null,
    identities: [],
    traits: [],
    values: [],
    min: null,
    max: null,
    notes: []
  };

  for (const child of node.children) {
    if (child.text.startsWith("prop ")) {
      seam.prop = childValue(child, "prop ");
      continue;
    }
    if (child.text.startsWith("values ")) {
      seam.values = parseValuesList(childValue(child, "values "));
      continue;
    }
    if (child.text.startsWith("token ")) {
      seam.token = childValue(child, "token ");
      continue;
    }
    if (child.text.startsWith("identity ")) {
      seam.identities.push(childValue(child, "identity "));
      continue;
    }
    if (child.text.startsWith("identities ")) {
      seam.identities.push(...parseValuesList(childValue(child, "identities ")));
      continue;
    }
    if (child.text.startsWith("trait ")) {
      seam.traits.push(childValue(child, "trait "));
      continue;
    }
    if (child.text.startsWith("traits ")) {
      seam.traits.push(...parseValuesList(childValue(child, "traits ")));
      continue;
    }
    if (child.text.startsWith("min ")) {
      seam.min = parseNumericValue(childValue(child, "min "), child.line, "minimum seam bound");
      continue;
    }
    if (child.text.startsWith("max ")) {
      seam.max = parseNumericValue(childValue(child, "max "), child.line, "maximum seam bound");
      continue;
    }
    if (child.text.startsWith("note ")) {
      seam.notes.push(childValue(child, "note "));
      continue;
    }
    throw new Error(`Unsupported seam directive on line ${child.line}: ${child.text}`);
  }

  if (!seam.prop && ["className", "style"].includes(seam.name)) seam.prop = seam.name;
  if (!seam.prop) {
    throw new Error(`Seam ${seam.name} is missing a prop declaration`);
  }
  if (!["variant", "toggle", "scalar", "token", "escape"].includes(seam.kind)) {
    throw new Error(`Seam ${seam.name} uses unsupported kind ${seam.kind}`);
  }
  seam.token = maybeUnquote(seam.token) || null;
  seam.identities = uniqueSorted(seam.identities);
  seam.traits = uniqueSorted(seam.traits);
  if (seam.kind === "variant" && !seam.values.length) {
    throw new Error(`Variant seam ${seam.name} must declare values`);
  }
  if (seam.kind === "toggle" && !seam.token) {
    throw new Error(`Toggle seam ${seam.name} must declare a token`);
  }
  if (seam.kind === "scalar" && (seam.min == null || seam.max == null)) {
    throw new Error(`Scalar seam ${seam.name} must declare both min and max bounds`);
  }
  if (seam.kind === "scalar" && seam.min > seam.max) {
    throw new Error(`Scalar seam ${seam.name} has min greater than max`);
  }
  seam.notes = uniqueSorted(seam.notes);
  return seam;
}

function parseApplicationSection(node, styleNames) {
  const seen = new Set();
  const slices = [];
  for (const child of directChildrenByPrefix(node, ["slice "])) {
    const name = childValue(child, "slice ");
    if (!name) throw new Error(`Slice declaration is missing a name on line ${child.line}`);
    if (seen.has(name)) throw new Error(`Duplicate slice ${name} on line ${child.line}`);
    seen.add(name);

    const slice = {
      name,
      asset: null,
      sourceFiles: [],
      identities: [],
      traits: [],
      families: [],
      seams: [],
      overrides: [],
      notes: []
    };

    for (const line of child.children) {
      if (line.text.startsWith("asset ")) {
        slice.asset = childValue(line, "asset ");
        continue;
      }
      if (line.text.startsWith("source ")) {
        slice.sourceFiles.push(childValue(line, "source "));
        continue;
      }
      if (line.text.startsWith("oracle ")) {
        throw new Error(`Application slice ${slice.name} still declares backend oracle coverage on line ${line.line}`);
      }
      if (line.text.startsWith("identity ")) {
        slice.identities.push(childValue(line, "identity "));
        continue;
      }
      if (line.text.startsWith("trait ")) {
        slice.traits.push(childValue(line, "trait "));
        continue;
      }
      if (line.text.startsWith("family ")) {
        slice.families.push(childValue(line, "family "));
        continue;
      }
      if (line.text.startsWith("seam ")) {
        slice.seams.push(parseSeamNode(line));
        continue;
      }
      if (line.text.startsWith("override ")) {
        const prop = childValue(line, "override ");
        slice.seams.push({
          kind: "escape",
          name: prop,
          prop,
          values: [],
          min: null,
          max: null,
          notes: []
        });
        continue;
      }
      if (line.text.startsWith("note ")) {
        slice.notes.push(childValue(line, "note "));
        continue;
      }
      throw new Error(`Unsupported application directive on line ${line.line}: ${line.text}`);
    }

    slice.asset = maybeUnquote(slice.asset);
    slice.sourceFiles = uniqueSorted(slice.sourceFiles);
    slice.identities = uniqueSorted(slice.identities);
    slice.traits = uniqueSorted(slice.traits);
    slice.families = uniqueSorted(slice.families);
    slice.seams = slice.seams
      .map(seam => ({
        kind: seam.kind,
        name: seam.name,
        prop: seam.prop,
        token: seam.token ?? null,
        identities: [...(seam.identities ?? [])],
        traits: [...(seam.traits ?? [])],
        values: [...(seam.values ?? [])],
        min: seam.min ?? null,
        max: seam.max ?? null,
        notes: [...(seam.notes ?? [])]
      }))
      .sort((left, right) => left.name.localeCompare(right.name) || left.kind.localeCompare(right.kind));
    slice.overrides = uniqueSorted(slice.seams.map(seam => seam.prop));
    slice.notes = uniqueSorted(slice.notes);

    if (!slice.asset) throw new Error(`Slice ${slice.name} is missing an asset declaration`);
    if (!knownStyleAsset(slice.asset)) {
      throw new Error(`Slice ${slice.name} targets unknown asset ${slice.asset}`);
    }
    if (!slice.sourceFiles.length) {
      throw new Error(`Slice ${slice.name} is missing at least one source file`);
    }
    for (const family of slice.families) {
      if (!styleNames.has(family)) {
        throw new Error(`Slice ${slice.name} references unknown style family ${family}`);
      }
    }
    slices.push(slice);
  }
  return slices;
}

function parseFamilyToGroup(text, lineNumber) {
  const arrowIndex = text.indexOf("->");
  if (arrowIndex === -1) {
    throw new Error(`Invalid lowering family mapping on line ${lineNumber}: ${text}`);
  }
  const family = maybeUnquote(text.slice(0, arrowIndex).trim());
  const group = maybeUnquote(text.slice(arrowIndex + 2).trim());
  if (!family || !group) {
    throw new Error(`Invalid lowering family mapping on line ${lineNumber}: ${text}`);
  }
  return { family, group };
}

function parsePropertyAssignment(node, context) {
  const equals = node.text.indexOf("=");
  if (equals === -1) {
    throw new Error(`Invalid ${context} property assignment on line ${node.line}: ${node.text}`);
  }
  const property = node.text.slice(0, equals).trim();
  const value = node.text.slice(equals + 1).trim();
  if (!property || !value) {
    throw new Error(`Invalid ${context} property assignment on line ${node.line}: ${node.text}`);
  }
  return [property, value];
}

function parseRuleBlock(node) {
  const selector = childValue(node, "rule ");
  if (!selector) throw new Error(`Lowering rule is missing a selector on line ${node.line}`);
  const declarations = [];
  const blocks = [];
  for (const child of node.children) {
    if (matchesDirective(child.text, "rule")) {
      blocks.push(parseRuleBlock(child));
      continue;
    }
    declarations.push(parsePropertyAssignment(child, `rule ${selector}`));
  }
  return {
    kind: "rule",
    selector,
    declarations,
    blocks
  };
}

function parseMediaBlock(node) {
  const query = childValue(node, "media ");
  if (!query) throw new Error(`Lowering media block is missing a query on line ${node.line}`);
  const blocks = [];
  for (const child of node.children) {
    if (!matchesDirective(child.text, "rule")) {
      throw new Error(`Unsupported media child on line ${child.line}: ${child.text}`);
    }
    blocks.push(parseRuleBlock(child));
  }
  return {
    kind: "media",
    query,
    blocks
  };
}

function parseKeyframeStep(node, keyframeName) {
  let step = null;
  if (matchesDirective(node.text, "step")) {
    step = childValue(node, "step ");
  } else if (node.text === "from" || node.text === "to" || /^\d+(\.\d+)?%$/.test(node.text)) {
    step = node.text;
  }
  if (!step) {
    throw new Error(`Invalid keyframe step in ${keyframeName} on line ${node.line}: ${node.text}`);
  }
  return {
    step,
    declarations: node.children.map(child => parsePropertyAssignment(child, `keyframe ${keyframeName} ${step}`))
  };
}

function parseKeyframesBlock(node) {
  const name = childValue(node, "keyframes ");
  if (!name) throw new Error(`Lowering keyframes block is missing a name on line ${node.line}`);
  const frames = node.children.map(child => parseKeyframeStep(child, name));
  if (!frames.length) throw new Error(`Lowering keyframes ${name} is missing frames`);
  return {
    kind: "keyframes",
    name,
    frames
  };
}

function parseDeclarationGroup(node) {
  const name = childValue(node, "group ");
  if (!name) throw new Error(`Lowering declaration group is missing a name on line ${node.line}`);
  const blocks = [];
  for (const child of node.children) {
    if (matchesDirective(child.text, "rule")) {
      blocks.push(parseRuleBlock(child));
      continue;
    }
    if (matchesDirective(child.text, "media")) {
      blocks.push(parseMediaBlock(child));
      continue;
    }
    if (matchesDirective(child.text, "keyframes")) {
      blocks.push(parseKeyframesBlock(child));
      continue;
    }
    throw new Error(`Unsupported lowering declaration directive on line ${child.line}: ${child.text}`);
  }
  return {
    kind: "group",
    name,
    blocks
  };
}

const NATIVE_SELECTOR_KEYWORDS = new Set([
  "identity",
  "identities",
  "trait",
  "traits",
  "tag",
  "tags",
  "variant",
  "variants",
  "pseudo",
  "pseudos",
  "selector"
]);

function parseNativeSelector(text, lineNumber) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) throw new Error(`Native lowering rule is missing a target on line ${lineNumber}`);
  if (trimmed.startsWith("selector ")) {
    const selector = maybeUnquote(trimmed.slice("selector ".length).trim());
    if (!selector) throw new Error(`Native lowering selector escape is missing a selector on line ${lineNumber}`);
    return {
      kind: "raw",
      selector,
      refs: {
        identities: [],
        traits: [],
        variants: []
      }
    };
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const segments = [];
  let index = 0;
  let currentSegment = null;

  function collectValues(keyword) {
    const values = [];
    while (index < tokens.length && !NATIVE_SELECTOR_KEYWORDS.has(tokens[index])) {
      values.push(tokens[index]);
      index += 1;
    }
    if (!values.length) {
      throw new Error(`Native lowering selector ${keyword} is missing values on line ${lineNumber}`);
    }
    return values.map(value => maybeUnquote(value));
  }

  while (index < tokens.length) {
    const keyword = tokens[index];
    index += 1;
    if (!NATIVE_SELECTOR_KEYWORDS.has(keyword)) {
      throw new Error(`Unsupported native lowering selector keyword ${keyword} on line ${lineNumber}`);
    }
    if (keyword === "selector") {
      throw new Error(`Native lowering selector escape must be the whole target on line ${lineNumber}`);
    }
    if (["identity", "identities", "trait", "traits", "tag", "tags"].includes(keyword)) {
      const kind = keyword.startsWith("identit") ? "identity" : keyword.startsWith("trait") ? "trait" : "tag";
      currentSegment = {
        kind,
        values: collectValues(keyword),
        variants: [],
        pseudos: []
      };
      segments.push(currentSegment);
      continue;
    }
    if (!currentSegment) {
      throw new Error(`Native lowering selector ${keyword} has no base segment on line ${lineNumber}`);
    }
    if (keyword === "variant" || keyword === "variants") {
      currentSegment.variants.push(...collectValues(keyword));
      continue;
    }
    if (keyword === "pseudo" || keyword === "pseudos") {
      currentSegment.pseudos.push(...collectValues(keyword));
      continue;
    }
  }

  if (!segments.length) throw new Error(`Native lowering rule is missing a target on line ${lineNumber}`);
  return {
    kind: "semantic",
    segments,
    refs: {
      identities: uniqueSorted(segments.filter(segment => segment.kind === "identity").flatMap(segment => segment.values)),
      traits: uniqueSorted(segments.filter(segment => segment.kind === "trait").flatMap(segment => segment.values)),
      variants: uniqueSorted(segments.flatMap(segment => segment.variants))
    }
  };
}

function parseNativeRuleBlock(node) {
  const target = parseNativeSelector(childValue(node, "rule "), node.line);
  const declarations = node.children.map(child => parsePropertyAssignment(child, `native rule on line ${node.line}`));
  return {
    kind: "native-rule",
    line: node.line,
    target,
    declarations
  };
}

function parseNativeMediaBlock(node) {
  const query = childValue(node, "media ");
  if (!query) throw new Error(`Native lowering media block is missing a query on line ${node.line}`);
  const blocks = [];
  for (const child of node.children) {
    if (!matchesDirective(child.text, "rule")) {
      throw new Error(`Unsupported native media child on line ${child.line}: ${child.text}`);
    }
    blocks.push(parseNativeRuleBlock(child));
  }
  return {
    kind: "native-media",
    line: node.line,
    query,
    blocks
  };
}

function collectNativeBlockRefs(blocks = []) {
  const identities = new Set();
  const traits = new Set();
  const variants = new Set();
  const rawSelectors = new Set();

  for (const block of blocks) {
    if (block.kind === "native-rule") {
      if (block.target.kind === "raw") {
        rawSelectors.add(block.target.selector);
      } else {
        for (const identity of block.target.refs.identities) identities.add(identity);
        for (const trait of block.target.refs.traits) traits.add(trait);
        for (const variant of block.target.refs.variants) variants.add(variant);
      }
      continue;
    }
    if (block.kind === "native-media") {
      const nested = collectNativeBlockRefs(block.blocks);
      for (const identity of nested.identities) identities.add(identity);
      for (const trait of nested.traits) traits.add(trait);
      for (const variant of nested.variants) variants.add(variant);
      for (const selector of nested.rawSelectors ?? []) rawSelectors.add(selector);
      continue;
    }
  }

  return {
    identities: uniqueSorted([...identities]),
    traits: uniqueSorted([...traits]),
    variants: uniqueSorted([...variants]),
    hasRawSelectors: rawSelectors.size > 0,
    rawSelectorCount: rawSelectors.size,
    rawSelectors: uniqueSorted([...rawSelectors])
  };
}

function parseNativeBlock(node) {
  const sliceName = childValue(node, "native ");
  if (!sliceName) throw new Error(`Native lowering block is missing a slice name on line ${node.line}`);
  const blocks = [];
  for (const child of node.children) {
    if (matchesDirective(child.text, "rule")) {
      blocks.push(parseNativeRuleBlock(child));
      continue;
    }
    if (matchesDirective(child.text, "media")) {
      blocks.push(parseNativeMediaBlock(child));
      continue;
    }
    if (matchesDirective(child.text, "keyframes")) {
      blocks.push(parseKeyframesBlock(child));
      continue;
    }
    throw new Error(`Unsupported native lowering directive on line ${child.line}: ${child.text}`);
  }
  return {
    sliceName,
    blocks,
    refs: collectNativeBlockRefs(blocks)
  };
}

function collectVariantUsesFromNativeBlocks(blocks = []) {
  const uses = [];
  for (const block of blocks) {
    if (block.kind === "native-rule") {
      if (block.target.kind !== "raw") {
        for (const segment of block.target.segments) {
          for (const variant of segment.variants) {
            uses.push({
              line: block.line,
              variant,
              identities: segment.kind === "identity" ? [...segment.values] : [],
              traits: segment.kind === "trait" ? [...segment.values] : []
            });
          }
        }
      }
      continue;
    }
    if (block.kind === "native-media") {
      uses.push(...collectVariantUsesFromNativeBlocks(block.blocks));
    }
  }
  return uses;
}

function parseLoweringSection(node, authoredSlices, styleNames) {
  const authoredSliceByName = new Map(authoredSlices.map(slice => [slice.name, slice]));
  const lowering = {
    backends: []
  };
  const backendNames = new Set();

  for (const backendNode of directChildrenByPrefix(node, ["backend "])) {
    const backendName = childValue(backendNode, "backend ");
    if (!backendName) throw new Error(`Lowering backend is missing a name on line ${backendNode.line}`);
    if (backendNames.has(backendName)) throw new Error(`Duplicate lowering backend ${backendName} on line ${backendNode.line}`);
    backendNames.add(backendName);

    const backend = {
      name: backendName,
      assets: [],
      slices: []
    };
    const backendAssetNames = new Set();
    const sliceOwnersByAsset = new Map();
    const sliceNames = new Set();

    for (const assetNode of backendNode.children) {
      if (!assetNode.text.startsWith("asset ")) {
        throw new Error(`Unsupported lowering backend directive on line ${assetNode.line}: ${assetNode.text}`);
      }
      const assetName = childValue(assetNode, "asset ");
      if (!knownStyleAsset(assetName)) {
        throw new Error(`Lowering backend ${backendName} targets unknown asset ${assetName} on line ${assetNode.line}`);
      }
      if (backendAssetNames.has(assetName)) {
        throw new Error(`Duplicate lowering asset ${assetName} for backend ${backendName} on line ${assetNode.line}`);
      }
      backendAssetNames.add(assetName);
      const asset = {
        name: assetName,
        slices: [],
        declarationGroups: [],
        nativeBlocks: []
      };
      if (!sliceOwnersByAsset.has(assetName)) sliceOwnersByAsset.set(assetName, new Map());
      const ownedGroups = sliceOwnersByAsset.get(assetName);
      const declaredGroupNames = new Set();
      const nativeBlockNames = new Set();

      for (const child of assetNode.children) {
        if (child.text.startsWith("slice ")) {
          const sliceName = childValue(child, "slice ");
          const authoredSlice = authoredSliceByName.get(sliceName) ?? null;
          if (!authoredSlice) {
            throw new Error(`Lowering backend ${backendName} references unknown slice ${sliceName} on line ${child.line}`);
          }
          if (authoredSlice.asset !== assetName) {
            throw new Error(`Lowering backend ${backendName} maps slice ${sliceName} to asset ${assetName} but application declares ${authoredSlice.asset}`);
          }
          if (sliceNames.has(sliceName)) {
            throw new Error(`Lowering backend ${backendName} declares slice ${sliceName} more than once`);
          }
          sliceNames.add(sliceName);

          const slice = {
            name: sliceName,
            asset: assetName,
            mode: "declaration-groups",
            groups: [],
            seams: [],
            familyGroups: [],
            notes: []
          };
          const familyNames = new Set();

          for (const line of child.children) {
            if (line.text.startsWith("mode ")) {
              slice.mode = childValue(line, "mode ");
              continue;
            }
            if (line.text.startsWith("group ")) {
              slice.groups.push(childValue(line, "group "));
              continue;
            }
            if (line.text.startsWith("seam ")) {
              slice.seams.push(childValue(line, "seam "));
              continue;
            }
            if (line.text.startsWith("family ")) {
              slice.familyGroups.push(parseFamilyToGroup(childValue(line, "family "), line.line));
              continue;
            }
            if (line.text.startsWith("note ")) {
              slice.notes.push(childValue(line, "note "));
              continue;
            }
            throw new Error(`Unsupported lowering directive on line ${line.line}: ${line.text}`);
          }

          slice.groups = uniqueSorted(slice.groups);
          slice.seams = uniqueSorted(slice.seams);
          slice.notes = uniqueSorted(slice.notes);
          slice.familyGroups = slice.familyGroups
            .map(entry => ({
              family: entry.family,
              group: entry.group
            }))
            .sort((left, right) => left.family.localeCompare(right.family) || left.group.localeCompare(right.group));

          if (!slice.groups.length) {
            throw new Error(`Lowering backend ${backendName} slice ${sliceName} is missing backend group coverage`);
          }
          if (!["declaration-groups", "native-browser"].includes(slice.mode)) {
            throw new Error(`Lowering backend ${backendName} slice ${sliceName} uses unsupported mode ${slice.mode}`);
          }

          for (const seam of slice.seams) {
            if (!slice.groups.includes(seam)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} declares seam ${seam} without owning that backend group`);
            }
          }

          for (const mapping of slice.familyGroups) {
            if (!styleNames.has(mapping.family)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} references unknown style family ${mapping.family}`);
            }
            if (!authoredSlice.families.includes(mapping.family)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} maps family ${mapping.family} that is not declared on the application slice`);
            }
            if (!slice.groups.includes(mapping.group)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} maps family ${mapping.family} to undeclared backend group ${mapping.group}`);
            }
            if (familyNames.has(mapping.family)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} maps family ${mapping.family} more than once`);
            }
            familyNames.add(mapping.family);
          }

          for (const family of authoredSlice.families) {
            if (!familyNames.has(family)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} is missing browser lowering coverage for family ${family}`);
            }
          }

          for (const group of slice.groups) {
            const priorOwner = ownedGroups.get(group);
            if (priorOwner && priorOwner !== sliceName) {
              throw new Error(`Lowering backend ${backendName} asset ${assetName} claims backend group ${group} from both ${priorOwner} and ${sliceName}`);
            }
            ownedGroups.set(group, sliceName);
          }

          asset.slices.push(slice);
          backend.slices.push(slice);
          continue;
        }

        if (child.text.startsWith("native ")) {
          const nativeBlock = parseNativeBlock(child);
          if (nativeBlockNames.has(nativeBlock.sliceName)) {
            throw new Error(`Lowering backend ${backendName} asset ${assetName} declares native slice ${nativeBlock.sliceName} more than once`);
          }
          nativeBlockNames.add(nativeBlock.sliceName);
          asset.nativeBlocks.push(nativeBlock);
          continue;
        }

        if (child.text.startsWith("group ")) {
          const declarationGroup = parseDeclarationGroup(child);
          if (declaredGroupNames.has(declarationGroup.name)) {
            throw new Error(`Lowering backend ${backendName} asset ${assetName} declares browser group ${declarationGroup.name} more than once`);
          }
          declaredGroupNames.add(declarationGroup.name);
          asset.declarationGroups.push(declarationGroup);
          continue;
        }

        throw new Error(`Unsupported lowering asset directive on line ${child.line}: ${child.text}`);
      }

      for (const slice of asset.slices) {
        for (const group of slice.groups) {
          if (!declaredGroupNames.has(group) && slice.mode !== "native-browser") {
            throw new Error(`Lowering backend ${backendName} asset ${assetName} selects browser group ${group} without a declaration group`);
          }
        }
        if (slice.mode === "native-browser" && !nativeBlockNames.has(slice.name)) {
          throw new Error(`Lowering backend ${backendName} asset ${assetName} marks slice ${slice.name} as native-browser without a native block`);
        }
      }

      for (const declaredGroup of declaredGroupNames) {
        if (!ownedGroups.has(declaredGroup)) {
          throw new Error(`Lowering backend ${backendName} asset ${assetName} declares browser group ${declaredGroup} without a slice owner`);
        }
      }
      for (const nativeSliceName of nativeBlockNames) {
        if (!asset.slices.some(slice => slice.name === nativeSliceName)) {
          throw new Error(`Lowering backend ${backendName} asset ${assetName} declares native block ${nativeSliceName} without a matching slice`);
        }
      }

      backend.assets.push(asset);
    }

    for (const authoredSlice of authoredSlices) {
      if (!sliceNames.has(authoredSlice.name)) {
        throw new Error(`Lowering backend ${backendName} is missing coverage for slice ${authoredSlice.name}`);
      }
    }

    lowering.backends.push(backend);
  }

  const browserLowering = lowering.backends.find(backend => backend.name === DEFAULT_BROWSER_BACKEND) ?? null;
  if (!browserLowering) {
    throw new Error(`Missing required lowering backend ${DEFAULT_BROWSER_BACKEND}`);
  }

  for (const backend of lowering.backends) {
    backend.assetsByName = Object.fromEntries(backend.assets.map(asset => [asset.name, asset]));
    for (const asset of backend.assets) {
      asset.nativeBlocksBySlice = Object.fromEntries(asset.nativeBlocks.map(block => [block.sliceName, block]));
    }
  }
  lowering.byBackend = Object.fromEntries(lowering.backends.map(backend => [backend.name, backend]));
  return lowering;
}

function compatibilitySlicesFromDocument(document, loweringSidecar, backendName = DEFAULT_BROWSER_BACKEND) {
  const backend = loweringSidecar?.byBackend?.[backendName] ?? null;
  if (!backend) throw new Error(`Unknown lowering backend ${backendName}`);
  const loweringBySlice = new Map(backend.slices.map(slice => [slice.name, slice]));
  return (document?.application?.slices ?? []).map(slice => {
    const lowering = loweringBySlice.get(slice.name) ?? null;
    if (!lowering) throw new Error(`Missing lowering coverage for slice ${slice.name} on backend ${backendName}`);
    return {
      ...structuredClone(slice),
      oracleGroups: [...lowering.groups],
      lowering: {
        [backendName]: structuredClone(lowering)
      }
    };
  });
}

export function renderOracleStylesheet(stylesheet) {
  return renderWcssStylesheet(stylesheet, {
    banner: stylesheetBanner()
  });
}

export function parseEngentusCanonicalWcss(text) {
  const root = parseIndentedWcssDocument(text);
  const themeNode = root.children.find(child => child.text.startsWith("theme ")) ?? null;
  const theme = themeNode ? childValue(themeNode, "theme ") : null;
  if (theme !== ENGENTUS_STYLE_THEME) {
    throw new Error(`Expected theme ${ENGENTUS_STYLE_THEME} but found ${theme || "<none>"}`);
  }

  const sections = sectionStatus(root);
  for (const sectionName of REQUIRED_CORE_TOP_LEVEL_SECTIONS) {
    if (!sections[sectionName]) throw new Error(`Missing required top-level section: ${sectionName}`);
  }

  const tokens = parseTokenSection(sections.tokens);
  const styles = parseStyleSection(sections.styles);
  const views = parseViewSection(sections.views);
  const slices = parseApplicationSection(sections.application, new Set(styles.map(style => style.name)));

  return {
    kind: "wcss-document",
    theme,
    tokens,
    styles,
    views,
    application: {
      slices
    },
    sections: {
      theme: structuredClone(themeNode),
      tokens: structuredClone(sections.tokens),
      styles: structuredClone(sections.styles),
      views: structuredClone(sections.views),
      application: structuredClone(sections.application)
    },
    attachments: {
      loweringSectionPresent: Boolean(sections.lowering),
      loweringSection: sections.lowering ? structuredClone(sections.lowering) : null
    },
    ast: root
  };
}

function collectNamesByDomain(names = []) {
  const grouped = new Map();
  for (const name of names) {
    const domain = primaryNameDomain(name) ?? "unknown";
    if (!grouped.has(domain)) grouped.set(domain, []);
    grouped.get(domain).push(name);
  }
  return [...grouped.entries()]
    .map(([domain, values]) => ({
      domain,
      count: values.length,
      names: uniqueSorted(values)
    }))
    .sort((left, right) => left.domain.localeCompare(right.domain));
}

export function buildEngentusCanonicalStyleGrammar(canonical) {
  const tokensByDomain = collectNamesByDomain((canonical?.tokens ?? []).map(token => token.name));
  const stylesByDomain = collectNamesByDomain((canonical?.styles ?? []).map(style => style.name));
  const slices = (canonical?.application?.slices ?? canonical?.slices ?? []).map(slice => {
    const familyDomains = uniqueSorted(slice.families.map(family => primaryNameDomain(family)));
    const seamKinds = uniqueSorted(slice.seams.map(seam => seam.kind));
    return {
      name: slice.name,
      asset: slice.asset,
      sourceFiles: [...slice.sourceFiles],
      identities: [...slice.identities],
      traits: [...slice.traits],
      families: [...slice.families],
      familyDomains,
      seams: structuredClone(slice.seams),
      seamKinds,
      seamNames: slice.seams.map(seam => seam.name),
      notes: [...slice.notes]
    };
  });

  const tokenDomainNames = uniqueSorted(tokensByDomain.map(entry => entry.domain));
  const styleDomainNames = uniqueSorted(stylesByDomain.map(entry => entry.domain));
  const errors = [];
  const warnings = [];

  for (const token of canonical?.tokens ?? []) {
    const segments = nameSegments(token.name);
    if (segments.length < 2) {
      errors.push(`Token ${token.name} must include at least a domain and one semantic segment`);
      continue;
    }
    const domain = segments[0];
    if (!CANONICAL_TOKEN_DOMAINS.includes(domain)) {
      errors.push(`Token ${token.name} uses unsupported token domain ${domain}`);
    }
  }

  for (const style of canonical?.styles ?? []) {
    const segments = nameSegments(style.name);
    if (segments.length < 2) {
      errors.push(`Style family ${style.name} must include a domain and family name`);
      continue;
    }
    const domain = segments[0];
    if (!CANONICAL_STYLE_DOMAINS.includes(domain)) {
      errors.push(`Style family ${style.name} uses unsupported style domain ${domain}`);
    }
  }

  for (const slice of slices) {
    const allowedFamilyDomains = CANONICAL_SLICE_FAMILY_DOMAINS[slice.name] ?? [];
    if (!allowedFamilyDomains.length) {
      warnings.push(`Slice ${slice.name} has no formal family-domain contract`);
    }
    for (const family of slice.families) {
      const domain = primaryNameDomain(family);
      if (domain && allowedFamilyDomains.length && !allowedFamilyDomains.includes(domain)) {
        errors.push(`Slice ${slice.name} uses style family ${family} outside its allowed family domains: ${allowedFamilyDomains.join(", ")}`);
      }
    }
    const seamPrefix = CANONICAL_SLICE_SEAM_PREFIXES[slice.name] ?? null;
    if (!seamPrefix) {
      warnings.push(`Slice ${slice.name} has no formal seam prefix contract`);
    }
    for (const seam of slice.seams) {
      const seamName = String(seam.name || "");
      const isExplicitEscape = seam.kind === "escape" && (seamName === seam.prop || ["className", "style"].includes(seamName));
      if (seamPrefix && !isExplicitEscape && !seamName.startsWith(seamPrefix)) {
        errors.push(`Slice ${slice.name} seam ${seam.name} must use prefix ${seamPrefix}`);
      }
    }
  }

  return {
    theme: canonical?.theme ?? null,
    views: (canonical?.views ?? []).map(view => view.name),
    tokens: {
      total: canonical?.tokens?.length ?? 0,
      allowedDomains: [...CANONICAL_TOKEN_DOMAINS],
      byDomain: tokensByDomain,
      domains: tokenDomainNames
    },
    styles: {
      total: canonical?.styles?.length ?? 0,
      allowedDomains: [...CANONICAL_STYLE_DOMAINS],
      byDomain: stylesByDomain,
      domains: styleDomainNames
    },
    application: {
      sliceCount: slices.length,
      sliceFamilyDomainContracts: structuredClone(CANONICAL_SLICE_FAMILY_DOMAINS),
      sliceSeamPrefixContracts: structuredClone(CANONICAL_SLICE_SEAM_PREFIXES),
      slices
    },
    consistency: {
      ok: errors.length === 0,
      errors,
      warnings
    }
  };
}

export function validateEngentusCanonicalStyleGrammar(canonical) {
  const grammar = buildEngentusCanonicalStyleGrammar(canonical);
  if (!grammar.consistency.ok) {
    throw new Error(`Engentus canonical style grammar is inconsistent:\n${grammar.consistency.errors.map(line => `- ${line}`).join("\n")}`);
  }
  return grammar;
}

export function serializeEngentusCanonicalWcss(document) {
  if (!document || document.kind !== "wcss-document") {
    throw new Error("serializeEngentusCanonicalWcss expects a WCSSDocument");
  }
  const nodes = [
    document.sections?.theme ?? { text: `theme ${document.theme}`, children: [] },
    document.sections?.tokens,
    document.sections?.styles,
    document.sections?.views,
    document.sections?.application
  ].filter(Boolean);
  return `${nodes.map(node => renderIndentedWcssNode(node)).join("\n\n")}\n`;
}

function serializeEngentusDocumentWithAttachments(document) {
  const children = Array.isArray(document?.ast?.children) ? document.ast.children : [];
  return `${children.map(node => renderIndentedWcssNode(node)).join("\n\n")}\n`;
}

function tokenValueByName(document) {
  return new Map((document?.tokens ?? []).map(token => [token.name, token.value]));
}

function canonicalizeEngentusDocument(document) {
  const canonical = structuredClone(document);
  canonical.grammar = validateEngentusCanonicalStyleGrammar(canonical);
  return canonical;
}

function styleFieldBindingKey({
  style,
  field,
  part = null,
  state = null
}) {
  return [
    style,
    part ? `part:${part}` : "base",
    state ? `state:${state}` : field
  ].join("\u0000") + (state ? `\u0000${field}` : "");
}

function buildStyleFieldValueIndex(document) {
  const index = new Map();
  for (const style of document?.styles ?? []) {
    for (const field of style.fields ?? []) {
      index.set(styleFieldBindingKey({
        style: style.name,
        field: field.field
      }), field.value);
    }
    for (const state of style.states ?? []) {
      for (const field of state.fields ?? []) {
        index.set(styleFieldBindingKey({
          style: style.name,
          state: state.name,
          field: field.field
        }), field.value);
      }
    }
    for (const part of style.parts ?? []) {
      for (const field of part.fields ?? []) {
        index.set(styleFieldBindingKey({
          style: style.name,
          part: part.name,
          field: field.field
        }), field.value);
      }
      for (const state of part.states ?? []) {
        for (const field of state.fields ?? []) {
          index.set(styleFieldBindingKey({
            style: style.name,
            part: part.name,
            state: state.name,
            field: field.field
          }), field.value);
        }
      }
    }
  }
  return index;
}

export function buildEngentusTokenCatalog(document) {
  const values = tokenValueByName(document);
  return {
    theme: ENGENTUS_STYLE_THEME,
    tokens: Object.entries(ENGENTUS_PREVIEWABLE_TOKEN_BINDINGS)
      .map(([name, bindings]) => {
        if (!values.has(name)) return null;
        return {
          name,
          value: values.get(name),
          domain: primaryNameDomain(name),
          bindings: structuredClone(bindings)
        };
      })
      .filter(Boolean)
  };
}

export function buildEngentusAuthoringSchema(document) {
  if (!document || document.kind !== "wcss-document") {
    throw new Error("buildEngentusAuthoringSchema requires a WCSSDocument");
  }
  const tokenCatalog = buildEngentusTokenCatalog(document);
  const previewableTokens = new Set(tokenCatalog.tokens.map(token => token.name));
  const grammar = document.grammar ?? buildEngentusCanonicalStyleGrammar(document);
  return {
    theme: document.theme,
    supportedOperations: [...WCSS_AUTHORING_OPERATION_KINDS],
    tokens: (document.tokens ?? []).map(token => ({
      name: token.name,
      domain: primaryNameDomain(token.name),
      currentValue: token.value,
      canonicalValue: token.value,
      previewable: previewableTokens.has(token.name),
      editable: true
    })),
    styles: (document.styles ?? []).map(style => ({
      name: style.name,
      domain: primaryNameDomain(style.name),
      editable: true,
      fields: (style.fields ?? []).map(field => ({
        field: field.field,
        value: field.value,
        previewable: ENGENTUS_PREVIEWABLE_STYLE_FIELD_BINDINGS[styleFieldBindingKey({
          style: style.name,
          field: field.field
        })] != null,
        editable: true
      })),
      states: (style.states ?? []).map(state => ({
        name: state.name,
        editable: true,
        fields: (state.fields ?? []).map(field => ({
          field: field.field,
          value: field.value,
          previewable: ENGENTUS_PREVIEWABLE_STYLE_FIELD_BINDINGS[styleFieldBindingKey({
            style: style.name,
            state: state.name,
            field: field.field
          })] != null,
          editable: true
        }))
      })),
      parts: (style.parts ?? []).map(part => ({
        name: part.name,
        editable: true,
        fields: (part.fields ?? []).map(field => ({
          field: field.field,
          value: field.value,
          previewable: ENGENTUS_PREVIEWABLE_STYLE_FIELD_BINDINGS[styleFieldBindingKey({
            style: style.name,
            part: part.name,
            field: field.field
          })] != null,
          editable: true
        })),
        states: (part.states ?? []).map(state => ({
          name: state.name,
          editable: true,
          fields: (state.fields ?? []).map(field => ({
            field: field.field,
            value: field.value,
            previewable: ENGENTUS_PREVIEWABLE_STYLE_FIELD_BINDINGS[styleFieldBindingKey({
              style: style.name,
              part: part.name,
              state: state.name,
              field: field.field
            })] != null,
            editable: true
          }))
        }))
      }))
    })),
    slices: (document.application?.slices ?? []).map(slice => ({
      name: slice.name,
      asset: slice.asset,
      currentFamilies: [...slice.families],
      allowedFamilyDomains: [...(grammar.application.sliceFamilyDomainContracts[slice.name] ?? [])],
      seams: structuredClone(slice.seams),
      editable: {
        families: true,
        seams: true,
        topology: false
      }
    })),
    views: (document.views ?? []).map(view => ({
      name: view.name,
      readOnly: true
    })),
    contributions: {
      themes: [],
      styles: [],
      authoringTools: []
    }
  };
}

function ensureFieldGroupAllowed(field, operationKind) {
  const normalized = String(field ?? "").trim();
  if (!normalized) throw new Error(`${operationKind} requires field`);
  const [group] = normalized.split(".");
  if (normalized.includes(".") && !WCSS_STYLE_FIELD_GROUPS.includes(group)) {
    throw new Error(`${operationKind} uses unknown field group ${group}`);
  }
  return normalized;
}

function findStyle(styles, styleName, operationKind) {
  const style = styles.find(entry => entry.name === styleName) ?? null;
  if (!style) throw new Error(`${operationKind} references unknown style ${styleName}`);
  return style;
}

function findSlice(slices, sliceName, operationKind) {
  const slice = slices.find(entry => entry.name === sliceName) ?? null;
  if (!slice) throw new Error(`${operationKind} references unknown slice ${sliceName}`);
  return slice;
}

function partContainerForStyle(style, partName, operationKind) {
  if (!partName) return style;
  const part = (style.parts ?? []).find(entry => entry.name === partName) ?? null;
  if (!part) throw new Error(`${operationKind} references unknown part ${partName} in style ${style.name}`);
  return part;
}

function findState(states, stateName) {
  return (states ?? []).find(entry => entry.name === stateName) ?? null;
}

function fieldIndex(fields, field) {
  return (fields ?? []).findIndex(entry => entry.field === field);
}

function setFieldValue(fields, field, value) {
  const index = fieldIndex(fields, field);
  if (index === -1) fields.push({ field, value });
  else fields[index] = { field, value };
}

function removeFieldValue(fields, field) {
  const index = fieldIndex(fields, field);
  if (index !== -1) fields.splice(index, 1);
}

function ensureState(states, stateName) {
  let state = findState(states, stateName);
  if (!state) {
    state = { name: stateName, fields: [] };
    states.push(state);
  }
  return state;
}

function removeState(states, stateName) {
  const index = (states ?? []).findIndex(entry => entry.name === stateName);
  if (index === -1) return;
  states.splice(index, 1);
}

function originalFieldValue(originalDocument, {
  styleName,
  partName = null,
  stateName = null,
  field,
  operationKind
}) {
  const style = findStyle(originalDocument.styles ?? [], styleName, operationKind);
  const container = partContainerForStyle(style, partName, operationKind);
  if (!stateName) {
    return (container.fields ?? []).find(entry => entry.field === field)?.value ?? null;
  }
  const state = findState(container.states ?? [], stateName);
  return state?.fields?.find(entry => entry.field === field)?.value ?? null;
}

function normalizeSeamPatch(seam, operationKind) {
  if (!seam || typeof seam !== "object" || Array.isArray(seam)) {
    throw new Error(`${operationKind} requires seam`);
  }
  const kind = typeof seam.kind === "string" ? seam.kind.trim() : "";
  const name = typeof seam.name === "string" ? seam.name.trim() : "";
  const prop = typeof seam.prop === "string" ? seam.prop.trim() : "";
  if (!kind || !name || !prop) {
    throw new Error(`${operationKind} requires seam kind, name, and prop`);
  }
  return {
    kind,
    name,
    prop,
    token: typeof seam.token === "string" && seam.token.trim() ? seam.token.trim() : null,
    identities: uniqueSorted(Array.isArray(seam.identities) ? seam.identities.map(value => String(value).trim()).filter(Boolean) : []),
    traits: uniqueSorted(Array.isArray(seam.traits) ? seam.traits.map(value => String(value).trim()).filter(Boolean) : []),
    values: uniqueSorted(Array.isArray(seam.values) ? seam.values.map(value => String(value).trim()).filter(Boolean) : []),
    min: seam.min == null ? null : Number(seam.min),
    max: seam.max == null ? null : Number(seam.max),
    notes: uniqueSorted(Array.isArray(seam.notes) ? seam.notes.map(value => String(value).trim()).filter(Boolean) : [])
  };
}

export function applyEngentusDocumentPatch(document, { ops } = {}) {
  if (!document || document.kind !== "wcss-document") {
    throw new Error("applyEngentusDocumentPatch requires a WCSSDocument");
  }
  if (!Array.isArray(ops)) {
    throw new Error("applyEngentusDocumentPatch requires ops");
  }
  const original = structuredClone(document);
  const nextTokens = structuredClone(document.tokens ?? []);
  const nextStyles = structuredClone(document.styles ?? []);
  const nextSlices = structuredClone(document.application?.slices ?? []);
  const tokenCatalog = buildEngentusTokenCatalog(document);
  const previewableTokens = new Set(tokenCatalog.tokens.map(token => token.name));

  for (const [index, rawOp] of ops.entries()) {
    const kind = typeof rawOp?.kind === "string" ? rawOp.kind.trim() : "";
    if (!kind) throw new Error(`Document patch op ${index} is missing kind`);
    if (!WCSS_AUTHORING_OPERATION_KINDS.includes(kind)) {
      throw new Error(`Unsupported document patch op ${kind}`);
    }
    if (kind.startsWith("token.")) {
      const tokenName = typeof rawOp?.token === "string" ? rawOp.token.trim() : "";
      if (!tokenName) throw new Error(`${kind} is missing token`);
      const tokenIndex = nextTokens.findIndex(token => token.name === tokenName);
      if (kind === "token.create") {
        const value = typeof rawOp?.value === "string" ? rawOp.value.trim() : "";
        if (!value) throw new Error("token.create requires value");
        if (tokenIndex !== -1) throw new Error(`Token ${tokenName} already exists`);
        nextTokens.push({ name: tokenName, value });
        continue;
      }
      if (tokenIndex === -1) throw new Error(`${kind} references unknown token ${tokenName}`);
      if (kind === "token.remove") {
        nextTokens.splice(tokenIndex, 1);
        continue;
      }
      if (kind === "token.set") {
        const value = typeof rawOp?.value === "string" ? rawOp.value.trim() : "";
        if (!value) throw new Error("token.set requires value");
        nextTokens[tokenIndex] = { name: tokenName, value };
        continue;
      }
      if (kind === "token.reset") {
        const originalTokens = tokenValueByName(original);
        if (!previewableTokens.has(tokenName) && !originalTokens.has(tokenName)) {
          throw new Error(`Unknown Engentus token ${tokenName}`);
        }
        if (!originalTokens.has(tokenName)) {
          nextTokens.splice(tokenIndex, 1);
        } else {
          nextTokens[tokenIndex] = { name: tokenName, value: originalTokens.get(tokenName) };
        }
        continue;
      }
    }

    if (kind === "style.create") {
      const styleName = typeof rawOp?.style === "string" ? rawOp.style.trim() : "";
      if (!styleName) throw new Error("style.create requires style");
      if ((nextStyles ?? []).some(style => style.name === styleName)) {
        throw new Error(`Style ${styleName} already exists`);
      }
      nextStyles.push({
        name: styleName,
        fields: [],
        states: [],
        parts: []
      });
      continue;
    }

    if (kind === "style.remove") {
      const styleName = typeof rawOp?.style === "string" ? rawOp.style.trim() : "";
      const styleIndex = nextStyles.findIndex(style => style.name === styleName);
      if (styleIndex === -1) throw new Error(`style.remove references unknown style ${styleName}`);
      nextStyles.splice(styleIndex, 1);
      continue;
    }

    if (kind.startsWith("style.")) {
      const styleName = typeof rawOp?.style === "string" ? rawOp.style.trim() : "";
      const partName = typeof rawOp?.part === "string" && rawOp.part.trim() ? rawOp.part.trim() : null;
      const style = findStyle(nextStyles, styleName, kind);
      const container = partContainerForStyle(style, partName, kind);
      if (kind === "style.field.set" || kind === "style.field.reset") {
        const field = ensureFieldGroupAllowed(rawOp?.field, kind);
        if (kind === "style.field.set") {
          const value = typeof rawOp?.value === "string" ? rawOp.value.trim() : "";
          if (!value) throw new Error("style.field.set requires value");
          setFieldValue(container.fields, field, value);
        } else {
          const value = originalFieldValue(original, {
            styleName,
            partName,
            field,
            operationKind: kind
          });
          if (value == null) removeFieldValue(container.fields, field);
          else setFieldValue(container.fields, field, value);
        }
        continue;
      }
      const stateName = typeof rawOp?.state === "string" ? rawOp.state.trim() : "";
      if (!stateName) throw new Error(`${kind} requires state`);
      if (kind === "style.state.create") {
        if (findState(container.states, stateName)) {
          throw new Error(`State ${stateName} already exists in style ${styleName}`);
        }
        container.states.push({ name: stateName, fields: [] });
        continue;
      }
      if (kind === "style.state.remove") {
        if (!findState(container.states, stateName)) {
          throw new Error(`style.state.remove references unknown state ${stateName}`);
        }
        removeState(container.states, stateName);
        continue;
      }
      const state = findState(container.states, stateName);
      if (!state) throw new Error(`${kind} references unknown state ${stateName}`);
      const field = ensureFieldGroupAllowed(rawOp?.field, kind);
      if (kind === "style.state_field.set") {
        const value = typeof rawOp?.value === "string" ? rawOp.value.trim() : "";
        if (!value) throw new Error("style.state_field.set requires value");
        setFieldValue(state.fields, field, value);
        continue;
      }
      if (kind === "style.state_field.reset") {
        const value = originalFieldValue(original, {
          styleName,
          partName,
          stateName,
          field,
          operationKind: kind
        });
        if (value == null) {
          removeFieldValue(state.fields, field);
          if (!state.fields.length && !findState((partContainerForStyle(findStyle(original.styles ?? [], styleName, kind), partName, kind).states ?? []), stateName)) {
            removeState(container.states, stateName);
          }
        } else {
          setFieldValue(state.fields, field, value);
        }
        continue;
      }
    }

    if (kind === "slice.family.assign" || kind === "slice.family.unassign") {
      const sliceName = typeof rawOp?.slice === "string" ? rawOp.slice.trim() : "";
      const family = typeof rawOp?.family === "string" ? rawOp.family.trim() : "";
      if (!family) throw new Error(`${kind} requires family`);
      const slice = findSlice(nextSlices, sliceName, kind);
      const nextFamilies = new Set(slice.families ?? []);
      if (kind === "slice.family.assign") nextFamilies.add(family);
      else nextFamilies.delete(family);
      slice.families = uniqueSorted([...nextFamilies]);
      continue;
    }

    if (kind === "slice.seam.upsert" || kind === "slice.seam.remove") {
      const sliceName = typeof rawOp?.slice === "string" ? rawOp.slice.trim() : "";
      const slice = findSlice(nextSlices, sliceName, kind);
      if (kind === "slice.seam.remove") {
        const seamName = typeof rawOp?.seam === "string" ? rawOp.seam.trim() : "";
        if (!seamName) throw new Error("slice.seam.remove requires seam");
        slice.seams = (slice.seams ?? []).filter(seam => seam.name !== seamName);
      } else {
        const seam = normalizeSeamPatch(rawOp?.seam, kind);
        const seams = [...(slice.seams ?? []).filter(entry => entry.name !== seam.name), seam];
        slice.seams = seams.sort((left, right) => left.name.localeCompare(right.name) || left.kind.localeCompare(right.kind));
      }
      slice.overrides = uniqueSorted((slice.seams ?? []).map(seam => seam.prop));
      continue;
    }
  }

  const nextSections = {
    ...(document.sections ?? {}),
    tokens: buildTokenSectionNode(nextTokens),
    styles: buildStyleSectionNode(nextStyles),
    application: buildApplicationSectionNode(nextSlices)
  };
  const nextAst = setTopLevelSectionNodes(document.ast, {
    tokens: nextSections.tokens,
    styles: nextSections.styles,
    application: nextSections.application
  });
  const reparsed = parseEngentusCanonicalWcss(serializeEngentusDocumentWithAttachments({
    ...structuredClone(document),
    sections: nextSections,
    ast: nextAst
  }));
  return canonicalizeEngentusDocument(reparsed);
}

export function applyEngentusTokenPatch(document, { ops } = {}) {
  return applyEngentusDocumentPatch(document, {
    ops: Array.isArray(ops)
      ? ops.map(op => {
        const kind = typeof op?.kind === "string" ? op.kind.trim() : "";
        if (kind === "set") {
          return {
            kind: "token.set",
            token: op.token,
            value: op.value
          };
        }
        if (kind === "reset") {
          return {
            kind: "token.reset",
            token: op.token
          };
        }
        return op;
      })
      : ops
  });
}

export async function loadEngentusCanonicalWcss(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const canonical = parseEngentusCanonicalWcss(await readFile(file, "utf8"));
  canonical.grammar = validateEngentusCanonicalStyleGrammar(canonical);
  return canonical;
}

export async function loadEngentusCanonicalStyleGrammar(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const canonical = await loadEngentusCanonicalWcss(file);
  return structuredClone(canonical.grammar ?? buildEngentusCanonicalStyleGrammar(canonical));
}

export function deriveEngentusLoweringSidecar({
  document,
  text
} = {}) {
  if (!document || document.kind !== "wcss-document") {
    throw new Error("deriveEngentusLoweringSidecar requires a WCSSDocument");
  }
  const sourceText = typeof text === "string" ? text : serializeEngentusCanonicalWcss(document);
  const root = typeof text === "string" ? parseIndentedWcssDocument(text) : document.ast;
  const sections = sectionStatus(root);
  if (!sections.lowering) {
    throw new Error(`Missing required lowering section for renderer backend ${DEFAULT_BROWSER_BACKEND}`);
  }
  const lowering = parseLoweringSection(
    sections.lowering,
    document.application.slices,
    new Set(document.styles.map(style => style.name))
  );
  return {
    kind: "wcss-renderer-sidecar",
    theme: document.theme,
    sourceText,
    backends: structuredClone(lowering.backends),
    byBackend: structuredClone(lowering.byBackend),
    sections: {
      lowering: structuredClone(sections.lowering)
    }
  };
}

export async function loadEngentusLoweringSidecar(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const [text, canonical] = await Promise.all([
    readFile(file, "utf8"),
    loadEngentusCanonicalWcss(file)
  ]);
  return deriveEngentusLoweringSidecar({
    document: canonical,
    text
  });
}

export async function loadEngentusBrowserLoweringMap(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const sidecar = await loadEngentusLoweringSidecar(file);
  return structuredClone(sidecar.byBackend[DEFAULT_BROWSER_BACKEND]);
}

export async function loadEngentusBrowserDeclarationGroups(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const browserLowering = await loadEngentusBrowserLoweringMap(file);
  return Object.fromEntries(
    browserLowering.assets.map(asset => [asset.name, structuredClone(asset.declarationGroups)])
  );
}

export async function loadEngentusAppliedWcss(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const [canonical, loweringSidecar] = await Promise.all([
    loadEngentusCanonicalWcss(file),
    loadEngentusLoweringSidecar(file)
  ]);
  return createEngentusAppliedWcssFromDocument(canonical, { loweringSidecar });
}

export function createEngentusAppliedWcssFromDocument(document, {
  loweringSidecar = null
} = {}) {
  const canonical = canonicalizeEngentusDocument(document);
  const resolvedLoweringSidecar = loweringSidecar ?? deriveEngentusLoweringSidecar({
    document: canonical,
    text: serializeEngentusDocumentWithAttachments(canonical)
  });
  return {
    theme: canonical.theme,
    kind: canonical.kind,
    styles: canonical.styles.map(style => style.name),
    views: canonical.views.map(view => view.name),
    document: structuredClone(canonical),
    lowering: structuredClone(resolvedLoweringSidecar),
    slices: compatibilitySlicesFromDocument(canonical, resolvedLoweringSidecar)
  };
}

export async function loadEngentusStyleSwitchManifest(file = DEFAULT_SWITCH_MANIFEST_FILE) {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  if (manifest?.theme !== ENGENTUS_STYLE_THEME) {
    throw new Error(`Expected switch manifest theme ${ENGENTUS_STYLE_THEME}`);
  }
  return manifest;
}

async function compileSliceSurfaceRecords(definition) {
  const surfacesByIdentity = new Map();
  const surfacesByName = new Map();
  const allRecords = [];
  const shellBaseSupplementals = shellBaseSupplementalSurfaceRecords(definition);

  for (const relativeFile of definition.sourceFiles) {
    const absoluteFile = path.join(MODULE_DIR, relativeFile);
    const desirePlus = await compileRvmFileToDesirePlus(absoluteFile);
    for (const node of desirePlus.nodes) {
      if (node.semantic?.kind !== "surface") continue;
      const surface = node.semantic;
      const ambientIdentity = ambientIdentityForSurface(surface);
      const identity = structuredIdentityForSurface(surface);
      const runtimeSurface = {
        id: surface.name ?? node.id ?? null,
        props: surface.props ?? {},
        bindings: surface.bindings ?? [],
        interactions: surface.interactions ?? [],
        surfaceKind: surface.surfaceKind ?? null
      };
      const presentationAnchor = trimDomString(surface.props?.presentationAnchor)
        ?? trimDomString(surface.props?.domId)
        ?? trimDomString(surface.props?.mountId)
        ?? surfaceDomId(runtimeSurface, { requireRuntimeAttachment: true });
      const record = {
        name: surface.name ?? null,
        ambientIdentity,
        identity,
        surfaceKind: surface.surfaceKind ?? null,
        traits: collectSurfaceTraits(surface),
        overrideProps: collectOverrideProps(surface.bindings ?? []),
        presentationAnchor,
        props: structuredClone(surface.props ?? {}),
        bindings: structuredClone(surface.bindings ?? []),
        children: [...(surface.children ?? [])],
        repeatTemplate: trimDomString(surface.repeat?.template),
        isTemplate: surface.props?.template === true,
        sourceFile: relativeFile
      };
      allRecords.push(record);
      if (record.identity && !surfacesByIdentity.has(record.identity)) surfacesByIdentity.set(record.identity, record);
      if (record.name && !surfacesByName.has(record.name)) surfacesByName.set(record.name, record);
      for (const supplemental of chartSupplementalSurfaceRecords(record)) {
        allRecords.push(supplemental);
        if (supplemental.identity && !surfacesByIdentity.has(supplemental.identity)) {
          surfacesByIdentity.set(supplemental.identity, supplemental);
        }
        if (supplemental.name && !surfacesByName.has(supplemental.name)) {
          surfacesByName.set(supplemental.name, supplemental);
        }
      }
    }
  }

  for (const supplemental of shellBaseSupplementals) {
    allRecords.push(supplemental);
    if (supplemental.identity && !surfacesByIdentity.has(supplemental.identity)) {
      surfacesByIdentity.set(supplemental.identity, supplemental);
    }
    if (supplemental.name && !surfacesByName.has(supplemental.name)) {
      surfacesByName.set(supplemental.name, supplemental);
    }
  }

  if (!definition.identities?.length) {
    return allRecords
      .map(record => ({ ...record, reachableViaTemplate: false }))
      .sort((left, right) => String(left.identity || left.name).localeCompare(String(right.identity || right.name)));
  }

  const selected = new Map();
  const queue = [
    ...definition.identities.map(candidate => ({ candidate, reachableViaTemplate: false })),
    ...shellBaseSupplementals.map(record => ({ candidate: record.identity, reachableViaTemplate: false }))
  ];
  while (queue.length) {
    const { candidate, reachableViaTemplate } = queue.shift();
    const record = surfacesByIdentity.get(candidate) ?? surfacesByName.get(candidate) ?? null;
    if (!record) continue;
    const key = record.identity || record.name;
    if (!key) continue;
    const existing = selected.get(key) ?? null;
    if (existing) {
      if (reachableViaTemplate && !existing.reachableViaTemplate) existing.reachableViaTemplate = true;
      continue;
    }
    selected.set(key, {
      ...record,
      reachableViaTemplate
    });
    for (const childName of record.children ?? []) {
      queue.push({ candidate: childName, reachableViaTemplate });
    }
    if (record.repeatTemplate) {
      queue.push({ candidate: record.repeatTemplate, reachableViaTemplate: true });
    }
  }

  const reachable = selected.size ? [...selected.values()] : allRecords;
  return reachable.sort((left, right) => String(left.identity || left.name).localeCompare(String(right.identity || right.name)));
}

export async function buildEngentusPresentationInventory(authoredPlan = null) {
  const plan = authoredPlan ?? await loadEngentusAppliedWcss();
  const browserLowering = plan.lowering?.byBackend?.[DEFAULT_BROWSER_BACKEND] ?? null;
  if (!browserLowering) throw new Error(`Missing lowering backend ${DEFAULT_BROWSER_BACKEND}`);
  const slices = [];
  for (const definition of plan.slices) {
    const surfaces = await compileSliceSurfaceRecords(definition);
    const identities = new Set();
    const traits = new Set();
    const overrideProps = new Set();
    for (const surface of surfaces) {
      if (surface.identity) identities.add(surface.identity);
      for (const trait of surface.traits) traits.add(trait);
      for (const prop of surface.overrideProps) overrideProps.add(prop);
    }
    slices.push({
      name: definition.name,
      asset: definition.asset,
      sourceFiles: [...definition.sourceFiles],
      notes: [...definition.notes],
      identities: uniqueSorted([...identities]),
      traits: uniqueSorted([...traits]),
      overrideProps: uniqueSorted([...overrideProps]),
      surfaces: surfaces.map(surface => ({
        name: surface.name,
        ambientIdentity: surface.ambientIdentity,
        identity: surface.identity,
        surfaceKind: surface.surfaceKind,
        traits: surface.traits,
        overrideProps: surface.overrideProps,
        presentationAnchor: surface.presentationAnchor,
        reachableViaTemplate: Boolean(surface.reachableViaTemplate),
        repeatTemplate: surface.repeatTemplate ?? null,
        isTemplate: Boolean(surface.isTemplate),
        sourceFile: surface.sourceFile
      }))
    });
  }
  return {
    theme: ENGENTUS_STYLE_THEME,
    oracleAssets: Object.fromEntries(
      browserLowering.assets.map(asset => [asset.name, assetGroupNames(asset)])
    ),
    slices
  };
}

export async function buildEngentusParityReport(authoredPlan, stylesheets, switchManifest = null, baselineFiles = null) {
  const emittedByAsset = {
    shell: renderOracleStylesheet(stylesheets.shell),
    chart: renderOracleStylesheet(stylesheets.chart)
  };
  const checkedInByAsset = {
    shell: typeof baselineFiles?.[styleAssetName("shell")] === "string"
      ? baselineFiles[styleAssetName("shell")]
      : null,
    chart: typeof baselineFiles?.[styleAssetName("chart")] === "string"
      ? baselineFiles[styleAssetName("chart")]
      : null
  };
  return {
    theme: ENGENTUS_STYLE_THEME,
    assets: Object.fromEntries(
      Object.entries(emittedByAsset).map(([asset, emittedCss]) => [asset, {
        exactParity: checkedInByAsset[asset] == null ? null : emittedCss === checkedInByAsset[asset]
      }])
    ),
    slices: (authoredPlan?.slices ?? []).map(slice => {
      const browserAsset = authoredPlan?.lowering?.byBackend?.[DEFAULT_BROWSER_BACKEND]?.assetsByName?.[slice.asset] ?? null;
      const nativeBlock = browserAsset?.nativeBlocksBySlice?.[slice.name] ?? null;
      return {
        name: slice.name,
        asset: slice.asset,
        loweringMode: effectiveLoweringMode(slice, switchManifest),
        authoredGroups: [...slice.oracleGroups],
        legacyGroups: [...slice.oracleGroups],
        exactOracleParity: checkedInByAsset[slice.asset] == null
          ? null
          : emittedByAsset[slice.asset] === checkedInByAsset[slice.asset],
        authoredOnly: [],
        legacyOnly: [],
        nativeDebt: {
          rawSelectorCount: nativeBlock?.refs?.rawSelectorCount ?? 0,
          rawSelectors: [...(nativeBlock?.refs?.rawSelectors ?? [])]
        },
        notes: [...slice.notes]
      };
    })
  };
}

function resolveSliceTrack(switchManifest, sliceName) {
  return switchManifest?.slices?.[sliceName] ?? "legacy";
}

function unknownSwitchSlices(authoredPlan, switchManifest) {
  const known = new Set((authoredPlan?.slices ?? []).map(slice => slice.name));
  return Object.keys(switchManifest?.slices ?? {}).filter(name => !known.has(name));
}

function seamTargetsSurface(seam, surface) {
  const seamIdentityTargets = seam?.identities ?? [];
  const seamTraitTargets = seam?.traits ?? [];
  if (!seamIdentityTargets.length && !seamTraitTargets.length) return true;
  if (surface?.identity && seamIdentityTargets.includes(surface.identity)) return true;
  return (surface?.traits ?? []).some(trait => seamTraitTargets.includes(trait));
}

function seamMatchesVariantUse(seam, use, inventorySurfaces) {
  if (!["variant", "toggle"].includes(seam?.kind)) return false;
  const matchingSurfaces = inventorySurfaces.filter(surface => {
    if (use.identities.includes(surface.identity)) return true;
    return surface.traits.some(trait => use.traits.includes(trait));
  });
  if (!matchingSurfaces.length) return false;
  if (!matchingSurfaces.some(surface => seamTargetsSurface(seam, surface))) return false;
  if (seam.kind === "variant") return (seam.values ?? []).includes(use.variant);
  return seam.token === use.variant;
}

export function verifyEngentusStyleOwnership({
  inventory,
  authoredPlan,
  switchManifest
}) {
  const inventoryByName = new Map((inventory?.slices ?? []).map(slice => [slice.name, slice]));
  const errors = [];
  const selectedGroupsByAsset = new Map();
  const slices = [];

  for (const unknownSlice of unknownSwitchSlices(authoredPlan, switchManifest)) {
    errors.push(`Switch manifest references unknown slice ${unknownSlice}`);
  }

  for (const authoredSlice of authoredPlan?.slices ?? []) {
    const track = resolveSliceTrack(switchManifest, authoredSlice.name);
    if (!["legacy", "wcss"].includes(track)) {
      errors.push(`Slice ${authoredSlice.name} has unsupported track ${track}`);
      continue;
    }
    const inventorySlice = inventoryByName.get(authoredSlice.name) ?? null;
    const lowering = authoredSlice.lowering?.[DEFAULT_BROWSER_BACKEND] ?? null;
    const selectedGroups = [...(lowering?.groups ?? authoredSlice.oracleGroups ?? [])];
    const seamsByProp = new Map();
    for (const seam of authoredSlice.seams ?? []) {
      if (!seamsByProp.has(seam.prop)) seamsByProp.set(seam.prop, []);
      seamsByProp.get(seam.prop).push(seam);
    }
    const loweringMode = effectiveLoweringMode(authoredSlice, switchManifest);
    const browserAsset = authoredPlan?.lowering?.byBackend?.[DEFAULT_BROWSER_BACKEND]?.assetsByName?.[authoredSlice.asset] ?? null;
    const nativeBlock = browserAsset?.nativeBlocksBySlice?.[authoredSlice.name] ?? null;

    if (!selectedGroups.length) {
      errors.push(`Slice ${authoredSlice.name} has no backend group coverage for ${DEFAULT_BROWSER_BACKEND}`);
    }

    if (track === "wcss" && inventorySlice) {
      for (const identity of authoredSlice.identities) {
        if (!inventorySlice.identities.includes(identity)) {
          errors.push(`Slice ${authoredSlice.name} references unknown structured identity ${identity}`);
        }
      }
      for (const trait of authoredSlice.traits) {
        if (!inventorySlice.traits.includes(trait)) {
          errors.push(`Slice ${authoredSlice.name} references unknown trait ${trait}`);
        }
      }
      for (const seam of authoredSlice.seams ?? []) {
        for (const identity of seam.identities ?? []) {
          if (!inventorySlice.identities.includes(identity)) {
            errors.push(`Slice ${authoredSlice.name} seam ${seam.name} targets unknown identity ${identity}`);
          }
        }
        for (const trait of seam.traits ?? []) {
          if (!inventorySlice.traits.includes(trait)) {
            errors.push(`Slice ${authoredSlice.name} seam ${seam.name} targets unknown trait ${trait}`);
          }
        }
      }
      for (const surface of inventorySlice.surfaces.filter(surface => surface.overrideProps.length)) {
        for (const overrideProp of surface.overrideProps) {
          const matchingSeams = seamsByProp.get(overrideProp) ?? [];
          if (!matchingSeams.some(seam => seamTargetsSurface(seam, surface))) {
            errors.push(`Slice ${authoredSlice.name} surface ${surface.identity || surface.name} has runtime override seam ${overrideProp} but the canonical WCSS slice does not declare a matching typed seam target`);
          }
        }
      }
      if (loweringMode === "native-browser") {
        if (!nativeBlock) {
          errors.push(`Slice ${authoredSlice.name} is switched to native-browser without a native lowering block`);
        } else {
          for (const identity of nativeBlock.refs.identities) {
            if (!inventorySlice.identities.includes(identity)) {
              errors.push(`Slice ${authoredSlice.name} native lowering references unknown identity ${identity}`);
            }
          }
          for (const trait of nativeBlock.refs.traits) {
            if (!inventorySlice.traits.includes(trait)) {
              errors.push(`Slice ${authoredSlice.name} native lowering references unknown trait ${trait}`);
            }
          }
          for (const identity of nativeBlock.refs.identities) {
            const targetSurface = inventorySlice.surfaces.find(surface => surface.identity === identity) ?? null;
            if (targetSurface && !targetSurface.presentationAnchor) {
              errors.push(`Slice ${authoredSlice.name} native lowering references identity ${identity} without a presentation anchor`);
            }
          }
          for (const variantUse of collectVariantUsesFromNativeBlocks(nativeBlock.blocks)) {
            if (!authoredSlice.seams.some(seam => seamMatchesVariantUse(seam, variantUse, inventorySlice.surfaces))) {
              errors.push(`Slice ${authoredSlice.name} native lowering references undeclared variant value ${variantUse.variant}`);
            }
          }
        }
      }
    }

    if (!selectedGroupsByAsset.has(authoredSlice.asset)) selectedGroupsByAsset.set(authoredSlice.asset, new Map());
    const assetSelection = selectedGroupsByAsset.get(authoredSlice.asset);
    for (const group of selectedGroups) {
      const priorOwner = assetSelection.get(group);
      if (priorOwner && priorOwner !== authoredSlice.name) {
        errors.push(`Oracle group ${group} is claimed by both ${priorOwner} and ${authoredSlice.name}`);
      } else {
        assetSelection.set(group, authoredSlice.name);
      }
    }

    slices.push({
      name: authoredSlice.name,
      asset: authoredSlice.asset,
      track,
      selectedGroups,
      identities: [...authoredSlice.identities],
      traits: [...authoredSlice.traits],
      families: [...authoredSlice.families],
      seams: structuredClone(authoredSlice.seams ?? []),
      anchorCoverage: inventorySlice ? {
        required: uniqueSorted((browserAssetIdentitiesForSlice(authoredPlan, authoredSlice) ?? []).filter(Boolean)),
        resolved: uniqueSorted((browserAssetIdentitiesForSlice(authoredPlan, authoredSlice) ?? [])
          .filter(identity => inventorySlice.surfaces.some(surface => surface.identity === identity && surface.presentationAnchor))),
        missing: uniqueSorted((browserAssetIdentitiesForSlice(authoredPlan, authoredSlice) ?? [])
          .filter(identity => !inventorySlice.surfaces.some(surface => surface.identity === identity && surface.presentationAnchor)))
      } : { required: [], resolved: [], missing: [] },
      descendantCoverage: inventorySlice ? {
        templateSurfaceCount: inventorySlice.surfaces.filter(surface => surface.reachableViaTemplate).length,
        templateTraits: uniqueSorted(
          inventorySlice.surfaces
            .filter(surface => surface.reachableViaTemplate)
            .flatMap(surface => surface.traits ?? [])
        ),
        requiredTraits: uniqueSorted(nativeBlock?.refs?.traits ?? []),
        resolvedTraits: uniqueSorted(
          (nativeBlock?.refs?.traits ?? [])
            .filter(trait => inventorySlice.traits.includes(trait))
        ),
        missingTraits: uniqueSorted(
          (nativeBlock?.refs?.traits ?? [])
            .filter(trait => !inventorySlice.traits.includes(trait))
        )
      } : {
        templateSurfaceCount: 0,
        templateTraits: [],
        requiredTraits: [],
        resolvedTraits: [],
        missingTraits: []
      },
      nativeDebt: {
        rawSelectorCount: nativeBlock?.refs?.rawSelectorCount ?? 0,
        rawSelectors: [...(nativeBlock?.refs?.rawSelectors ?? [])]
      },
      loweringMode,
      lowering: lowering ? structuredClone(lowering) : null,
      overrides: [...authoredSlice.overrides],
      notes: [...authoredSlice.notes]
    });
  }

  return {
    theme: ENGENTUS_STYLE_THEME,
    ok: errors.length === 0,
    errors,
    slices
  };
}

function browserAssetDefinition(browserLowering, assetName) {
  const asset = browserLowering?.assetsByName?.[assetName] ?? browserLowering?.assets?.find(entry => entry.name === assetName) ?? null;
  if (!asset) throw new Error(`Missing browser lowering asset ${assetName}`);
  return asset;
}

function browserAssetIdentitiesForSlice(authoredPlan, authoredSlice) {
  const browserAsset = authoredPlan?.lowering?.byBackend?.[DEFAULT_BROWSER_BACKEND]?.assetsByName?.[authoredSlice.asset] ?? null;
  const nativeBlock = browserAsset?.nativeBlocksBySlice?.[authoredSlice.name] ?? null;
  return nativeBlock?.refs?.identities ?? [];
}

function selectorFromPseudo(pseudo) {
  return ["after", "before"].includes(pseudo) || String(pseudo).startsWith("-webkit-")
    ? `::${pseudo}`
    : `:${pseudo}`;
}

function selectorForIdentity(identity, recordsByIdentity) {
  const record = recordsByIdentity.get(identity) ?? null;
  if (!record) throw new Error(`Native lowering references unknown identity ${identity}`);
  if (typeof record.presentationAnchor === "string" && record.presentationAnchor.startsWith("selector:")) {
    return record.presentationAnchor.slice("selector:".length);
  }
  if (record.presentationAnchor) return `#${record.presentationAnchor}`;
  throw new Error(`Native lowering cannot derive a browser selector for identity ${identity}`);
}

function renderNativeSelector(target, recordsByIdentity) {
  if (target.kind === "raw") return target.selector;
  let selectors = [""];
  for (const segment of target.segments) {
    let segmentSelectors = [];
    if (segment.kind === "identity") {
      segmentSelectors = segment.values.map(identity => selectorForIdentity(identity, recordsByIdentity));
    } else if (segment.kind === "trait") {
      segmentSelectors = segment.values.map(trait => `.${trait}`);
    } else if (segment.kind === "tag") {
      segmentSelectors = segment.values.map(tag => tag);
    } else {
      throw new Error(`Unsupported native selector segment kind ${segment.kind}`);
    }
    if (segment.variants.length) {
      segmentSelectors = segmentSelectors.flatMap(selector => segment.variants.map(variant => `${selector}.${variant}`));
    }
    if (segment.pseudos.length) {
      segmentSelectors = segmentSelectors.flatMap(selector => segment.pseudos.map(pseudo => `${selector}${selectorFromPseudo(pseudo)}`));
    }
    selectors = selectors.flatMap(prefix => segmentSelectors.map(selector => prefix ? `${prefix} ${selector}` : selector));
  }
  return selectors.join(", ");
}

function nativeBlockToBrowserBlocks(nativeBlock, recordsByIdentity) {
  return nativeBlock.blocks.map(block => {
    if (block.kind === "native-rule") {
      return {
        kind: "rule",
        selector: renderNativeSelector(block.target, recordsByIdentity),
        declarations: structuredClone(block.declarations),
        blocks: []
      };
    }
    if (block.kind === "native-media") {
      return {
        kind: "media",
        query: block.query,
        blocks: block.blocks.map(ruleBlock => ({
          kind: "rule",
          selector: renderNativeSelector(ruleBlock.target, recordsByIdentity),
          declarations: structuredClone(ruleBlock.declarations),
          blocks: []
        }))
      };
    }
    if (block.kind === "keyframes") return structuredClone(block);
    throw new Error(`Unsupported native lowering block kind ${block.kind}`);
  });
}

function effectiveLoweringMode(slice, switchManifest) {
  const track = resolveSliceTrack(switchManifest, slice.name);
  const mode = slice.lowering?.[DEFAULT_BROWSER_BACKEND]?.mode ?? "declaration-groups";
  if (track !== "wcss") return "declaration-groups";
  return mode;
}

function preferredNativeGroupName(slice) {
  const groups = slice?.lowering?.[DEFAULT_BROWSER_BACKEND]?.groups ?? slice?.oracleGroups ?? [];
  return groups[0] ?? slice?.name ?? "native";
}

async function composeStylesheetForAsset(browserLowering, authoredPlan, assetName, switchManifest) {
  const asset = browserAssetDefinition(browserLowering, assetName);
  const ownedSliceByGroup = new Map();
  const slicesForAsset = (authoredPlan?.slices ?? []).filter(slice => slice.asset === assetName);
  for (const slice of slicesForAsset) {
    const groups = slice.lowering?.[DEFAULT_BROWSER_BACKEND]?.groups ?? slice.oracleGroups ?? [];
    for (const group of groups) ownedSliceByGroup.set(group, slice);
  }
  const nativeSlices = slicesForAsset.filter(slice => effectiveLoweringMode(slice, switchManifest) === "native-browser");
  const nativeRecordsBySlice = new Map();
  for (const slice of nativeSlices) {
    const records = await compileSliceSurfaceRecords(slice);
    nativeRecordsBySlice.set(slice.name, new Map(records.filter(record => record.identity).map(record => [record.identity, record])));
  }

  const blocks = [];
  const emittedNativeSlices = new Set();
  for (const declaredGroup of asset.declarationGroups) {
    const ownerSlice = ownedSliceByGroup.get(declaredGroup.name) ?? null;
    if (!ownerSlice) continue;
    const track = resolveSliceTrack(switchManifest, ownerSlice.name);
    if (!["legacy", "wcss"].includes(track)) continue;
    if (effectiveLoweringMode(ownerSlice, switchManifest) !== "native-browser") {
      blocks.push(structuredClone(declaredGroup));
      continue;
    }
    if (emittedNativeSlices.has(ownerSlice.name)) continue;
    const nativeBlock = asset.nativeBlocksBySlice?.[ownerSlice.name] ?? null;
    const recordsByIdentity = nativeRecordsBySlice.get(ownerSlice.name) ?? null;
    if (!nativeBlock || !recordsByIdentity) {
      throw new Error(`Missing native lowering data for slice ${ownerSlice.name}`);
    }
    emittedNativeSlices.add(ownerSlice.name);
    blocks.push({
      kind: "group",
      name: declaredGroup.name,
      blocks: nativeBlockToBrowserBlocks(nativeBlock, recordsByIdentity)
    });
  }

  for (const ownerSlice of nativeSlices) {
    if (emittedNativeSlices.has(ownerSlice.name)) continue;
    const nativeBlock = asset.nativeBlocksBySlice?.[ownerSlice.name] ?? null;
    const recordsByIdentity = nativeRecordsBySlice.get(ownerSlice.name) ?? null;
    if (!nativeBlock || !recordsByIdentity) {
      throw new Error(`Missing native lowering data for slice ${ownerSlice.name}`);
    }
    emittedNativeSlices.add(ownerSlice.name);
    blocks.push({
      kind: "group",
      name: preferredNativeGroupName(ownerSlice),
      blocks: nativeBlockToBrowserBlocks(nativeBlock, recordsByIdentity)
    });
  }

  return createWcssStylesheet({
    name: stylesheetTitle(assetName),
    blocks
  });
}

export async function composeEngentusStylesheets({
  authoredPlan,
  switchManifest
}) {
  const browserLowering = authoredPlan?.lowering?.byBackend?.[DEFAULT_BROWSER_BACKEND] ?? null;
  if (!browserLowering) throw new Error(`Missing lowering backend ${DEFAULT_BROWSER_BACKEND}`);
  return {
    shell: await composeStylesheetForAsset(browserLowering, authoredPlan, "shell", switchManifest),
    chart: await composeStylesheetForAsset(browserLowering, authoredPlan, "chart", switchManifest)
  };
}

export async function loadEngentusGeneratedCssBundle({
  authoredPlan = null,
  switchManifest = null
} = {}) {
  const resolvedAuthoredPlan = authoredPlan ?? await loadEngentusAppliedWcss();
  const resolvedSwitchManifest = switchManifest ?? await loadEngentusStyleSwitchManifest();
  const stylesheets = await composeEngentusStylesheets({
    authoredPlan: resolvedAuthoredPlan,
    switchManifest: resolvedSwitchManifest
  });
  return {
    authoredPlan: resolvedAuthoredPlan,
    switchManifest: resolvedSwitchManifest,
    stylesheets,
    files: {
      [styleAssetName("shell")]: renderOracleStylesheet(stylesheets.shell),
      [styleAssetName("chart")]: renderOracleStylesheet(stylesheets.chart)
    }
  };
}

export function applyEngentusTokenBindingsToCssBundle(files, document) {
  const tokenValues = tokenValueByName(document);
  const nextFiles = { ...files };
  for (const [tokenName, bindings] of Object.entries(ENGENTUS_PREVIEWABLE_TOKEN_BINDINGS)) {
    const value = tokenValues.get(tokenName);
    if (typeof value !== "string" || !value.trim()) continue;
    for (const binding of bindings) {
      const fileName = styleAssetName(binding.asset);
      const source = nextFiles[fileName];
      if (typeof source !== "string") continue;
      const pattern = new RegExp(`(${escapeRegExp(binding.cssVariable)}\\s*:\\s*)([^;]+)(;)`, "g");
      nextFiles[fileName] = source.replace(pattern, `$1${value}$3`);
    }
  }
  return nextFiles;
}

export function applyEngentusStyleFieldBindingsToCssBundle(files, document) {
  const fieldValues = buildStyleFieldValueIndex(document);
  const tokenValues = tokenValueByName(document);
  const nextFiles = { ...files };
  for (const [fieldKey, bindings] of Object.entries(ENGENTUS_PREVIEWABLE_STYLE_FIELD_BINDINGS)) {
    const rawValue = fieldValues.get(fieldKey);
    const value = tokenValues.get(rawValue) ?? rawValue;
    if (typeof value !== "string" || !value.trim()) continue;
    for (const binding of bindings) {
      const fileName = styleAssetName(binding.asset);
      const source = nextFiles[fileName];
      if (typeof source !== "string") continue;
      const pattern = new RegExp(`(${escapeRegExp(binding.cssVariable)}\\s*:\\s*)([^;]+)(;)`, "g");
      nextFiles[fileName] = source.replace(pattern, `$1${value}$3`);
    }
  }
  return nextFiles;
}

export async function buildEngentusStyleArtifacts() {
  const bundle = await loadEngentusGeneratedCssBundle();
  const { authoredPlan, switchManifest, stylesheets, files } = bundle;
  const grammar = await loadEngentusCanonicalStyleGrammar();
  const loweringSidecar = structuredClone(authoredPlan.lowering);
  const inventory = await buildEngentusPresentationInventory(authoredPlan);
  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan,
    switchManifest
  });
  if (!ownership.ok) {
    throw new Error(`Engentus WCSS ownership check failed:\n${ownership.errors.map(line => `- ${line}`).join("\n")}`);
  }
  const parity = await buildEngentusParityReport(authoredPlan, stylesheets, switchManifest, files);
  return {
    authoredPlan,
    switchManifest,
    grammar,
    loweringSidecar,
    inventory,
    parity,
    ownership,
    files
  };
}

export async function authoredOracleGroupCoverage(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const browserLowering = await loadEngentusBrowserLoweringMap(file);
  return Object.fromEntries(
    browserLowering.assets.map(asset => [asset.name, uniqueSorted(assetGroupNames(asset))])
  );
}

export async function oracleGroupIndexByAsset(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const browserLowering = await loadEngentusBrowserLoweringMap(file);
  return Object.fromEntries(
    browserLowering.assets.map(asset => [asset.name, assetGroupIndex(asset)])
  );
}
