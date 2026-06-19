import { projectors } from "./kernel.js";
import { defineRoute, moduleProjectors } from "./modules.js";
import { applyDesire, createDesireDocument, createDesireNode } from "./desire/index.js";
import { applyLegacyFrontendMigration } from "./frontend-legacy-migration.js";
import {
  legacyFrontendBridgeConfigFromRoute,
  legacyFrontendBridgeConfigFromSurface,
  legacySurfaceIdForRoute,
  isLegacyFrontendBridgeSurface
} from "./legacy-frontend-bridge.js";
import { frontendProgram, widgetTree } from "./widgets.js";

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cloneParams(params = null) {
  return params && typeof params === "object" && !Array.isArray(params)
    ? structuredClone(params)
    : {};
}

function sanitizeIdPart(value, fallback = "item") {
  const normalized = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function exactExpression(value) {
  const match = typeof value === "string" ? value.match(/^\$\{([^}]+)\}$/) : null;
  return match ? match[1].trim() : null;
}

function isInterpolatedString(value) {
  return typeof value === "string" && value.includes("${") && !exactExpression(value);
}

function surfaceRowsFromWitnesses(witnesses = []) {
  const rows = new Map();
  for (const witness of witnesses ?? []) {
    if (witness?.process !== "desire.defineSurface" || !trimString(witness?.body?.id)) continue;
    rows.set(witness.body.id, witness.body);
  }
  return [...rows.values()];
}

function currentRouteSources(project) {
  const routes = project(moduleProjectors.routes) ?? [];
  const surfaces = new Map((project(surfaceRowsFromWitnesses) ?? []).map(surface => [surface.id, surface]));
  return routes.flatMap(route => {
    if (trimString(route?.handler) === "page.home") {
      const bridge = legacyFrontendBridgeConfigFromRoute(route);
      return bridge ? [{ route, bridge, routeKind: "page.home", sourceSurface: null }] : [];
    }
    if (trimString(route?.handler) !== "page.surface") return [];
    const rootSurfaceId = trimString(route?.params?.rootSurface);
    const sourceSurface = rootSurfaceId ? (surfaces.get(rootSurfaceId) ?? null) : null;
    const bridge = legacyFrontendBridgeConfigFromSurface(sourceSurface);
    return bridge ? [{ route, bridge, routeKind: "page.surface", sourceSurface }] : [];
  });
}

function nativeRootSurfaceIdForRoute(routeId) {
  return `legacyUplift.${routeId}.surface.root`;
}

function widgetSurfaceId(routeId, widgetId) {
  return `legacyUplift.${routeId}.surface.widget.${sanitizeIdPart(widgetId, "widget")}`;
}

function collectionIdFor(routeId, name) {
  return `legacyUplift.${routeId}.collection.${sanitizeIdPart(name, "collection")}`;
}

function processIdForRoute(routeId) {
  return `legacyUplift.${routeId}.process`;
}

function triggerMessageId(routeId, eventName) {
  return `legacyUplift.${routeId}.message.trigger.${sanitizeIdPart(eventName, "event")}`;
}

function commandMessageId(routeId, name) {
  return `legacyUplift.${routeId}.message.command.${sanitizeIdPart(name, "command")}`;
}

function successMessageId(routeId, name) {
  return `legacyUplift.${routeId}.message.success.${sanitizeIdPart(name, "success")}`;
}

function failureMessageId(routeId, name) {
  return `legacyUplift.${routeId}.message.failure.${sanitizeIdPart(name, "failure")}`;
}

function boundaryIdFor(routeId, name) {
  return `legacyUplift.${routeId}.boundary.${sanitizeIdPart(name, "boundary")}`;
}

function policyIdFor(routeId, name) {
  return `legacyUplift.${routeId}.policy.${sanitizeIdPart(name, "policy")}`;
}

function stateIdFor(routeId, name) {
  return `legacyUplift.${routeId}.type.state.${sanitizeIdPart(name, "state")}`;
}

function queryStateIdFor(routeId, param) {
  return `legacyUplift.${routeId}.type.state.query.${sanitizeIdPart(param, "param")}`;
}

function enumIdFor(routeId, name) {
  return `legacyUplift.${routeId}.type.enum.${sanitizeIdPart(name, "enum")}`;
}

function preloadPolicyIdFor(routeId, name) {
  return `legacyUplift.${routeId}.preload.${sanitizeIdPart(name, "preload")}`;
}

function definitionIdsForPlan(plan = null) {
  if (!plan || typeof plan !== "object") return [];
  return [
    ...Object.values(plan.ids?.collections ?? {}),
    ...Object.values(plan.ids?.surfaces ?? {}),
    ...Object.values(plan.ids?.messages ?? {}),
    ...Object.values(plan.ids?.types ?? {}),
    ...Object.values(plan.ids?.enums ?? {}),
    ...Object.values(plan.ids?.boundaries ?? {}),
    ...Object.values(plan.ids?.policies ?? {}),
    plan.ids?.process ?? null
  ].filter(Boolean);
}

function sameOriginRoute(url) {
  const text = trimString(url);
  return Boolean(text) && text.startsWith("/") && !text.startsWith("//");
}

function walkWidgets(root, visit) {
  if (!root || typeof root !== "object") return;
  visit(root);
  for (const child of Array.isArray(root.children) ? root.children : []) {
    walkWidgets(child, visit);
  }
}

function widgetIndex(root) {
  const byId = new Map();
  const parentById = new Map();
  walkWidgets(root, widget => {
    byId.set(widget.id, widget);
    for (const child of Array.isArray(widget.children) ? widget.children : []) {
      parentById.set(child.id, widget.id);
    }
  });
  return { byId, parentById };
}

function supportedWidgetSurfaceKind(widget) {
  switch (widget?.kind) {
    case "Page": return { surfaceKind: "page", tag: "main" };
    case "Box":
    case "Section": return { surfaceKind: "section", tag: "section" };
    case "Header": return { surfaceKind: "header", tag: "header" };
    case "Heading": return { surfaceKind: "heading", tag: `h${Math.max(1, Math.min(6, Number(widget?.props?.level ?? 1) || 1))}` };
    case "Paragraph": return { surfaceKind: "text", tag: "p" };
    case "Small": return { surfaceKind: "text", tag: "small" };
    case "Text": return { surfaceKind: "text", tag: "div" };
    case "Label": return { surfaceKind: "label", tag: "label" };
    case "Form": return { surfaceKind: "form", tag: "form" };
    case "Input": return { surfaceKind: "form-field", tag: "div" };
    case "Textarea": return { surfaceKind: "text-area", tag: "textarea" };
    case "Select": return { surfaceKind: "select", tag: "select" };
    case "Option": return { surfaceKind: "option", tag: "option" };
    case "Button": return { surfaceKind: "action", tag: "button" };
    case "Link": return { surfaceKind: "action", tag: "a" };
    case "Fragment": return { surfaceKind: "fragment", tag: "div" };
    default: return null;
  }
}

function surfacePropsFromWidget(widget) {
  const props = {};
  const sourceProps = widget?.props && typeof widget.props === "object" ? widget.props : {};
  if (sourceProps.class) props.className = sourceProps.class;
  if (sourceProps.title) props.title = sourceProps.title;
  if (sourceProps.text) props.text = sourceProps.text;
  if (sourceProps.label) props.label = sourceProps.label;
  if (sourceProps.placeholder) props.placeholder = sourceProps.placeholder;
  if (sourceProps.autocomplete) props.autocomplete = sourceProps.autocomplete;
  if (sourceProps.href) props.href = sourceProps.href;
  if (sourceProps.hidden === true) props.hidden = true;
  if (widget?.kind === "Button" && sourceProps.type) props.type = sourceProps.type;
  if (widget?.kind === "Input") {
    props.inputType = sourceProps.type ?? "text";
    if (sourceProps.name) props.name = sourceProps.name;
    if (sourceProps.value != null) props.value = sourceProps.value;
    if (sourceProps.checked != null) props.checked = sourceProps.checked;
    if (sourceProps.label) props.label = sourceProps.label;
  }
  if (widget?.kind === "Textarea") {
    if (sourceProps.name) props.name = sourceProps.name;
    props.text = sourceProps.text ?? "";
  }
  if (widget?.kind === "Select") {
    if (sourceProps.name) props.name = sourceProps.name;
    if (sourceProps.multiple === true) props.multiple = true;
    if (sourceProps.value != null) props.value = sourceProps.value;
  }
  if (widget?.kind === "Option") {
    if (sourceProps.value != null) props.value = sourceProps.value;
    if (sourceProps.text) props.label = sourceProps.text;
  }
  return props;
}

