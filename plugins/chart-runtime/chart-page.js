/**
 * chart-page.js — assemble a self-contained HTML page for a chart.
 *
 * Inlines the generic runtimes (dataflow-eval, gog-runtime, chart-client) plus
 * the injected domain std-lib into a single ES-module <script>, embeds the
 * resolved {model, view, params} spec, and loads D3. No dependency on the
 * (currently-migrating) widget/route runtime — this is the render seam the
 * engentus module gets by depending on plugin.chart-runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// strip ES import/export so the modules concatenate into one inline script
function inlineModule(file) {
  const src = fs.readFileSync(path.join(here, file), "utf8");
  return src
    .replace(/^\s*import\s+[^;]*;?\s*$/gm, "")           // drop import lines
    .replace(/^\s*export\s+default\s+/gm, "const __default_unused = ")
    .replace(/^\s*export\s+(const|function|let|class)\s/gm, "$1 ");
}

export function chartRuntimeBundleSource(extraModules = []) {
  return [
    "// ── inlined generic chart runtime ──",
    inlineModule("dataflow-eval.js"),
    inlineModule("gog-runtime.js"),
    ...extraModules.map(inlineModule),
    inlineModule("chart-client.js")
  ].join("\n\n");
}

export function renderChartHtml({ title = "Chart", spec, domainModule = "goodman-stdlib.js", functionsExport = "goodmanFunctions" } = {}) {
  const bundle = chartRuntimeBundleSource([domainModule]);
  const specJson = JSON.stringify(spec ?? {});
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
  html,body{margin:0;height:100%;background:#2C3C63;font-family:-apple-system,Segoe UI,sans-serif}
  #chart{position:absolute;inset:16px;background:#fff;border-radius:8px}
  svg.gog text{font-size:11px;fill:#475569}
</style>
</head>
<body>
<div id="chart" data-chart-spec='${escapeAttr(specJson)}'></div>
<script type="module">
${bundle}

bootChartsFromDom(document, ${functionsExport});
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function escapeAttr(s) {
  return String(s).replace(/'/g, "&#39;").replace(/&(?!#39;)/g, "&amp;");
}
