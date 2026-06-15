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

function assignNestedPatchValue(target, path, value) {
  const parts = String(path ?? "").split(".").filter(Boolean);
  if (!parts.length) return false;
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const nextPart = parts[index + 1];
    if (Array.isArray(cursor)) {
      const arrayIndex = Number(part);
      if (!Number.isInteger(arrayIndex) || arrayIndex < 0) return false;
      cursor[arrayIndex] ??= /^\d+$/.test(nextPart) ? [] : {};
      cursor = cursor[arrayIndex];
      continue;
    }
    if (cursor[part] == null || typeof cursor[part] !== "object") {
      cursor[part] = /^\d+$/.test(nextPart) ? [] : {};
    }
    cursor = cursor[part];
  }
  const leaf = parts[parts.length - 1];
  if (Array.isArray(cursor)) {
    const arrayIndex = Number(leaf);
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0) return false;
    cursor[arrayIndex] = value;
    return true;
  }
  cursor[leaf] = value;
  return true;
}

function readNestedValue(source, path) {
  let cursor = source;
  for (const part of String(path ?? "").split(".").filter(Boolean)) {
    if (cursor == null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function chartViewportSize(container, view = {}) {
  const rawWidth = Number(container?.clientWidth || 0) > 0 ? container.clientWidth : 800;
  const rawHeight = Number(container?.clientHeight || 0) > 0 ? container.clientHeight : 520;
  if (view?.frame !== "disc") {
    return { width: rawWidth, height: rawHeight };
  }
  const size = Math.max(1, Math.min(rawWidth, rawHeight));
  if (container?.style) {
    container.style.width = `${size}px`;
    container.style.height = `${size}px`;
  }
  return { width: size, height: size };
}

function scalarModelOutputs(evaluated = {}) {
  const outputs = {};
  for (const [name, field] of Object.entries(evaluated.fields ?? {})) {
    if (Array.isArray(field?.axes) && field.axes.length === 0) outputs[name] = field.data;
  }
  return outputs;
}

function publishCapabilityOutputs(container, outputs = {}) {
  container.__surfaceCapabilityOutputs = outputs;
  const surfaceId = container.getAttribute?.("data-surface-id") ?? "";
  const event = typeof CustomEvent === "function"
    ? new CustomEvent("surface-capability-output", {
        bubbles: true,
        detail: { capability: "chart.render", surfaceId, outputs }
      })
    : null;
  if (event) container.dispatchEvent(event);
}

function tooltipElementFor(container, view = {}) {
  const tooltipId = view?.props?.tooltipId;
  if (tooltipId && globalThis.document?.getElementById) {
    const byId = globalThis.document.getElementById(tooltipId);
    if (byId) return byId;
  }
  const sibling = container?.parentElement?.querySelector?.("[data-chart-page-overlay='tooltip']");
  return sibling ?? null;
}

function formatTooltipKey(key) {
  return String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatTooltipValue(value) {
  const number = Number(value);
  if (Number.isFinite(number) && value !== "" && value !== null) {
    if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(2)} k`;
    if (Math.abs(number) >= 10) return number.toFixed(1);
    return number.toFixed(3).replace(/\.?0+$/, "");
  }
  return String(value ?? "");
}

function tooltipMarkup(readout = {}) {
  const readingTooltip = Array.isArray(readout.readings)
    ? readout.readings.find(reading => reading?.tooltip && Object.keys(reading.tooltip).length)?.tooltip
    : null;
  const values = readout.tooltip && typeof readout.tooltip === "object"
    ? readout.tooltip
    : (readingTooltip && typeof readingTooltip === "object" ? readingTooltip : {});
  const entries = Object.entries(values).filter(([, value]) => value != null && value !== "");
  if (!entries.length) return "";
  const [firstKey, firstValue] = entries[0];
  const rows = entries.slice(1).map(([key, value]) =>
    `<div><span>${formatTooltipKey(key)}</span>: ${formatTooltipValue(value)}</div>`
  );
  return [
    `<div style="font-weight:600;margin-bottom:3px">${formatTooltipKey(firstKey)} ${formatTooltipValue(firstValue)}</div>`,
    ...rows
  ].join("");
}

function attachChartTooltip(container, renderedNode, view = {}) {
  const tooltip = tooltipElementFor(container, view);
  if (!tooltip || typeof renderedNode?.probeAtPoint !== "function") return () => {};
  const eventTarget = renderedNode.parentElement ?? renderedNode;
  const move = event => {
    const rect = renderedNode.getBoundingClientRect?.();
    if (!rect) return;
    const readout = renderedNode.probeAtPoint(event.clientX - rect.left, event.clientY - rect.top);
    const html = tooltipMarkup(readout);
    if (!html) {
      tooltip.style.display = "none";
      tooltip.style.opacity = "0";
      return;
    }
    tooltip.innerHTML = html;
    tooltip.style.display = "block";
    tooltip.style.opacity = "1";
    tooltip.style.left = `${event.clientX - rect.left + 10}px`;
    tooltip.style.top = `${event.clientY - rect.top - 10}px`;
  };
  const leave = () => {
    tooltip.style.display = "none";
    tooltip.style.opacity = "0";
  };
  eventTarget.addEventListener("mousemove", move, true);
  eventTarget.addEventListener("mouseleave", leave, true);
  return () => {
    eventTarget.removeEventListener("mousemove", move, true);
    eventTarget.removeEventListener("mouseleave", leave, true);
    leave();
  };
}

export function mountChart(container, initialSpec = {}) {
  let mountSpec = normalizeMountSpec(initialSpec);
  let renderedNode = null;
  let evaluatedModel = null;
  let renderedPlan = null;
  let cleanupTooltip = null;
  let resizeObserver = null;
  let resizeFrame = 0;
  let cancelResizeFrame = null;

  const render = () => {
    const evaluated = evaluateModel(mountSpec.model, {
      functions: mountSpec.functions,
      params: mountSpec.params,
      axisValues: mountSpec.axisValues
    });
    evaluatedModel = evaluated;
    const viewport = chartViewportSize(container, mountSpec.view);
    const plan = planChart(mountSpec.view, evaluated, {
      width: viewport.width,
      height: viewport.height
    });
    renderedPlan = plan;
    cleanupTooltip?.();
    cleanupTooltip = null;
    if (renderedNode && typeof renderedNode.destroy === "function") renderedNode.destroy();
    renderedNode = drawChart(container, plan, globalThis.d3);
    cleanupTooltip = attachChartTooltip(container, renderedNode, mountSpec.view);
    publishCapabilityOutputs(container, scalarModelOutputs(evaluated));
    return renderedNode;
  };

  const scheduleRender = () => {
    if (resizeFrame) return;
    if (typeof globalThis.requestAnimationFrame === "function") {
      resizeFrame = globalThis.requestAnimationFrame(() => {
        resizeFrame = 0;
        cancelResizeFrame = null;
        render();
      });
      cancelResizeFrame = () => globalThis.cancelAnimationFrame?.(resizeFrame);
      return;
    }
    resizeFrame = setTimeout(() => {
      resizeFrame = 0;
      cancelResizeFrame = null;
      render();
    }, 0);
    cancelResizeFrame = () => clearTimeout(resizeFrame);
  };

  render();
  if (typeof globalThis.ResizeObserver === "function") {
    resizeObserver = new globalThis.ResizeObserver(scheduleRender);
    resizeObserver.observe(container.parentElement ?? container);
  } else if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("resize", scheduleRender);
  }

  return {
    get node() {
      return renderedNode;
    },
    get spec() {
      return mountSpec;
    },
    get evaluated() {
      return evaluatedModel;
    },
    get plan() {
      return renderedPlan;
    },
    get outputs() {
      return scalarModelOutputs(evaluatedModel);
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
      if (resizeFrame && typeof cancelResizeFrame === "function") cancelResizeFrame();
      resizeFrame = 0;
      cancelResizeFrame = null;
      resizeObserver?.disconnect?.();
      if (!resizeObserver && typeof globalThis.removeEventListener === "function") {
        globalThis.removeEventListener("resize", scheduleRender);
      }
      cleanupTooltip?.();
      cleanupTooltip = null;
      if (typeof renderedNode?.destroy === "function") renderedNode.destroy();
      renderedNode = null;
    }
  };
}

function chartElementsIn(root) {
  const queryRoot = root ?? globalThis.document;
  const elements = [];
  if (typeof queryRoot?.matches === "function" && queryRoot.matches("[data-chart-spec]")) {
    elements.push(queryRoot);
  }
  if (typeof queryRoot?.querySelectorAll === "function") {
    elements.push(...queryRoot.querySelectorAll("[data-chart-spec]"));
  }
  return elements;
}

export function bootChartsFromDom(doc, functions = {}) {
  for (const el of chartElementsIn(doc)) {
    if (el.__chartController) continue;
    const spec = JSON.parse(el.getAttribute("data-chart-spec"));
    el.__chartController = mountChart(el, {
      model: spec.model,
      view: spec.view,
      params: spec.params ?? {},
      functions
    });
    let pendingProps = {};
    let pendingFrame = 0;
    const flushPendingProps = () => {
      pendingFrame = 0;
      const props = pendingProps;
      pendingProps = {};
      const params = {};
      let view = null;
      for (const [key, value] of Object.entries(props ?? {})) {
        if (key.startsWith("param.")) {
          const paramKey = key.slice("param.".length);
          if (el.__chartController.spec?.params?.[paramKey] === value) continue;
          params[paramKey] = value;
        } else if (key.startsWith("presentation.")) {
          const viewKey = key.slice("presentation.".length);
          if (!viewKey) continue;
          if (readNestedValue(el.__chartController.spec?.view, viewKey) === value) continue;
          view ??= structuredClone(el.__chartController.spec?.view ?? {});
          assignNestedPatchValue(view, viewKey, value);
        }
      }
      const patch = {};
      if (Object.keys(params).length) patch.params = params;
      if (view) patch.view = view;
      if (Object.keys(patch).length) el.__chartController.update(patch);
    };
    const schedulePropsFlush = () => {
      if (pendingFrame) return;
      const raf = globalThis.requestAnimationFrame ?? (callback => setTimeout(callback, 0));
      pendingFrame = raf(flushPendingProps);
    };
    el.__surfaceCapabilityController = {
      updateProps(props = {}) {
        pendingProps = { ...pendingProps, ...(props ?? {}) };
        schedulePropsFlush();
      }
    };
  }
}

export function registerChartSurfaceCapabilityBoot(functions = {}) {
  const boot = root => bootChartsFromDom(root ?? globalThis.document, functions);
  globalThis.__surfaceCapabilityBootHooks = Array.isArray(globalThis.__surfaceCapabilityBootHooks)
    ? globalThis.__surfaceCapabilityBootHooks
    : [];
  if (!globalThis.__surfaceCapabilityBootHooks.includes(boot)) {
    globalThis.__surfaceCapabilityBootHooks.push(boot);
  }
  return boot;
}