function fieldValueTypeForWidget(widget) {
  const inputType = trimString(widget?.props?.type).toLowerCase();
  if (inputType === "checkbox") return "bool";
  if (inputType === "number" || inputType === "range") return "number";
  return "text";
}

function initialFieldValueForWidget(widget) {
  const inputType = trimString(widget?.props?.type).toLowerCase();
  if (inputType === "checkbox") return widget?.props?.checked === true;
  if (inputType === "number" || inputType === "range") return widget?.props?.value ?? 0;
  return widget?.props?.value ?? widget?.props?.text ?? "";
}

function analyzeRouteSource(world, source) {
  const routeId = source.route.id;
  const witnesses = world.allWitnesses();
  const rootWidgetId = trimString(source.bridge?.rootWidget);
  const tree = rootWidgetId ? widgetTree(witnesses, rootWidgetId) : null;
  const program = frontendProgram(witnesses, trimString(source.bridge?.frontendProgram) || null);
  const blocked = [];
  const ids = {
    collections: {},
    surfaces: { root: nativeRootSurfaceIdForRoute(routeId) },
    messages: {},
    types: {},
    enums: {},
    boundaries: {},
    policies: {},
    process: processIdForRoute(routeId)
  };
  if (!tree || !rootWidgetId) {
    blocked.push({
      id: `legacyFrontendUplift:blocked:${routeId}:rootWidget`,
      routeId,
      limitationType: "legacy-shape",
      goal: `uplift ${routeId} onto native page.surface authoring`,
      attemptedAuthoringPath: "surface + process + message + boundary + policy",
      missingPrimitive: "legacy route is missing a resolvable root widget tree",
      minimumHumanAction: "repair the legacy route rootWidget reference before retrying native uplift",
      proof: [`route ${routeId} does not resolve rootWidget=${rootWidgetId || "(missing)"}`]
    });
    return { route: source.route, bridge: source.bridge, blocked, ids, plan: null };
  }

  const { byId, parentById } = widgetIndex(tree);
  const aliasForms = new Map();
  const fieldStates = new Map();
  const surfaceBindings = new Map();
  const surfaceInteractions = new Map();
  const surfaceRepeats = new Map();
  const uiStateSpecs = new Map();
  const messages = new Map();
  const typeDocs = new Map();
  const enumDocs = new Map();
  const boundaryDocs = new Map();
  const policyDocs = new Map();
  const collectionDocs = new Map();
  const processHandles = new Set();
  const processEmits = new Set();
  const processRules = [];
  const surfaceDocs = [];
  const preloadPolicies = [];
  const handledLoadSteps = new Set();
  const queryBindings = [];

  function ensureSurface(surfaceId) {
    if (!surfaceBindings.has(surfaceId)) surfaceBindings.set(surfaceId, []);
    if (!surfaceInteractions.has(surfaceId)) surfaceInteractions.set(surfaceId, []);
  }

  function ensureState(name, {
    valueType = "text",
    initial = "",
    role = "state"
  } = {}) {
    const stateId = stateIdFor(routeId, name);
    return ensureStateDoc(name, stateId, { valueType, initial, role });
  }

  function ensureStateDoc(name, stateId, {
    valueType = "text",
    initial = "",
    role = "state"
  } = {}) {
    if (!ids.types[name]) ids.types[name] = stateId;
    if (!typeDocs.has(stateId)) {
      typeDocs.set(stateId, {
        id: stateId,
        role,
        valueType,
        initial
      });
    }
    return stateId;
  }

  function ensureUiState(widgetId, prop, initial, valueType = "text") {
    const key = `${widgetId}:${prop}`;
    if (uiStateSpecs.has(key)) return uiStateSpecs.get(key);
    const stateId = ensureState(`${sanitizeIdPart(widgetId)}.${sanitizeIdPart(prop)}`, { valueType, initial });
    const spec = { key, stateId, widgetId, prop, valueType };
    uiStateSpecs.set(key, spec);
    return spec;
  }

  function ensureCollection(name) {
    const collectionId = collectionIdFor(routeId, name);
    ids.collections[name] = collectionId;
    if (!collectionDocs.has(collectionId)) {
      collectionDocs.set(collectionId, { id: collectionId });
    }
    return collectionId;
  }

  function ensureQueryBinding(param, {
    stateId,
    defaultValue
  } = {}) {
    const existing = queryBindings.find(binding => binding.param === param && binding.state === stateId);
    if (existing) return existing;
    const next = {
      param,
      process: ids.process,
      state: stateId,
      ...(typeof defaultValue !== "undefined" ? { defaultValue } : {})
    };
    queryBindings.push(next);
    return next;
  }

  function routeEntryKey() {
    return trimString(routeId) || trimString(source.route?.path) || "route";
  }

  function ensureTriggerMessage(eventName) {
    const id = triggerMessageId(routeId, eventName);
    ids.messages[`trigger:${eventName}`] = id;
    if (!messages.has(id)) {
      messages.set(id, { id, role: "event", writes: {}, fields: [] });
    }
    processHandles.add(id);
    return id;
  }

  function ensurePreloadRouteCommand({
    preloadName,
    route,
    method,
    into = null,
    collectionOutputs = null,
    successWrites = {},
    requestFields = []
  } = {}) {
    const commandId = commandMessageId(routeId, preloadName);
    const successId = successMessageId(routeId, preloadName);
    const failureId = failureMessageId(routeId, preloadName);
    const boundaryId = boundaryIdFor(routeId, preloadName);
    const statusEnumId = enumIdFor(routeId, `${preloadName}.status`);
    const statusStateId = ensureState(`${preloadName}.status`, { valueType: statusEnumId, initial: "idle" });
    const loadingStateId = ensureState(`${preloadName}.loading`, { valueType: "bool", initial: false });
    ids.messages[`command:${preloadName}`] = commandId;
    ids.messages[`success:${preloadName}`] = successId;
    ids.messages[`failure:${preloadName}`] = failureId;
    ids.boundaries[preloadName] = boundaryId;
    ids.policies[preloadName] = policyIdFor(routeId, preloadName);
    ids.enums[`${preloadName}.status`] = statusEnumId;
    enumDocs.set(statusEnumId, {
      id: statusEnumId,
      role: "enum",
      cases: ["idle", "running", "ready", "repair_required"]
    });
    messages.set(commandId, { id: commandId, role: "command", fields: requestFields, writes: {} });
    messages.set(successId, {
      id: successId,
      role: "event",
      fields: into ? [{ name: "value", type: into }] : [],
      writes: {
        [loadingStateId]: false,
        [statusStateId]: "ready",
        ...successWrites
      }
    });
    messages.set(failureId, {
      id: failureId,
      role: "event",
      fields: [],
      writes: {
        [loadingStateId]: false,
        [statusStateId]: "repair_required"
      }
    });
    processHandles.add(successId);
    processHandles.add(failureId);
    processEmits.add(commandId);
    boundaryDocs.set(boundaryId, {
      id: boundaryId,
      capabilities: [],
      operations: [{
        name: preloadName,
        kind: "adapter",
        command: commandId,
        route,
        method,
        loadingState: loadingStateId,
        successEvent: successId,
        failureEvent: failureId,
        refreshRuntime: true,
        ...(collectionOutputs ? { collectionOutputs } : {})
      }]
    });
    policyDocs.set(ids.policies[preloadName], {
      id: ids.policies[preloadName],
      subject: ids.process,
      initialState: "idle",
      stateField: statusStateId,
      readyState: "ready",
      disagreementState: "repair_required",
      policyOutcomes: {
        ready: "ready",
        repair_required: "repair_required"
      },
      disagreementOutcomes: {}
    });
    preloadPolicies.push({
      id: preloadPolicyIdFor(routeId, preloadName),
      when: { kind: "routeEnter", route: routeEntryKey() },
      targets: [{
        kind: "route",
        route: routeEntryKey(),
        command: commandId,
        load: ["command"]
      }]
    });
    return { commandId, successId, failureId, boundaryId };
  }

  function addSurfaceInteraction(surfaceId, interaction) {
    ensureSurface(surfaceId);
    const list = surfaceInteractions.get(surfaceId);
    if (!list.some(row => JSON.stringify(row) === JSON.stringify(interaction))) list.push(interaction);
  }

  function addSurfaceBinding(surfaceId, binding) {
    ensureSurface(surfaceId);
    const list = surfaceBindings.get(surfaceId);
    if (!list.some(row => JSON.stringify(row) === JSON.stringify(binding))) list.push(binding);
  }

  function fieldStateForAlias(alias, field) {
    return fieldStates.get(`${alias}.${field}`) ?? null;
  }

  function bindFormAlias(step) {
    const alias = trimString(step?.params?.into);
    const widgetId = trimString(step?.params?.widget);
    const formWidget = widgetId ? (byId.get(widgetId) ?? null) : null;
    if (!alias || !formWidget || formWidget.kind !== "Form") {
      blocked.push({
        id: `legacyFrontendUplift:blocked:${routeId}:readForm:${step?.order ?? 0}`,
        routeId,
        limitationType: "missing-primitive",
        goal: `uplift ${routeId} readForm semantics`,
        attemptedAuthoringPath: "field-state ownership on native surface interactions",
        missingPrimitive: "readForm requires an explicit form widget with named scalar controls",
        minimumHumanAction: "rewrite the legacy form so every submitted field is a named scalar control on the authored form widget",
        proof: [`readForm step expected form widget ${widgetId || "(missing)"}`]
      });
      return;
    }
    aliasForms.set(alias, { widgetId, checkboxes: trimString(step?.params?.checkboxes) });
    walkWidgets(formWidget, widget => {
      if (!["Input", "Textarea", "Select"].includes(widget?.kind)) return;
      if (widget.kind === "Select" && widget?.props?.multiple === true) {
        blocked.push({
          id: `legacyFrontendUplift:blocked:${routeId}:multiSelect:${widget.id}`,
          routeId,
          limitationType: "missing-primitive",
          goal: `uplift ${routeId} repeated or multi-valued form state`,
          attemptedAuthoringPath: "surface + process field-state ownership",
          missingPrimitive: "public multi-value collection authoring lane",
          minimumHumanAction: "replace the multi-select path with scalar native controls or wait for first-class collection authoring",
          proof: [`field ${widget.id} uses multi-select semantics`]
        });
        return;
      }
      const name = trimString(widget?.props?.name);
      if (!name) return;
      const stateId = ensureState(`${alias}.${name}`, {
        valueType: fieldValueTypeForWidget(widget),
        initial: initialFieldValueForWidget(widget)
      });
      fieldStates.set(`${alias}.${name}`, stateId);
      const surfaceId = widgetSurfaceId(routeId, widget.id);
      if (trimString(widget?.props?.type).toLowerCase() === "checkbox") {
        addSurfaceBinding(surfaceId, { prop: "checked", source: { kind: "state", state: stateId } });
        addSurfaceInteraction(surfaceId, {
          target: "self",
          event: "change",
          action: { kind: "setState", state: stateId, value: { kind: "eventChecked" } }
        });
      } else if (widget.kind === "Select") {
        addSurfaceBinding(surfaceId, { prop: "value", source: { kind: "state", state: stateId } });
        addSurfaceInteraction(surfaceId, {
          target: "self",
          event: "change",
          action: { kind: "setState", state: stateId, value: { kind: "eventValue" } }
        });
      } else if (widget.kind === "Textarea") {
        addSurfaceBinding(surfaceId, { prop: "text", source: { kind: "state", state: stateId } });
        addSurfaceInteraction(surfaceId, {
          target: "self",
          event: "input",
          action: { kind: "setState", state: stateId, value: { kind: "eventValue" } }
        });
      } else {
        addSurfaceBinding(surfaceId, { prop: "value", source: { kind: "state", state: stateId } });
        addSurfaceInteraction(surfaceId, {
          target: "self",
          event: "input",
          action: { kind: "setState", state: stateId, value: { kind: "eventValue" } }
        });
      }
    });
  }

  const programSteps = Array.isArray(program?.steps) ? [...program.steps].sort((a, b) => a.order - b.order) : [];
  for (const step of programSteps) {
    if (step?.when) {
      blocked.push({
        id: `legacyFrontendUplift:blocked:${routeId}:when:${step.event}:${step.order}`,
        routeId,
        limitationType: "missing-primitive",
        goal: `uplift conditional legacy step ${step.event}`,
        attemptedAuthoringPath: "surface interactions + process rules",
        missingPrimitive: "public conditional interaction/process rule authoring",
        minimumHumanAction: "replace the conditional legacy step with explicit native state and route branching before uplift",
        proof: [`step ${step.event}#${step.order} uses when=${JSON.stringify(step.when)}`]
      });
      continue;
    }
    if (step?.repeat) {
      blocked.push({
        id: `legacyFrontendUplift:blocked:${routeId}:repeat:${step.event}:${step.order}`,
        routeId,
        limitationType: "missing-primitive",
        goal: `uplift repeated legacy step ${step.event}`,
        attemptedAuthoringPath: "surface + process native lowering",
        missingPrimitive: "public collection / repeated collection authoring lane",
        minimumHumanAction: "replace repeated legacy render or loop behavior with first-class collection authoring when it exists",
        proof: [`step ${step.event}#${step.order} uses repeat=${JSON.stringify(step.repeat)}`]
      });
      continue;
    }
    if (step?.op === "dispatchDomEvent") {
      blocked.push({
        id: `legacyFrontendUplift:blocked:${routeId}:dispatchDomEvent:${step.order}`,
        routeId,
        limitationType: "missing-primitive",
        goal: `uplift retired host-event dispatch on ${routeId}`,
        attemptedAuthoringPath: "surface interaction + route/boundary/capability semantics",
        missingPrimitive: "first-class native replacement for this host-only event contract",
        minimumHumanAction: "replace the retired DOM event side channel with explicit refresh, navigation, boundary, policy, or capability semantics before uplift",
        proof: [`step ${step.event}#${step.order} uses dispatchDomEvent`]
      });
      continue;
    }
    if ((step?.op === "fetchJson" || step?.op === "initSession") && trimString(step?.event) !== "load") {
      blocked.push({
        id: `legacyFrontendUplift:blocked:${routeId}:${step.op}:${step.order}`,
        routeId,
        limitationType: "missing-primitive",
        goal: `uplift ${step.op} on ${routeId}`,
        attemptedAuthoringPath: "native page.surface command/boundary/policy authoring",
        missingPrimitive: "route-enter preload authoring is only supported for legacy load semantics in this tranche",
        minimumHumanAction: "move the effect to route load semantics or keep the route on the compatibility bridge",
        proof: [`step ${step.event}#${step.order} uses ${step.op}`]
      });
      continue;
    }
    if (["postJson", "patchJson", "deleteJson", "setSession"].includes(step?.op)) {
      const route = trimString(step?.params?.url) || (step?.op === "setSession" ? "/api/session" : "");
      if (!sameOriginRoute(route)) {
        blocked.push({
          id: `legacyFrontendUplift:blocked:${routeId}:network:${step.order}`,
          routeId,
          limitationType: "missing-primitive",
          goal: `uplift network effect on ${routeId}`,
          attemptedAuthoringPath: "boundary route operation",
          missingPrimitive: "non-route-backed or external network effects are not native-authored in this tranche",
          minimumHumanAction: "replace the external target with a same-origin runtime route before uplift",
          proof: [`step ${step.event}#${step.order} targets ${route || "(missing route)"}`]
        });
      }
    }
  }

  for (const step of programSteps.filter(step => step?.op === "readForm")) {
    bindFormAlias(step);
  }

  for (const step of programSteps.filter(step => step?.op === "renderCollection")) {
    const hostWidgetId = trimString(step?.params?.widget);
    const hostWidget = hostWidgetId ? (byId.get(hostWidgetId) ?? null) : null;
    const templateWidgetId = trimString(step?.params?.template);
    const templateTree = templateWidgetId ? widgetTree(witnesses, templateWidgetId) : null;
    const fromExpression = trimString(step?.params?.from);
    const match = fromExpression ? fromExpression.match(/^([A-Za-z0-9_.-]+)\.([A-Za-z0-9_.-]+)$/) : null;
    if (!hostWidget || !templateTree || !match) {
      blocked.push({
        id: `legacyFrontendUplift:blocked:${routeId}:renderCollection:${step.order}`,
        routeId,
        limitationType: "missing-primitive",
        goal: `uplift repeated collection rendering on ${routeId}`,
        attemptedAuthoringPath: "surface repeat / collection authoring",
        missingPrimitive: "renderCollection requires a resolvable host widget, template widget tree, and scalar source path",
        minimumHumanAction: "rewrite renderCollection to point at a real host widget, template widget tree, and supported source path before uplift",
        proof: [`step ${step.event}#${step.order} widget=${hostWidgetId || "(missing)"} template=${templateWidgetId || "(missing)"} from=${fromExpression || "(missing)"}`]
      });
      continue;
    }
    const [, sourceName, responsePath] = match;
    const collectionId = ensureCollection(sourceName);
    const hostSurfaceId = widgetSurfaceId(routeId, hostWidgetId);
    ensureSurface(hostSurfaceId);
    if (!surfaceDocs.some(doc => doc.id === widgetSurfaceId(routeId, templateTree.id))) {
      walkWidgets(templateTree, widget => {
        const mapped = supportedWidgetSurfaceKind(widget);
        if (!mapped) return;
        const surfaceId = widgetSurfaceId(routeId, widget.id);
        ensureSurface(surfaceId);
        if (!surfaceDocs.some(doc => doc.id === surfaceId)) {
          surfaceDocs.push({
            id: surfaceId,
            surfaceKind: mapped.surfaceKind,
            className: widget?.props?.class ?? null,
            children: (widget?.children ?? []).map(child => widgetSurfaceId(routeId, child.id)),
            props: {
              tag: mapped.tag,
              ...surfacePropsFromWidget(widget)
            },
            bindings: surfaceBindings.get(surfaceId) ?? [],
            interactions: surfaceInteractions.get(surfaceId) ?? [],
            repeat: null,
            processRef: null,
            capabilityRefs: []
          });
        }
      });
    }
    const repeatState = {
      collection: collectionId,
      template: widgetSurfaceId(routeId, templateTree.id),
      itemAs: trimString(step?.params?.itemAs) || "item",
      indexAs: trimString(step?.params?.indexAs) || "index"
    };
    surfaceRepeats.set(hostSurfaceId, repeatState);
    const loadFetch = programSteps.find(candidate =>
      trimString(candidate?.event) === trimString(step?.event)
      && candidate?.op === "fetchJson"
      && trimString(candidate?.params?.into) === sourceName
    );
    if (loadFetch) {
      const route = trimString(loadFetch?.params?.url);
      if (!sameOriginRoute(route)) {
        blocked.push({
          id: `legacyFrontendUplift:blocked:${routeId}:fetchJson:${loadFetch.order}`,
          routeId,
          limitationType: "missing-primitive",
          goal: `uplift fetchJson on ${routeId}`,
          attemptedAuthoringPath: "route-enter preload boundary operation",
          missingPrimitive: "external or non-route-backed network targets are not supported for native preload uplift",
          minimumHumanAction: "replace the target with a same-origin runtime route before uplift",
          proof: [`step ${loadFetch.event}#${loadFetch.order} targets ${route || "(missing route)"}`]
        });
      } else {
        ensurePreloadRouteCommand({
          preloadName: `${sanitizeIdPart(loadFetch.event)}.${sanitizeIdPart(loadFetch.op)}.${loadFetch.order}`,
          route,
          method: "GET",
          collectionOutputs: { [collectionId]: responsePath }
        });
        handledLoadSteps.add(loadFetch.order);
      }
    }
  }

  for (const step of programSteps.filter(step => trimString(step?.event) === "load" && !handledLoadSteps.has(step?.order))) {
    if (step?.op === "fetchJson") {
      const route = trimString(step?.params?.url);
      if (!sameOriginRoute(route)) {
        blocked.push({
          id: `legacyFrontendUplift:blocked:${routeId}:fetchJson:${step.order}`,
          routeId,
          limitationType: "missing-primitive",
          goal: `uplift fetchJson on ${routeId}`,
          attemptedAuthoringPath: "route-enter preload boundary operation",
          missingPrimitive: "external or non-route-backed network targets are not supported for native preload uplift",
          minimumHumanAction: "replace the target with a same-origin runtime route before uplift",
          proof: [`step ${step.event}#${step.order} targets ${route || "(missing route)"}`]
        });
        continue;
      }
      const into = trimString(step?.params?.into);
      if (!into) {
        blocked.push({
          id: `legacyFrontendUplift:blocked:${routeId}:fetchJsonInto:${step.order}`,
          routeId,
          limitationType: "missing-primitive",
          goal: `uplift fetchJson on ${routeId}`,
          attemptedAuthoringPath: "route-enter preload boundary operation",
          missingPrimitive: "fetchJson preload uplift requires a declared scalar target via into",
          minimumHumanAction: "rewrite the load fetch to assign into a named scalar state or pair it with renderCollection",
          proof: [`step ${step.event}#${step.order} into=${into || "(missing)"}`]
        });
        continue;
      }
      const stateId = ensureState(into, { valueType: "text", initial: "" });
      ensurePreloadRouteCommand({
        preloadName: `${sanitizeIdPart(step.event)}.${sanitizeIdPart(step.op)}.${step.order}`,
        route,
        method: "GET",
        into: stateId
      });
      handledLoadSteps.add(step.order);
      continue;
    }
    if (step?.op === "initSession") {
      ensureState("session", { valueType: "text", initial: "" });
      ensurePreloadRouteCommand({
        preloadName: `${sanitizeIdPart(step.event)}.${sanitizeIdPart(step.op)}.${step.order}`,
        route: "/api/session",
        method: "GET",
        into: ids.types.session ?? ensureState("session", { valueType: "text", initial: "" })
      });
      handledLoadSteps.add(step.order);
    }
  }

  const stepsByEvent = new Map();
  for (const step of programSteps) {
    const eventName = trimString(step?.event);
    if (!eventName) continue;
    if (eventName === "load") continue;
    if (!stepsByEvent.has(eventName)) stepsByEvent.set(eventName, []);
    stepsByEvent.get(eventName).push(step);
  }

  function resolveDirectValueSpec(rawValue) {
    if (rawValue === undefined) return { kind: "literal", value: "" };
    if (typeof rawValue === "boolean" || typeof rawValue === "number") return { kind: "literal", value: rawValue };
    if (isInterpolatedString(rawValue)) return { kind: "blocked", reason: "string interpolation requires a missing native string-composition primitive" };
    const expr = exactExpression(rawValue);
    if (!expr) return { kind: "literal", value: rawValue };
    if (expr === "event.value") return { kind: "eventValue" };
    if (expr === "event.checked") return { kind: "eventChecked" };
    if (expr === "event.values") return { kind: "eventValues" };
    return { kind: "blocked", reason: `exact expression ${expr} cannot be lowered in this tranche` };
  }

  function resolveQueryMutationSpec(rawValue) {
    const direct = resolveDirectValueSpec(rawValue);
    if (direct.kind !== "blocked") return direct;
    const expr = exactExpression(rawValue);
    if (!expr) return direct;
    const fieldMatch = expr.match(/^([A-Za-z0-9_.-]+)\.([A-Za-z0-9_.-]+)$/);
    if (!fieldMatch) return direct;
    const stateId = fieldStateForAlias(fieldMatch[1], fieldMatch[2]);
    if (!stateId) {
      return {
        kind: "blocked",
        reason: `query binding source ${expr} is not backed by explicit native field state`
      };
    }
    return {
      kind: "state",
      state: stateId
    };
  }

  for (const [eventName, steps] of stepsByEvent.entries()) {
    const eventParts = eventName.split(":");
    const eventKind = eventParts[0];
    const eventTarget = eventParts.slice(1).join(":");
    if (!["click", "input", "change", "submit"].includes(eventKind)) {
      blocked.push({
        id: `legacyFrontendUplift:blocked:${routeId}:event:${sanitizeIdPart(eventName)}`,
        routeId,
        limitationType: "missing-primitive",
        goal: `uplift ${eventName} on ${routeId}`,
        attemptedAuthoringPath: "generic native surface interactions",
        missingPrimitive: "public native interaction authoring for this legacy event kind",
        minimumHumanAction: "replace the legacy event with click/input/change/submit or extend the platform interaction lane first",
        proof: [`event ${eventName} is not in the supported uplift subset`]
      });
      continue;
    }

    const asyncIndex = steps.findIndex(step => ["postJson", "patchJson", "deleteJson", "setSession", "logout"].includes(step?.op));
    const directEventMessageId = ensureTriggerMessage(eventName);
    const targetSurfaceId = eventTarget ? widgetSurfaceId(routeId, eventTarget) : ids.surfaces.root;
    ensureSurface(targetSurfaceId);

    let directActionEmitted = false;
    const preCommandSteps = asyncIndex >= 0 ? steps.slice(0, asyncIndex) : steps;
    const postCommandSteps = asyncIndex >= 0 ? steps.slice(asyncIndex + 1) : [];

    for (const step of preCommandSteps) {
      if (step?.op === "readForm") continue;
      if (step?.op === "navigate") {
        const href = trimString(step?.params?.url) || trimString(step?.params?.href);
        if (!sameOriginRoute(href) || steps.length !== 1) {
          blocked.push({
            id: `legacyFrontendUplift:blocked:${routeId}:navigate:${step.order}`,
            routeId,
            limitationType: "missing-primitive",
            goal: `uplift navigate on ${routeId}`,
            attemptedAuthoringPath: "native surface interaction navigate",
            missingPrimitive: "compound navigate flows beyond a direct literal interaction",
            minimumHumanAction: "reduce the legacy navigate event to a single literal same-origin navigation step before uplift",
            proof: [`step ${eventName}#${step.order} navigates to ${href || "(missing href)"}`]
          });
          continue;
        }
        addSurfaceInteraction(targetSurfaceId, {
          target: "self",
          event: eventKind,
          action: { kind: "navigate", href }
        });
        directActionEmitted = true;
        continue;
      }
      if (step?.op === "setQueryParam") {
        const param = trimString(step?.params?.param) || trimString(step?.params?.name);
        if (!param) {
          blocked.push({
            id: `legacyFrontendUplift:blocked:${routeId}:queryParam:${step.order}`,
            routeId,
            limitationType: "missing-primitive",
            goal: `uplift setQueryParam on ${routeId}`,
            attemptedAuthoringPath: "query-bound state synchronization",
            missingPrimitive: "setQueryParam requires an explicit query parameter name",
            minimumHumanAction: "rewrite the legacy step with a concrete param or name before uplift",
            proof: [`step ${eventName}#${step.order} param=${param || "(missing)"}`]
          });
          continue;
        }
        const spec = resolveQueryMutationSpec(step?.params?.value);
        if (spec.kind === "blocked") {
          blocked.push({
            id: `legacyFrontendUplift:blocked:${routeId}:queryValue:${step.order}`,
            routeId,
            limitationType: "missing-primitive",
            goal: `uplift setQueryParam on ${routeId}`,
            attemptedAuthoringPath: "query-bound state synchronization",
            missingPrimitive: spec.reason,
            minimumHumanAction: "reduce query mutation to a literal, event scalar, event values, or scalar readForm-owned state before uplift",
            proof: [`step ${eventName}#${step.order} value=${JSON.stringify(step?.params?.value)}`]
          });
          continue;
        }
        const queryStateId = spec.kind === "state"
          ? spec.state
          : ensureStateDoc(`query.${param}`, queryStateIdFor(routeId, param), {
              valueType: spec.kind === "eventChecked" ? "bool" : (spec.kind === "eventValues" ? "text[]" : "text"),
              initial: spec.kind === "literal" ? spec.value : (spec.kind === "eventValues" ? [] : "")
            });
        ensureQueryBinding(param, {
          stateId: queryStateId,
          ...(spec.kind === "literal" ? { defaultValue: spec.value } : {})
        });
        if (spec.kind === "literal") {
          processRules.push({
            trigger: directEventMessageId,
            steps: [{ kind: "setState", state: queryStateId, value: spec.value }]
          });
          addSurfaceInteraction(targetSurfaceId, {
            target: "self",
            event: eventKind,
            action: { kind: "deliver", message: directEventMessageId }
          });
        } else if (spec.kind === "state") {
          directActionEmitted = true;
        } else {
          addSurfaceInteraction(targetSurfaceId, {
            target: "self",
            event: eventKind,
            action: {
              kind: "setState",
              state: queryStateId,
              value: spec.kind === "eventValue"
                ? { kind: "eventValue" }
                : spec.kind === "eventChecked"
                  ? { kind: "eventChecked" }
                  : { kind: "eventValues" }
            }
          });
          directActionEmitted = true;
        }
        continue;
      }
      if (!["setText", "setValue", "setHidden", "setDisabled"].includes(step?.op)) {
        blocked.push({
          id: `legacyFrontendUplift:blocked:${routeId}:op:${sanitizeIdPart(step?.op)}:${step.order}`,
          routeId,
          limitationType: "missing-primitive",
          goal: `uplift ${step?.op} on ${routeId}`,
          attemptedAuthoringPath: "native surface interactions + process rules",
          missingPrimitive: `${step?.op} is outside the currently authored native uplift subset`,
          minimumHumanAction: "keep this route on the compatibility bridge until that primitive is first-class",
          proof: [`step ${eventName}#${step.order} uses ${step?.op}`]
        });
        continue;
      }
      const targetWidgetId = trimString(step?.params?.widget);
      const targetWidget = targetWidgetId ? (byId.get(targetWidgetId) ?? null) : null;
      if (!targetWidget) {
        blocked.push({
          id: `legacyFrontendUplift:blocked:${routeId}:target:${step.order}`,
          routeId,
          limitationType: "legacy-shape",
          goal: `uplift ${step?.op} target on ${routeId}`,
          attemptedAuthoringPath: "native surface binding",
          missingPrimitive: "legacy step target widget must resolve inside the widget tree",
          minimumHumanAction: "repair the target widget reference before retrying uplift",
          proof: [`step ${eventName}#${step.order} targets ${targetWidgetId || "(missing widget)"}`]
        });
        continue;
      }
      const prop = step.op === "setText" ? "text" : step.op === "setValue" ? "value" : step.op === "setHidden" ? "hidden" : "disabled";
      const rawValue = prop === "text" ? step?.params?.text : prop === "value" ? step?.params?.value : step?.params?.[prop];
      const spec = resolveDirectValueSpec(rawValue);
      if (spec.kind === "blocked") {
        blocked.push({
          id: `legacyFrontendUplift:blocked:${routeId}:value:${step.order}`,
          routeId,
          limitationType: "missing-primitive",
          goal: `uplift ${step?.op} value on ${routeId}`,
          attemptedAuthoringPath: "native state bindings",
          missingPrimitive: spec.reason,
          minimumHumanAction: "rewrite the legacy step to a literal or direct event-value native binding before uplift",
          proof: [`step ${eventName}#${step.order} value=${JSON.stringify(rawValue)}`]
        });
        continue;
      }
      const initial = prop === "text"
        ? (targetWidget?.props?.text ?? "")
        : prop === "value"
          ? (targetWidget?.props?.value ?? "")
          : prop === "hidden"
            ? Boolean(targetWidget?.props?.hidden)
            : Boolean(targetWidget?.props?.disabled);
      const valueType = prop === "text" || prop === "value" ? "text" : "bool";
      const uiState = ensureUiState(targetWidgetId, prop, initial, valueType);
      addSurfaceBinding(widgetSurfaceId(routeId, targetWidgetId), {
        prop,
        source: { kind: "state", state: uiState.stateId }
      });
      if (spec.kind === "literal") {
        processRules.push({
          trigger: directEventMessageId,
          steps: [{ kind: "setState", state: uiState.stateId, value: spec.value }]
        });
        addSurfaceInteraction(targetSurfaceId, {
          target: "self",
          event: eventKind,
          action: { kind: "deliver", message: directEventMessageId }
        });
      } else {
        addSurfaceInteraction(targetSurfaceId, {
          target: "self",
          event: eventKind,
          action: {
            kind: "setState",
            state: uiState.stateId,
            value: spec.kind === "eventValue"
              ? { kind: "eventValue" }
              : spec.kind === "eventChecked"
                ? { kind: "eventChecked" }
                : { kind: "eventValues" }
          }
        });
        directActionEmitted = true;
      }
    }

    if (asyncIndex >= 0) {
      const step = steps[asyncIndex];
      const commandName = `${sanitizeIdPart(eventName)}.${sanitizeIdPart(step.op)}.${step.order}`;
      const commandId = commandMessageId(routeId, commandName);
      const successId = successMessageId(routeId, commandName);
      const failureId = failureMessageId(routeId, commandName);
      const boundaryId = boundaryIdFor(routeId, commandName);
      const statusEnumId = enumIdFor(routeId, `${commandName}.status`);
      const statusStateId = ensureState(`${commandName}.status`, { valueType: statusEnumId, initial: "idle" });
      const loadingStateId = ensureState(`${commandName}.loading`, { valueType: "bool", initial: false });
      ids.messages[`command:${commandName}`] = commandId;
      ids.messages[`success:${commandName}`] = successId;
      ids.messages[`failure:${commandName}`] = failureId;
      ids.boundaries[commandName] = boundaryId;
      ids.policies[commandName] = policyIdFor(routeId, commandName);
      ids.enums[`${commandName}.status`] = statusEnumId;
      enumDocs.set(statusEnumId, {
        id: statusEnumId,
        role: "enum",
        cases: ["idle", "running", "ready", "repair_required"]
      });
      messages.set(commandId, { id: commandId, role: "command", fields: [], writes: {} });
      messages.set(successId, {
        id: successId,
        role: "event",
        fields: [],
        writes: {
          [loadingStateId]: false,
          [statusStateId]: "ready"
        }
      });
      messages.set(failureId, {
        id: failureId,
        role: "event",
        fields: [],
        writes: {
          [loadingStateId]: false,
          [statusStateId]: "repair_required"
        }
      });
      processHandles.add(directEventMessageId);
      processHandles.add(successId);
      processHandles.add(failureId);
      processEmits.add(commandId);

      let route = "";
      let method = "POST";
      if (step.op === "setSession") {
        route = "/api/session";
        method = "POST";
      } else if (step.op === "logout") {
        route = "/api/session";
        method = "DELETE";
      } else {
        route = trimString(step?.params?.url);
        method = step.op === "patchJson" ? "PATCH" : step.op === "deleteJson" ? "DELETE" : "POST";
      }
      if (!sameOriginRoute(route)) {
        blocked.push({
          id: `legacyFrontendUplift:blocked:${routeId}:route:${step.order}`,
          routeId,
          limitationType: "missing-primitive",
          goal: `uplift ${step.op} on ${routeId}`,
          attemptedAuthoringPath: "boundary route operation",
          missingPrimitive: "external or unresolved route target",
          minimumHumanAction: "replace the target with a same-origin runtime route before uplift",
          proof: [`step ${eventName}#${step.order} route=${route || "(missing)"}`]
        });
        continue;
      }

      const fromAlias = trimString(step?.params?.from);
      if (fromAlias) {
        const form = aliasForms.get(fromAlias) ?? null;
        if (!form) {
          blocked.push({
            id: `legacyFrontendUplift:blocked:${routeId}:from:${step.order}`,
            routeId,
            limitationType: "missing-primitive",
            goal: `uplift ${step.op} request body on ${routeId}`,
            attemptedAuthoringPath: "command field bindings",
            missingPrimitive: "only explicit form-field state aliases can feed native authored request bodies in this tranche",
            minimumHumanAction: "bind the request body to a legacy readForm alias with named scalar controls before uplift",
            proof: [`step ${eventName}#${step.order} from=${fromAlias}`]
          });
          continue;
        }
        for (const [key, stateId] of fieldStates.entries()) {
          if (!key.startsWith(`${fromAlias}.`)) continue;
          const fieldName = key.slice(fromAlias.length + 1);
          messages.get(commandId).fields.push({ name: fieldName, type: stateId });
        }
      }

      boundaryDocs.set(boundaryId, {
        id: boundaryId,
        capabilities: [],
        operations: [{
          name: commandName,
          kind: "adapter",
          command: commandId,
          route,
          method,
          loadingState: loadingStateId,
          successEvent: successId,
          failureEvent: failureId,
          refreshRuntime: true
        }]
      });
      policyDocs.set(ids.policies[commandName], {
        id: ids.policies[commandName],
        subject: ids.process,
        initialState: "idle",
        stateField: statusStateId,
        readyState: "ready",
        disagreementState: "repair_required",
        policyOutcomes: {
          ready: "ready",
          repair_required: "repair_required"
        },
        disagreementOutcomes: {}
      });

      const triggerSteps = [];
      if (directActionEmitted !== true) {
        addSurfaceInteraction(targetSurfaceId, {
          target: "self",
          event: eventKind,
          action: { kind: "deliver", message: directEventMessageId }
        });
      }
      triggerSteps.push({ kind: "command", command: commandId });
      processRules.push({ trigger: directEventMessageId, steps: triggerSteps });

      const successSteps = [];
      for (const stepAfter of postCommandSteps) {
        if (stepAfter?.op === "clearForm") {
          const widgetId = trimString(stepAfter?.params?.widget);
          const alias = [...aliasForms.entries()].find(([, form]) => form.widgetId === widgetId)?.[0] ?? null;
          if (!alias) {
            blocked.push({
              id: `legacyFrontendUplift:blocked:${routeId}:clearForm:${stepAfter.order}`,
              routeId,
              limitationType: "missing-primitive",
              goal: `uplift clearForm on ${routeId}`,
              attemptedAuthoringPath: "explicit native state reset",
              missingPrimitive: "clearForm can only lower when the target form already owns explicit native field state",
              minimumHumanAction: "keep the form on a supported readForm alias or rewrite the reset as explicit field state authoring",
              proof: [`step ${eventName}#${stepAfter.order} clears ${widgetId || "(missing form)"}`]
            });
            continue;
          }
          for (const [key, stateId] of fieldStates.entries()) {
            if (!key.startsWith(`${alias}.`)) continue;
            const type = typeDocs.get(stateId);
            successSteps.push({ kind: "setState", state: stateId, value: type?.initial ?? "" });
          }
          continue;
        }
        if (!["setText", "setValue", "setHidden", "setDisabled"].includes(stepAfter?.op)) {
          blocked.push({
            id: `legacyFrontendUplift:blocked:${routeId}:postAsync:${stepAfter.order}`,
            routeId,
            limitationType: "missing-primitive",
            goal: `uplift post-command ${stepAfter?.op} on ${routeId}`,
            attemptedAuthoringPath: "success-event process rule",
            missingPrimitive: "only explicit state reset and literal UI updates lower after route-backed commands in this tranche",
            minimumHumanAction: "rewrite the post-command behavior to literal state updates or keep the route on the bridge",
            proof: [`step ${eventName}#${stepAfter.order} follows async ${step.op}`]
          });
          continue;
        }
        const targetWidgetId = trimString(stepAfter?.params?.widget);
        const targetWidget = targetWidgetId ? (byId.get(targetWidgetId) ?? null) : null;
        const prop = stepAfter.op === "setText" ? "text" : stepAfter.op === "setValue" ? "value" : stepAfter.op === "setHidden" ? "hidden" : "disabled";
        const rawValue = prop === "text" ? stepAfter?.params?.text : prop === "value" ? stepAfter?.params?.value : stepAfter?.params?.[prop];
        const spec = resolveDirectValueSpec(rawValue);
        if (!targetWidget || spec.kind !== "literal") {
          blocked.push({
            id: `legacyFrontendUplift:blocked:${routeId}:postAsyncValue:${stepAfter.order}`,
            routeId,
            limitationType: "missing-primitive",
            goal: `uplift post-command ${stepAfter?.op} on ${routeId}`,
            attemptedAuthoringPath: "success-event state write",
            missingPrimitive: "post-command UI updates must be literal authored state writes in this tranche",
            minimumHumanAction: "rewrite the post-command UI update as a literal native state target before uplift",
            proof: [`step ${eventName}#${stepAfter.order} value=${JSON.stringify(rawValue)}`]
          });
          continue;
        }
        const initial = prop === "text"
          ? (targetWidget?.props?.text ?? "")
          : prop === "value"
            ? (targetWidget?.props?.value ?? "")
            : prop === "hidden"
              ? Boolean(targetWidget?.props?.hidden)
              : Boolean(targetWidget?.props?.disabled);
        const valueType = prop === "text" || prop === "value" ? "text" : "bool";
        const uiState = ensureUiState(targetWidgetId, prop, initial, valueType);
        addSurfaceBinding(widgetSurfaceId(routeId, targetWidgetId), {
          prop,
          source: { kind: "state", state: uiState.stateId }
        });
        successSteps.push({ kind: "setState", state: uiState.stateId, value: spec.value });
      }
      if (successSteps.length) processRules.push({ trigger: successId, steps: successSteps });
    } else if (!directActionEmitted && preCommandSteps.length) {
      addSurfaceInteraction(targetSurfaceId, {
        target: "self",
        event: eventKind,
        action: { kind: "deliver", message: directEventMessageId }
      });
    }
  }

  walkWidgets(tree, widget => {
    const mapped = supportedWidgetSurfaceKind(widget);
    if (!mapped) {
      blocked.push({
        id: `legacyFrontendUplift:blocked:${routeId}:widget:${sanitizeIdPart(widget?.kind)}:${sanitizeIdPart(widget?.id)}`,
        routeId,
        limitationType: "missing-primitive",
        goal: `uplift widget ${widget?.id} on ${routeId}`,
        attemptedAuthoringPath: "surface tree authoring",
        missingPrimitive: `widget kind ${widget?.kind} does not have a public native surface lowering in this tranche`,
        minimumHumanAction: "replace the widget with a supported native surface-compatible shape before uplift",
        proof: [`widget ${widget?.id} kind=${widget?.kind}`]
      });
      return;
    }
    const isRootWidget = widget.id === rootWidgetId;
    const surfaceId = widgetSurfaceId(routeId, widget.id);
    ids.surfaces[widget.id] = surfaceId;
    ensureSurface(surfaceId);
    surfaceDocs.push({
      id: surfaceId,
      surfaceKind: mapped.surfaceKind,
      className: widget?.props?.class ?? null,
      children: (widget?.children ?? []).map(child => widgetSurfaceId(routeId, child.id)),
      props: {
        tag: mapped.tag,
        ...surfacePropsFromWidget(widget)
      },
      bindings: surfaceBindings.get(surfaceId) ?? [],
      interactions: surfaceInteractions.get(surfaceId) ?? [],
      repeat: surfaceRepeats.get(surfaceId) ?? null,
      processRef: isRootWidget ? ids.process : null,
      capabilityRefs: []
    });
  });

  surfaceDocs.unshift({
    id: ids.surfaces.root,
    surfaceKind: "app-root",
    className: null,
    children: [widgetSurfaceId(routeId, rootWidgetId)],
    props: {
      legacyRouteId: routeId,
      legacyPage: source.bridge?.page ?? null
    },
    bindings: [],
    interactions: [],
    repeat: null,
    processRef: ids.process,
    capabilityRefs: []
  });

  const definitionIds = definitionIdsForPlan({ ids });
  const blockedFatal = blocked.length > 0;
  const plan = blockedFatal
    ? null
    : {
        ids,
        collections: [...collectionDocs.values()],
        surfaces: surfaceDocs,
        messages: [...messages.values()],
        types: [...typeDocs.values()],
        enums: [...enumDocs.values()],
        boundaries: [...boundaryDocs.values()],
        policies: [...policyDocs.values()],
        preloadPolicies,
        queryBindings,
        process: {
          id: ids.process,
          state: [...new Set([...typeDocs.keys()])],
          handles: [...processHandles],
          emits: [...processEmits],
          rules: processRules
        },
        routeRewrite: {
          routeId,
          handler: "page.surface",
          rootSurface: ids.surfaces.root,
          preloadPolicies,
          queryBindings
        },
        definitionIds
      };

  return {
    route: source.route,
    bridge: source.bridge,
    blocked,
    ids,
    plan
  };
}

