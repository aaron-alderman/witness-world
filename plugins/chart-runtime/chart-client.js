/**
 * chart-client.js — browser boot for the chart runtime. Generic.
 *
 * Walks chart mount elements, resolves their manifest-backed model spec into a
 * product tensor, lowers it through the private chart plan/scene/port seam,
 * and mounts the resulting runtime node. Domain functions (e.g. the Goodman
 * std-lib) are injected by the page — this stays generic.
 */
import { evaluateModel } from "./plan/evaluate-model.js";
import { planChart } from "./plan/chart-plan.js";
import { buildScene } from "./scene/build-scene.js";
import { renderScene } from "./ports/render-port.js";
import { assignChartPresentationPatchValue, applyChartPresentationPatch, readChartPresentationPatchValue } from "./chart-presentation-patch.js";
import { resolvePresentationView } from "./presentation/resolve-presentation.js";

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

export { applyChartPresentationPatch };

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function classListContains(node, className) {
  const classes = String(node?.getAttribute?.("class") ?? node?.className ?? "")
    .split(/\s+/)
    .filter(Boolean);
  return classes.includes(className);
}

function isChartMount(node) {
  return Boolean(node)
    && classListContains(node, "chart-page__mount")
    && Boolean(trimString(node?.getAttribute?.("data-chart-id")));
}

function jsonNodeText(root, id) {
  const candidates = [
    root,
    root?.ownerDocument,
    globalThis.document
  ];
  for (const candidate of candidates) {
    const node = typeof candidate?.getElementById === "function"
      ? candidate.getElementById(id)
      : null;
    if (typeof node?.textContent === "string") return node.textContent;
  }
  return "";
}

