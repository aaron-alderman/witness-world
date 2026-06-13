/**
 * chart-runtime plugin — contributes the generic `chart.render` capability.
 *
 * It resolves a witnessed `chart` (surface) node and its referenced `model`
 * (dataflow) node from the world, then serves a self-contained page that
 * evaluates the model and paints the grammar-of-graphics spec with D3. Modules
 * are reusable verbatim — no engentus/Goodman logic lives here (the fatigue
 * std-lib is injected by the page from goodman-stdlib.js).
 *
 * Modules that depend on this plugin declare it via dependsOnPlugins /
 * dependsOnCapabilities; the platform installs it. No direct route wiring in
 * the authored module.
 */
import { renderChartHtml } from "./chart-page.js";

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
    params: {}
  };
}

export function createHandlers(deps = {}) {
  const { world, send, sendJson } = deps;
  return {
    "page.chart": async ({ res, route }) => {
      const chartName = route?.params?.chart ?? route?.query?.chart ?? "GoodmanDiagram";
      const witnesses = typeof world?.allWitnesses === "function" ? world.allWitnesses() : [];
      const spec = resolveChartSpec(witnesses, chartName);
      if (!spec) {
        if (sendJson) sendJson(res, 404, { error: `chart not found: ${chartName}` });
        return;
      }
      const html = renderChartHtml({ title: chartName, spec });
      if (send) send(res, 200, "text/html", html);
    }
  };
}

export default { bundleId, handlerCatalog, routes, surfaces, capabilities, createHandlers };