function previewRowsForAnalysis(project, analysis) {
  if (!analysis?.plan) return [];
  const rows = [];
  const existingThingIds = project(projectors.things);
  const pushIfMissing = (id, kind, action, extra = {}) => {
    if (id && existingThingIds?.has?.(id)) return;
    rows.push({
      id: `legacyFrontendUplift:${kind}:${analysis.route.id}:${sanitizeIdPart(id || kind)}`,
      routeId: analysis.route.id,
      kind,
      action,
      authoredId: id,
      ...extra
    });
  };
  pushIfMissing(analysis.plan.ids.process, "process", "process.define");
  for (const doc of analysis.plan.collections ?? []) pushIfMissing(doc.id, "collection", "collection.define");
  for (const doc of analysis.plan.enums ?? []) pushIfMissing(doc.id, "enum", "type.define");
  for (const doc of analysis.plan.types ?? []) pushIfMissing(doc.id, "type", "type.define");
  for (const doc of analysis.plan.messages ?? []) pushIfMissing(doc.id, "message", "message.define");
  for (const doc of analysis.plan.boundaries ?? []) pushIfMissing(doc.id, "boundary", "boundary.define");
  for (const doc of analysis.plan.policies ?? []) pushIfMissing(doc.id, "policy", "policy.define");
  for (const doc of analysis.plan.surfaces ?? []) pushIfMissing(doc.id, "surface", "surface.define");
  rows.push({
    id: `legacyFrontendUplift:route:${analysis.route.id}`,
    routeId: analysis.route.id,
    kind: "route",
    action: "route.rewrite",
    authoredId: analysis.plan.ids.surfaces.root,
    currentHandler: analysis.route.handler,
    nextHandler: "page.surface",
    nextRootSurface: analysis.plan.ids.surfaces.root,
    path: analysis.route.path,
    method: analysis.route.method
  });
  return rows;
}

