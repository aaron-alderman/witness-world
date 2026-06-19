/**
 * chart-page.js - assemble a self-contained HTML page for a chart.
 *
 * Inlines the generic runtimes (dataflow-eval, gog-runtime, chart-client),
 * embeds the resolved {model, view, params} spec, and loads any authored
 * helper modules through authored URLs. No dependency on the surrounding shell
 * runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendQueryParamsToHref } from "../../src/runtime-url-utils.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const CHART_RUNTIME_MODULE_FILES = [
  "presentation/chart-chrome.js",
  "presentation/resolve-presentation.js",
  "graphics/scales.js",
  "graphics/geometry.js",
  "graphics/axes.js",
  "graphics/svg-dom.js",
  "graphics/canvas-runtime.js",
  "graphics/hit-testing.js",
  "graphics/timeline.js",
  "ports/svg-port.js",
  "ports/canvas-port.js",
  "ports/render-port.js",
  "scene/build-scene.js",
  "dataflow-eval.js",
  "gog-runtime.js",
  "plan/evaluate-model.js",
  "plan/chart-plan.js",
  "chart-presentation-patch.js",
  "chart-client.js"
];

function moduleIdForFile(file) {
  return `./${file.replace(/\\/g, "/")}`;
}

function resolveRuntimeModuleId(fromId, specifier) {
  if (!specifier.startsWith(".")) {
    throw new Error(`chart runtime bundle only supports relative imports: ${specifier}`);
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromId), specifier));
  return resolved.startsWith(".") ? resolved : `./${resolved}`;
}

function parseNamedBindings(source) {
  return source
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const match = part.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!match) throw new Error(`Unsupported chart runtime binding syntax: ${part}`);
      return {
        imported: match[1],
        local: match[2] ?? match[1]
      };
    });
}

function destructureBindings(bindings) {
  return bindings.map(binding =>
    binding.imported === binding.local
      ? binding.imported
      : `${binding.imported}: ${binding.local}`
  ).join(", ");
}

function bundleModuleSource(file) {
  const id = moduleIdForFile(file);
  let source = fs.readFileSync(path.join(here, file), "utf8");
  const exports = [];
  const pushExport = (exported, local = exported) => {
    if (!exports.some(entry => entry.exported === exported)) exports.push({ exported, local });
  };

  source = source.replace(/^\s*import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["'];?\s*$/gm, (_match, bindingsSource, specifier) => {
    const bindings = parseNamedBindings(bindingsSource);
    return `const { ${destructureBindings(bindings)} } = __chartRequire("${resolveRuntimeModuleId(id, specifier)}");`;
  });

  source = source.replace(/^\s*export\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["'];?\s*$/gm, (_match, bindingsSource, specifier) => {
    const bindings = parseNamedBindings(bindingsSource);
    for (const binding of bindings) pushExport(binding.local);
    return `const { ${destructureBindings(bindings)} } = __chartRequire("${resolveRuntimeModuleId(id, specifier)}");`;
  });

  source = source.replace(/^\s*export\s+default\s+/gm, () => {
    pushExport("default", "__default_export__");
    return "const __default_export__ = ";
  });

  source = source.replace(/^\s*export\s+(const|function|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_match, kind, name) => {
    pushExport(name);
    return `${kind} ${name}`;
  });

  source = source.replace(/^\s*export\s*\{([\s\S]*?)\};?\s*$/gm, (_match, bindingsSource) => {
    for (const binding of parseNamedBindings(bindingsSource)) pushExport(binding.local, binding.imported);
    return "";
  });

  const returnBody = exports.length
    ? `return { ${exports.map(entry => entry.exported === entry.local ? entry.exported : `${entry.exported}: ${entry.local}`).join(", ")} };`
    : "return {};";

  return `__chartModules[${JSON.stringify(id)}] = __chartRequire => {\n${source}\n${returnBody}\n};`;
}

export function chartRuntimeBundleSource() {
  return [
    "// inlined generic chart runtime",
    "const __chartModules = Object.create(null);",
    "const __chartModuleCache = Object.create(null);",
    "function __chartRequire(id) {",
    "  if (__chartModuleCache[id]) return __chartModuleCache[id];",
    "  const factory = __chartModules[id];",
    "  if (!factory) throw new Error(`chart runtime module not found: ${id}`);",
    "  const exports = factory(__chartRequire);",
    "  __chartModuleCache[id] = exports;",
    "  return exports;",
    "}",
    ...CHART_RUNTIME_MODULE_FILES.map(bundleModuleSource),
    "const { evaluateModel } = __chartRequire(\"./plan/evaluate-model.js\");",
    "const { planChart } = __chartRequire(\"./plan/chart-plan.js\");",
    "const { bootChartsFromDom, registerChartSurfaceCapabilityBoot } = __chartRequire(\"./chart-client.js\");"
  ].join("\n\n");
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    if (!value.trim()) continue;
    return value.trim();
  }
  return "";
}

function attrMarkup(name, value) {
  const text = firstNonEmpty(value);
  return text ? ` ${name}="${escapeAttr(text)}"` : "";
}

function styleMarkup(entries) {
  const text = Object.entries(entries ?? {})
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key, value]) => `${key}:${value.trim()}`)
    .join(";");
  return text ? ` style="${escapeAttr(text)}"` : "";
}

function escapeScriptBody(source) {
  return String(source ?? "").replaceAll("</script", "<\\/script");
}

function tagName(value, fallback = "div") {
  const text = firstNonEmpty(value);
  return /^[A-Za-z][A-Za-z0-9-]*$/.test(text) ? text.toLowerCase() : fallback;
}

function parseList(value, fallback = []) {
  if (Array.isArray(value)) return value.map(item => String(item ?? "").trim()).filter(Boolean);
  const text = firstNonEmpty(value);
  if (!text) return fallback;
  return text.split(",").map(item => item.trim()).filter(Boolean);
}

function uniqueNonEmpty(values = []) {
  return [...new Set(values.map(value => String(value ?? "").trim()).filter(Boolean))];
}

function uniqueFunctionDeps(entries = []) {
  const seen = new Set();
  const rows = [];
  for (const entry of entries) {
    if (!entry || typeof entry.href !== "string" || typeof entry.exportName !== "string") continue;
    const href = entry.href.trim();
    const exportName = entry.exportName.trim();
    if (!href || !exportName) continue;
    const key = `${href}::${exportName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ href, exportName });
  }
  return rows;
}

function normalizePageProps(pageProps = {}) {
  return {
    stylesheetHref: firstNonEmpty(pageProps.pageStylesheetHref),
    chartSurfaceId: firstNonEmpty(pageProps.chartSurfaceId),
    htmlClass: firstNonEmpty(pageProps.htmlClass),
    bodyClass: firstNonEmpty(pageProps.bodyClass),
    viewportId: firstNonEmpty(pageProps.viewportId),
    viewportClass: firstNonEmpty(pageProps.viewportClass),
    hostId: firstNonEmpty(pageProps.hostId),
    hostClass: firstNonEmpty(pageProps.hostClass),
    mountId: firstNonEmpty(pageProps.mountId),
    mountClass: firstNonEmpty(pageProps.mountClass),
    mountTag: tagName(pageProps.mountTag, "div"),
    overlayCanvasId: firstNonEmpty(pageProps.overlayCanvasId),
    overlayCanvasClass: firstNonEmpty(pageProps.overlayCanvasClass),
    tooltipId: firstNonEmpty(pageProps.tooltipId),
    tooltipClass: firstNonEmpty(pageProps.tooltipClass),
    pageBackground: firstNonEmpty(pageProps.pageBackground),
    textColor: firstNonEmpty(pageProps.textColor)
  };
}

function chartRuntimeDeps(pagePropsList = []) {
  const normalizedPages = pagePropsList.map(pageProps => ({
    page: normalizePageProps(pageProps),
    raw: pageProps ?? {}
  }));
  const functionDeps = uniqueFunctionDeps(
    normalizedPages.flatMap(entry => {
      const moduleHrefs = parseList(entry.raw.functionsModules);
      const functionExports = parseList(entry.raw.functionsExports);
      if (!moduleHrefs.length && !functionExports.length) return [];
      if (moduleHrefs.length !== functionExports.length) {
        throw new Error("functionsModules and functionsExports must have the same item count");
      }
      return moduleHrefs.map((href, index) => ({
        href,
        exportName: functionExports[index]
      }));
    })
  );
  const stylesheetHrefs = uniqueNonEmpty(normalizedPages.map(entry => entry.page.stylesheetHref));
  return {
    stylesheetHrefs,
    functionDeps
  };
}

function chartRuntimeFunctionsLoaderSource(functionDeps = []) {
  const deps = uniqueFunctionDeps(functionDeps);
  if (!deps.length) return "const __chartRuntimeFunctions = {};";
  return `
const __chartRuntimeFunctionDeps = ${JSON.stringify(deps)};
const __chartRuntimeLoadedModules = await Promise.all(
  __chartRuntimeFunctionDeps.map(dep => import(dep.href))
);
const __chartRuntimeFunctions = Object.assign({}, ...__chartRuntimeFunctionDeps.map((dep, index) => {
  const moduleValue = __chartRuntimeLoadedModules[index]?.[dep.exportName];
  if (moduleValue == null) {
    throw new Error("chart runtime export not found: " + dep.exportName + " from " + dep.href);
  }
  if (typeof moduleValue === "function") {
    return { [dep.exportName]: moduleValue };
  }
  if (moduleValue && typeof moduleValue === "object") {
    return moduleValue;
  }
  throw new Error("chart runtime export must be a function or object: " + dep.exportName + " from " + dep.href);
}));`.trim();
}

export function renderChartMountMarkup({
  spec,
  pageProps = {},
  mountIdOverride = "",
  mountAttributes = {},
  overlayCanvasAttributes = {},
  tooltipAttributes = {},
  includeOverlayCanvas = true,
  includeTooltip = true
} = {}) {
  const page = normalizePageProps(pageProps);
  const mountTagName = page.mountTag;
  const chartSurfaceId = firstNonEmpty(page.chartSurfaceId, spec?.view?.id);
  const overlayCanvas = includeOverlayCanvas
    ? renderChartOverlayMarkup({
        pageProps,
        overlayCanvasAttributes,
        includeTooltip: false
      })
    : "";
  const tooltip = includeTooltip
    ? renderChartOverlayMarkup({
        pageProps,
        tooltipAttributes,
        includeOverlayCanvas: false
      })
    : "";
  return `<${mountTagName}${attrMarkup("id", firstNonEmpty(mountIdOverride, page.mountId))}${attrMarkup("class", page.mountClass)}${attrsMarkup({ "data-chart-id": chartSurfaceId, ...mountAttributes })}></${mountTagName}>${overlayCanvas}${tooltip}`;
}

export function renderChartOverlayMarkup({
  pageProps = {},
  overlayCanvasAttributes = {},
  tooltipAttributes = {},
  includeOverlayCanvas = true,
  includeTooltip = true
} = {}) {
  const page = normalizePageProps(pageProps);
  const overlayCanvas = includeOverlayCanvas && (page.overlayCanvasId || page.overlayCanvasClass)
    ? `<canvas${attrMarkup("id", page.overlayCanvasId)}${attrMarkup("class", page.overlayCanvasClass)}${attrsMarkup({ "data-chart-page-overlay": "canvas", ...overlayCanvasAttributes })}></canvas>`
    : "";
  const tooltip = includeTooltip && (page.tooltipId || page.tooltipClass)
    ? `<div${attrMarkup("id", page.tooltipId)}${attrMarkup("class", page.tooltipClass)}${attrsMarkup({ "data-chart-page-overlay": "tooltip", ...tooltipAttributes })}></div>`
    : "";
  return `${overlayCanvas}${tooltip}`;
}

export function chartRuntimeInlineCss({ standalone = true } = {}) {
  return `${standalone ? "html,body{margin:0;height:100%;overflow:hidden}body{font-family:-apple-system,Segoe UI,sans-serif}" : ""}
.chart-page__mount{display:block;width:100%;height:100%}
svg.gog{display:block;width:100%;height:100%}`;
}

function renderChartRuntimeManifestScript(chartSpecs = {}) {
  return `<script type="application/json" id="chart-runtime-manifest">${escapeScriptBody(JSON.stringify({ chartSpecs }))}</script>`;
}

export function chartRuntimeAssets({
  pagePropsList = [],
  standalone = true,
  autoBoot = standalone
} = {}) {
  const deps = chartRuntimeDeps(pagePropsList);
  return {
    scriptSrcs: [],
    stylesheetHrefs: deps.stylesheetHrefs,
    inlineCss: chartRuntimeInlineCss({ standalone }),
    scriptBody: `${chartRuntimeBundleSource()}\n\n${chartRuntimeFunctionsLoaderSource(deps.functionDeps)}\nconst __surfaceCapabilityReadyPromises = Array.isArray(globalThis.__surfaceCapabilityReadyPromises) ? globalThis.__surfaceCapabilityReadyPromises : (globalThis.__surfaceCapabilityReadyPromises = []);\nconst __chartRuntimeReady = (async () => {\n  registerChartSurfaceCapabilityBoot(__chartRuntimeFunctions);\n})();\n__surfaceCapabilityReadyPromises.push(__chartRuntimeReady);\nawait __chartRuntimeReady;${autoBoot ? "\nbootChartsFromDom(document, __chartRuntimeFunctions);" : ""}`
  };
}

export function renderChartHtml({ title = "Chart", spec, pageProps = {} } = {}) {
  const page = normalizePageProps(pageProps);
  const chartSurfaceId = firstNonEmpty(page.chartSurfaceId, spec?.view?.id);
  const stylesheetQuery = pageProps?.stylesheetQuery && typeof pageProps.stylesheetQuery === "object"
    ? pageProps.stylesheetQuery
    : null;
  const assets = chartRuntimeAssets({
    pagePropsList: [pageProps],
    standalone: true
  });
  return `<!doctype html>
<html lang="en"${attrMarkup("class", page.htmlClass)}>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
${assets.scriptSrcs.map(src => `<script src="${escapeAttr(src)}"></script>`).join("\n")}
${assets.stylesheetHrefs.map(href => `<link rel="stylesheet" href="${escapeAttr(appendQueryParamsToHref(href, stylesheetQuery ?? {}))}">`).join("\n")}
<style>
  body{background:${page.pageBackground || "transparent"};color:${page.textColor || "#475569"};font-family:-apple-system,Segoe UI,sans-serif}
  [data-chart-page-viewport]{position:relative;width:100%;height:100%;overflow:hidden}
  [data-chart-page-host]{position:relative;width:100%;height:100%;overflow:hidden}
  ${assets.inlineCss}
</style>
</head>
<body${attrMarkup("class", page.bodyClass)}>
<div${attrMarkup("id", page.viewportId)}${attrMarkup("class", page.viewportClass)} data-chart-page-viewport>
  <div${attrMarkup("id", page.hostId)}${attrMarkup("class", page.hostClass)}${attrMarkup("data-chart-id", firstNonEmpty(page.chartSurfaceId, spec?.view?.id))} data-chart-page-host${styleMarkup({ background: page.pageBackground })}>
    ${renderChartMountMarkup({ spec, pageProps })}
  </div>
</div>
${renderChartRuntimeManifestScript(chartSurfaceId ? { [chartSurfaceId]: spec ?? {} } : {})}
<script type="module">
${assets.scriptBody}
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function escapeAttr(s) {
  return String(s)
    .replace(/&(?!#39;|quot;)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attrsMarkup(entries = {}) {
  return Object.entries(entries)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => ` ${key}="${escapeAttr(String(value))}"`)
    .join("");
}
