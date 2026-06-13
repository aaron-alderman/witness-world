import { thing, relation } from "./kernel.js";
import { witnessRelations } from "./modules.js";
import { stepGraphFromLinearSteps } from "./process-graph.js";

// Generic authored-widget ABI: witnessed widget/program definitions, activation
// primitives, and projections. Product rendering and action workflows live in plugins.

export function defineWidget(world, { actor, id, kind, props = {}, owner = actor, context = null }) {
  return world.emit({
    process: "defineWidget",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id),
      relation(id, "hasModuleKind", "widget"),
      relation(id, "widgetKind", kind),
      ...(context ? [relation(id, "inContext", context)] : [])
    ],
    body: { id, kind, props, context: context ? String(context) : null }
  });
}

export function updateWidget(world, { actor, id, kind, props = {}, context = null }) {
  return world.emit({
    process: "updateWidget",
    actor,
    claims: [
      thing(id),
      relation(id, "hasModuleKind", "widget"),
      relation(id, "widgetKind", kind),
      ...(context ? [relation(id, "inContext", context)] : [])
    ],
    body: { id, kind, props, context: context ? String(context) : null }
  });
}

export function defineWidgetVersion(world, { actor, soul, version, kind, props = {}, index = 0, owner = actor, context = null }) {
  return world.emit({
    process: "defineWidgetVersion",
    actor,
    claims: [
      thing(soul),
      thing(version),
      relation(owner, "owns", soul),
      relation(soul, "hasModuleKind", "widget"),
      ...(context ? [relation(soul, "inContext", context)] : []),
      relation(version, "hasModuleKind", "widgetVersion"),
      ...(context ? [relation(version, "inContext", context)] : []),
      relation(version, "versionOf", soul),
      relation(soul, "hasWidgetVersion", version, { index }),
      relation(version, "widgetKind", kind)
    ],
    body: { soul, version, kind, props, index, context: context ? String(context) : null }
  });
}

export function defineWidgetVersionTransition(world, {
  actor,
  soul,
  from,
  to,
  strategy,
  id = `widgetVersionTransition:${soul}:${from}:${to}`,
  owner = actor
}) {
  return world.emit({
    process: "defineWidgetVersionTransition",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id),
      relation(id, "hasModuleKind", "widgetVersionTransition"),
      relation(id, "widgetVersionTransitionOf", soul),
      relation(id, "transitionFrom", from),
      relation(id, "transitionTo", to),
      relation(id, "transitionStrategy", strategy)
    ],
    body: { id, soul, from, to, strategy }
  });
}

export function activateWidgetVersion(world, { actor, soul, version }) {
  const versions = widgetVersions(world.allWitnesses());
  const allowed = versions.some(v => v.soul === soul && v.version === version);
  return world.emit({
    process: allowed ? "activateWidgetVersion" : "activateWidgetVersion.failed",
    actor,
    claims: allowed ? [relation(soul, "activeWidgetVersion", version)] : [],
    body: { soul, version, ok: allowed }
  });
}

export function widgetVersionTransitions(witnesses) {
  return witnesses
    .filter(w => w.process === "defineWidgetVersionTransition")
    .map(w => ({
      id: w.body.id,
      soul: w.body.soul,
      from: w.body.from,
      to: w.body.to,
      strategy: w.body.strategy
    }));
}

export function widgetVersionTransitionIndex(witnesses) {
  const index = new Map();
  for (const row of widgetVersionTransitions(witnesses)) {
    index.set(`${row.soul}\u0000${row.from}\u0000${row.to}`, row);
  }
  return index;
}

export function widgetVersionActivationHistory(witnesses) {
  const history = new Map();
  for (const w of witnesses) {
    if (w.process !== "activateWidgetVersion") continue;
    if (w.body?.ok === false) continue;
    const soul = w.body?.soul;
    const version = w.body?.version;
    if (!soul || !version) continue;
    if (!history.has(soul)) history.set(soul, []);
    history.get(soul).push({
      witnessId: w.id,
      actor: w.actor,
      soul,
      version
    });
  }
  return history;
}

export function attachWidget(world, { actor, parent, child, slot = "children", order = 0 }) {
  return world.emit({
    process: "attachWidget",
    actor,
    claims: [relation(parent, "hasChildWidget", child, { slot, order })],
    body: { parent, child, slot, order }
  });
}

export function defineFrontendProgram(world, { actor, id, rootWidget, owner = actor, context = null }) {
  return world.emit({
    process: "defineFrontendProgram",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id),
      relation(id, "hasModuleKind", "frontendProgram"),
      relation(id, "targetsRootWidget", rootWidget),
      ...(context ? [relation(id, "inContext", context)] : [])
    ],
    body: { id, rootWidget, context: context ? String(context) : null }
  });
}

export function defineFrontendStep(world, { actor, program, event, op, order = 0, params = {}, when = null, repeat = null, after = null }) {
  return world.emit({
    process: "defineFrontendStep",
    actor,
    claims: [relation(program, "hasFrontendStep", `${program}:${event}:${order}:${op}`, { event, order, op })],
    body: { program, event, op, order, params, when, repeat, after: Array.isArray(after) ? after : [] }
  });
}

export function widgetVersions(witnesses) {
  return witnesses
    .filter(w => w.process === "defineWidgetVersion")
    .map(w => ({ soul: w.body.soul, version: w.body.version, kind: w.body.kind, props: w.body.props ?? {}, index: w.body.index ?? 0 }));
}

export function activeWidgetVersions(witnesses) {
  const active = new Map();
  for (const w of witnesses) {
    if (w.process !== "activateWidgetVersion") continue;
    if (w.body?.ok === false) continue;
    active.set(w.body.soul, w.body.version);
  }
  return active;
}

