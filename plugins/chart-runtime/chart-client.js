/**
 * chart-client.js — browser boot for the chart runtime. Generic.
 *
 * Walks [data-chart-spec] elements, evaluates the embedded model spec into a
 * product tensor, plans the chart, and paints it with D3. Domain functions
 * (e.g. the Goodman std-lib) are injected by the page — this stays generic.
 */
import { evaluateModel } from "./dataflow-eval.js";
import { planChart, drawChart } from "./gog-runtime.js";

export function mountChart(container, { model, view, functions = {}, params = {}, axisValues = {} }) {
  const evaluated = evaluateModel(model, { functions, params, axisValues });
  const plan = planChart(view, evaluated, {
    width: container.clientWidth || 800,
    height: container.clientHeight || 520
  });
  return drawChart(container, plan, globalThis.d3);
}

export function bootChartsFromDom(doc, functions = {}) {
  const root = doc ?? globalThis.document;
  for (const el of root.querySelectorAll("[data-chart-spec]")) {
    const spec = JSON.parse(el.getAttribute("data-chart-spec"));
    mountChart(el, { model: spec.model, view: spec.view, params: spec.params ?? {}, functions });
  }
}
