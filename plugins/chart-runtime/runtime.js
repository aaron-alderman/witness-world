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
import { APP_REVISION_EVENTS_PATH } from "../../src/app-snapshot-manager.js";
import { fileURLToPath } from "node:url";
import {
  chartRuntimeAssets,
  renderChartHtml,
  renderChartMountMarkup,
  renderChartOverlayMarkup
} from "./chart-page.js";
import { applyChartPresentationPatch } from "./chart-presentation-patch.js";

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

function runtimeFile(name) {
  return fileURLToPath(new URL(`./${name}`, import.meta.url));
}

function cloneSpec(spec) {
  return JSON.parse(JSON.stringify(spec ?? {}));
}

function stateValue(initialState, stateId) {
  const key = String(stateId ?? "").trim();
  if (!key) return undefined;
  if (initialState instanceof Map) return initialState.get(key);
  if (initialState && typeof initialState === "object") return initialState[key];
  return undefined;
}

function bindingValue(binding, initialState) {
  const stateId = binding?.source?.state;
  if (!stateId) return undefined;
  return stateValue(initialState, stateId);
}

function applyInitialChartBindings(spec, chartSurface, initialState) {
  if (!Array.isArray(chartSurface?.bindings) || !chartSurface.bindings.length) return spec;
  const next = cloneSpec(spec);
  for (const binding of chartSurface.bindings) {
    const prop = String(binding?.prop ?? "").trim();
    if (!prop) continue;
    const value = bindingValue(binding, initialState);
    if (value === undefined) continue;
    if (prop.startsWith("param.")) {
      const paramKey = prop.slice("param.".length).trim();
      if (paramKey) {
        next.params ??= {};
        next.params[paramKey] = value;
      }
      continue;
    }
    if (prop.startsWith("presentation.")) {
      const viewKey = prop.slice("presentation.".length).trim();
      if (viewKey) applyChartPresentationPatch(next.view, viewKey, value);
    }
  }
  return next;
}

function injectDevClient(html, { appRevision = 0, eventsPath = APP_REVISION_EVENTS_PATH } = {}) {
  const runtime = `<script>
(() => {
  const currentRevision = ${JSON.stringify(Number(appRevision || 0))};
  if (typeof EventSource !== "function") return;
  const source = new EventSource(${JSON.stringify(eventsPath)});
  source.onmessage = event => {
    try {
      const payload = JSON.parse(event.data || "{}");
      if (Number(payload.appRevision || 0) <= currentRevision) return;
      source.close();
      window.location.reload();
    } catch {}
  };
  source.onerror = () => {
    try { source.close(); } catch {}
  };
})();
</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${runtime}</body>`) : `${html}\n${runtime}`;
}

// resolve {model, view} for a chart node from the witnessed world
export function resolveChartSpec(witnesses, chartName) {
  const find = (process, id) => witnesses.find(w => w.process === process && w.body?.id === id)?.body ?? null;
  const view = find("desire.defineSurface", chartName);
  if (!view || view.surfaceKind !== "chart") return null;
  const model = find("desire.define.dataflow", view.modelRef);
  if (!model) return null;
  return {
    model: { axes: model.axes ?? [], params: model.params ?? [], derives: model.derives ?? [], reduces: model.reduces ?? [] },
    view: { frame: view.frame, encoding: view.encoding ?? {}, editable: view.editable ?? [], layers: view.layers ?? [], modelRef: view.modelRef, props: view.props ?? {} },
    params: {},
    pageProps: view.props ?? {}
  };
}

