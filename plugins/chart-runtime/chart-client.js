/**
 * chart-client.js — browser boot for the chart runtime. Generic.
 *
 * Walks [data-chart-spec] elements, evaluates the embedded model spec into a
 * product tensor, plans the chart, and paints it with D3. Domain functions
 * (e.g. the Goodman std-lib) are injected by the page — this stays generic.
 */
import { evaluateModel } from "./dataflow-eval.js";
import { planChart, drawChart } from "./gog-runtime.js";

function normalizeMountSpec(spec = {}) {
  return {
    model: spec.model ?? {},
    view: spec.view ?? {},
    functions: spec.functions ?? {},
    params: spec.params ?? {},
    axisValues: spec.axisValues ?? {}
  };
}

function mergedMountSpec(base, patch = {}) {
  return {
    ...base,
    ...patch,
    model: patch.model ?? base.model,
    view: patch.view ?? base.view,
    functions: patch.functions ? { ...base.functions, ...patch.functions } : base.functions,
    params: patch.params ? { ...base.params, ...patch.params } : base.params,
    axisValues: patch.axisValues ? { ...base.axisValues, ...patch.axisValues } : base.axisValues
  };
}

export function mountChart(container, initialSpec = {}) {
  let mountSpec = normalizeMountSpec(initialSpec);
  let renderedNode = null;

  const render = () => {
    const evaluated = evaluateModel(mountSpec.model, {
      functions: mountSpec.functions,
      params: mountSpec.params,
      axisValues: mountSpec.axisValues
    });
    const plan = planChart(mountSpec.view, evaluated, {
      width: container.clientWidth || 800,
      height: container.clientHeight || 520
    });
    if (renderedNode && typeof renderedNode.destroy === "function") renderedNode.destroy();
    renderedNode = drawChart(container, plan, globalThis.d3);
    return renderedNode;
  };

  render();

  return {
    get node() {
      return renderedNode;
    },
    get spec() {
      return mountSpec;
    },
    update(patch = {}) {
      mountSpec = mergedMountSpec(mountSpec, patch);
      return render();
    },
    probeAt(x) {
      return typeof renderedNode?.probeAt === "function" ? renderedNode.probeAt(x) : null;
    },
    scrubTo(valueOrFrame) {
      if (typeof renderedNode?.scrubToValue === "function") return renderedNode.scrubToValue(valueOrFrame);
      if (typeof renderedNode?.scrubTo === "function") return renderedNode.scrubTo(valueOrFrame);
      return null;
    },
    play() {
      if (typeof renderedNode?.play === "function") renderedNode.play();
    },
    pause() {
      if (typeof renderedNode?.pause === "function") renderedNode.pause();
    },
    destroy() {
      if (typeof renderedNode?.destroy === "function") renderedNode.destroy();
      renderedNode = null;
    }
  };
}

export function bootChartsFromDom(doc, functions = {}) {
  const root = doc ?? globalThis.document;
  for (const el of root.querySelectorAll("[data-chart-spec]")) {
    const spec = JSON.parse(el.getAttribute("data-chart-spec"));
    el.__chartController = mountChart(el, {
      model: spec.model,
      view: spec.view,
      params: spec.params ?? {},
      functions
    });
  }
}
