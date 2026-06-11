import { thing, relation } from "./kernel.js";
import { witnessRelations } from "./modules.js";
import { stepGraphFromLinearSteps, runProcessGraph, runNode, predicatePasses } from "./process-graph.js";
import {
  FALLBACK_EDITOR_BY_TRAIT,
  typeModelProjection,
  editorForValueType,
  processSpecFor,
  validateFlatRecord,
  validateProcessInput,
  compatibleWithType,
  matchAccepts,
  matchingValueTypes,
  valueMatchesType,
  coerceDomValue,
  inferTraitEditor,
  normalizeFields,
  jsTypeOf,
  previewValue
} from "./type-model.js";

export function defineWidget(world, { actor, id, kind, props = {}, owner = actor }) {
  return world.emit({
    process: "defineWidget",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id),
      relation(id, "hasModuleKind", "widget"),
      relation(id, "widgetKind", kind)
    ],
    body: { id, kind, props }
  });
}

export function defineWidgetVersion(world, { actor, soul, version, kind, props = {}, index = 0, owner = actor }) {
  return world.emit({
    process: "defineWidgetVersion",
    actor,
    claims: [
      thing(soul),
      thing(version),
      relation(owner, "owns", soul),
      relation(soul, "hasModuleKind", "widget"),
      relation(version, "hasModuleKind", "widgetVersion"),
      relation(version, "versionOf", soul),
      relation(soul, "hasWidgetVersion", version, { index }),
      relation(version, "widgetKind", kind)
    ],
    body: { soul, version, kind, props, index }
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

export function requestWidgetVersionActivation(world, { actor, soul, version }) {
  const witnesses = world.allWitnesses();
  const versions = widgetVersions(witnesses);
  const target = versions.find(candidate => candidate.soul === soul && candidate.version === version);
  if (!target) {
    const witness = world.emit({
      process: "activateWidgetVersion.failed",
      actor,
      claims: [],
      body: { soul, version, ok: false, reason: "unknown widget version" }
    });
    return { ok: false, status: "failed", soul, version, witness, witnesses: [witness] };
  }

  const current = activeWidgetVersions(witnesses).get(soul) ?? null;
  if (!current) {
    const witness = activateWidgetVersion(world, { actor, soul, version });
    return { ok: true, status: "activated", soul, version, witness, witnesses: [witness] };
  }

  if (current === version) {
    const witness = activateWidgetVersion(world, { actor, soul, version });
    return { ok: true, status: "activated", soul, version, witness, witnesses: [witness] };
  }

  const transition = widgetVersionTransitionIndex(witnesses).get(`${soul}\u0000${current}\u0000${version}`) ?? null;
  const strategy = transition?.strategy ?? "block";
  if (strategy === "compatible") {
    const witness = activateWidgetVersion(world, { actor, soul, version });
    return { ok: true, status: "activated", soul, version, witness, witnesses: [witness] };
  }
  if (strategy === "migrate") {
    const migration = world.emit({
      process: "widgetVersion.migrate",
      actor,
      claims: [],
      body: { soul, from: current, to: version, strategy }
    });
    const activation = activateWidgetVersion(world, { actor, soul, version });
    return { ok: true, status: "migrated", soul, version, witness: activation, witnesses: [migration, activation] };
  }
  if (strategy === "fork") {
    const requested = world.emit({
      process: "widgetVersion.fork.requested",
      actor,
      claims: [],
      body: { soul, from: current, to: version, strategy }
    });
    const blocked = world.emit({
      process: "activateWidgetVersion.blocked",
      actor,
      claims: [],
      body: { soul, from: current, version, strategy, reason: "fork required" }
    });
    return { ok: false, status: "forkRequired", soul, version, witness: blocked, witnesses: [requested, blocked] };
  }
  const blocked = world.emit({
    process: "activateWidgetVersion.blocked",
    actor,
    claims: [],
    body: { soul, from: current, version, strategy, reason: transition ? "transition blocked" : "no authored transition" }
  });
  return { ok: false, status: "blocked", soul, version, witness: blocked, witnesses: [blocked] };
}

export function rollbackWidgetVersion(world, { actor, soul }) {
  const history = widgetVersionActivationHistory(world.allWitnesses()).get(soul) ?? [];
  if (history.length < 2) {
    const witness = world.emit({
      process: "widgetVersion.rollback.failed",
      actor,
      claims: [],
      body: { soul, reason: "no previous active version" }
    });
    return { ok: false, status: "failed", soul, version: null, witness, witnesses: [witness] };
  }

  const current = history[history.length - 1]?.version ?? null;
  let target = null;
  for (let index = history.length - 2; index >= 0; index -= 1) {
    if (history[index].version !== current) {
      target = history[index].version;
      break;
    }
  }
  if (!target) {
    const witness = world.emit({
      process: "widgetVersion.rollback.failed",
      actor,
      claims: [],
      body: { soul, reason: "no previous distinct active version" }
    });
    return { ok: false, status: "failed", soul, version: null, witness, witnesses: [witness] };
  }

  const rollback = world.emit({
    process: "widgetVersion.rollback",
    actor,
    claims: [],
    body: { soul, from: current, to: target }
  });
  const activation = activateWidgetVersion(world, { actor, soul, version: target });
  return { ok: true, status: "rolledBack", soul, version: target, witness: activation, witnesses: [rollback, activation] };
}

export function attachWidget(world, { actor, parent, child, slot = "children", order = 0 }) {
  return world.emit({
    process: "attachWidget",
    actor,
    claims: [relation(parent, "hasChildWidget", child, { slot, order })],
    body: { parent, child, slot, order }
  });
}

export function defineFrontendProgram(world, { actor, id, rootWidget, owner = actor }) {
  return world.emit({
    process: "defineFrontendProgram",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id),
      relation(id, "hasModuleKind", "frontendProgram"),
      relation(id, "targetsRootWidget", rootWidget)
    ],
    body: { id, rootWidget }
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
    if (w.process !== "defineWidget") continue;
    widgets.set(w.body.id, { id: w.body.id, kind: w.body.kind, props: w.body.props ?? {} });
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

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function renderWidgetPage(world, { actor, rootWidget, frontendProgram: programId = null, appConfig = {} }) {
  const tree = world.project(w => widgetTree(w, rootWidget));
  const program = world.project(w => frontendProgram(w, programId));
  const typeModel = world.project(typeModelProjection);
  const templates = world.project(templateWidgetTrees);
  const html = renderDocument(tree, program, appConfig, typeModel, templates);

  world.emit({
    process: "widget.renderHtml",
    actor,
    claims: [relation(actor, "rendered", rootWidget)],
    body: { rootWidget, frontendProgram: programId, bytes: html.length }
  });

  return html;
}

function renderDocument(root, program, appConfig = {}, typeModel = {}, templates = []) {
  const title = root.props?.title ?? "Witness App";
  const bodyAttrs = appConfig.page ? ` data-page="${escapeAttr(appConfig.page)}"` : "";
  const options = { excludeRoles: new Set(appConfig.excludeWidgetRoles ?? []), typeModel };
  return `<!doctype html>\n<html>\n${renderHead(title)}\n<body${bodyAttrs}>\n${renderWidget(root, options)}\n${templates.map(template => renderWidgetTemplate(template, options)).join("\n")}\n${program ? renderClientEngine({ ...program, config: { ...appConfig, typeModel } }) : ""}\n</body>\n</html>`;
}

function renderHead(title) {
  return `<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 920px; margin: 40px auto; padding: 0 24px; color: #222; }
    body[data-page="world"] { max-width: none; margin: 0; padding: 0; overflow: hidden; }
    body[data-page="world"] main { height: 100vh; display: grid; grid-template-rows: auto 1fr; gap: 0; overflow: hidden; }
    body[data-page="world"] h1 { font-size: 1.05rem; margin: 4px 14px 6px; line-height: 1.2; }
    body[data-page="world"] .world-graph-link { padding: 6px 14px; display: inline-block; font-size: 13px; }
    body[data-actor="aaron"] { --accent: #375a7f; }
    body[data-actor="callan"] { --accent: #6b4f8a; }
    body[data-actor="adam"] { --accent: #667a3a; }
    h1 { color: var(--accent, #333); }
    main { display: grid; gap: 18px; }
    form { display: flex; gap: 8px; margin: 8px 0; }
    select { padding: 10px; border: 1px solid #bbb; border-radius: 6px; }
    input { flex: 1; padding: 10px; border: 1px solid #bbb; border-radius: 6px; }
    button { padding: 8px 12px; cursor: pointer; border: 1px solid #999; border-radius: 6px; background: #f8f8f8; }
    button:hover { background: #eee; }
    ul { list-style: none; padding: 0; margin: 0; }
    li, .todo-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #eee; }
    li.done .todo-title, .todo-row.done .todo-title { text-decoration: line-through; color: #777; }
    .status { min-height: 1.5em; color: #555; }
    .todo-actions { margin-left: auto; display: flex; gap: 6px; }
    .session-panel, .private-notes, .witness-inspector, .widget-editor { border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #fafafa; }
    .session-panel { border-left: 6px solid var(--accent, #ddd); }
    .value-editor-field { display: grid; gap: 4px; min-width: 0; flex: 1; }
    .private-note-list { display: grid; gap: 6px; margin-top: 8px; }
    .private-note { padding: 8px; border-radius: 6px; background: #fff; border: 1px solid #eee; }
    .witness-inspector { }
    .witness-inspector h2 { font-size: 1rem; margin: 0 0 8px; }
    .witness-list { max-height: 260px; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .witness { display: grid; grid-template-columns: 150px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid #eee; }
    .witness-process { font-weight: 700; }
    .witness-body { color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .widget-editor, .version-playground { border-left: 6px solid #ddd; }
    .world-graph { border: 0; border-radius: 0; padding: 0; background: #fafafa; height: 100%; min-height: 0; overflow: hidden; }
    .world-graph h2 { font-size: 1rem; margin: 0 0 8px; }
    .world-graph-shell { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 0; align-items: stretch; height: 100%; max-height: 100%; overflow: hidden; border-top: 1px solid #e5e5e5; }
    .world-main-pane { display: grid; grid-template-rows: auto 1fr; min-height: 0; overflow: hidden; }
    .world-mode-menu { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #e5e5e5; background: #fbfbfb; overflow-x: auto; white-space: nowrap; flex-wrap: nowrap; min-height: 35px; box-sizing: border-box; }
    .world-mode-button { border-radius: 999px; padding: 5px 11px; font-size: 12px; }
    .world-mode-active { background: var(--accent, #375a7f); color: white; border-color: var(--accent, #375a7f); }
    .world-graph-inspector { border-right: 1px solid #ddd; background: #fff; padding: 14px; min-height: 0; height: 100%; max-height: 100%; overflow-y: scroll; overflow-x: hidden; font-size: 12px; box-sizing: border-box; }
    .world-graph-inspector h2 { margin: 0 0 8px; font-size: 1rem; }
    .world-inspector-row { display: grid; grid-template-columns: 84px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f2f2f2; }
    .world-inspector-key { color: #777; font-weight: 700; }
    .world-inspector-list { display: grid; gap: 4px; margin-top: 8px; }
    .world-inspector-item { border: 1px solid #eee; border-radius: 6px; padding: 5px 7px; background: #fafafa; text-align: left; cursor: pointer; }
    .world-ref-button { appearance: none; border: 0; background: none; color: var(--accent, #375a7f); padding: 0; cursor: pointer; font: inherit; text-align: left; text-decoration: underline; }
    .world-kind-button { appearance: none; border: 0; border-radius: 999px; background: #eee; padding: 2px 7px; cursor: pointer; font: inherit; }
    .world-graph-canvas { position: relative; width: 100%; height: 100%; min-height: 0; overflow: scroll; border: 0; border-radius: 0; background: #fff; box-sizing: border-box; }
    .world-graph-content { position: relative; }
    .world-document-view, .world-primitive-browser { height: 100%; overflow: auto; box-sizing: border-box; padding: 16px; background: #fff; }
    .world-source-workbench { display: grid; grid-template-columns: 260px minmax(0, 1fr); height: 100%; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #1e1e1e; color: #d4d4d4; }
    .world-source-sidebar { background: #252526; border-right: 1px solid #333; padding: 10px; overflow: auto; }
    .world-source-file-button { display: block; width: 100%; text-align: left; border: 0; border-radius: 4px; background: transparent; color: #ccc; padding: 6px 8px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; cursor: pointer; }
    .world-source-file-button:hover, .world-source-file-active { background: #37373d; color: #f2f2f2; }
    .world-source-ref:hover { color: #dcdcaa; background: #2a2d2e; }
    .world-source-editor { overflow: auto; min-width: 0; }
    .world-source-title { position: sticky; top: 0; z-index: 2; background: #2d2d2d; color: #eee; padding: 8px 12px; border-bottom: 1px solid #3a3a3a; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .world-source-code { display: table; width: 100%; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .world-source-line { display: table-row; }
    .world-source-line-number { display: table-cell; width: 44px; padding: 0 10px; text-align: right; color: #858585; background: #1e1e1e; user-select: none; border-right: 1px solid #2a2a2a; }
    .world-source-line-code { display: table-cell; white-space: pre-wrap; padding: 0 12px; }
    .world-source-highlight .world-source-line-code { background: rgba(255, 213, 0, .18); outline: 1px solid rgba(255, 213, 0, .35); }
    .world-source-ref { color: #9cdcfe; background: transparent; border: 0; padding: 0; font: inherit; text-decoration: underline; cursor: pointer; }
    .world-source-empty { padding: 16px; color: #ccc; }
    .world-primitive-grid { display: grid; grid-template-columns: 220px 280px minmax(0, 1fr); gap: 16px; }
    .world-primitive-list { display: grid; gap: 6px; align-content: start; }
    .world-primitive-item { text-align: left; border: 1px solid #eee; border-radius: 6px; padding: 6px 8px; background: #fafafa; cursor: pointer; }
    .world-graph-svg { position: absolute; inset: 0; pointer-events: none; }
    .world-context-box { position: absolute; border: 2px solid #d7d7d7; border-radius: 14px; background: rgba(250,250,250,.78); box-sizing: border-box; }
    .world-context-label { position: absolute; left: 12px; top: 8px; font-weight: 700; font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: .06em; }
    .world-node { position: absolute; width: 190px; min-height: 48px; padding: 8px; border: 1px solid #ccc; border-radius: 8px; background: white; box-shadow: 0 1px 2px rgba(0,0,0,.08); font-size: 12px; cursor: pointer; }
    .world-node-selected { outline: 3px solid var(--accent, #333); outline-offset: 2px; box-shadow: 0 0 0 5px rgba(55,90,127,.12); }
    .world-node-step { border-style: dashed; background: #fbfbff; }
    .world-node-api { border-color: #c79b45; background: #fff9ed; }
    .world-node-process { border-color: #b8c7e0; background: #f8fbff; }
    .world-node-context, .world-node-context-ref { border-color: #aaa; background: #f7f7f7; }
    .world-node-widget, .world-node-layout { border-color: #6ca278; background: #f4fff6; }
    .world-node-capability { border-color: #9a7cc0; background: #fbf7ff; }
    .world-node-trait, .world-node-valueType, .world-node-processSpec { border-color: #4c8f8f; background: #f2fffe; }
    .world-node-vocabulary { border-color: #999; background: #f7f7f7; }
    .world-node a { color: var(--accent, #333); font-weight: 700; text-decoration: none; }
    .world-node-kind { color: #777; font-size: 11px; }
    .world-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .world-badge { background: #f0f0f0; border-radius: 999px; padding: 2px 6px; font-size: 10px; }
    .world-edge-props { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
    .world-value-list { color: #555; display: grid; gap: 4px; }
    .world-value-widget { display: grid; gap: 3px; border: 1px solid #eee; border-radius: 6px; padding: 5px; background: #fff; }
    .world-value-type { color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    .world-value-record { display: grid; gap: 4px; }
    .world-value-record-row { display: grid; grid-template-columns: 72px 1fr; gap: 6px; }
    .world-source-ast { margin: 6px 0 0; max-height: 180px; overflow: auto; white-space: pre-wrap; background: #fff; border: 1px solid #eee; border-radius: 6px; padding: 6px; font-size: 11px; }
    .world-edge-label { font-size: 10px; fill: #777; }
    .world-edge-ownership { stroke: #c7352f; stroke-width: 2.5; }
    .world-edge-process { stroke: #5577aa; stroke-dasharray: 4 3; }
    .world-edge-capability { stroke: #777; stroke-dasharray: 2 3; }
    .world-edge-relation { stroke: #ddd; }
    [data-widget-version] { border-left: 8px solid var(--version-color, #ddd); padding-left: 12px; border-radius: 8px; }
  </style>
</head>`;
}

function renderWidgetTemplate(widget, options = {}) {
  const content = renderWidget(widget, { ...options, templateContent: true });
  if (widget.kind === "Option") {
    // Browsers do not consistently preserve top-level <option> nodes inside a
    // parsed template fragment. Keep the authored widget declarative, but wrap
    // it in a temporary <select> so the parser creates a real option element.
    return `<template data-widget-template="${escapeAttr(widget.id)}"><select data-template-wrapper="option">${content}</select></template>`;
  }
  return `<template data-widget-template="${escapeAttr(widget.id)}">${content}</template>`;
}

function renderWidget(widget, options = {}) {
  const role = widget.props?.role ?? widget.props?.["data-role"];
  if (role && options.excludeRoles?.has(role)) return "";
  if (widget.props?.template === true && !options.templateContent) return "";
  const children = widget.children.map(child => renderWidget(child, options)).join("\n");
  const attrs = renderAttrs(widget);

  switch (widget.kind) {
    case "Page":
      return `<main${attrs}>\n${children}\n</main>`;
    case "Box":
    case "Section":
      return `<section${attrs}>\n${children}\n</section>`;
    case "Heading": {
      const level = clamp(Number(widget.props.level ?? 1), 1, 6);
      return `<h${level}${attrs}>${escapeHtml(widget.props.text ?? "")}</h${level}>`;
    }
    case "Text":
      return `<div${attrs}>${escapeHtml(widget.props.text ?? "")}</div>`;
    case "Form":
      return `<form${attrs}>\n${children}\n</form>`;
    case "Input":
      return `<input${attrs}${renderExtraAttrs(widget, ["name", "placeholder", "type", "valueType", "label", "template"])} name="${escapeAttr(widget.props.name ?? "value")}" placeholder="${escapeAttr(widget.props.placeholder ?? "")}" autocomplete="off" />`;
    case "Select":
      return `<select${attrs}${renderExtraAttrs(widget, ["name", "template"])} name="${escapeAttr(widget.props.name ?? "value")}">${children}</select>`;
    case "Option":
      return `<option${attrs}${renderExtraAttrs(widget, ["text", "value", "template"])} value="${escapeAttr(widget.props.value ?? "")}">${escapeHtml(widget.props.text ?? "")}</option>`;
    case "ValueEditor":
      return renderValueEditor(widget, options.typeModel ?? {}, attrs);
    case "Button": {
      const type = widget.props.type ?? "button";
      return `<button${attrs}${renderExtraAttrs(widget, ["text", "type", "template"])} type="${escapeAttr(type)}">${escapeHtml(widget.props.text ?? "Button")}</button>`;
    }
    case "Link":
      return `<a${attrs}${renderExtraAttrs(widget, ["text", "href", "template"])} href="${escapeAttr(widget.props.href ?? "#")}">${escapeHtml(widget.props.text ?? widget.props.href ?? "Link")}</a>`;
    case "List":
      return `<ul${attrs}></ul>`;
    default:
      return `<section${attrs} data-kind="${escapeAttr(widget.kind)}">${children}</section>`;
  }
}

function renderValueEditor(widget, typeModel, attrs) {
  const valueType = widget.props.valueType ?? "textual";
  const editor = editorForValueType(typeModel, valueType);
  const name = escapeAttr(widget.props.name ?? "value");
  const placeholder = escapeAttr(widget.props.placeholder ?? "");
  const controlAttrs = `${attrs} name="${name}" data-value-type="${escapeAttr(valueType)}" data-editor-control="${escapeAttr(editor.control)}"`;
  let control = "";
  if (editor.control === "select") {
    const options = Array.isArray(editor.options) ? editor.options : [];
    const placeholderOption = widget.props.placeholder ? `<option value="">${escapeHtml(widget.props.placeholder)}</option>` : "";
    control = `<select${controlAttrs}>${placeholderOption}${options.map(option => `<option value="${escapeAttr(option)}">${escapeHtml(option)}</option>`).join("")}</select>`;
  } else if (editor.control === "checkbox") {
    control = `<input${controlAttrs} type="checkbox" />`;
  } else {
    const inputType = editor.control === "number" ? "number" : editor.control === "color" ? "color" : "text";
    control = `<input${controlAttrs} type="${escapeAttr(inputType)}" placeholder="${placeholder}" autocomplete="off" />`;
  }
  if (!widget.props.label) return control;
  return `<label class="value-editor-field"><span>${escapeHtml(widget.props.label)}</span>${control}</label>`;
}

function renderAttrs(widget) {
  const parts = [`data-widget="${escapeAttr(widget.id)}"`];
  if (widget.version) parts.push(`data-widget-version="${escapeAttr(widget.version)}"`);
  if (widget.props.class) parts.push(`class="${escapeAttr(widget.props.class)}"`);
  if (widget.props.role) {
    parts.push(`data-role="${escapeAttr(widget.props.role)}"`);
    parts.push(`data-${escapeAttr(widget.props.role)}`);
  }
  if (widget.props.action) parts.push(`data-action="${escapeAttr(widget.props.action)}"`);
  if (widget.props.type && widget.kind !== "Button") parts.push(`type="${escapeAttr(widget.props.type)}"`);
  if (widget.versionIndex != null) parts.push(`style="--version-color: ${escapeAttr(versionColor(widget.versionIndex))}"`);
  for (const [key, value] of Object.entries(widget.props || {})) {
    if (key.startsWith("event") && key.length > 5 && value != null) {
      parts.push(`data-${escapeAttr(camelToKebab(key.slice(5)))}="${escapeAttr(value)}"`);
    }
    if ((key.startsWith("data-") || key.startsWith("aria-")) && value != null) parts.push(`${escapeAttr(key)}="${escapeAttr(value)}"`);
  }
  return " " + parts.join(" ");
}

function renderExtraAttrs(widget, consumed = []) {
  const consumedSet = new Set(["class", "role", "action", "template", ...consumed]);
  const entries = Object.entries(widget.props || {})
    .filter(([key, value]) => !consumedSet.has(key) && !key.startsWith("event") && !key.startsWith("data-") && !key.startsWith("aria-") && value != null && typeof value !== "object");
  if (entries.length === 0) return "";
  return " " + entries.map(([key, value]) => `${escapeAttr(key)}="${escapeAttr(value)}"`).join(" ");
}

function camelToKebab(value) {
  return String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function versionColor(index) {
  const colors = ["#375a7f", "#6b4f8a", "#667a3a", "#9a5a35", "#2f766f", "#8a3f65"];
  const n = Math.abs(Number(index) || 0) % colors.length;
  return colors[n];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function renderClientEngine(program) {
  const json = JSON.stringify(program).replace(/</g, "\\u003c");
  const engine = String.raw`(async () => {
  let program = JSON.parse(document.getElementById('witness-frontend-program').textContent);
  let config = program.config || {};
  let typeModel = config.typeModel || {};
  const state = Object.create(null);
  const liveProjectionProcesses = new Set(['defineWidget', 'attachWidget', 'defineWidgetVersion', 'activateWidgetVersion', 'widgetVersion.migrate', 'widgetVersion.rollback']);
  let refreshInFlight = null;
  let liveProjectionStarted = false;
  const byWidget = id => document.querySelector('[data-widget="' + CSS.escape(id) + '"]');
  const byTemplate = id => document.querySelector('[data-widget-template="' + CSS.escape(id) + '"]');
  const readPath = (value, path) => String(path || '').split('.').filter(Boolean).reduce((x, key) => x == null ? undefined : x[key], value);
  const FALLBACK_EDITOR_BY_TRAIT = ${JSON.stringify(FALLBACK_EDITOR_BY_TRAIT)};
  const predicatePasses = ${predicatePasses.toString()};
  const runNode = ${runNode.toString()};
  const runProcessGraph = ${runProcessGraph.toString()};
  const compatibleWithType = ${compatibleWithType.toString()};
  const editorForValueType = ${editorForValueType.toString()};
  const processSpecFor = ${processSpecFor.toString()};
  const normalizeFields = ${normalizeFields.toString()};
  const jsTypeOf = ${jsTypeOf.toString()};
  const previewValue = ${previewValue.toString()};
  const inferTraitEditor = ${inferTraitEditor.toString()};
  const coerceDomValue = ${coerceDomValue.toString()};
  const valueMatchesType = ${valueMatchesType.toString()};
  const matchingValueTypes = ${matchingValueTypes.toString()};
  const matchAccepts = ${matchAccepts.toString()};
  const validateFlatRecord = ${validateFlatRecord.toString()};
  const validateProcessInput = ${validateProcessInput.toString()};
  const textAt = (value, path) => String(readPath(value, path) ?? '');
  const setText = (id, text) => { const el = byWidget(id); if (el) el.textContent = text; };
  const setValue = (id, value) => {
    const el = byWidget(id);
    if (!el) return;
    if ('value' in el) el.value = value ?? '';
    else el.textContent = value ?? '';
  };
  const currentActor = () => state.session?.actor || state.actor || '';
  const applyTheme = () => { document.body.dataset.actor = currentActor() || ''; };
  const syncSession = session => {
    const authenticated = Boolean(session?.authenticated);
    state.session = authenticated ? session : { authenticated: false, identity: null, actor: null, label: null, perspective: null };
    state.actor = state.session.actor || '';
    applyTheme();
  };
  const traceEndpoint = '/api/process-events';
  const traceContext = { runId: null, stepId: null };
  const makeRunId = () => (globalThis.crypto?.randomUUID?.() || ('run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)));
  const withTraceContext = async (runId, stepId, fn) => {
    const previous = { ...traceContext };
    traceContext.runId = runId || previous.runId || null;
    traceContext.stepId = stepId || null;
    try {
      return await fn();
    } finally {
      traceContext.runId = previous.runId;
      traceContext.stepId = previous.stepId;
    }
  };
  const requestOptions = (options, { url = '', disableTrace = false } = {}) => {
    const next = { credentials: 'same-origin', ...(options || {}) };
    if (!disableTrace && url !== traceEndpoint && traceContext.runId) {
      next.headers = {
        ...(next.headers || {}),
        'x-witness-process-run': traceContext.runId,
        'x-witness-step-id': traceContext.stepId || ''
      };
    }
    return next;
  };
  const scopeFor = extra => ({ state, event: state.event || {}, ...extra });
  const traceStepBody = (process, body = {}) => ({
    process,
    runId: body.runId || '',
    program: body.program || program.id || '',
    event: body.event || '',
    nodeId: body.nodeId || '',
    op: body.op || '',
    status: body.status || '',
    frontier: Array.isArray(body.frontier) ? body.frontier : [],
    repeat: body.repeat ?? null,
    repeatCount: body.repeatCount ?? null,
    message: body.message || '',
    eventData: body.eventData ?? null,
    actor: currentActor() || '',
    timestamp: Date.now()
  });
  const recordProcessEvent = async (process, body = {}) => {
    try {
      await fetch(traceEndpoint, requestOptions({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(traceStepBody(process, body))
      }, { url: traceEndpoint, disableTrace: true }));
    } catch {}
  };
  const evaluateExpression = (expression, scope) => {
    const names = Object.keys(scope);
    const values = Object.values(scope);
    return Function(...names, 'return (' + expression + ');')(...values);
  };
  const interpolateString = (value, scope) => {
    const text = String(value ?? '');
    const exact = text.match(/^\$\{([^}]+)\}$/);
    if (exact) {
      try { return evaluateExpression(exact[1], scope); }
      catch { return ''; }
    }
    return text.replace(/\$\{([^}]+)\}/g, (_, expression) => {
      try {
        const result = evaluateExpression(expression, scope);
        return result == null ? '' : String(result);
      } catch {
        return '';
      }
    });
  };
  const interpolateValue = (value, scope) => {
    if (typeof value === 'string') return interpolateString(value, scope);
    if (Array.isArray(value)) return value.map(item => interpolateValue(item, scope));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateValue(item, scope)]));
    return value;
  };
  const applyInterpolations = (root, scope) => {
    const applyElementAttrs = element => {
      for (const attr of [...element.attributes]) {
        if (!attr.value.includes('\${')) continue;
        const value = interpolateString(attr.value, scope);
        if (attr.name === 'selected' || attr.name === 'checked' || attr.name === 'disabled') {
          if (value === false || value === '' || value === 'false' || value == null) element.removeAttribute(attr.name);
          else element.setAttribute(attr.name, attr.name);
        } else if (value == null || value === false) {
          element.removeAttribute(attr.name);
        } else {
          element.setAttribute(attr.name, String(value));
        }
      }
    };
    if (root?.nodeType === Node.ELEMENT_NODE) applyElementAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let current;
    while ((current = walker.nextNode())) {
      if (current.nodeType === Node.TEXT_NODE) {
        if (current.textContent && current.textContent.includes('\${')) current.textContent = interpolateString(current.textContent, scope);
        continue;
      }
      applyElementAttrs(current);
    }
  };
  const instantiateTemplate = (templateId, scope) => {
    const template = byTemplate(templateId);
    if (!template) throw new Error('unknown template ' + templateId);
    const fragment = template.content.cloneNode(true);
    applyInterpolations(fragment, scope);
    return fragment;
  };
  const instantiateSelectOption = (templateId, scope) => {
    const template = byTemplate(templateId);
    if (!template) throw new Error('unknown template ' + templateId);
    const option = template.content.querySelector('option')?.cloneNode(true);
    if (!option) throw new Error('option template ' + templateId + ' did not yield an option');
    applyInterpolations(option, scope);
    return option;
  };
  const appendTemplateInstance = (target, instance) => {
    const wrapper = instance.firstElementChild;
    if (wrapper?.getAttribute?.('data-template-wrapper') === 'option') {
      while (wrapper.firstChild) target.appendChild(wrapper.firstChild);
      return;
    }
    target.appendChild(instance);
  };
  const renderCollection = ({ widget, from, template, itemAs = 'item', indexAs = 'index', emptyWidget = null, limit = null, reverse = false }) => {
    const el = byWidget(widget);
    if (!el) return;
    const value = readPath(state, from);
    let items = Array.isArray(value) ? [...value] : [];
    if (reverse) items.reverse();
    if (limit != null && Number.isFinite(Number(limit))) items = items.slice(0, Number(limit));
    el.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const target = el.tagName === 'SELECT' ? el : fragment;
    if (items.length === 0) {
      if (emptyWidget) appendTemplateInstance(target, instantiateTemplate(emptyWidget, scopeFor({ item: null, index: 0 })));
      if (target !== el) el.appendChild(fragment);
      return;
    }
    items.forEach((item, index) => {
      const scope = scopeFor({ item, index, [itemAs]: item, [indexAs]: index });
      if (el.tagName === 'SELECT') {
        el.appendChild(instantiateSelectOption(template, scope));
        return;
      }
      appendTemplateInstance(target, instantiateTemplate(template, scope));
    });
    if (target !== el) el.appendChild(fragment);
  };
  const renderWorldGraph = ({ widget, from }) => {
    const root = byWidget(widget);
    if (!root) return;
    const value = readPath(state, from) || {};
    const graph = value.graph || value;
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    const groups = graph.groups || [];
    const width = Math.max(900, ...nodes.map(n => (n.x || 0) + 240), ...groups.map(g => (g.x || 0) + (g.width || 0) + 24));
    const height = Math.max(420, ...nodes.map(n => (n.y || 0) + 90), ...groups.map(g => (g.y || 0) + (g.height || 0) + 24));
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    let selectedId = state.worldGraphSelectedId && byId[state.worldGraphSelectedId] ? state.worldGraphSelectedId : (nodes[0]?.id || '');
    const primitiveIndex = buildPrimitiveIndex();
    const sourceFiles = [...new Map(nodes.flatMap(n => (n.sources || []).map(src => [src.file, src])).filter(([file]) => file).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).values()];
    const currentMode = () => state.worldGraphMode || 'graph';
    const modeButton = (mode, label) => '<button class="world-mode-button ' + (currentMode() === mode ? 'world-mode-active' : '') + '" data-world-mode="' + mode + '">' + label + '</button>';
    const renderModeMenu = () => '<nav class="world-mode-menu">' + modeButton('graph', 'Graph') + modeButton('things', 'Thing List') + modeButton('primitive', 'Primitive Browser') + modeButton('source', 'Source Browser') + modeButton('process', 'Process Explorer') + '</nav>';
    const linkRef = id => byId[id]
      ? '<button class="world-ref-button" data-world-select="' + escapeHtml(id) + '">' + escapeHtml(id) + '</button>'
      : '<button class="world-ref-button" data-world-primitive="' + escapeHtml(String(id || '')) + '" data-world-primitive-kind="unresolved-ref">' + escapeHtml(String(id || '')) + '</button>';
    const linkKind = kind => '<button class="world-kind-button" data-world-kind="' + escapeHtml(kind) + '">' + escapeHtml(kind) + '</button>';
    const linkPrimitive = (kind, value) => {
      const text = String(value ?? '');
      if (sourceFiles.some(src => src.file === text)) return '<button class="world-ref-button" data-world-source-file="' + escapeHtml(text) + '">' + escapeHtml(text) + '</button>';
      return '<button class="world-ref-button" data-world-primitive="' + escapeHtml(text) + '" data-world-primitive-kind="' + escapeHtml(kind) + '">' + escapeHtml(text) + '</button>';
    };
    function buildPrimitiveIndex() {
      const map = new Map();
      const add = (kind, value, where = '') => {
        const text = String(value ?? '');
        if (!text) return;
        if (!map.has(kind)) map.set(kind, new Map());
        const bucket = map.get(kind);
        if (!bucket.has(text)) bucket.set(text, { value: text, count: 0, where: new Set() });
        const entry = bucket.get(text);
        entry.count += 1;
        if (where) entry.where.add(where);
      };
      const visitTyped = (value, where) => {
        if (!value || typeof value !== 'object') return;
        if (value.type === 'string') add('string', value.value, where);
        else if (value.type === 'number') add('number', value.value, where);
        else if (value.type === 'boolean') add('boolean', value.value, where);
        else if (value.type === 'null') add('null', 'null', where);
        else if (value.type === 'ref') { if (!byId[value.target]) add('unresolved-ref', value.target, where); }
        else if (value.type === 'list') (value.items || []).forEach(x => visitTyped(x, where));
        else if (value.type === 'record') Object.values(value.fields || {}).forEach(x => visitTyped(x, where));
      };
      for (const n of nodes) {
        add('kind', n.kind || 'thing', n.id);
        if (n.context && !byId[n.context]) add('context', n.context, n.id);
        for (const p of [...(n.properties || []), ...(n.values || [])]) visitTyped(p.value, n.id + '.' + p.key);
        for (const b of n.badges || []) add('badge', b.label || b, n.id);
      }
      for (const e of edges) {
        add('relation', e.rel, e.from + '→' + e.to);
        for (const p of e.properties || []) {
          if (typeof p.value === 'string' || typeof p.value === 'number' || typeof p.value === 'boolean') add('association-property', p.value, e.rel + '.' + p.key);
        }
      }
      return map;
    }
    const renderInspector = () => {
      if (state.worldGraphSelectedKind) {
        const kind = state.worldGraphSelectedKind;
        const matches = nodes.filter(n => (n.kind || 'thing') === kind).sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
        return '<h2>' + escapeHtml(kind) + ' list</h2>' +
          '<div class="world-inspector-row"><span class="world-inspector-key">count</span><span>' + matches.length + '</span></div>' +
          '<button class="world-ref-button" data-world-clear-kind>Back to selected object</button>' +
          '<div class="world-inspector-list">' + matches.map(n =>
            '<button class="world-inspector-item" data-world-select="' + escapeHtml(n.id) + '"><strong>' + escapeHtml(n.label || n.id) + '</strong><br><span class="world-node-kind">' + escapeHtml(n.context || '') + '</span></button>'
          ).join('') + '</div>';
      }
      const node = byId[selectedId];
      const incoming = edges.filter(e => e.to === selectedId).slice(0, 24);
      const outgoing = edges.filter(e => e.from === selectedId).slice(0, 24);
      if (!node) return '<h2>Selection</h2><p>Select a node in the graph.</p>';
      const rows = [
        ['id', linkRef(node.id)],
        ['label', escapeHtml(String(node.label || node.id))],
        ['kind', linkKind(node.kind || 'thing')],
        ['context', node.context ? linkRef(node.context) : ''],
        ['href', node.href ? escapeHtml(String(node.href)) : '']
      ].filter(([, v]) => v !== null && v !== undefined && String(v) !== '');
      const badges = (node.badges || []).map(b => '<span class="world-badge">' + escapeHtml(String(b.label || b)) + '</span>').join('');
      const valueRef = value => {
        if (typeof value === 'string' && byId[value]) return linkRef(value);
        if (typeof value === 'string') return linkPrimitive('string', value);
        if (typeof value === 'number') return linkPrimitive('number', value);
        if (typeof value === 'boolean') return linkPrimitive('boolean', value);
        if (Array.isArray(value)) return '<span class="world-value-list">' + value.map(valueRef).join('') + '</span>';
        if (value && typeof value === 'object') return renderTypedValue(value);
        return linkPrimitive('null', value ?? 'null');
      };
      const renderTypedValue = value => {
        if (!value || typeof value !== 'object' || !value.type) return '<code>' + escapeHtml(JSON.stringify(value)) + '</code>';
        const type = '<span class="world-value-type">' + escapeHtml(value.type) + '</span>';
        if (value.type === 'ref') return '<span class="world-value-widget">' + type + linkRef(value.target) + '</span>';
        if (value.type === 'list') return '<span class="world-value-widget">' + type + '<span class="world-value-list">' + (value.items || []).map(renderTypedValue).join('') + '</span></span>';
        if (value.type === 'record') {
          const rows = Object.entries(value.fields || {}).map(([k, v]) => '<span class="world-value-record-row"><span class="world-inspector-key">' + escapeHtml(k) + '</span><span>' + renderTypedValue(v) + '</span></span>').join('');
          return '<span class="world-value-widget">' + type + '<span class="world-value-record">' + rows + '</span></span>';
        }
        const primitiveValue = value.value ?? (value.type === 'null' ? 'null' : '');
        return '<span class="world-value-widget">' + type + '<span>' + linkPrimitive(value.type, primitiveValue) + '</span></span>';
      };
      const propertyList = (title, props) => '<div class="world-inspector-list"><strong>' + title + '</strong>' + ((props || []).length ? props.map(p =>
        '<div class="world-inspector-row"><span class="world-inspector-key">' + escapeHtml(p.key) + '</span><span>' + valueRef(p.value) + '</span></div>'
      ).join('') : '<div class="world-node-kind">none</div>') + '</div>';
      const edgeItem = (e, dir) => {
        const other = dir === 'in' ? e.from : e.to;
        const props = (e.properties || []).length ? '<div class="world-edge-props">' + e.properties.map(p => '<span class="world-badge">' + escapeHtml(p.key) + '=' + escapeHtml(JSON.stringify(p.value)) + '</span>').join('') + '</div>' : '';
        return '<div class="world-inspector-item">' + linkRef(other) + '<br><span class="world-node-kind">' + escapeHtml(e.rel || '') + '</span>' + props + '</div>';
      };
      const edgeList = (title, list, dir) => '<div class="world-inspector-list"><strong>' + title + '</strong>' + (list.length ? list.map(e => edgeItem(e, dir)).join('') : '<div class="world-node-kind">none</div>') + '</div>';
      const associationPropertyList = (node.associationProperties || []).length ? '<div class="world-inspector-list"><strong>Association properties</strong>' + node.associationProperties.slice(0, 24).map(a =>
        '<div class="world-inspector-item">' + linkRef(a.from) + ' <span class="world-node-kind">' + escapeHtml(a.rel) + '</span> ' + linkRef(a.to) +
        '<div class="world-edge-props">' + (a.properties || []).map(p => '<span class="world-badge">' + escapeHtml(p.key) + '=' + escapeHtml(JSON.stringify(p.value)) + '</span>').join('') + '</div></div>'
      ).join('') + '</div>' : '';
      const sourceList = (node.sources || []).length ? '<div class="world-inspector-list"><strong>Source definition</strong>' + node.sources.slice(-6).reverse().map(src =>
        '<div class="world-inspector-item"><div>' + escapeHtml(src.section || '') + '</div><button class="world-ref-button" data-world-source-file="' + escapeHtml(src.file || '') + '" data-world-source-focus="' + escapeHtml(node.id) + '">' + escapeHtml(src.file || '') + (src.line != null ? ' (line ' + src.line + ')' : '') + '</button><pre class="world-source-ast">' + escapeHtml(JSON.stringify(src.values || {}, null, 2)) + '</pre></div>'
      ).join('') + '</div>' : '';
      return '<h2>Selected Object</h2>' +
        rows.map(([k, v]) => '<div class="world-inspector-row"><span class="world-inspector-key">' + escapeHtml(k) + '</span><span>' + v + '</span></div>').join('') +
        '<div class="world-badges">' + badges + '</div>' +
        propertyList('Object properties', node.properties) +
        propertyList('Values', node.values) +
        edgeList('Associations from this object', outgoing, 'out') +
        edgeList('Associations to this object', incoming, 'in') +
        associationPropertyList +
        sourceList;
    };
    const sourceDefinitionRange = (text, focusId) => {
      const node = byId[focusId] || byId[selectedId];
      const src = (node?.sources || []).slice(-1)[0];
      if (!src || !text) return null;
      const lines = text.split(/\r?\n/);
      if (src.line != null) {
        const startLine = src.line - 1;
        let endLine = lines.length - 1;
        for (let i = startLine + 1; i < lines.length; i++) {
          if (/^\s*\[\[?/.test(lines[i]) && i > startLine) { endLine = i - 1; break; }
        }
        return { start: startLine, end: endLine };
      }
      const candidates = [src.values?.id, src.values?.soul, src.values?.version, focusId].filter(Boolean).map(String);
      const section = src.section ? '[[' + src.section + ']]' : null;
      let startLine = -1;
      for (let i = 0; i < lines.length; i++) {
        const nearSection = !section || lines[i].trim() === section;
        const hasCandidate = candidates.some(c => lines[i].includes('"' + c + '"') || lines[i].includes(c));
        if (nearSection || hasCandidate) {
          if (nearSection) {
            for (let j = i; j < Math.min(lines.length, i + 12); j++) {
              if (candidates.some(c => lines[j].includes('"' + c + '"') || lines[j].includes(c))) { startLine = i; break; }
            }
          }
          if (startLine < 0 && hasCandidate) startLine = Math.max(0, i - 2);
          if (startLine >= 0) break;
        }
      }
      if (startLine < 0) return null;
      let endLine = lines.length - 1;
      for (let i = startLine + 1; i < lines.length; i++) {
        if (/^\s*\[\[?/.test(lines[i]) && i > startLine + 1) { endLine = i - 1; break; }
      }
      return { start: startLine, end: endLine };
    };
    const renderSourceText = (text, focusId) => {
      const range = sourceDefinitionRange(text, focusId);
      const ids = Object.keys(byId).filter(id => id && id.length > 2).sort((a, b) => b.length - a.length).slice(0, 400);
      const linkLine = line => {
        let out = escapeHtml(line);
        for (const id of ids) {
          const escaped = escapeHtml(id).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          out = out.replace(new RegExp('(&quot;)?\\b' + escaped + '\\b(&quot;)?', 'g'), match => '<button class="world-source-ref" data-world-select="' + escapeHtml(id) + '">' + match + '</button>');
        }
        return out;
      };
      return text.split(/\r?\n/).map((line, i) => {
        const highlighted = range && i >= range.start && i <= range.end;
        const lineNumAttrs = highlighted && focusId ? ' data-world-jump-to-graph="' + escapeHtml(focusId) + '" title="Jump to object in graph"' : '';
        return '<div class="world-source-line ' + (highlighted ? 'world-source-highlight' : '') + '"><span class="world-source-line-number"' + lineNumAttrs + '>' + (i + 1) + '</span><span class="world-source-line-code">' + linkLine(line) + '</span></div>';
      }).join('');
    };
    const renderSourceDocument = () => {
      const doc = state.worldGraphSource;
      const selectedFile = doc?.file || sourceFiles[0]?.file || '';
      const sidebar = '<aside class="world-source-sidebar"><strong>Source files</strong>' + (sourceFiles.length ? sourceFiles.map(src => '<button class="world-source-file-button ' + (src.file === selectedFile ? 'world-source-file-active' : '') + '" data-world-source-file="' + escapeHtml(src.file || '') + '">' + escapeHtml((src.file || '').split(/[\\/]/).slice(-2).join('/')) + '</button>').join('') : '<div class="world-source-empty">No witnessed source files.</div>') + '</aside>';
      const body = doc
        ? '<section class="world-source-editor"><div class="world-source-title">' + escapeHtml(doc.file || 'Source') + '</div><div class="world-source-code">' + renderSourceText(doc.text || '', state.worldGraphSourceFocus || selectedId) + '</div></section>'
        : '<section class="world-source-editor"><div class="world-source-title">Source Browser</div><div class="world-source-empty">Select a source file. Definitions linked to the selected object will be highlighted.</div></section>';
      return '<div class="world-document-view"><div class="world-source-workbench">' + sidebar + body + '</div></div>';
    };
    const renderThingList = () => {
      const kinds = [...new Set(nodes.map(n => n.kind || 'thing'))].sort();
      const selectedKind = state.worldGraphSelectedKind || 'thing';
      const items = nodes.filter(n => (n.kind || 'thing') === selectedKind).sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
      return '<div class="world-primitive-browser"><h2>Thing List</h2><div class="world-primitive-grid"><div class="world-primitive-list"><strong>Kinds</strong>' + kinds.map(k => '<button class="world-primitive-item" data-world-kind="' + escapeHtml(k) + '">' + escapeHtml(k) + ' <span class="world-node-kind">' + nodes.filter(n => (n.kind || 'thing') === k).length + '</span></button>').join('') + '</div><div class="world-primitive-list" style="grid-column: span 2"><strong>' + escapeHtml(selectedKind) + '</strong>' + items.map(n => '<button class="world-primitive-item" data-world-select="' + escapeHtml(n.id) + '"><strong>' + escapeHtml(n.label || n.id) + '</strong><br><span class="world-node-kind">' + escapeHtml(n.context || '') + '</span></button>').join('') + '</div></div></div>';
    };
    const renderProcessExplorer = () => '<div class="world-primitive-browser"><h2>Process Explorer</h2><div class="world-primitive-list"><a class="world-primitive-item" href="/process"><strong>Open Process View</strong><br><span class="world-node-kind">Dedicated process graph, run inspector, and replay</span></a></div></div>';
    const renderPrimitiveBrowser = () => {
      const selectedKind = state.worldGraphSelectedPrimitiveKind || [...primitiveIndex.keys()][0] || '';
      const bucket = primitiveIndex.get(selectedKind) || new Map();
      const selectedValue = state.worldGraphSelectedPrimitiveValue || '';
      const kinds = [...primitiveIndex.keys()].sort();
      const items = [...bucket.values()].sort((a, b) => a.value.localeCompare(b.value));
      const selectedItem = bucket.get(selectedValue) || items[0] || null;
      const refs = selectedItem ? [...selectedItem.where].sort() : [];
      return '<div class="world-primitive-browser"><h2>Primitive browser</h2><div class="world-primitive-grid"><div class="world-primitive-list"><strong>Kinds</strong>' + kinds.map(k => '<button class="world-primitive-item" data-world-primitive-kind-only="' + escapeHtml(k) + '">' + escapeHtml(k) + ' <span class="world-node-kind">' + (primitiveIndex.get(k)?.size || 0) + '</span></button>').join('') + '</div><div class="world-primitive-list"><strong>' + escapeHtml(selectedKind || 'none') + '</strong>' + items.map(item => '<button class="world-primitive-item" data-world-primitive="' + escapeHtml(item.value) + '" data-world-primitive-kind="' + escapeHtml(selectedKind) + '">' + escapeHtml(item.value) + '<br><span class="world-node-kind">count ' + item.count + '</span></button>').join('') + '</div><div class="world-primitive-list"><strong>References</strong>' + refs.map(ref => { const id = String(ref).split('.')[0].split('→')[0]; return '<button class="world-primitive-item" data-world-select="' + escapeHtml(byId[id] ? id : '') + '" data-world-primitive-ref="' + escapeHtml(ref) + '">' + escapeHtml(ref) + '</button>'; }).join('') + '</div></div></div>';
    };
    const marker = '<defs><marker id="world-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L7,3 z" fill="#777" /></marker><marker id="world-arrow-owner" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L7,3 z" fill="#c7352f" /></marker></defs>';
    const renderCanvas = () => {
      if (currentMode() === 'source') return renderSourceDocument();
      if (currentMode() === 'primitive') return renderPrimitiveBrowser();
      if (currentMode() === 'things') return renderThingList();
      if (currentMode() === 'process') return renderProcessExplorer();
      const svg = '<svg class="world-graph-svg" width="' + width + '" height="' + height + '">' + marker + edges.map(e => {
        const a = byId[e.from], b = byId[e.to];
        if (!a || !b) return '';
        const x1 = (a.x || 0) + 190, y1 = (a.y || 0) + 28, x2 = (b.x || 0), y2 = (b.y || 0) + 28;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const style = e.style || 'relation';
        const markerId = style === 'ownership' ? 'world-arrow-owner' : 'world-arrow';
        return '<line class="world-edge-' + escapeHtml(style) + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" marker-end="url(#' + markerId + ')" />' +
          '<text class="world-edge-label" x="' + mx + '" y="' + (my - 3) + '">' + escapeHtml(String(e.rel || '')) + '</text>';
      }).join('') + '</svg>';
      const groupHtml = groups.map(g => '<div class="world-context-box" style="left:' + (g.x || 0) + 'px;top:' + (g.y || 0) + 'px;width:' + (g.width || 0) + 'px;height:' + (g.height || 0) + 'px"><div class="world-context-label">' + escapeHtml(g.label || g.id || '') + '</div></div>').join('');
      const html = nodes.map(n => '<div class="world-node world-node-' + escapeHtml(n.kind || 'thing') + (n.id === selectedId ? ' world-node-selected' : '') + '" data-world-node-id="' + escapeHtml(n.id) + '" style="left:' + (n.x || 0) + 'px;top:' + (n.y || 0) + 'px">' +
        '<div class="world-node-kind">' + escapeHtml(n.kind || 'thing') + '</div>' +
        '<a href="' + escapeHtml(n.href || '#') + '" title="' + escapeHtml(n.id) + '">' + escapeHtml(String(n.label || n.id)) + '</a>' +
        '<div class="world-badges">' + (n.badges || []).map(b => '<span class="world-badge">' + escapeHtml(String(b.label || b)) + '</span>').join('') + '</div>' +
        '</div>').join('');
      return '<div class="world-graph-canvas"><div class="world-graph-content" style="width:' + width + 'px;height:' + height + 'px">' + groupHtml + svg + html + '</div></div>';
    };
    const openSourceFile = async (file, focusId = selectedId) => {
      if (!file) return;
      state.worldGraphSourceFocus = focusId || selectedId;
      const res = await fetch('/api/source?file=' + encodeURIComponent(file), requestOptions({}, { url: '/api/source' }));
      state.worldGraphSource = await res.json().catch(() => ({ file, text: 'Failed to load source' }));
      state.worldGraphMode = 'source';
      state.worldGraphPrimitiveMode = false;
    };
    const openSourceForSelected = async () => {
      const src = (byId[selectedId]?.sources || []).slice(-1)[0];
      if (src?.file) await openSourceFile(src.file, selectedId);
    };
    const draw = () => {
      root.innerHTML = '<div class="world-graph-shell"><aside class="world-graph-inspector" data-world-inspector>' + renderInspector() + '</aside><section class="world-main-pane">' + renderModeMenu() + renderCanvas() + '</section></div>';
      root.querySelectorAll('[data-world-mode]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          state.worldGraphMode = el.getAttribute('data-world-mode') || 'graph';
          if (state.worldGraphMode !== 'source') state.worldGraphSource = null;
          if (state.worldGraphMode === 'source' && !state.worldGraphSource) await openSourceForSelected();
          draw();
        });
      });
      root.querySelectorAll('[data-world-node-id], [data-world-select]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          selectedId = el.getAttribute('data-world-node-id') || el.getAttribute('data-world-select');
          if (!selectedId) return;
          state.worldGraphSelectedId = selectedId;
          state.worldGraphSelectedKind = '';
          state.worldGraphPrimitiveMode = false;
          if (currentMode() === 'source') await openSourceForSelected();
          else state.worldGraphSource = null;
          draw();
        });
      });
      root.querySelectorAll('[data-world-kind]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          state.worldGraphSelectedKind = el.getAttribute('data-world-kind') || '';
          draw();
        });
      });
      root.querySelectorAll('[data-world-clear-kind]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          state.worldGraphSelectedKind = '';
          draw();
        });
      });
      root.querySelectorAll('[data-world-source-file]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          const file = el.getAttribute('data-world-source-file') || '';
          await openSourceFile(file, el.getAttribute('data-world-source-focus') || state.worldGraphSourceFocus || selectedId);
          draw();
        });
      });
      root.querySelectorAll('[data-world-jump-to-graph]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          const id = el.getAttribute('data-world-jump-to-graph');
          if (!id) return;
          selectedId = id;
          state.worldGraphSelectedId = id;
          state.worldGraphSelectedKind = '';
          state.worldGraphSource = null;
          state.worldGraphMode = 'graph';
          draw();
        });
      });
      root.querySelectorAll('[data-world-close-source]').forEach(el => {
        el.addEventListener('click', event => { event.preventDefault(); state.worldGraphSource = null; state.worldGraphMode = 'graph'; draw(); });
      });
      root.querySelectorAll('[data-world-primitive], [data-world-primitive-kind-only]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          state.worldGraphMode = 'primitive';
          state.worldGraphPrimitiveMode = true;
          state.worldGraphSource = null;
          state.worldGraphSelectedPrimitiveKind = el.getAttribute('data-world-primitive-kind') || el.getAttribute('data-world-primitive-kind-only') || state.worldGraphSelectedPrimitiveKind || '';
          state.worldGraphSelectedPrimitiveValue = el.getAttribute('data-world-primitive') || '';
          draw();
        });
      });
      root.querySelectorAll('[data-world-close-primitive]').forEach(el => {
        el.addEventListener('click', event => { event.preventDefault(); state.worldGraphPrimitiveMode = false; state.worldGraphMode = 'graph'; draw(); });
      });
      const selected = byId[selectedId];
      const canvas = root.querySelector('.world-graph-canvas');
      if (selected && canvas && currentMode() === 'graph') {
        canvas.scrollLeft = Math.max(0, (selected.x || 0) - canvas.clientWidth / 2 + 95);
        canvas.scrollTop = Math.max(0, (selected.y || 0) - canvas.clientHeight / 2 + 28);
      }
    };
    draw();
  };
  const initSession = async () => {
    const res = await fetch('/api/session', requestOptions({}, { url: '/api/session' }));
    const body = await res.json().catch(() => ({ authenticated: false }));
    if (!res.ok) throw new Error(body?.error || 'session request failed');
    syncSession(body);
  };
  const setSession = async ({ from }) => {
    const credentials = state[from] || {};
    const res = await fetch('/api/session', requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: credentials.username || '',
        password: credentials.password || ''
      })
    }, { url: '/api/session' }));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || 'session request failed');
    syncSession(body);
  };
  const logout = async () => {
    const res = await fetch('/api/session', requestOptions({ method: 'DELETE' }, { url: '/api/session' }));
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || 'logout failed');
    }
    syncSession({ authenticated: false, identity: null, actor: null, label: null, perspective: null });
  };
  const formForWidget = widget => {
    const el = byWidget(widget);
    if (!el) return null;
    return el.matches?.('form') ? el : el.querySelector?.('form') || null;
  };
  const readTypedForm = (data, schema) => {
    const result = validateProcessInput(typeModel, schema, data, { coerceStrings: true });
    if (result.ok) return result.value;
    const first = result.failures?.[0];
    throw new Error(first?.reason || ('typed validation failed for ' + schema));
  };
  const readForm = ({ widget, into, schema }) => {
    const form = formForWidget(widget);
    if (!form) throw new Error('widget ' + widget + ' does not contain a form');
    const data = Object.fromEntries(new FormData(form).entries());
    state[into] = schema ? readTypedForm(data, schema) : data;
  };
  const clearForm = ({ widget }) => { formForWidget(widget)?.reset?.(); };
  const bindSubmitHandlers = () => {
    for (const step of program.steps.filter(s => s.event && s.event.startsWith('submit:'))) {
      const widget = step.event.slice('submit:'.length);
      const form = byWidget(widget);
      if (form && !form.__witnessBound) {
        form.__witnessBound = true;
        form.addEventListener('submit', event => { event.preventDefault(); safeRun('submit:' + widget); });
      }
    }
  };
  const refreshProjection = async () => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const res = await fetch(window.location.href, requestOptions({}, { url: window.location.pathname }));
      if (!res.ok) throw new Error('projection refresh failed');
      const html = await res.text();
      const nextDocument = new DOMParser().parseFromString(html, 'text/html');
      const nextProgramEl = nextDocument.getElementById('witness-frontend-program');
      if (nextProgramEl?.textContent) {
        program = JSON.parse(nextProgramEl.textContent);
        config = program.config || {};
        typeModel = config.typeModel || {};
      }
      const nextRoot = nextDocument.querySelector('[data-widget="' + CSS.escape(program.rootWidget) + '"]');
      const currentRoot = byWidget(program.rootWidget);
      if (!nextRoot || !currentRoot) throw new Error('projection root not found');
      currentRoot.replaceWith(nextRoot);
      document.querySelectorAll('[data-widget-template]').forEach(node => node.remove());
      const currentProgramEl = document.getElementById('witness-frontend-program');
      const templateAnchor = currentProgramEl || document.body.lastChild;
      nextDocument.querySelectorAll('[data-widget-template]').forEach(template => {
        const clone = template.cloneNode(true);
        if (templateAnchor?.parentNode) templateAnchor.parentNode.insertBefore(clone, templateAnchor);
        else document.body.appendChild(clone);
      });
      if (currentProgramEl && nextProgramEl?.textContent) currentProgramEl.textContent = nextProgramEl.textContent;
      bindSubmitHandlers();
      await safeRun('load');
    })();
    try {
      await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  };
  const bootLiveProjection = () => {
    if (!config.liveProjection || liveProjectionStarted) return;
    liveProjectionStarted = true;
    const stream = new EventSource('/api/events');
    stream.onmessage = event => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (!liveProjectionProcesses.has(payload.process)) return;
        void refreshProjection();
      } catch {}
    };
  };
  const resolveBody = ({ from, pick, body }) => {
    if (body) return interpolateValue(body, scopeFor({}));
    const source = state[from] || {};
    if (!pick) return source;
    const out = {};
    for (const key of pick) out[key] = source[key];
    return out;
  };
  const stepTraceMeta = (step, event, runId, extra = {}) => ({
    runId,
    program: program.id || '',
    event,
    nodeId: step?.id || '',
    op: step?.op || '',
    frontier: Array.isArray(step?.after) ? [...step.after] : [],
    repeat: step?.repeat ?? null,
    ...extra
  });
  async function run(event, eventData = {}, { runId = makeRunId() } = {}) {
    state.event = eventData;
    const nodes = (program.graph || program.steps || []).filter(s => s.event === event);
    await recordProcessEvent('frontend.process.start', {
      runId,
      program: program.id || '',
      event,
      status: 'start',
      eventData
    });
    try {
      await runProcessGraph(
        nodes,
        event,
        async (node, nextState, executionScope) => {
          await executeStep(node, { runId, stateRef: nextState, executionScope });
        },
        state,
        {
          onNodeStart: async node => {
            await recordProcessEvent('frontend.step.start', stepTraceMeta(node, event, runId, { status: 'start' }));
          },
          onNodeSkipped: async node => {
            await recordProcessEvent('frontend.step.skipped', stepTraceMeta(node, event, runId, { status: 'skipped' }));
          },
          onNodeDone: async (node, meta) => {
            await recordProcessEvent('frontend.step.done', stepTraceMeta(node, event, runId, {
              status: 'done',
              repeatCount: meta.count ?? null
            }));
          },
          onNodeFailed: async (node, error) => {
            await recordProcessEvent('frontend.step.failed', stepTraceMeta(node, event, runId, {
              status: 'failed',
              message: error instanceof Error ? error.message : String(error)
            }));
          }
        }
      );
      await recordProcessEvent('frontend.process.done', {
        runId,
        program: program.id || '',
        event,
        status: 'done'
      });
    } catch (error) {
      await recordProcessEvent('frontend.process.failed', {
        runId,
        program: program.id || '',
        event,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  const hasEventHandlers = event => (program.graph || program.steps || []).some(step => step.event === event);
  async function dispatchError(error, event, step = null) {
    if (event === 'error') throw error;
    if (!hasEventHandlers('error')) throw error;
    await run('error', {
      message: error instanceof Error ? error.message : String(error),
      event,
      stepId: step?.id || '',
      op: step?.op || ''
    });
  }
  async function safeRun(event, eventData = {}, step = null) {
    try {
      await run(event, eventData);
    } catch (error) {
      await dispatchError(error, event, step);
    }
  }
  async function executeStep(step, { runId, stateRef = state, executionScope = {} }) {
    const p = interpolateValue(step.params || {}, scopeFor(executionScope));
    try {
      await withTraceContext(runId, step.id, async () => {
        if (step.op === 'initSession') await initSession(p);
        if (step.op === 'setSession') await setSession(p);
        if (step.op === 'logout') await logout(p);
        if (step.op === 'setText') setText(p.widget, p.text || '');
        if (step.op === 'setValue') setValue(p.widget, p.value ?? '');
        if (step.op === 'fetchJson') {
          const res = await fetch(p.url, requestOptions({}, { url: p.url }));
          stateRef[p.into] = await res.json().catch(() => ({}));
          if (!res.ok && !p.allowFailure) throw new Error(stateRef[p.into]?.error || 'request failed');
        }
        if (step.op === 'renderCollection') renderCollection(p);
        if (step.op === 'renderWorldGraph') renderWorldGraph(p);
        if (step.op === 'readForm') readForm(p);
        if (step.op === 'refreshProjection') await refreshProjection();
        if (step.op === 'reloadPage') window.location.reload();
        if (step.op === 'postJson' || step.op === 'patchJson' || step.op === 'deleteJson') {
          const method = step.op === 'postJson' ? (p.method || 'POST') : step.op === 'patchJson' ? (p.method || 'PATCH') : (p.method || 'DELETE');
          const options = requestOptions({ method, headers: { 'content-type': 'application/json' } }, { url: p.url });
          if (step.op !== 'deleteJson') options.body = JSON.stringify(resolveBody(p));
          const res = await fetch(p.url, options);
          stateRef[p.into || 'lastResponse'] = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(stateRef[p.into || 'lastResponse'].error || 'request failed');
        }
        if (step.op === 'clearForm') clearForm(p);
        if (step.op === 'run') await run(p.event, stateRef.event);
      });
    } catch (error) {
      throw error;
    }
  }
  bindSubmitHandlers();
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    event.preventDefault();
    safeRun('click:' + button.dataset.action, { ...button.dataset, done: button.dataset.done === 'true' });
  });
  bootLiveProjection();
  safeRun('load');
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
})();`;
  return `<script type="application/json" id="witness-frontend-program">${json}</script>\n<script>\n${engine}\n</script>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}
