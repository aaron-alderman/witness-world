/**
 * chart-runtime plugin — contributes the generic `chart.render` capability.
 *
 * It resolves a witnessed `chart` (surface) node and its referenced `model`
 * (dataflow) node from the world, then serves a self-contained page that
 * evaluates the model and paints the grammar-of-graphics spec with D3. Modules
 * are reusable verbatim — any authored domain helper libraries are injected by
 * the page rather than baked into the runtime.
 *
 * Modules that depend on this plugin declare it via dependsOnPlugins /
 * dependsOnCapabilities; the platform installs it. No direct route wiring in
 * the authored module.
 */
import {
  chartRuntimeAssets,
  renderChartHtml,
  renderChartMountMarkup,
  renderChartOverlayMarkup
} from "./chart-page.js";

export const bundleId = "bundle-chart-runtime";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze(["page.chart"]),
  pageHandlers: Object.freeze(["page.chart"]),
  dispatchHandlers: Object.freeze(["page.chart"]),
  handlerMetadata: Object.freeze({
    "page.chart": Object.freeze({ routeKind: "page", responseKind: "page", methods: Object.freeze(["GET"]) })
  })
});

export const routes = Object.freeze([
  { method: "GET", path: "/chart", handler: "page.chart" }
]);
export const surfaces = Object.freeze([]);
export const capabilities = Object.freeze(["chart.render"]);

// resolve {model, view} for a chart node from the witnessed world
export function resolveChartSpec(witnesses, chartName) {
  const find = (process, id) => witnesses.find(w => w.process === process && w.body?.id === id)?.body ?? null;
  const view = find("desire.defineSurface", chartName);
  if (!view || view.surfaceKind !== "chart") return null;
  const model = find("desire.define.dataflow", view.modelRef);
  if (!model) return null;
  return {
    model: { axes: model.axes ?? [], params: model.params ?? [], derives: model.derives ?? [], reduces: model.reduces ?? [] },
    view: { frame: view.frame, encoding: view.encoding ?? {}, editable: view.editable ?? [], layers: view.layers ?? [], modelRef: view.modelRef },
    params: {},
    pageProps: view.props ?? {}
  };
}

export function createHandlers(deps = {}) {
  const { world, send, sendJson } = deps;
  return {
    "page.chart": async ({ res, route, requestUrl }) => {
      const chartName = route?.params?.chart
        ?? route?.query?.chart
        ?? requestUrl?.searchParams?.get("chart");
      if (!chartName) {
        if (sendJson) sendJson(res, 400, { error: "missing chart id" });
        return;
      }
      const witnesses = typeof world?.allWitnesses === "function" ? world.allWitnesses() : [];
      const spec = resolveChartSpec(witnesses, chartName);
      if (!spec) {
        if (sendJson) sendJson(res, 404, { error: `chart not found: ${chartName}` });
        return;
      }
      const html = renderChartHtml({ title: chartName, spec, pageProps: spec.pageProps ?? {} });
      if (send) send(res, 200, "text/html", html);
    }
  };
}

export function buildMountedChartRuntime({ world, activeSurface } = {}) {
  const witnesses = typeof world?.allWitnesses === "function" ? world.allWitnesses() : [];
  const chartIds = Array.isArray(activeSurface?.children)
    ? activeSurface.children.filter(Boolean)
    : [];
  const resolvedCharts = chartIds
    .map(chartId => ({ chartId, spec: resolveChartSpec(witnesses, chartId) }))
    .filter(entry => entry.spec);
  if (!resolvedCharts.length) return null;

  const assets = chartRuntimeAssets({
    pagePropsList: resolvedCharts.map(entry => entry.spec.pageProps ?? {}),
    standalone: false
  });

  return {
    stylesheetHrefs: assets.stylesheetHrefs,
    scriptSrcs: assets.scriptSrcs,
    inlineCss: assets.inlineCss,
    scriptBody: assets.scriptBody,
    describeChartSurface(chartSurface) {
      if (!chartSurface?.id) return null;
      const spec = resolveChartSpec(witnesses, chartSurface.id);
      if (!spec) return null;
      return {
        spec,
        pageProps: spec.pageProps ?? {}
      };
    },
    renderMountedChart(chartSurface, {
      mountMode = "mounted-panel",
      viewKey = null,
      visible = true,
      includeOverlayCanvas = true,
      includeTooltip = true
    } = {}) {
      if (mountMode === "iframe" || !chartSurface?.id) return null;
      const chart = this.describeChartSurface(chartSurface);
      if (!chart) return null;
      return renderChartMountMarkup({
        spec: chart.spec,
        pageProps: chart.pageProps,
        mountAttributes: {
          "data-mount-mode": mountMode,
          "data-surface-id": chartSurface.id,
          ...(visible ? {} : { style: "display:none" }),
          ...(viewKey ? { "data-chart-view": viewKey } : {})
        },
        includeOverlayCanvas,
        includeTooltip
      });
    },
    renderChartOverlays(chartSurface, {
      overlayCanvasAttributes = {},
      tooltipAttributes = {}
    } = {}) {
      const chart = this.describeChartSurface(chartSurface);
      if (!chart) return null;
      return renderChartOverlayMarkup({
        pageProps: chart.pageProps,
        overlayCanvasAttributes,
        tooltipAttributes
      });
    }
  };
}

export const providers = Object.freeze([
  {
    kind: "coreHook",
    id: "buildMountedChartRuntime",
    hook: buildMountedChartRuntime
  }
]);

export default { bundleId, handlerCatalog, routes, surfaces, capabilities, providers, createHandlers };