function sortRows(rows = []) {
  return [...rows].sort((left, right) =>
    String(left.routeId || "").localeCompare(String(right.routeId || ""))
    || String(left.kind || "").localeCompare(String(right.kind || ""))
    || String(left.id || "").localeCompare(String(right.id || ""))
  );
}

function applyPlan(world, analysis, actor) {
  if (!analysis?.plan) return [];
  const provenanceMeta = (sourceKind, id) => ({
    provenance: {
      file: "authoring://plugin.authoring/frontend.upliftLegacy",
      sourceLanguage: "authoring",
      sourceKind,
      startLine: 1,
      endLine: 1,
      startColumn: 1,
      endColumn: null,
      originNodeId: null,
      via: [`authoring:frontend.upliftLegacy:${analysis.route.id}:${id}`],
      actor,
      owner: actor,
      context: analysis.route.context ?? null
    }
  });
  const nodes = [
    ...analysis.plan.collections.map(doc => createDesireNode({
      kind: "collection",
      name: doc.id,
      body: { id: doc.id },
      meta: provenanceMeta("collection", doc.id)
    })),
    ...analysis.plan.enums.map(doc => createDesireNode({
      kind: "type",
      name: doc.id,
      body: { role: doc.role, cases: doc.cases },
      meta: provenanceMeta("type", doc.id)
    })),
    ...analysis.plan.types.map(doc => createDesireNode({
      kind: "type",
      name: doc.id,
      body: { role: doc.role, valueType: doc.valueType, initial: doc.initial },
      meta: provenanceMeta("type", doc.id)
    })),
    ...analysis.plan.messages.map(doc => createDesireNode({
      kind: "message",
      name: doc.id,
      body: { role: doc.role, fields: doc.fields ?? [], writes: doc.writes ?? {}, refreshRuntime: true },
      meta: provenanceMeta("message", doc.id)
    })),
    createDesireNode({
      kind: "process",
      name: analysis.plan.process.id,
      body: {
        state: analysis.plan.process.state,
        handles: analysis.plan.process.handles,
        emits: analysis.plan.process.emits,
        rules: analysis.plan.process.rules
      },
      meta: provenanceMeta("process", analysis.plan.process.id)
    }),
    ...analysis.plan.boundaries.map(doc => createDesireNode({
      kind: "boundary",
      name: doc.id,
      body: { capabilities: doc.capabilities, operations: doc.operations },
      meta: provenanceMeta("boundary", doc.id)
    })),
    ...analysis.plan.policies.map(doc => createDesireNode({
      kind: "policy",
      name: doc.id,
      body: {
        subject: doc.subject,
        initialState: doc.initialState,
        stateField: doc.stateField,
        readyState: doc.readyState,
        disagreementState: doc.disagreementState,
        policyOutcomes: doc.policyOutcomes,
        disagreementOutcomes: doc.disagreementOutcomes
      },
      meta: provenanceMeta("policy", doc.id)
    })),
    ...analysis.plan.surfaces.map(doc => createDesireNode({
      kind: "surface",
      name: doc.id,
      body: {
        surfaceKind: doc.surfaceKind,
        className: doc.className,
        children: doc.children,
        props: doc.props,
        processRef: doc.processRef,
        bindings: doc.bindings,
        interactions: doc.interactions,
        repeat: doc.repeat ?? null,
        capabilityRefs: doc.capabilityRefs,
        projectionRefs: []
      },
      meta: provenanceMeta("surface", doc.id)
    }))
  ];

  applyDesire(world, createDesireDocument(nodes));
  const nextParams = cloneParams(analysis.route.params);
  delete nextParams.rootWidget;
  delete nextParams.frontendProgram;
  delete nextParams.page;
  delete nextParams.excludeWidgetRoles;
  delete nextParams.liveProjection;
  nextParams.rootSurface = analysis.plan.ids.surfaces.root;
  if (Array.isArray(analysis.plan.preloadPolicies) && analysis.plan.preloadPolicies.length) {
    nextParams.preloadPolicies = structuredClone(analysis.plan.preloadPolicies);
  }
  if (Array.isArray(analysis.plan.queryBindings) && analysis.plan.queryBindings.length) {
    nextParams.queryBindings = structuredClone(analysis.plan.queryBindings);
  }
  defineRoute(world, {
    actor,
    id: analysis.route.id,
    path: analysis.route.path,
    serves: analysis.route.serves,
    method: analysis.route.method,
    handler: "page.surface",
    params: Object.keys(nextParams).length ? nextParams : null,
    context: analysis.route.context ?? null,
    owner: actor
  });
  return [
    ...analysis.plan.definitionIds.map(id => ({ action: "define", routeId: analysis.route.id, id })),
    { action: "route.rewrite", routeId: analysis.route.id, rootSurface: analysis.plan.ids.surfaces.root }
  ];
}