export function createHandlers(deps = {}) {
  const { world, send, sendJson, currentAppRenderWorld } = deps;
  return {
    "page.chart": async ({ res, route, requestUrl, appContext }) => {
      const chartName = route?.params?.chart
        ?? route?.query?.chart
        ?? requestUrl?.searchParams?.get("chart");
      if (!chartName) {
        if (sendJson) sendJson(res, 400, { error: "missing chart id" });
        return;
      }
      const renderWorld = appContext?.appSnapshotManager?.getActiveSnapshot()?.world
        ?? (typeof currentAppRenderWorld === "function" ? currentAppRenderWorld() : null)
        ?? world;
      const witnesses = typeof renderWorld?.allWitnesses === "function" ? renderWorld.allWitnesses() : [];
      const spec = resolveChartSpec(witnesses, chartName);
      if (!spec) {
        if (sendJson) sendJson(res, 404, { error: `chart not found: ${chartName}` });
        return;
      }
      let html = renderChartHtml({ title: chartName, spec, pageProps: spec.pageProps ?? {} });
      if (appContext?.devMode && appContext?.appSnapshotManager) {
        html = injectDevClient(html, {
          appRevision: appContext.appSnapshotManager.getActiveSnapshot()?.appRevision ?? 0
        });
      }
      if (send) send(res, 200, "text/html", html, appContext?.devMode ? { "cache-control": "no-cache" } : {});
    }
  };
}

export function buildMountedChartRuntime({ world, activeSurface, rootSurface, initialState } = {}) {
  const witnesses = typeof world?.allWitnesses === "function" ? world.allWitnesses() : [];
  const surfaces = new Map(
    witnesses
      .filter(witness => witness.process === "desire.defineSurface" && witness.body?.id)
      .map(witness => [witness.body.id, witness.body])
  );
  const chartIds = [];
  const traversalRoot = rootSurface ?? activeSurface;
  const queue = traversalRoot?.id
    ? [traversalRoot.id]
    : (Array.isArray(activeSurface?.children) ? [...activeSurface.children] : []);
  const seen = new Set();
  while (queue.length) {
    const surfaceId = String(queue.shift() || "").trim();
    if (!surfaceId || seen.has(surfaceId)) continue;
    seen.add(surfaceId);
    const surface = surfaces.get(surfaceId);
    if (!surface) continue;
    if (surface.surfaceKind === "chart") chartIds.push(surface.id);
    if (Array.isArray(surface.children)) queue.push(...surface.children);
  }
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
        spec: applyInitialChartBindings(spec, chartSurface, initialState),
        pageProps: spec.pageProps ?? {}
      };
    },
    renderMountedChart(chartSurface, {
      mountMode = "mounted-panel",
      viewKey = null,
      visible = true,
      fallbackId = "",
      includeOverlayCanvas = true,
      includeTooltip = true
    } = {}) {
      if (mountMode === "iframe" || !chartSurface?.id) return null;
      const chart = this.describeChartSurface(chartSurface);
      if (!chart) return null;
      return renderChartMountMarkup({
        spec: chart.spec,
        pageProps: chart.pageProps,
        mountIdOverride: fallbackId,
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

export function createSurfaceCapabilityRenderer(context = {}) {
  const mounted = buildMountedChartRuntime(context);
  if (!mounted) return null;
  return {
    capability: "chart.render",
    stylesheetHrefs: mounted.stylesheetHrefs,
    scriptSrcs: mounted.scriptSrcs,
    inlineCss: mounted.inlineCss,
    scriptBody: mounted.scriptBody,
    renderSurface(surface) {
      if (surface?.surfaceKind !== "chart") return null;
      return mounted.renderMountedChart(surface, {
        mountMode: "mounted-panel"
      });
    }
  };
}

export const providers = Object.freeze([
  {
    kind: "staticAssetProvider",
    id: "chart-runtime.static",
    mount: "/canvas-lib/",
    files: Object.freeze({
      "chart-presentation-patch.js": runtimeFile("chart-presentation-patch.js"),
      "chart-client.js": runtimeFile("chart-client.js"),
      "dataflow-eval.js": runtimeFile("dataflow-eval.js"),
      "gog-runtime.js": runtimeFile("gog-runtime.js")
    })
  },
  {
    kind: "coreHook",
    id: "buildMountedChartRuntime",
    hook: buildMountedChartRuntime
  },
  {
    kind: "surfaceCapabilityRenderer",
    id: "chart-runtime.surfaceCapabilityRenderer",
    capability: "chart.render",
    factory: createSurfaceCapabilityRenderer
  }
]);

export default { bundleId, handlerCatalog, routes, surfaces, capabilities, providers, createHandlers };