function projectWidgetState(witnesses) {
  const widgets = new Map();
  const children = new Map();
  const rels = witnessRelations(witnesses);
  const versions = widgetVersions(witnesses);
  const active = activeWidgetVersions(witnesses);

  for (const w of witnesses) {
    if (w.process !== "defineWidget" && w.process !== "updateWidget") continue;
    const previous = widgets.get(w.body.id) ?? null;
    widgets.set(w.body.id, {
      id: w.body.id,
      kind: w.body.kind ?? previous?.kind ?? "Widget",
      props: w.body.props ?? previous?.props ?? {}
    });
  }

  for (const v of versions) {
    const activeVersion = active.get(v.soul);
    const isActive = activeVersion ? activeVersion === v.version : false;
    if (!isActive) continue;
    widgets.set(v.soul, { id: v.soul, kind: v.kind, props: v.props, version: v.version, versionIndex: v.index });
  }

  // Witness logs are append-only and the same DSL may be replayed/applied on restart.
  // The widget tree projection must therefore be idempotent: repeated identical
  // attachment witnesses should not render repeated children.
  const attachmentKeys = new Set();
  for (const r of rels) {
    if (r.rel !== "hasChildWidget") continue;
    const slot = r.meta?.slot ?? "children";
    const order = r.meta?.order ?? 0;
    const key = `${r.from}\u0000${slot}\u0000${order}\u0000${r.to}`;
    if (attachmentKeys.has(key)) continue;
    attachmentKeys.add(key);
    if (!children.has(r.from)) children.set(r.from, []);
    children.get(r.from).push({ id: r.to, slot, order });
  }

  function build(id, seen = new Set()) {
    if (seen.has(id)) return { id, kind: "Cycle", props: {}, children: [] };
    const node = widgets.get(id);
    if (!node) return { id, kind: "MissingWidget", props: { id }, children: [] };
    seen.add(id);
    const kids = (children.get(id) ?? [])
      .sort((a, b) => a.order - b.order)
      .map(c => build(c.id, new Set(seen)));
    return { ...node, children: kids };
  }

  return { widgets, children, build };
}

export function widgetTree(witnesses, root) {
  return projectWidgetState(witnesses).build(root);
}

export function widgetDefinitions(witnesses) {
  const contexts = new Map(witnessRelations(witnesses).filter(row => row.rel === "inContext").map(row => [row.from, row.to]));
  const owners = new Map(witnessRelations(witnesses).filter(row => row.rel === "owns").map(row => [row.to, row.from]));
  const state = projectWidgetState(witnesses);
  return [...state.widgets.values()]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(widget => ({
      id: widget.id,
      kind: widget.kind,
      props: { ...(widget.props ?? {}) },
      context: contexts.get(widget.id) ?? null,
      owner: owners.get(widget.id) ?? null
    }));
}

export function templateWidgetTrees(witnesses) {
  const state = projectWidgetState(witnesses);
  return [...state.widgets.values()]
    .filter(widget => widget.props?.template === true)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(widget => state.build(widget.id));
}

export function frontendProgram(witnesses, programId) {
  if (!programId) return null;
  const program = witnesses.find(w => w.process === "defineFrontendProgram" && w.body.id === programId)?.body;
  if (!program) return null;
  const stepMap = new Map();
  for (const w of witnesses.filter(w => w.process === "defineFrontendStep" && w.body.program === programId)) {
    const step = {
      event: w.body.event,
      op: w.body.op,
      order: w.body.order ?? 0,
      params: w.body.params ?? {},
      when: w.body.when ?? null,
      repeat: w.body.repeat ?? null,
      after: Array.isArray(w.body.after) ? w.body.after : []
    };
    // Idempotent projection for replayed/imported DSL. Same declared step should
    // execute once even if its defining witness appears multiple times.
    const key = `${step.event}\u0000${step.order}\u0000${step.op}\u0000${stableJson(step.params)}\u0000${stableJson(step.when)}\u0000${stableJson(step.repeat)}\u0000${stableJson(step.after)}`;
    stepMap.set(key, step);
  }
  const steps = [...stepMap.values()].sort((a, b) => a.order - b.order);
  return { id: program.id, rootWidget: program.rootWidget, steps, graph: stepGraphFromLinearSteps(steps, { programId: program.id }) };
}

export function frontendProgramsProjection(witnesses) {
  const contexts = new Map(witnessRelations(witnesses).filter(row => row.rel === "inContext").map(row => [row.from, row.to]));
  const rows = [];
  for (const witness of witnesses) {
    if (witness.process !== "defineFrontendProgram" || !witness.body?.id) continue;
    if (rows.some(row => row.id === witness.body.id)) continue;
    rows.push({ id: witness.body.id, rootWidget: witness.body.rootWidget, context: contexts.get(witness.body.id) ?? (witness.body.context ? String(witness.body.context) : null) });
  }
  return rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function frontendStepsProjection(witnesses) {
  return witnesses
    .filter(witness => witness.process === "defineFrontendStep" && witness.body?.program)
    .map(witness => ({
      program: witness.body.program,
      event: witness.body.event,
      op: witness.body.op,
      order: witness.body.order ?? 0,
      params: witness.body.params ?? {},
      when: witness.body.when ?? null,
      repeat: witness.body.repeat ?? null,
      after: Array.isArray(witness.body.after) ? witness.body.after : []
    }))
    .sort((a, b) => String(a.program).localeCompare(String(b.program)) || String(a.event).localeCompare(String(b.event)) || a.order - b.order);
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