export function previewLegacyFrontendUpliftFromProject(project) {
  if (typeof project !== "function") throw new Error("project must be a function");
  const witnesses = typeof project.allWitnesses === "function" ? project.allWitnesses() : [];
  const pseudoWorld = {
    allWitnesses: () => witnesses,
    project
  };
  const analyses = currentRouteSources(project).map(source => analyzeRouteSource(pseudoWorld, source));
  const pending = sortRows(analyses.flatMap(analysis => previewRowsForAnalysis(project, analysis)));
  const blocked = sortRows(analyses.flatMap(analysis => analysis.blocked ?? []));
  return {
    compatibilityMode: analyses.length ? "bridge-active" : "first-class-only",
    pending,
    blocked
  };
}

export function previewLegacyFrontendUplift(world) {
  const project = projector => world.project(projector);
  const analyses = currentRouteSources(project).map(source => analyzeRouteSource(world, source));
  const pending = sortRows(analyses.flatMap(analysis => previewRowsForAnalysis(project, analysis)));
  const blocked = sortRows(analyses.flatMap(analysis => analysis.blocked ?? []));
  return {
    compatibilityMode: analyses.length ? "bridge-active" : "first-class-only",
    pending,
    blocked
  };
}

export function frontendLegacyUpliftAuthorityTargets(world) {
  const preview = previewLegacyFrontendUplift(world);
  const routeIds = new Set([
    ...(preview.pending ?? []).map(row => trimString(row?.routeId)).filter(Boolean),
    ...(preview.blocked ?? []).map(row => trimString(row?.routeId)).filter(Boolean)
  ]);
  return {
    preview,
    targets: [...routeIds].sort().map(target => ({ targetKind: "route", target }))
  };
}

