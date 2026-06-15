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

const here = path.dirname(fileURLToPath(import.meta.url));

// Strip ES import/export so the generic runtime modules concatenate into one inline script.
function inlineModule(file) {
  const src = fs.readFileSync(path.join(here, file), "utf8");
  return src
    .replace(/^\s*import\s+[^;]*;?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "const __default_unused = ")
    .replace(/^\s*export\s+(const|function|let|class)\s/gm, "$1 ");
}

export function chartRuntimeBundleSource() {
  return [
    "// inlined generic chart runtime",
    inlineModule("dataflow-eval.js"),
    inlineModule("gog-runtime.js"),
    inlineModule("chart-client.js")
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
  const specJson = JSON.stringify(spec ?? {});
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
  return `<${mountTagName}${attrMarkup("id", firstNonEmpty(mountIdOverride, page.mountId))}${attrMarkup("class", page.mountClass)}${attrsMarkup({ "data-chart-spec": specJson, ...mountAttributes })}></${mountTagName}>${overlayCanvas}${tooltip}`;
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
[data-chart-spec]{display:block;width:100%;height:100%}
svg.gog{display:block;width:100%;height:100%}
svg.gog text{font-size:11px;fill:#475569}`;
}

export function chartRuntimeAssets({
  pagePropsList = [],
  standalone = true
} = {}) {
  const deps = chartRuntimeDeps(pagePropsList);
  return {
    scriptSrcs: ["https://d3js.org/d3.v7.min.js"],
    stylesheetHrefs: deps.stylesheetHrefs,
    inlineCss: chartRuntimeInlineCss({ standalone }),
    scriptBody: `${chartRuntimeBundleSource()}\n\n${chartRuntimeFunctionsLoaderSource(deps.functionDeps)}\nregisterChartSurfaceCapabilityBoot(__chartRuntimeFunctions);\nbootChartsFromDom(document, __chartRuntimeFunctions);`
  };
}

export function renderChartHtml({ title = "Chart", spec, pageProps = {} } = {}) {
  const page = normalizePageProps(pageProps);
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
${assets.stylesheetHrefs.map(href => `<link rel="stylesheet" href="${escapeAttr(href)}">`).join("\n")}
<style>
  body{background:${page.pageBackground || "transparent"};color:${page.textColor || "#475569"};font-family:-apple-system,Segoe UI,sans-serif}
  [data-chart-page-viewport]{position:relative;width:100%;height:100%;overflow:hidden}
  [data-chart-page-host]{position:relative;width:100%;height:100%;overflow:hidden}
  ${assets.inlineCss}
</style>
</head>
<body${attrMarkup("class", page.bodyClass)}>
<div${attrMarkup("id", page.viewportId)}${attrMarkup("class", page.viewportClass)} data-chart-page-viewport>
  <div${attrMarkup("id", page.hostId)}${attrMarkup("class", page.hostClass)} data-chart-page-host${styleMarkup({ background: page.pageBackground })}>
    ${renderChartMountMarkup({ spec, pageProps })}
  </div>
</div>
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
