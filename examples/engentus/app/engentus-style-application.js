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
const REQUIRED_TOP_LEVEL_SECTIONS = ["tokens", "styles", "views", "application", "lowering"];
const DEFAULT_BROWSER_BACKEND = "browser";
const KNOWN_STYLE_ASSETS = new Set(["shell", "chart"]);
const STYLESHEET_TITLES = Object.freeze({
  shell: "Engentus shell theme grammar",
  chart: "Engentus chart theme grammar"
});

export const ENGENTUS_STYLE_THEME = "engentus";

function splitClassTokens(value) {
  if (typeof value !== "string") return [];
  return value.split(/\s+/).map(token => token.trim()).filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function maybeUnquote(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
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
      line: child.line
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

function compatibilitySlicesFromCanonical(canonical, backendName = DEFAULT_BROWSER_BACKEND) {
  const backend = canonical.lowering.byBackend[backendName] ?? null;
  if (!backend) throw new Error(`Unknown lowering backend ${backendName}`);
  const loweringBySlice = new Map(backend.slices.map(slice => [slice.name, slice]));
  return canonical.slices.map(slice => {
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
  for (const sectionName of REQUIRED_TOP_LEVEL_SECTIONS) {
    if (!sections[sectionName]) throw new Error(`Missing required top-level section: ${sectionName}`);
  }

  const tokens = parseTokenSection(sections.tokens);
  const styles = parseStyleSection(sections.styles);
  const views = parseViewSection(sections.views);
  const slices = parseApplicationSection(sections.application, new Set(styles.map(style => style.name)));
  const lowering = parseLoweringSection(sections.lowering, slices, new Set(styles.map(style => style.name)));

  return {
    theme,
    tokens,
    styles,
    views,
    slices,
    lowering,
    ast: root
  };
}

export async function loadEngentusCanonicalWcss(file = DEFAULT_CANONICAL_WCSS_FILE) {
  return parseEngentusCanonicalWcss(await readFile(file, "utf8"));
}

export async function loadEngentusBrowserLoweringMap(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const canonical = await loadEngentusCanonicalWcss(file);
  return structuredClone(canonical.lowering.byBackend[DEFAULT_BROWSER_BACKEND]);
}

export async function loadEngentusBrowserDeclarationGroups(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const browserLowering = await loadEngentusBrowserLoweringMap(file);
  return Object.fromEntries(
    browserLowering.assets.map(asset => [asset.name, structuredClone(asset.declarationGroups)])
  );
}

export async function loadEngentusAppliedWcss(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const canonical = await loadEngentusCanonicalWcss(file);
  return {
    theme: canonical.theme,
    styles: canonical.styles.map(style => style.name),
    views: canonical.views.map(view => view.name),
    lowering: structuredClone(canonical.lowering),
    slices: compatibilitySlicesFromCanonical(canonical)
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

export async function buildEngentusParityReport(authoredPlan, stylesheets, switchManifest = null) {
  const [shellCss, chartCss] = await Promise.all([
    readFile(path.join(MODULE_DIR, styleAssetName("shell")), "utf8"),
    readFile(path.join(MODULE_DIR, styleAssetName("chart")), "utf8")
  ]);
  const emittedByAsset = {
    shell: renderOracleStylesheet(stylesheets.shell),
    chart: renderOracleStylesheet(stylesheets.chart)
  };
  const checkedInByAsset = {
    shell: shellCss,
    chart: chartCss
  };
  return {
    theme: ENGENTUS_STYLE_THEME,
    assets: Object.fromEntries(
      Object.entries(emittedByAsset).map(([asset, emittedCss]) => [asset, {
        exactParity: emittedCss === checkedInByAsset[asset]
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
        exactOracleParity: emittedByAsset[slice.asset] === checkedInByAsset[slice.asset],
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

export async function buildEngentusStyleArtifacts() {
  const [authoredPlan, switchManifest] = await Promise.all([
    loadEngentusAppliedWcss(),
    loadEngentusStyleSwitchManifest()
  ]);
  const inventory = await buildEngentusPresentationInventory(authoredPlan);
  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan,
    switchManifest
  });
  if (!ownership.ok) {
    throw new Error(`Engentus WCSS ownership check failed:\n${ownership.errors.map(line => `- ${line}`).join("\n")}`);
  }
  const stylesheets = await composeEngentusStylesheets({
    authoredPlan,
    switchManifest
  });
  const parity = await buildEngentusParityReport(authoredPlan, stylesheets, switchManifest);
  return {
    authoredPlan,
    switchManifest,
    inventory,
    parity,
    ownership,
    files: {
      [styleAssetName("shell")]: renderOracleStylesheet(stylesheets.shell),
      [styleAssetName("chart")]: renderOracleStylesheet(stylesheets.chart)
    }
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