export function applyLegacyFrontendUplift(world, {
  actor,
  backendHost
} = {}) {
  const previewBefore = previewLegacyFrontendUplift(world);
  if ((previewBefore.pending ?? []).length === 0 && (previewBefore.blocked ?? []).length === 0) {
    const witness = world.emit({
      process: "frontend.upliftLegacy",
      actor,
      claims: [],
      body: { ok: true, actions: [], previewBefore, previewAfter: previewBefore }
    });
    return { ok: true, actions: [], previewBefore, previewAfter: previewBefore, witness };
  }

  if ((previewBefore.blocked ?? []).length) {
    const witness = world.emit({
      process: "frontend.upliftLegacy.blocked",
      actor,
      claims: [],
      body: { ok: false, previewBefore, blocked: previewBefore.blocked }
    });
    return {
      ok: false,
      status: 409,
      error: "legacy frontend uplift is blocked for one or more routes",
      previewBefore,
      blocked: previewBefore.blocked,
      witness
    };
  }

  const normalized = applyLegacyFrontendMigration(world, {
    actor: actor || backendHost
  });
  if (!normalized.ok) return normalized;

  const actions = [...(normalized.actions ?? []).map(entry => ({ ...entry, phase: "bridge-normalize" }))];
  const analyses = currentRouteSources(projector => {
    return world.project(projector);
  }).map(source => analyzeRouteSource(world, source));
  const stillBlocked = analyses.flatMap(analysis => analysis.blocked ?? []);
  if (stillBlocked.length) {
    const previewAfterBlocked = previewLegacyFrontendUplift(world);
    const witness = world.emit({
      process: "frontend.upliftLegacy.blocked",
      actor: actor || backendHost,
      claims: [],
      body: { ok: false, actions, previewBefore, previewAfter: previewAfterBlocked, blocked: stillBlocked }
    });
    return {
      ok: false,
      status: 409,
      error: "legacy frontend uplift is blocked for one or more routes",
      actions,
      previewBefore,
      previewAfter: previewAfterBlocked,
      blocked: stillBlocked,
      witness
    };
  }

  for (const analysis of analyses) {
    actions.push(...applyPlan(world, analysis, actor || backendHost).map(entry => ({ ...entry, phase: "native-uplift" })));
  }

  const previewAfter = previewLegacyFrontendUplift(world);
  const witness = world.emit({
    process: "frontend.upliftLegacy",
    actor: actor || backendHost,
    claims: [],
    body: {
      ok: true,
      actions,
      previewBefore,
      previewAfter
    }
  });
  return { ok: true, actions, previewBefore, previewAfter, witness };
}