function readJsonManifest(root, id) {
  const text = jsonNodeText(root, id);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readChartSpecs(root) {
  return {
    ...(readJsonManifest(root, "surface-runtime-manifest")?.chartSpecs ?? {}),
    ...(readJsonManifest(root, "chart-runtime-manifest")?.chartSpecs ?? {})
  };
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

function publishCapabilityError(container, {
  phase = "capability-mount",
  message = "Chart capability failed",
  error = null
} = {}) {
  const surfaceId = container?.getAttribute?.("data-surface-id") ?? "";
  const targetId = container?.id ?? "";
  const details = error
    ? {
        name: error?.name || "Error",
        message: String(error?.message || error),
        stack: String(error?.stack || "")
      }
    : null;
  globalThis.console?.error?.("chart capability error", error ?? message);
  const event = typeof CustomEvent === "function"
    ? new CustomEvent("surface-capability-error", {
        bubbles: true,
        detail: {
          capability: "chart.render",
          surfaceId,
          targetId,
          phase,
          message,
          details
        }
      })
    : null;
  if (event && typeof container?.dispatchEvent === "function") container.dispatchEvent(event);
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

function tooltipMarkup(readout = {}, { view = {}, functions = {}, plan = null, spec = null } = {}) {
  const formatterKey = view?.props?.tooltipFormatter;
  const formatter = typeof formatterKey === "string" && formatterKey.trim()
    ? functions?.[formatterKey.trim()]
    : null;
  if (typeof formatter === "function") {
    try {
      const rendered = formatter({ readout, view, plan, spec });
      if (typeof rendered === "string") return rendered;
    } catch (error) {
      globalThis.console?.error?.("chart tooltip formatter error", error);
    }
  }
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

function attachChartTooltip(container, renderedNode, { view = {}, functions = {}, plan = null, spec = null } = {}) {
  const tooltip = tooltipElementFor(container, view);
  if (!tooltip || typeof renderedNode?.probeAtPoint !== "function") return () => {};
  const eventTarget = renderedNode.parentElement ?? renderedNode;
  const move = event => {
    const rect = renderedNode.getBoundingClientRect?.();
    if (!rect) return;
    const readout = renderedNode.probeAtPoint(event.clientX - rect.left, event.clientY - rect.top);
    const html = tooltipMarkup(readout, { view, functions, plan, spec });
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
    const resolvedView = resolvePresentationView(mountSpec.view, container);
    const evaluated = evaluateModel(mountSpec.model, {
      functions: mountSpec.functions,
      params: mountSpec.params,
      axisValues: mountSpec.axisValues
    });
    evaluatedModel = evaluated;
    const viewport = chartViewportSize(container, resolvedView);
    const plan = planChart(resolvedView, evaluated, {
      width: viewport.width,
      height: viewport.height
    });
    renderedPlan = plan;
    const scene = buildScene(plan, {
      mountTag: String(container?.tagName ?? "").toLowerCase()
    });
    cleanupTooltip?.();
    cleanupTooltip = null;
    if (renderedNode && typeof renderedNode.destroy === "function") renderedNode.destroy();
    renderedNode = renderScene(container, scene, { plan });
    cleanupTooltip = attachChartTooltip(container, renderedNode, {
      view: resolvedView,
      functions: mountSpec.functions,
      plan,
      spec: mountSpec
    });
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
  if (isChartMount(queryRoot)) {
    elements.push(queryRoot);
  }
  if (typeof queryRoot?.querySelectorAll === "function") {
    elements.push(...[...queryRoot.querySelectorAll("*")].filter(isChartMount));
  }
  return elements;
}

export function bootChartsFromDom(doc, functions = {}) {
  const chartSpecs = readChartSpecs(doc);
  for (const el of chartElementsIn(doc)) {
    const chartId = trimString(el.getAttribute?.("data-chart-id"));
    if (el.__chartController) {
      const currentFunctions = el.__chartController.spec?.functions ?? {};
      const nextFunctions = functions ?? {};
      const currentKeys = Object.keys(currentFunctions);
      const nextKeys = Object.keys(nextFunctions);
      const needsFunctionRefresh = nextKeys.some(key => currentFunctions[key] !== nextFunctions[key]);
      if (needsFunctionRefresh || nextKeys.length !== currentKeys.length) {
        try {
          el.__chartController.update({ functions: nextFunctions });
        } catch (error) {
          publishCapabilityError(el, {
            phase: "refresh",
            message: "Chart capability failed during function refresh",
            error
          });
        }
      }
      continue;
    }
    try {
      const spec = chartId ? chartSpecs[chartId] : null;
      if (!spec || typeof spec !== "object") {
        throw new Error(`chart spec missing from manifest for ${chartId || "unknown chart"}`);
      }
      el.__chartController = mountChart(el, {
        model: spec.model,
        view: spec.view,
        params: spec.params ?? {},
        functions
      });
    } catch (error) {
      publishCapabilityError(el, {
        phase: "capability-mount",
        message: "Chart capability failed during mount",
        error
      });
      continue;
    }
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
          if (readChartPresentationPatchValue(el.__chartController.spec?.view, viewKey) === value) continue;
          view ??= structuredClone(el.__chartController.spec?.view ?? {});
          assignChartPresentationPatchValue(view, viewKey, value);
        }
      }
      const patch = {};
      if (Object.keys(params).length) patch.params = params;
      if (view) patch.view = view;
      if (Object.keys(patch).length) {
        try {
          el.__chartController.update(patch);
        } catch (error) {
          publishCapabilityError(el, {
            phase: "refresh",
            message: "Chart capability failed during update",
            error
          });
        }
      }
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
  const registry = globalThis.__chartRuntimeFunctions = {
    ...(globalThis.__chartRuntimeFunctions ?? {}),
    ...(functions ?? {})
  };
  const boot = globalThis.__chartSurfaceCapabilityBoot
    ?? (globalThis.__chartSurfaceCapabilityBoot = (root => bootChartsFromDom(root ?? globalThis.document, globalThis.__chartRuntimeFunctions ?? {})));
  globalThis.__surfaceCapabilityBootHooks = Array.isArray(globalThis.__surfaceCapabilityBootHooks)
    ? globalThis.__surfaceCapabilityBootHooks
    : [];
  if (!globalThis.__surfaceCapabilityBootHooks.includes(boot)) {
    globalThis.__surfaceCapabilityBootHooks.push(boot);
  }
  if (globalThis.document) bootChartsFromDom(globalThis.document, registry);
  return boot;
}
