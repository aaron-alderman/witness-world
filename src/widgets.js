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
import { TODO_TUTORIAL_ID, tutorialDefinition } from "./tutorials.js";
import { resolveEdenPageTheme } from "./eden-page-theme.js";

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
  const state = projectWidgetState(witnesses);
  return [...state.widgets.values()]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(widget => ({ id: widget.id, kind: widget.kind, props: { ...(widget.props ?? {}) }, context: contexts.get(widget.id) ?? null }));
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
  const pageTheme = resolveEdenPageTheme(appConfig.pageChrome || {});
  const bodyAttrs = [
    appConfig.page ? `data-page="${escapeAttr(appConfig.page)}"` : "",
    pageTheme.themeId ? `data-page-theme="${escapeAttr(pageTheme.themeId)}"` : "",
    pageTheme.material ? `data-page-material="${escapeAttr(pageTheme.material)}"` : "",
    pageTheme.typography ? `data-page-typography="${escapeAttr(pageTheme.typography)}"` : ""
  ].filter(Boolean).join(" ");
  const options = { excludeRoles: new Set(appConfig.excludeWidgetRoles ?? []), typeModel };
  return `<!doctype html>\n<html>\n${renderHead(title, pageTheme)}\n<body${bodyAttrs ? " " + bodyAttrs : ""}>\n${renderWidget(root, options)}\n${templates.map(template => renderWidgetTemplate(template, options)).join("\n")}\n${program ? renderClientEngine({ ...program, config: { ...appConfig, typeModel, pageChrome: pageTheme } }) : ""}\n${appConfig.tutorial ? renderTutorialClient(appConfig.tutorial) : ""}\n</body>\n</html>`;
}

function renderHead(title, pageTheme = resolveEdenPageTheme()) {
  const tokens = pageTheme.tokens || resolveEdenPageTheme().tokens;
  return `<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      --page-bg: ${tokens.pageBackground};
      --surface-bg: ${tokens.surface};
      --surface-strong: ${tokens.surfaceStrong};
      --surface-border: ${tokens.border};
      --surface-shadow: ${tokens.panelShadow};
      --accent: ${tokens.accent};
      --ink: ${tokens.ink};
      --muted: ${tokens.muted};
      --input-bg: ${tokens.input};
      --button-bg: ${tokens.button};
      --panel-radius: ${tokens.panelRadius};
      --texture-opacity: ${tokens.textureOpacity};
      --body-font: ${tokens.bodyFont};
      --heading-font: ${tokens.headingFont};
    }
    body {
      font-family: var(--body-font);
      max-width: 920px;
      margin: 40px auto;
      padding: 0 24px;
      color: var(--ink);
      background:
        radial-gradient(circle at top, rgba(255,255,255,0.38), transparent 34%),
        linear-gradient(180deg, rgba(255,255,255,var(--texture-opacity)) 0%, rgba(255,255,255,0) 22%),
        var(--page-bg);
    }
    body[data-page="world"] { max-width: none; margin: 0; padding: 0; overflow: hidden; }
    body[data-page="world"] main { height: 100vh; display: grid; grid-template-rows: auto 1fr; gap: 0; overflow: hidden; }
    body[data-page="world"] h1 { font-size: 1.05rem; margin: 4px 14px 6px; line-height: 1.2; }
    body[data-page="world"] .world-graph-link { padding: 6px 14px; display: inline-block; font-size: 13px; }
    body[data-actor="aaron"] { --accent: #375a7f; }
    body[data-actor="callan"] { --accent: #6b4f8a; }
    body[data-actor="adam"] { --accent: #667a3a; }
    h1, h2 { font-family: var(--heading-font); }
    h1 { color: var(--accent, #333); }
    main { display: grid; gap: 18px; }
    form { display: flex; gap: 8px; margin: 8px 0; }
    select { padding: 10px; border: 1px solid var(--surface-border); border-radius: 8px; background: var(--input-bg); color: var(--ink); }
    input { flex: 1; padding: 10px; border: 1px solid var(--surface-border); border-radius: 8px; background: var(--input-bg); color: var(--ink); }
    button { padding: 8px 12px; cursor: pointer; border: 1px solid var(--surface-border); border-radius: 999px; background: var(--button-bg); color: var(--ink); }
    button:hover { background: var(--surface-strong); }
    ul { list-style: none; padding: 0; margin: 0; }
    li, .todo-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.08); }
    li.done .todo-title, .todo-row.done .todo-title { text-decoration: line-through; color: var(--muted); }
    .status { min-height: 1.5em; color: var(--muted); }
    .todo-actions { margin-left: auto; display: flex; gap: 6px; }
    .session-panel, .private-notes, .witness-inspector, .widget-editor, .version-playground {
      border: 1px solid var(--surface-border);
      border-radius: var(--panel-radius);
      padding: 12px;
      background: var(--surface-bg);
      box-shadow: var(--surface-shadow);
    }
    .session-panel { border-left: 6px solid var(--accent, #ddd); }
    .value-editor-field { display: grid; gap: 4px; min-width: 0; flex: 1; }
    .private-note-list { display: grid; gap: 6px; margin-top: 8px; }
    .private-note { padding: 8px; border-radius: 8px; background: var(--input-bg); border: 1px solid rgba(0,0,0,0.08); }
    .witness-inspector { }
    .witness-inspector h2 { font-size: 1rem; margin: 0 0 8px; }
    code, pre, textarea { font-family: var(--mono); }
    textarea { font-size: 12px; line-height: 1.45; }
    .witness-list { max-height: 260px; overflow: auto; font-family: var(--mono); font-size: 12px; }
    .witness { display: grid; grid-template-columns: 150px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid #eee; }
    .witness-process { font-weight: 700; }
    .witness-body { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .widget-editor, .version-playground { border-left: 6px solid var(--surface-border); }
    .widget-editor input, .widget-editor select, .widget-editor textarea, [data-role="widget-editor-form"] input, [data-role="widget-editor-form"] select, [data-role="widget-editor-form"] textarea { font-family: var(--mono); }
    .world-graph { border: 0; border-radius: 0; padding: 0; background: #fafafa; height: 100%; min-height: 0; overflow: hidden; }
    .world-graph h2 { font-size: 1rem; margin: 0 0 8px; }
    .world-graph-shell { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 0; align-items: stretch; height: 100%; max-height: 100%; overflow: hidden; border-top: 1px solid #e5e5e5; }
    .world-main-pane { display: grid; grid-template-rows: auto 1fr; min-height: 0; overflow: hidden; }
    .world-mode-menu { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #e5e5e5; background: #fbfbfb; overflow-x: auto; white-space: nowrap; flex-wrap: nowrap; min-height: 35px; box-sizing: border-box; }
    .world-mode-spacer { flex: 1 1 auto; min-width: 16px; }
    .world-mode-button { border-radius: 999px; padding: 5px 11px; font-size: 12px; }
    .world-mode-active { background: var(--accent, #375a7f); color: white; border-color: var(--accent, #375a7f); }
    .world-command-toggle { border-radius: 999px; padding: 5px 11px; font-size: 12px; }
    .world-command-hint { color: #777; font-size: 11px; font-family: var(--mono); }
    .world-command-palette { border-bottom: 1px solid #e5e5e5; background: #fff; padding: 12px; display: grid; gap: 10px; }
    .world-command-head { display: flex; gap: 8px; align-items: center; }
    .world-command-input { flex: 1 1 auto; min-width: 0; font: 13px var(--mono); padding: 9px 11px; border: 1px solid #ddd; border-radius: 10px; }
    .world-command-list { display: grid; gap: 6px; max-height: 320px; overflow: auto; }
    .world-command-item { text-align: left; border: 1px solid #eee; border-radius: 8px; padding: 8px 10px; background: #fafafa; cursor: pointer; }
    .world-command-item strong { display: block; font-size: 13px; }
    .world-command-meta { color: #777; font-size: 11px; font-family: var(--mono); }
    .world-command-empty { color: #777; font-size: 12px; padding: 6px 2px; }
    .world-graph-inspector { border-right: 1px solid #ddd; background: #fff; padding: 14px; min-height: 0; height: 100%; max-height: 100%; overflow-y: scroll; overflow-x: hidden; font-size: 12px; box-sizing: border-box; }
    .world-graph-inspector h2 { margin: 0 0 8px; font-size: 1rem; }
    .world-tutorial-panel { display: grid; gap: 10px; margin-bottom: 14px; padding: 12px; border: 1px solid #ddd; border-radius: 10px; background: #faf8f1; }
    .world-tutorial-panel h2 { margin: 0; font-size: 1rem; }
    .world-tutorial-meta { color: #777; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .world-tutorial-summary { color: #555; line-height: 1.5; }
    .world-tutorial-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .world-tutorial-list { display: grid; gap: 6px; }
    .world-tutorial-item { border: 1px solid #e8e1cf; border-radius: 8px; padding: 8px 9px; background: rgba(255,255,255,.78); }
    .world-tutorial-item p { margin: 4px 0 0; color: #555; line-height: 1.45; }
    .world-inspector-row { display: grid; grid-template-columns: 84px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f2f2f2; }
    .world-inspector-key { color: #777; font-weight: 700; }
    .world-inspector-list { display: grid; gap: 4px; margin-top: 8px; }
    .world-inspector-item { border: 1px solid #eee; border-radius: 6px; padding: 5px 7px; background: #fafafa; text-align: left; cursor: pointer; }
    .world-version-item { display: grid; gap: 6px; }
    .world-version-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .world-version-status { margin-top: 8px; padding: 8px 10px; border-radius: 6px; background: #f6f6f6; border: 1px solid #e4e4e4; }
    .world-version-status[data-level="error"] { background: #fff1f1; border-color: #f1c9c9; color: #8a2e2e; }
    .world-version-status[data-level="ok"] { background: #eef8ef; border-color: #cde6cf; color: #265f31; }
    .world-ref-button { appearance: none; border: 0; background: none; color: var(--accent, #375a7f); padding: 0; cursor: pointer; font: inherit; text-align: left; text-decoration: underline; }
    .world-kind-button { appearance: none; border: 0; border-radius: 999px; background: #eee; padding: 2px 7px; cursor: pointer; font: inherit; }
    .world-graph-canvas { position: relative; width: 100%; height: 100%; min-height: 0; overflow: scroll; border: 0; border-radius: 0; background: #fff; box-sizing: border-box; }
    .world-graph-content { position: relative; }
    .world-document-view, .world-primitive-browser { height: 100%; overflow: auto; box-sizing: border-box; padding: 16px; background: #fff; }
    .world-witness-browser { height: 100%; overflow: auto; box-sizing: border-box; padding: 16px; background: #fff; display: grid; gap: 10px; align-content: start; }
    .world-witness-card { border: 1px solid #eee; border-radius: 8px; padding: 10px 12px; background: #fafafa; display: grid; gap: 6px; }
    .world-witness-card pre { margin: 0; white-space: pre-wrap; font-size: 11px; background: #fff; border: 1px solid #eee; border-radius: 6px; padding: 8px; overflow: auto; }
    .world-source-workbench { display: grid; grid-template-columns: 260px minmax(0, 1fr); height: 100%; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #1e1e1e; color: #d4d4d4; }
    .world-source-sidebar { background: #252526; border-right: 1px solid #333; padding: 10px; overflow: auto; }
    .world-source-file-button { display: block; width: 100%; text-align: left; border: 0; border-radius: 4px; background: transparent; color: #ccc; padding: 6px 8px; font: 12px var(--mono); cursor: pointer; }
    .world-source-file-button:hover, .world-source-file-active { background: #37373d; color: #f2f2f2; }
    .world-source-ref:hover { color: #dcdcaa; background: #2a2d2e; }
    .world-source-editor { overflow: auto; min-width: 0; }
    .world-source-title { position: sticky; top: 0; z-index: 2; background: #2d2d2d; color: #eee; padding: 8px 12px; border-bottom: 1px solid #3a3a3a; font: 12px var(--mono); }
    .world-source-code { display: table; width: 100%; font: 12px/1.5 var(--mono); }
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
    .world-source-ast { margin: 6px 0 0; max-height: 180px; overflow: auto; white-space: pre-wrap; background: #fff; border: 1px solid #eee; border-radius: 6px; padding: 6px; font-size: 11px; font-family: var(--mono); }
    .world-edge-label { font-size: 10px; fill: #777; }
    .world-edge-ownership { stroke: #c7352f; stroke-width: 2.5; }
    .world-edge-process { stroke: #5577aa; stroke-dasharray: 4 3; }
    .world-edge-capability { stroke: #777; stroke-dasharray: 2 3; }
    .world-edge-relation { stroke: #ddd; }
    .surface-inspector-toggle { position: fixed; left: 16px; bottom: 16px; z-index: 10; border-radius: 999px; padding: 9px 14px; background: rgba(255,255,255,.96); box-shadow: 0 6px 20px rgba(0,0,0,.14); }
    .surface-inspector-panel { position: fixed; left: 16px; bottom: 68px; z-index: 10; width: 360px; max-width: calc(100vw - 32px); max-height: calc(100vh - 96px); overflow: auto; border: 1px solid #ddd; border-radius: 14px; background: rgba(255,255,255,.98); box-shadow: 0 16px 36px rgba(0,0,0,.18); padding: 14px; display: grid; gap: 10px; }
    .surface-inspector-panel h2 { margin: 0; font-size: 1rem; }
    .surface-inspector-meta { color: #777; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; font-family: var(--mono); }
    .surface-inspector-summary { color: #555; line-height: 1.45; }
    .surface-inspector-grid { display: grid; gap: 6px; }
    .surface-inspector-row { display: grid; grid-template-columns: 92px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f1f1f1; }
    .surface-inspector-label { color: #777; font-weight: 700; font-family: var(--mono); }
    .surface-inspector-value { min-width: 0; overflow-wrap: anywhere; font-family: var(--mono); }
    .surface-inspector-form { display: grid; gap: 8px; }
    .surface-inspector-field { display: grid; gap: 4px; font-size: 12px; color: #555; }
    .surface-inspector-field span { font-family: var(--mono); color: #777; }
    .surface-inspector-field input, .surface-inspector-field textarea { width: 100%; box-sizing: border-box; border: 1px solid #ddd; border-radius: 8px; background: #fff; padding: 8px; font-family: var(--mono); font-size: 12px; }
    .surface-inspector-field textarea { min-height: 72px; resize: vertical; }
    .surface-inspector-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .surface-inspector-actions button { font-size: 12px; }
    .surface-inspector-list { display: grid; gap: 6px; }
    .surface-inspector-item { border: 1px solid #eee; border-radius: 8px; padding: 8px 9px; background: #fafafa; }
    .surface-inspector-item strong { display: block; margin-bottom: 4px; font-size: 12px; }
    .surface-inspector-status { padding: 8px 10px; border-radius: 8px; border: 1px solid #e3e3e3; background: #f7f7f7; }
    .surface-inspector-status[data-level="ok"] { background: #eef8ef; border-color: #cde6cf; color: #265f31; }
    .surface-inspector-status[data-level="error"] { background: #fff1f1; border-color: #f1c9c9; color: #8a2e2e; }
    .surface-inspector-menu { position: fixed; z-index: 11; min-width: 220px; max-width: min(320px, calc(100vw - 24px)); border: 1px solid #ddd; border-radius: 12px; background: rgba(255,255,255,.98); box-shadow: 0 16px 36px rgba(0,0,0,.18); padding: 8px; display: grid; gap: 6px; }
    .surface-inspector-menu button { text-align: left; width: 100%; background: #fafafa; }
    .surface-inspector-menu button:hover { background: #f1f1f1; }
    .surface-inspector-menu p { margin: 0; color: #555; font-size: 12px; line-height: 1.4; padding: 4px 2px; }
    .surface-command-toggle { position: fixed; right: 16px; bottom: 16px; z-index: 10; border-radius: 999px; padding: 9px 14px; background: rgba(255,255,255,.96); box-shadow: 0 6px 20px rgba(0,0,0,.14); }
    .surface-command-palette { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); z-index: 12; width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; border: 1px solid #ddd; border-radius: 14px; background: rgba(255,255,255,.98); box-shadow: 0 16px 36px rgba(0,0,0,.18); padding: 12px; display: grid; gap: 10px; }
    .surface-command-palette .world-command-list { max-height: min(420px, calc(100vh - 160px)); }
    [data-surface-inspector-selected="true"] { outline: 3px solid var(--accent, #333); outline-offset: 4px; border-radius: 8px; box-shadow: 0 0 0 8px rgba(51, 51, 51, .12); }
    [data-widget-version] { border-left: 8px solid var(--version-color, #ddd); padding-left: 12px; border-radius: 8px; }
    [data-tutorial-focus-scope="true"], [data-tutorial-current] { position: relative; z-index: 9; }
    [data-tutorial-current] { outline: 3px solid var(--accent, #333); outline-offset: 4px; border-radius: 8px; scroll-margin-top: 60px; animation: tutorial-focus-pulse 1.35s ease-in-out infinite; }
    [data-tutorial-changed="true"] { box-shadow: 0 0 0 3px rgba(51, 51, 51, .12); animation: tutorial-changed-pulse 1.1s ease-in-out 2; }
    [data-tutorial-changed="true"] strong { animation: tutorial-text-pulse 1.1s ease-in-out 2; }
    .tutorial-dimmer { position: fixed; inset: 0; z-index: 7; background: rgba(17, 17, 17, .38); backdrop-filter: blur(2px); pointer-events: none; }
    .tutorial-overlay { position: fixed; width: 340px; max-width: calc(100vw - 24px); z-index: 10; background: rgba(255,255,255,.98); border: 1px solid #ddd; border-radius: 14px; padding: 14px; box-shadow: 0 16px 36px rgba(0,0,0,.18); pointer-events: none; }
    .tutorial-overlay h3 { margin: 0 0 8px; font-size: 1rem; }
    .tutorial-overlay p { margin: 0 0 10px; color: #555; line-height: 1.45; }
    .tutorial-overlay-meta { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #777; margin-bottom: 6px; }
    .tutorial-concept-list { display: grid; gap: 8px; margin: 0 0 10px; }
    .tutorial-concept { border: 1px solid #ddd; border-radius: 10px; padding: 9px 10px; background: rgba(248,248,248,.92); }
    .tutorial-concept strong { display: block; margin-bottom: 3px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #333; }
    .tutorial-concept span { display: block; font-size: 13px; line-height: 1.4; color: #555; }
    .tutorial-overlay button, .tutorial-overlay-handle { pointer-events: auto; }
    .tutorial-overlay-handle { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin: -4px -4px 10px; padding: 4px; cursor: grab; user-select: none; }
    .tutorial-overlay-handle:active { cursor: grabbing; }
    .tutorial-handle-copy { min-width: 0; }
    .tutorial-handle-kicker { font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: #777; }
    .tutorial-handle-grip { color: #777; font-size: 18px; line-height: 1; padding-top: 2px; }
    .tutorial-click-pulse { position: fixed; width: 22px; height: 22px; margin-left: -11px; margin-top: -11px; border-radius: 999px; border: 2px solid rgba(51, 51, 51, .55); background: rgba(51, 51, 51, .12); z-index: 11; pointer-events: none; animation: tutorial-click-pulse .55s ease-out forwards; }
    .tutorial-auto-click { animation: tutorial-button-click .5s ease-out; }
    .tutorial-resume { position: fixed; right: 16px; bottom: 16px; z-index: 10; }
    body.tutorial-dragging { user-select: none; }
    @keyframes tutorial-focus-pulse {
      0%, 100% { outline-color: rgba(51, 51, 51, 1); box-shadow: 0 0 0 0 rgba(51, 51, 51, .08); }
      50% { outline-color: rgba(51, 51, 51, .65); box-shadow: 0 0 0 10px rgba(51, 51, 51, .1); }
    }
    @keyframes tutorial-changed-pulse {
      0%, 100% { transform: scale(1); }
      45% { transform: scale(1.01); }
    }
    @keyframes tutorial-text-pulse {
      0%, 100% { font-weight: 600; opacity: 1; }
      50% { font-weight: 400; opacity: .82; }
    }
    @keyframes tutorial-click-pulse {
      0% { transform: scale(.35); opacity: 1; }
      100% { transform: scale(2.6); opacity: 0; }
    }
    @keyframes tutorial-button-click {
      0% { transform: scale(1); }
      35% { transform: scale(.95); }
      100% { transform: scale(1); }
    }
    .world-inspector-key, .world-inspector-item, .world-badge, .world-value-list, .world-value-type, .world-value-record-row,
    .world-context-label, .world-node-kind, .world-node a, .world-source-ref, .tutorial-overlay-meta, .tutorial-handle-kicker {
      font-family: var(--mono);
    }
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
  const commandTutorial = tutorialDefinition(TODO_TUTORIAL_ID);
  const commandTutorialJson = JSON.stringify(commandTutorial).replace(/</g, "\\u003c");
  const engine = String.raw`(async () => {
  let program = JSON.parse(document.getElementById('witness-frontend-program').textContent);
  let config = program.config || {};
  let typeModel = config.typeModel || {};
  const commandTutorial = ${commandTutorialJson};
  const state = Object.create(null);
  const liveProjectionProcesses = new Set(['defineWidget', 'updateWidget', 'widget.update', 'attachWidget', 'defineWidgetVersion', 'activateWidgetVersion', 'widgetVersion.migrate', 'widgetVersion.rollback']);
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
  const liveSurfaceInspectable = Boolean(config.page && config.page !== 'world');
  const validWorldGraphModes = new Set(['graph', 'things', 'primitive', 'witness', 'source', 'process']);
  const processViewHref = ({ program, event }) => {
    const url = new URL('/process', window.location.origin);
    if (program) url.searchParams.set('program', program);
    if (event) url.searchParams.set('event', event);
    return url.pathname + url.search;
  };
  const worldSurfaceHref = ({ select = '', mode = '' } = {}) => {
    const url = new URL('/world', window.location.origin);
    if (select) url.searchParams.set('select', select);
    if (mode) url.searchParams.set('mode', mode);
    return url.pathname + url.search;
  };
  const selectedSurfaceWidgetId = () => String(state.surfaceInspectorSelectedId || '');
  const clearSurfaceInspectorHighlight = () => {
    document.querySelectorAll('[data-surface-inspector-selected]').forEach(node => node.removeAttribute('data-surface-inspector-selected'));
  };
  const applySurfaceInspectorHighlight = widgetId => {
    clearSurfaceInspectorHighlight();
    if (!widgetId) return;
    const element = byWidget(widgetId);
    if (!element) return;
    element.setAttribute('data-surface-inspector-selected', 'true');
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const selectedSurfaceWidgetElement = () => {
    const widgetId = selectedSurfaceWidgetId();
    return widgetId ? byWidget(widgetId) : null;
  };
  const selectedSurfaceWidgetNode = () => state.surfaceInspectorGraphById?.[selectedSurfaceWidgetId()] || null;
  const selectedSurfaceWidgetAuthored = () => state.surfaceInspectorWidgetsById?.[selectedSurfaceWidgetId()] || null;
  const selectedSurfaceWidgetSource = () => {
    const node = selectedSurfaceWidgetNode();
    return (node?.sources || []).slice(-1)[0] || null;
  };
  const selectedSurfaceWidgetVersionState = () => selectedSurfaceWidgetNode()?.widgetVersionState || null;
  const selectedSurfaceWidgetVersions = () => selectedSurfaceWidgetNode()?.widgetVersions || [];
  const deriveSurfaceInspectorProcessSelection = widgetId => {
    if (!widgetId || !program?.graph?.length) return null;
    const element = byWidget(widgetId);
    if (!element) return null;
    const action = element.getAttribute('data-action') || '';
    if (action) {
      const event = 'click:' + action;
      if ((program.graph || []).some(step => step.event === event)) return { program: program.id, event };
    }
    const form = element.matches?.('form[data-widget]') ? element : element.closest?.('form[data-widget]');
    const formId = form?.getAttribute?.('data-widget') || '';
    if (formId) {
      const event = 'submit:' + formId;
      if ((program.graph || []).some(step => step.event === event)) return { program: program.id, event };
    }
    if (widgetId === program.rootWidget && (program.graph || []).some(step => step.event === 'load')) {
      return { program: program.id, event: 'load' };
    }
    return null;
  };
  const invalidateSurfaceInspectorGraph = () => {
    state.surfaceInspectorGraph = null;
    state.surfaceInspectorGraphById = null;
    state.surfaceInspectorGraphLoaded = false;
    state.surfaceInspectorGraphError = null;
  };
  const invalidateSurfaceInspectorWidgets = () => {
    state.surfaceInspectorWidgets = null;
    state.surfaceInspectorWidgetsById = null;
    state.surfaceInspectorWidgetsLoaded = false;
    state.surfaceInspectorWidgetsError = null;
  };
  const setSurfaceInspectorStatus = (message, level = 'ok') => {
    state.surfaceInspectorStatus = message ? { message: String(message), level } : null;
  };
  const selectedSurfaceInspectorProcessSelection = () => {
    const selectedNode = selectedSurfaceWidgetNode();
    if (selectedNode?.processSelection?.program && selectedNode?.processSelection?.event) return selectedNode.processSelection;
    return deriveSurfaceInspectorProcessSelection(selectedSurfaceWidgetId());
  };
  const ensureSurfaceInspectorGraph = async ({ force = false } = {}) => {
    if (!liveSurfaceInspectable) return { ok: false, error: 'surface inspector unavailable' };
    if (force) invalidateSurfaceInspectorGraph();
    if (state.surfaceInspectorGraphLoaded && state.surfaceInspectorGraphById) {
      return { ok: true, graph: state.surfaceInspectorGraph, byId: state.surfaceInspectorGraphById };
    }
    if (state.surfaceInspectorGraphPromise) return state.surfaceInspectorGraphPromise;
    state.surfaceInspectorGraphPromise = (async () => {
      const url = '/api/world-graph';
      const response = await fetch(url, requestOptions({}, { url }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        state.surfaceInspectorGraphError = body?.error || 'world graph request failed';
        state.surfaceInspectorGraphLoaded = true;
        return { ok: false, error: state.surfaceInspectorGraphError, status: response.status };
      }
      const graph = body.graph || body;
      const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
      state.surfaceInspectorGraph = graph;
      state.surfaceInspectorGraphById = Object.fromEntries(nodes.map(node => [node.id, node]));
      state.surfaceInspectorGraphLoaded = true;
      state.surfaceInspectorGraphError = null;
      return { ok: true, graph, byId: state.surfaceInspectorGraphById };
    })();
    try {
      return await state.surfaceInspectorGraphPromise;
    } finally {
      state.surfaceInspectorGraphPromise = null;
    }
  };
  const ensureSurfaceInspectorWidgets = async ({ force = false } = {}) => {
    if (!liveSurfaceInspectable) return { ok: false, error: 'surface inspector unavailable' };
    if (force) invalidateSurfaceInspectorWidgets();
    if (state.surfaceInspectorWidgetsLoaded && state.surfaceInspectorWidgetsById) {
      return { ok: true, widgets: state.surfaceInspectorWidgets, byId: state.surfaceInspectorWidgetsById };
    }
    if (state.surfaceInspectorWidgetsPromise) return state.surfaceInspectorWidgetsPromise;
    state.surfaceInspectorWidgetsPromise = (async () => {
      const url = '/api/bootstrap-state';
      const response = await fetch(url, requestOptions({}, { url }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        state.surfaceInspectorWidgetsError = body?.error || 'bootstrap widget state request failed';
        state.surfaceInspectorWidgetsLoaded = true;
        return { ok: false, error: state.surfaceInspectorWidgetsError, status: response.status };
      }
      const widgets = Array.isArray(body?.widgets) ? body.widgets : [];
      state.surfaceInspectorWidgets = widgets;
      state.surfaceInspectorWidgetsById = Object.fromEntries(widgets.map(widget => [widget.id, widget]));
      state.surfaceInspectorWidgetsLoaded = true;
      state.surfaceInspectorWidgetsError = null;
      return { ok: true, widgets, byId: state.surfaceInspectorWidgetsById };
    })();
    try {
      return await state.surfaceInspectorWidgetsPromise;
    } finally {
      state.surfaceInspectorWidgetsPromise = null;
    }
  };
  const selectSurfaceInspectorWidget = async (widgetId, { refreshGraph = false, statusMessage = null } = {}) => {
    state.surfaceInspectorOpen = true;
    state.surfaceInspectorSelectedId = widgetId || '';
    state.surfaceInspectorMenu = widgetId && state.surfaceInspectorMenu
      ? { ...state.surfaceInspectorMenu, widgetId }
      : null;
    applySurfaceInspectorHighlight(widgetId || '');
    if (statusMessage) setSurfaceInspectorStatus(statusMessage, 'ok');
    if (!widgetId) {
      updateSurfaceInspectorUi();
      return { ok: true, widgetId: '' };
    }
    const [loaded, authored] = await Promise.all([
      ensureSurfaceInspectorGraph({ force: refreshGraph }),
      ensureSurfaceInspectorWidgets({ force: refreshGraph })
    ]);
    if (!loaded.ok) {
      setSurfaceInspectorStatus(loaded.error || 'Failed to load world graph for inspector.', 'error');
    } else if (!authored.ok) {
      setSurfaceInspectorStatus(authored.error || 'Failed to load authored widget state for inspector.', 'error');
    } else if (!state.surfaceInspectorGraphById?.[widgetId] && !statusMessage) {
      setSurfaceInspectorStatus('Selected widget is not yet visible in the world graph.', 'error');
    } else if (!statusMessage) {
      setSurfaceInspectorStatus('Selected ' + widgetId + '.', 'ok');
    }
    updateSurfaceInspectorUi();
    return { ok: true, widgetId };
  };
  const closeSurfaceInspectorMenu = () => {
    if (!state.surfaceInspectorMenu) return;
    state.surfaceInspectorMenu = null;
    updateSurfaceInspectorUi();
  };
  const surfaceInspectorTagLabel = element => {
    const tag = String(element?.tagName || '').toLowerCase();
    return tag ? '<' + tag + '>' : '';
  };
  const patchSurfaceWidget = async ({ id, patch }) => {
    const url = '/api/widgets/' + encodeURIComponent(id);
    const response = await fetch(url, requestOptions({
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch || {})
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const renderSurfaceInspectorEditor = () => {
    const widgetId = selectedSurfaceWidgetId();
    if (!widgetId) return '';
    const authoredWidget = selectedSurfaceWidgetAuthored();
    const versionRows = selectedSurfaceWidgetVersions();
    if (versionRows.length) {
      return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">Versioned widgets still use the dedicated version controls. This first save-back slice intentionally blocks direct editing for souls with authored widget versions.</div></section>';
    }
    if (!state.surfaceInspectorWidgetsLoaded) {
      return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">Loading authored widget state...</div></section>';
    }
    if (state.surfaceInspectorWidgetsError) {
      return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">Authored widget state is unavailable right now.</div></section>';
    }
    if (!authoredWidget) {
      return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">This selected element is not currently backed by a directly editable authored widget row.</div></section>';
    }
    const props = authoredWidget.props || {};
    return '<section><div class="surface-inspector-meta">Live Save-Back</div>'
      + '<form class="surface-inspector-form" data-surface-inspector-edit-form data-widget-id="' + escapeAttr(widgetId) + '">'
      + '<label class="surface-inspector-field"><span>Text</span><textarea name="text" rows="3">' + escapeHtml(String(props.text ?? '')) + '</textarea></label>'
      + '<label class="surface-inspector-field"><span>Title</span><input name="title" value="' + escapeAttr(String(props.title ?? '')) + '" /></label>'
      + '<label class="surface-inspector-field"><span>Class</span><input name="class" value="' + escapeAttr(String(props.class ?? '')) + '" /></label>'
      + '<div class="surface-inspector-actions"><button type="submit" data-surface-inspector-save>Save Widget</button></div>'
      + '</form>'
      + '<div class="surface-inspector-summary">Writes a real <code>widget.update</code> witness for the selected widget. This first slice only edits <code>text</code>, <code>title</code>, and <code>class</code>.</div>'
      + '</section>';
  };
  const renderSurfaceInspectorPanel = () => {
    if (!liveSurfaceInspectable || state.surfaceInspectorOpen !== true) return '';
    const widgetId = selectedSurfaceWidgetId();
    const selectedNode = selectedSurfaceWidgetNode();
    const selectedElement = selectedSurfaceWidgetElement();
    const selectedSource = selectedSurfaceWidgetSource();
    const versionState = selectedSurfaceWidgetVersionState();
    const versionRows = selectedSurfaceWidgetVersions();
    const processSelection = selectedSurfaceInspectorProcessSelection();
    const summary = widgetId
      ? (selectedNode
        ? ('Inspecting ' + widgetId + ' as a real ' + String(selectedNode.kind || 'thing') + ' node. Use the handoff buttons to jump into witnesses, source, process, or the world surface.')
        : ('Inspecting ' + widgetId + ' from the live page. World metadata is loading or not yet available.'))
      : 'Right-click any widget on this page to inspect it. This first slice is truthful inspect/handoff/version control plus narrow save-back for non-versioned widget text/title/class edits.';
    const rows = widgetId
      ? [
          ['Widget', widgetId],
          ['Kind', selectedNode?.kind || selectedElement?.getAttribute?.('data-kind') || surfaceInspectorTagLabel(selectedElement) || 'widget'],
          ['Context', selectedNode?.context || ''],
          ['Element', surfaceInspectorTagLabel(selectedElement)],
          ['Source', selectedSource?.file || ''],
          ['Process', processSelection?.event || '']
        ].filter(([, value]) => value)
      : [];
    const actions = widgetId
      ? [
          '<button type="button" data-surface-inspector-world>Open In World</button>',
          '<button type="button" data-surface-inspector-world-mode="witness">Show Witnesses</button>',
          selectedSource?.file ? '<button type="button" data-surface-inspector-world-mode="source">Show Source</button>' : '',
          processSelection ? '<button type="button" data-surface-inspector-open-process>Open Process View</button>' : ''
        ].filter(Boolean).join('')
      : '';
    const versions = versionRows.length
      ? '<section><div class="surface-inspector-meta">Widget Versions</div><div class="surface-inspector-list">' + versionRows.map(row =>
          '<div class="surface-inspector-item">'
            + '<strong>' + escapeHtml(row.version || row.soul || '') + (row.isActive ? ' [active]' : '') + '</strong>'
            + (row.transitionFromActive ? '<div class="surface-inspector-summary">Transition: ' + escapeHtml(row.transitionFromActive) + '</div>' : '')
            + (!row.isActive
              ? '<div class="surface-inspector-actions"><button type="button" data-surface-inspector-activate="' + escapeHtml(row.soul || '') + '" data-surface-inspector-version="' + escapeHtml(row.version || '') + '">Activate</button></div>'
              : '')
          + '</div>'
        ).join('') + '</div>'
        + (versionState?.rollbackAvailable
          ? '<div class="surface-inspector-actions"><button type="button" data-surface-inspector-rollback="' + escapeHtml(versionState.soul || '') + '">Rollback To ' + escapeHtml(versionState.rollbackVersion || 'previous') + '</button></div>'
          : '')
        + '</section>'
      : '';
    const status = state.surfaceInspectorStatus?.message
      ? '<div class="surface-inspector-status" data-level="' + escapeHtml(state.surfaceInspectorStatus.level || 'ok') + '">' + escapeHtml(state.surfaceInspectorStatus.message) + '</div>'
      : '';
    const graphError = state.surfaceInspectorGraphError
      ? '<div class="surface-inspector-status" data-level="error">' + escapeHtml(state.surfaceInspectorGraphError) + '</div>'
      : '';
    return '<aside class="surface-inspector-panel" data-surface-inspector-panel>'
      + '<div class="surface-inspector-meta">Live Page Inspector</div>'
      + '<h2>' + escapeHtml(widgetId || 'Inspect Page') + '</h2>'
      + '<div class="surface-inspector-summary">' + escapeHtml(summary) + '</div>'
      + status
      + graphError
      + '<div class="surface-inspector-actions">'
        + '<button type="button" data-surface-inspector-close>Close Inspector</button>'
        + (widgetId ? '<button type="button" data-surface-inspector-clear>Clear Selection</button>' : '')
        + '<button type="button" data-surface-inspector-refresh>Refresh Metadata</button>'
      + '</div>'
      + (rows.length
        ? '<div class="surface-inspector-grid">' + rows.map(([label, value]) =>
            '<div class="surface-inspector-row"><div class="surface-inspector-label">' + escapeHtml(label) + '</div><div class="surface-inspector-value">' + escapeHtml(value) + '</div></div>'
          ).join('') + '</div>'
        : '')
      + (actions ? '<div class="surface-inspector-actions">' + actions + '</div>' : '')
      + versions
      + renderSurfaceInspectorEditor()
    + '</aside>';
  };
  const renderSurfaceInspectorMenu = () => {
    if (!liveSurfaceInspectable || !state.surfaceInspectorMenu?.widgetId) return '';
    const widgetId = String(state.surfaceInspectorMenu.widgetId || '');
    const x = Math.max(12, Math.min(Number(state.surfaceInspectorMenu.x) || 12, window.innerWidth - 236));
    const y = Math.max(12, Math.min(Number(state.surfaceInspectorMenu.y) || 12, window.innerHeight - 220));
    const selectedSource = selectedSurfaceWidgetSource();
    const processSelection = selectedSurfaceInspectorProcessSelection();
    return '<div class="surface-inspector-menu" data-surface-inspector-menu style="left:' + x + 'px;top:' + y + 'px">'
      + '<div class="surface-inspector-meta">Widget</div>'
      + '<p>' + escapeHtml(widgetId) + '</p>'
      + '<button type="button" data-surface-inspector-select>Inspect Widget</button>'
      + '<button type="button" data-surface-inspector-world>Open In World</button>'
      + '<button type="button" data-surface-inspector-world-mode="witness">Show Witnesses</button>'
      + (selectedSource?.file ? '<button type="button" data-surface-inspector-world-mode="source">Show Source</button>' : '')
      + (processSelection ? '<button type="button" data-surface-inspector-open-process>Open Process View</button>' : '')
    + '</div>';
  };
  const liveSurfaceWidgetRows = () => {
    if (!liveSurfaceInspectable) return [];
    const rootWidget = byWidget(program.rootWidget);
    if (!rootWidget) return [];
    const widgetIds = [];
    rootWidget.querySelectorAll('[data-widget]').forEach(element => {
      const widgetId = element.getAttribute('data-widget') || '';
      if (widgetId && !widgetIds.includes(widgetId)) widgetIds.push(widgetId);
    });
    return widgetIds.map(widgetId => {
      const node = state.surfaceInspectorGraphById?.[widgetId] || null;
      return {
        id: widgetId,
        label: String(node?.label || widgetId),
        kind: String(node?.kind || 'widget'),
        context: String(node?.context || ''),
        source: (node?.sources || []).slice(-1)[0] || null,
        processSelection: node?.processSelection?.program && node?.processSelection?.event
          ? node.processSelection
          : deriveSurfaceInspectorProcessSelection(widgetId),
        versionState: node?.widgetVersionState || null,
        versionRows: node?.widgetVersions || []
      };
    });
  };
  const buildSurfaceCommandCatalog = () => {
    const items = [];
    const push = item => {
      if (!item?.id || !item?.action?.kind) return;
      items.push(item);
    };
    const widgetRows = liveSurfaceWidgetRows();
    const selectedWidget = widgetRows.find(row => row.id === selectedSurfaceWidgetId()) || null;
    const graphNodes = Array.isArray(state.surfaceInspectorGraph?.nodes)
      ? state.surfaceInspectorGraph.nodes
      : Object.values(state.surfaceInspectorGraphById || {});
    const widgetIds = new Set(widgetRows.map(row => row.id));
    const routeValue = (node, key) => {
      const row = (node?.values || []).find(entry => entry.key === key);
      return row?.value?.type === 'string' ? String(row.value.value || '') : '';
    };
    for (const row of widgetRows) {
      const keywords = [row.id, row.label, row.kind, row.context].filter(Boolean).join(' ');
      push({
        id: 'surface-widget:' + row.id,
        type: 'widget',
        title: 'Inspect Widget ' + row.label,
        subtitle: row.id + (row.context ? ' / ' + row.context : ''),
        search: 'inspect widget live page rendered current surface ' + keywords,
        priority: row.id === selectedSurfaceWidgetId() ? 250 : 220,
        action: { kind: 'inspect-widget', widgetId: row.id }
      });
      if (row.processSelection?.program && row.processSelection?.event) {
        push({
          id: 'surface-widget-process:' + row.id,
          type: 'execution',
          title: 'Open Process For ' + row.label,
          subtitle: row.processSelection.event,
          search: 'open process witnessed execution live page widget ' + keywords + ' ' + row.processSelection.program + ' ' + row.processSelection.event,
          priority: 216,
          action: { kind: 'navigate', href: processViewHref(row.processSelection) }
        });
      }
      if (row.source?.file) {
        push({
          id: 'surface-widget-source:' + row.id,
          type: 'source',
          title: 'Show Source For ' + row.label,
          subtitle: row.source.file,
          search: 'show source live page widget witnessed source ' + keywords + ' ' + row.source.file,
          priority: 214,
          action: { kind: 'world-navigate', select: row.id, mode: 'source' }
        });
      }
    }
    if (selectedWidget) {
      push({
        id: 'surface-selected-world:' + selectedWidget.id,
        type: 'command',
        title: 'Open Selected Widget In World',
        subtitle: selectedWidget.id,
        search: 'open selected widget world witnesses graph ' + selectedWidget.id + ' ' + selectedWidget.label,
        priority: 260,
        action: { kind: 'world-navigate', select: selectedWidget.id }
      });
      push({
        id: 'surface-selected-witness:' + selectedWidget.id,
        type: 'command',
        title: 'Show Witnesses For Selected Widget',
        subtitle: selectedWidget.id,
        search: 'show witnesses selected widget live page ' + selectedWidget.id + ' ' + selectedWidget.label,
        priority: 258,
        action: { kind: 'world-navigate', select: selectedWidget.id, mode: 'witness' }
      });
      if (selectedWidget.source?.file) {
        push({
          id: 'surface-selected-source:' + selectedWidget.id,
          type: 'command',
          title: 'Show Source For Selected Widget',
          subtitle: selectedWidget.source.file,
          search: 'show source selected widget live page ' + selectedWidget.id + ' ' + selectedWidget.label + ' ' + selectedWidget.source.file,
          priority: 256,
          action: { kind: 'world-navigate', select: selectedWidget.id, mode: 'source' }
        });
      }
      if (selectedWidget.processSelection?.program && selectedWidget.processSelection?.event) {
        push({
          id: 'surface-selected-process:' + selectedWidget.id,
          type: 'command',
          title: 'Open Process For Selected Widget',
          subtitle: selectedWidget.processSelection.event,
          search: 'open process selected widget witnessed execution live page ' + selectedWidget.id + ' ' + selectedWidget.label + ' ' + selectedWidget.processSelection.program + ' ' + selectedWidget.processSelection.event,
          priority: 257,
          action: { kind: 'navigate', href: processViewHref(selectedWidget.processSelection) }
        });
      }
      for (const row of selectedWidget.versionRows.filter(entry => !entry.isActive)) {
        push({
          id: 'surface-selected-version:' + row.soul + ':' + row.version,
          type: 'command',
          title: 'Upgrade Selected Widget To ' + row.version,
          subtitle: row.soul,
          search: 'upgrade activate version selected widget live page ' + row.soul + ' ' + row.version,
          priority: 252,
          action: { kind: 'widget-version-activate', soul: row.soul, version: row.version }
        });
      }
      if (selectedWidget.versionState?.rollbackAvailable) {
        push({
          id: 'surface-selected-rollback:' + selectedWidget.versionState.soul,
          type: 'command',
          title: 'Rollback Selected Widget To ' + selectedWidget.versionState.rollbackVersion,
          subtitle: selectedWidget.versionState.soul,
          search: 'rollback selected widget version live page ' + selectedWidget.versionState.soul + ' ' + selectedWidget.versionState.rollbackVersion,
          priority: 251,
          action: { kind: 'widget-version-rollback', soul: selectedWidget.versionState.soul }
        });
      }
    }
    const builtInSurfaces = [
      { id: 'surface:home', type: 'page', title: 'Open Home Page', subtitle: '/', search: 'home page app surface / user-facing', href: '/' },
      { id: 'surface:world', type: 'surface', title: 'Open World', subtitle: 'Operating surface / graph and inspectors', search: 'world graph operating surface witnesses source process internal operator /world', href: '/world' },
      { id: 'surface:bootstrap', type: 'surface', title: 'Open Bootstrap', subtitle: 'Recovery and authoring seam', search: 'bootstrap harness recovery authoring semi-internal /_bootstrap', href: '/_bootstrap' },
      { id: 'surface:process-view', type: 'surface', title: 'Open Process View', subtitle: 'Witnessed execution page', search: 'process view witnessed execution internal operator /process', href: '/process' }
    ];
    for (const surface of builtInSurfaces) {
      push({
        id: surface.id,
        type: surface.type,
        title: surface.title,
        subtitle: surface.subtitle,
        search: surface.search,
        priority: 205,
        action: { kind: 'navigate', href: surface.href }
      });
    }
    for (const node of graphNodes) {
      if (!node?.id) continue;
      const label = String(node.label || node.id);
      const kind = String(node.kind || 'thing');
      const keywords = [node.id, label, kind, node.context, node.surfaceTier, node.surfaceLabel, ...(node.badges || []).map(b => b.label || b)].filter(Boolean).join(' ');
      const source = (node.sources || []).slice(-1)[0] || null;
      if (!widgetIds.has(node.id)) {
        push({
          id: 'surface-world-node:' + node.id,
          type: kind,
          title: 'Open In World: ' + label,
          subtitle: kind + (node.context ? ' / ' + node.context : ''),
          search: 'open in world graph object capability widget route process source ' + keywords,
          priority: kind === 'capability' ? 198 : 170,
          action: { kind: 'world-navigate', select: node.id }
        });
      }
      if (kind === 'route') {
        const routePath = routeValue(node, 'path');
        const routeMethod = routeValue(node, 'method');
        if (routePath && routeMethod === 'GET') {
          push({
            id: 'surface-route:' + node.id,
            type: 'page',
            title: 'Open Page ' + routePath,
            subtitle: node.id + (node.surfaceTier ? ' / ' + node.surfaceTier : ''),
            search: 'open page route surface ' + routePath + ' ' + keywords,
            priority: 215,
            action: { kind: 'navigate', href: routePath }
          });
        }
      }
      if (source?.file) {
        push({
          id: 'surface-source:' + node.id,
          type: 'source',
          title: 'Show Source For ' + label,
          subtitle: source.file,
          search: 'show source witnessed file dsl ' + keywords + ' ' + source.file,
          priority: 166,
          action: { kind: 'world-navigate', select: node.id, mode: 'source' }
        });
      }
      if (node.processSelection?.program && node.processSelection?.event) {
        push({
          id: 'surface-process:' + node.id,
          type: 'execution',
          title: 'Open Process For ' + label,
          subtitle: node.processSelection.event,
          search: 'open process witnessed execution ' + keywords + ' ' + node.processSelection.program + ' ' + node.processSelection.event,
          priority: 167,
          action: { kind: 'navigate', href: processViewHref(node.processSelection) }
        });
      }
    }
    return [...new Map(items.map(item => [item.id, item])).values()];
  };
  const scoreSurfaceCommandItem = (item, query) => {
    if (!query) return item.priority || 0;
    const haystack = ((item.title || '') + ' ' + (item.subtitle || '') + ' ' + (item.search || '')).toLowerCase();
    const title = String(item.title || '').toLowerCase();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return item.priority || 0;
    let score = item.priority || 0;
    for (const term of terms) {
      if (title === term) score += 220;
      else if (title.startsWith(term)) score += 120;
      else if (title.includes(term)) score += 70;
      else if (haystack.includes(term)) score += 25;
      else return -1;
    }
    return score;
  };
  const visibleSurfaceCommands = () => {
    const query = String(state.surfaceCommandQuery || '').trim();
    return buildSurfaceCommandCatalog()
      .map(item => ({ ...item, score: scoreSurfaceCommandItem(item, query) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => (b.score - a.score) || String(a.title).localeCompare(String(b.title)))
      .slice(0, query ? 24 : 12);
  };
  const renderSurfaceCommandPalette = () => {
    if (!liveSurfaceInspectable || !state.surfaceCommandOpen) return '';
    const query = String(state.surfaceCommandQuery || '');
    const items = visibleSurfaceCommands();
    const graphNotice = state.surfaceInspectorGraphError
      ? '<div class="surface-inspector-status" data-level="error">' + escapeHtml(state.surfaceInspectorGraphError) + '</div>'
      : (!state.surfaceInspectorGraphLoaded
          ? '<div class="world-command-meta">Loading world graph metadata for capabilities, routes, and source handoffs...</div>'
          : '');
    const currentSelection = selectedSurfaceWidgetId()
      ? '<div class="world-command-meta">Selected widget / ' + escapeHtml(selectedSurfaceWidgetId()) + '</div>'
      : '<div class="world-command-meta">No widget selected yet. Search current-page widgets to inspect them in place.</div>';
    const results = items.length
      ? items.map((item, index) => '<button class="world-command-item" data-surface-command-run="' + index + '"><strong>' + escapeHtml(item.title) + '</strong><span class="world-command-meta">' + escapeHtml(item.type) + (item.subtitle ? ' / ' + escapeHtml(item.subtitle) : '') + '</span></button>').join('')
      : '<div class="world-command-empty">No matching pages, widgets, capabilities, or commands.</div>';
    return '<section class="surface-command-palette world-command-palette" data-surface-command-palette>'
      + '<div class="world-command-head">'
        + '<input class="world-command-input" data-surface-command-input placeholder="Search pages, widgets, capabilities, execution, commands..." value="' + escapeHtml(query) + '" />'
        + '<button class="world-command-toggle" data-surface-command-close>Close</button>'
      + '</div>'
      + currentSelection
      + graphNotice
      + '<div class="world-command-list">' + results + '</div>'
    + '</section>';
  };
  const executeSurfaceCommand = async item => {
    if (!item?.action) return;
    const action = item.action;
    state.surfaceCommandOpen = false;
    state.surfaceCommandQuery = '';
    state.surfaceCommandFocusRequested = false;
    if (action.kind === 'navigate') {
      window.location.assign(action.href);
      return;
    }
    if (action.kind === 'inspect-widget') {
      await selectSurfaceInspectorWidget(action.widgetId || '');
      updateSurfaceInspectorUi();
      return;
    }
    if (action.kind === 'world-navigate') {
      window.location.assign(worldSurfaceHref({ select: action.select || '', mode: action.mode || '' }));
      return;
    }
    if (action.kind === 'widget-version-activate') {
      setSurfaceInspectorStatus('Activating ' + (action.version || '') + '...', 'ok');
      updateSurfaceInspectorUi();
      const result = await activateSurfaceWidgetVersion({ soul: action.soul || '', version: action.version || '' });
      if (!result.ok) {
        setSurfaceInspectorStatus(result.body?.error || 'Widget version activation failed.', 'error');
        updateSurfaceInspectorUi();
        return;
      }
      invalidateSurfaceInspectorGraph();
      await refreshProjection();
      await selectSurfaceInspectorWidget(action.soul || '', {
        refreshGraph: true,
        statusMessage: 'Activated ' + (action.version || '') + (result.body?.status ? ' (' + result.body.status + ')' : '.')
      });
      return;
    }
    if (action.kind === 'widget-version-rollback') {
      setSurfaceInspectorStatus('Rolling back ' + (action.soul || '') + '...', 'ok');
      updateSurfaceInspectorUi();
      const result = await rollbackSurfaceWidgetVersion({ soul: action.soul || '' });
      if (!result.ok) {
        setSurfaceInspectorStatus(result.body?.error || 'Widget version rollback failed.', 'error');
        updateSurfaceInspectorUi();
        return;
      }
      invalidateSurfaceInspectorGraph();
      await refreshProjection();
      await selectSurfaceInspectorWidget(action.soul || '', {
        refreshGraph: true,
        statusMessage: 'Rolled back to ' + (result.body?.version || 'the previous version') + '.'
      });
    }
  };
  const updateSurfaceInspectorUi = () => {
    if (!liveSurfaceInspectable) return;
    let overlay = document.getElementById('surface-inspector-root');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'surface-inspector-root';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML =
      '<button type="button" class="surface-command-toggle world-command-toggle" data-surface-command-toggle>'
        + (state.surfaceCommandOpen ? 'Close Search' : 'Search / Command')
      + '</button>'
      + renderSurfaceCommandPalette()
      +
      '<button type="button" class="surface-inspector-toggle" data-surface-inspector-toggle>'
        + (state.surfaceInspectorOpen ? 'Close Inspector' : 'Inspect Page')
      + '</button>'
      + renderSurfaceInspectorPanel()
      + renderSurfaceInspectorMenu();
    overlay.querySelectorAll('[data-surface-command-toggle]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        state.surfaceCommandOpen = !state.surfaceCommandOpen;
        if (state.surfaceCommandOpen) {
          state.surfaceCommandFocusRequested = true;
          void ensureSurfaceInspectorGraph().then(() => updateSurfaceInspectorUi()).catch(() => {});
        } else {
          state.surfaceCommandQuery = '';
        }
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-command-close]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        state.surfaceCommandOpen = false;
        state.surfaceCommandQuery = '';
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-command-input]').forEach(node => {
      node.addEventListener('input', () => {
        state.surfaceCommandQuery = node.value || '';
        state.surfaceCommandFocusRequested = true;
        updateSurfaceInspectorUi();
      });
      node.addEventListener('keydown', async event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const items = visibleSurfaceCommands();
        if (items[0]) await executeSurfaceCommand(items[0]);
      });
    });
    overlay.querySelectorAll('[data-surface-command-run]').forEach(node => {
      node.addEventListener('click', async event => {
        event.preventDefault();
        const index = Number(node.getAttribute('data-surface-command-run'));
        const items = visibleSurfaceCommands();
        if (Number.isFinite(index) && items[index]) await executeSurfaceCommand(items[index]);
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-toggle]').forEach(node => {
      node.addEventListener('click', async event => {
        event.preventDefault();
        state.surfaceInspectorOpen = !state.surfaceInspectorOpen;
        if (!state.surfaceInspectorOpen) {
          state.surfaceInspectorMenu = null;
          clearSurfaceInspectorHighlight();
        } else {
          setSurfaceInspectorStatus('Inspector enabled. Right-click any widget on the live page.', 'ok');
          if (selectedSurfaceWidgetId()) applySurfaceInspectorHighlight(selectedSurfaceWidgetId());
        }
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-close]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        state.surfaceInspectorOpen = false;
        state.surfaceInspectorMenu = null;
        clearSurfaceInspectorHighlight();
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-clear]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        state.surfaceInspectorSelectedId = '';
        state.surfaceInspectorMenu = null;
        clearSurfaceInspectorHighlight();
        setSurfaceInspectorStatus('Selection cleared. Right-click another widget to inspect it.', 'ok');
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-refresh]').forEach(node => {
      node.addEventListener('click', async event => {
        event.preventDefault();
        if (!selectedSurfaceWidgetId()) {
          invalidateSurfaceInspectorGraph();
          invalidateSurfaceInspectorWidgets();
          setSurfaceInspectorStatus('Inspector metadata refreshed.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        await selectSurfaceInspectorWidget(selectedSurfaceWidgetId(), {
          refreshGraph: true,
          statusMessage: 'Inspector metadata refreshed for ' + selectedSurfaceWidgetId() + '.'
        });
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-select]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        state.surfaceInspectorMenu = null;
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-world]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        const widgetId = selectedSurfaceWidgetId();
        if (!widgetId) return;
        window.location.assign(worldSurfaceHref({ select: widgetId }));
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-world-mode]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        const widgetId = selectedSurfaceWidgetId();
        if (!widgetId) return;
        const mode = node.getAttribute('data-surface-inspector-world-mode') || '';
        window.location.assign(worldSurfaceHref({ select: widgetId, mode }));
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-open-process]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        const selection = selectedSurfaceInspectorProcessSelection();
        if (!selection?.program || !selection?.event) return;
        window.location.assign(processViewHref(selection));
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-activate]').forEach(node => {
      node.addEventListener('click', async event => {
        event.preventDefault();
        const soul = node.getAttribute('data-surface-inspector-activate') || '';
        const version = node.getAttribute('data-surface-inspector-version') || '';
        if (!soul || !version) return;
        setSurfaceInspectorStatus('Activating ' + version + '...', 'ok');
        updateSurfaceInspectorUi();
        const result = await activateSurfaceWidgetVersion({ soul, version });
        if (!result.ok) {
          setSurfaceInspectorStatus(result.body?.error || 'Widget version activation failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        invalidateSurfaceInspectorGraph();
        await refreshProjection();
        await selectSurfaceInspectorWidget(soul, {
          refreshGraph: true,
          statusMessage: 'Activated ' + version + (result.body?.status ? ' (' + result.body.status + ')' : '.')
        });
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-rollback]').forEach(node => {
      node.addEventListener('click', async event => {
        event.preventDefault();
        const soul = node.getAttribute('data-surface-inspector-rollback') || '';
        if (!soul) return;
        setSurfaceInspectorStatus('Rolling back ' + soul + '...', 'ok');
        updateSurfaceInspectorUi();
        const result = await rollbackSurfaceWidgetVersion({ soul });
        if (!result.ok) {
          setSurfaceInspectorStatus(result.body?.error || 'Widget version rollback failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        invalidateSurfaceInspectorGraph();
        await refreshProjection();
        await selectSurfaceInspectorWidget(soul, {
          refreshGraph: true,
          statusMessage: 'Rolled back to ' + (result.body?.version || 'the previous version') + '.'
        });
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-edit-form]').forEach(node => {
      node.addEventListener('submit', async event => {
        event.preventDefault();
        const widgetId = node.getAttribute('data-widget-id') || selectedSurfaceWidgetId();
        if (!widgetId) return;
        const current = selectedSurfaceWidgetAuthored();
        if (!current) {
          setSurfaceInspectorStatus('Authored widget state is not available for editing.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        const formData = new FormData(node);
        const patch = {
          text: String(formData.get('text') ?? ''),
          title: String(formData.get('title') ?? ''),
          class: String(formData.get('class') ?? '')
        };
        const currentProps = current.props || {};
        if ((currentProps.text ?? '') === patch.text && (currentProps.title ?? '') === patch.title && (currentProps.class ?? '') === patch.class) {
          setSurfaceInspectorStatus('No widget changes to save.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        setSurfaceInspectorStatus('Saving ' + widgetId + '...', 'ok');
        updateSurfaceInspectorUi();
        const result = await patchSurfaceWidget({ id: widgetId, patch });
        if (!result.ok) {
          setSurfaceInspectorStatus(result.body?.error || 'Widget save failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        invalidateSurfaceInspectorGraph();
        invalidateSurfaceInspectorWidgets();
        await refreshProjection();
        await selectSurfaceInspectorWidget(widgetId, {
          refreshGraph: true,
          statusMessage: 'Saved ' + widgetId + '.'
        });
      });
    });
    if (state.surfaceCommandOpen && state.surfaceCommandFocusRequested !== false) {
      const input = overlay.querySelector('[data-surface-command-input]');
      if (input) {
        input.focus();
        const length = input.value.length;
        input.setSelectionRange(length, length);
      }
      state.surfaceCommandFocusRequested = false;
    }
  };
  const bootSurfaceInspector = () => {
    if (!liveSurfaceInspectable || state.surfaceInspectorBooted) return;
    state.surfaceInspectorBooted = true;
    updateSurfaceInspectorUi();
    document.addEventListener('contextmenu', event => {
      if (!state.surfaceInspectorOpen) return;
      const rootWidget = byWidget(program.rootWidget);
      const target = event.target?.closest?.('[data-widget]');
      if (!rootWidget || !target || !rootWidget.contains(target)) return;
      const widgetId = target.getAttribute('data-widget') || '';
      if (!widgetId) return;
      event.preventDefault();
      state.surfaceInspectorMenu = {
        widgetId,
        x: event.clientX,
        y: event.clientY
      };
      void selectSurfaceInspectorWidget(widgetId).catch(error => {
        setSurfaceInspectorStatus(error instanceof Error ? error.message : String(error), 'error');
        updateSurfaceInspectorUi();
      });
    }, true);
    document.addEventListener('click', event => {
      if (!state.surfaceInspectorMenu) return;
      if (event.target?.closest?.('.surface-inspector-menu')) return;
      state.surfaceInspectorMenu = null;
      updateSurfaceInspectorUi();
    }, true);
    window.addEventListener('keydown', event => {
      const active = document.activeElement;
      const typing = active?.matches?.('input, textarea, select') || active?.isContentEditable;
      const key = String(event.key || '').toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'k') {
        event.preventDefault();
        state.surfaceCommandOpen = true;
        state.surfaceCommandFocusRequested = true;
        void ensureSurfaceInspectorGraph().then(() => updateSurfaceInspectorUi()).catch(() => {});
        updateSurfaceInspectorUi();
        return;
      }
      if (event.key === 'Escape' && state.surfaceCommandOpen) {
        event.preventDefault();
        state.surfaceCommandOpen = false;
        state.surfaceCommandQuery = '';
        updateSurfaceInspectorUi();
        return;
      }
      if (event.key === '/' && !typing && !state.surfaceCommandOpen) {
        event.preventDefault();
        state.surfaceCommandOpen = true;
        state.surfaceCommandFocusRequested = true;
        void ensureSurfaceInspectorGraph().then(() => updateSurfaceInspectorUi()).catch(() => {});
        updateSurfaceInspectorUi();
        return;
      }
      if (event.key !== 'Escape') return;
      if (state.surfaceInspectorMenu) {
        event.preventDefault();
        state.surfaceInspectorMenu = null;
        updateSurfaceInspectorUi();
      }
    });
  };
  const commandTutorialStepById = new Map((commandTutorial?.steps || []).map(step => [step.id, step]));
  const commandTutorialConceptMap = new Map((commandTutorial?.concepts || []).map(concept => [concept.id, concept]));
  const commandTutorialKnownPages = [...new Set((commandTutorial?.steps || []).map(step => typeof step.page === 'string' ? step.page : '').filter(Boolean))];
  const commandTutorialPageLabel = page => page === 'app' ? 'App' : (page === 'bootstrap' ? 'Bootstrap' : (page === 'world' ? 'World' : String(page || '')));
  const commandTutorialPageHref = page => page === 'app' ? '/' : (page === 'bootstrap' ? '/_bootstrap' : (page === 'world' ? '/world' : null));
  const normalizeWorldTutorialProgress = progress => {
    if (!progress || typeof progress !== 'object') return null;
    const stepId = typeof progress.stepId === 'string' && commandTutorialStepById.has(progress.stepId) ? progress.stepId : null;
    const disabledPages = [...new Set((Array.isArray(progress.disabledPages) ? progress.disabledPages : []).map(String).filter(page => commandTutorialKnownPages.includes(page)))];
    const replayStepId = typeof progress.replayStepId === 'string' && commandTutorialStepById.has(progress.replayStepId) ? progress.replayStepId : null;
    return {
      ...progress,
      stepId,
      disabledPages,
      replayStepId
    };
  };
  const commandTutorialStep = current => commandTutorialStepById.get(current?.stepId || '') || null;
  const commandTutorialPreviousStep = current => {
    const index = (commandTutorial?.steps || []).findIndex(step => step.id === current?.stepId);
    return index > 0 ? commandTutorial.steps[index - 1] : null;
  };
  const commandTutorialNextStep = current => {
    const index = (commandTutorial?.steps || []).findIndex(step => step.id === current?.stepId);
    return index >= 0 ? (commandTutorial.steps[index + 1] || null) : (commandTutorial.steps?.[0] || null);
  };
  const commandTutorialDisabledPages = current => [...new Set((Array.isArray(current?.disabledPages) ? current.disabledPages : []).map(String).filter(page => commandTutorialKnownPages.includes(page)))];
  const commandTutorialReplayStepId = current => {
    const replayStepId = typeof current?.replayStepId === 'string' && commandTutorialStepById.has(current.replayStepId) ? current.replayStepId : null;
    return replayStepId;
  };
  const commandTutorialStepConcepts = step => [...new Set((step?.concepts || []).map(String))].map(id => commandTutorialConceptMap.get(id)).filter(Boolean);
  const commandTutorialRevealedConcepts = current => {
    if (!commandTutorial?.steps?.length) return [];
    const currentIndex = current?.completedAt
      ? (commandTutorial.steps.length - 1)
      : commandTutorial.steps.findIndex(step => step.id === current?.stepId);
    if (currentIndex < 0) return [];
    const ids = [];
    for (const step of commandTutorial.steps.slice(0, currentIndex + 1)) {
      for (const concept of commandTutorialStepConcepts(step)) {
        if (!ids.includes(concept.id)) ids.push(concept.id);
      }
    }
    return ids.map(id => commandTutorialConceptMap.get(id)).filter(Boolean);
  };
  const worldTutorialSurfaceState = current => {
    const step = commandTutorialStep(current);
    if (!current || !step) return { kind: 'idle', page: null };
    if (current.completedAt) return { kind: 'completed', page: step.page || null };
    if (current.hidden) return { kind: 'hidden', page: step.page || null };
    if ((step.page || null) !== 'world') return { kind: 'offpage', page: step.page || null };
    if (commandTutorialDisabledPages(current).includes('world')) return { kind: 'disabled', page: step.page || null };
    return { kind: 'active', page: step.page || null };
  };
  const clearWorldTutorialPageDisabled = (current, page = 'world') => ({
    ...current,
    disabledPages: commandTutorialDisabledPages(current).filter(candidate => candidate !== page)
  });
  const disableWorldTutorialOnCurrentPage = current => ({
    ...current,
    hidden: false,
    disabledPages: [...new Set([...commandTutorialDisabledPages(current), 'world'])]
  });
  const requestWorldTutorialProgress = async () => {
    if (!commandTutorial?.id || !state.session?.authenticated) {
      state.worldTutorialProgress = null;
      state.worldTutorialError = null;
      state.worldTutorialLoaded = true;
      return;
    }
    const requestId = (state.worldTutorialRequestId || 0) + 1;
    state.worldTutorialRequestId = requestId;
    const url = '/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id);
    const res = await fetch(url, requestOptions({}, { url }));
    const body = await res.json().catch(() => ({ progress: null }));
    if (state.worldTutorialRequestId !== requestId) return;
    if (!res.ok) {
      state.worldTutorialProgress = null;
      state.worldTutorialError = body?.error || 'tutorial request failed';
      state.worldTutorialLoaded = true;
      return;
    }
    state.worldTutorialProgress = normalizeWorldTutorialProgress(body.progress);
    state.worldTutorialError = null;
    state.worldTutorialLoaded = true;
  };
  const persistWorldTutorialProgress = async nextProgress => {
    if (!commandTutorial?.id || !state.session?.authenticated) {
      state.worldTutorialProgress = normalizeWorldTutorialProgress(nextProgress);
      state.worldTutorialLoaded = true;
      return { ok: true, body: { progress: state.worldTutorialProgress } };
    }
    const url = '/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id);
    const response = await fetch(url, requestOptions({
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nextProgress)
    }, { url }));
    const body = await response.json().catch(() => ({ progress: null }));
    state.worldTutorialProgress = response.ok
      ? normalizeWorldTutorialProgress(body.progress || nextProgress)
      : normalizeWorldTutorialProgress(state.worldTutorialProgress);
    state.worldTutorialError = response.ok ? null : (body.error || 'tutorial guidance update failed');
    state.worldTutorialLoaded = true;
    return { ok: response.ok, body };
  };
  const clearWorldTutorialProgress = async () => {
    if (!commandTutorial?.id || !state.session?.authenticated) {
      state.worldTutorialProgress = null;
      state.worldTutorialError = null;
      state.worldTutorialLoaded = true;
      return { ok: true, body: { progress: null } };
    }
    const url = '/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id);
    const response = await fetch(url, requestOptions({ method: 'DELETE' }, { url }));
    const body = await response.json().catch(() => ({ progress: null }));
    state.worldTutorialProgress = null;
    state.worldTutorialError = response.ok ? null : (body.error || 'tutorial guidance reset failed');
    state.worldTutorialLoaded = true;
    return { ok: response.ok, body };
  };
  const syncSession = session => {
    const authenticated = Boolean(session?.authenticated);
    state.session = authenticated ? session : { authenticated: false, identity: null, actor: null, label: null, perspective: null };
    state.actor = state.session.actor || '';
    state.worldTutorialLoaded = false;
    state.worldTutorialProgress = null;
    state.worldTutorialError = null;
    applyTheme();
    updateSurfaceInspectorUi();
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
  const activateSurfaceWidgetVersion = async ({ soul, version }) => {
    const response = await fetch('/api/widget-versions/' + encodeURIComponent(soul) + '/activate', requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version })
    }, { url: '/api/widget-versions/' + encodeURIComponent(soul) + '/activate' }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const rollbackSurfaceWidgetVersion = async ({ soul }) => {
    const response = await fetch('/api/widget-versions/' + encodeURIComponent(soul) + '/rollback', requestOptions({
      method: 'POST'
    }, { url: '/api/widget-versions/' + encodeURIComponent(soul) + '/rollback' }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
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
    if (!state.worldGraphUrlStateApplied) {
      state.worldGraphUrlStateApplied = true;
      const params = new URLSearchParams(window.location.search);
      const selectedFromUrl = params.get('select') || '';
      const modeFromUrl = params.get('mode') || '';
      if (selectedFromUrl) state.worldGraphSelectedId = selectedFromUrl;
      if (validWorldGraphModes.has(modeFromUrl)) {
        state.worldGraphMode = modeFromUrl;
        state.worldGraphInitialSourcePending = modeFromUrl === 'source';
      }
    }
    let selectedId = state.worldGraphSelectedId && byId[state.worldGraphSelectedId] ? state.worldGraphSelectedId : (nodes[0]?.id || '');
    const primitiveIndex = buildPrimitiveIndex();
    const sourceFiles = [...new Map(nodes.flatMap(n => (n.sources || []).map(src => [src.file, src])).filter(([file]) => file).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).values()];
    const currentMode = () => state.worldGraphMode || 'graph';
    const modeButton = (mode, label) => '<button class="world-mode-button ' + (currentMode() === mode ? 'world-mode-active' : '') + '" data-world-mode="' + mode + '">' + label + '</button>';
    const renderModeMenu = () => '<nav class="world-mode-menu">' +
      modeButton('graph', 'Graph') +
      modeButton('things', 'Thing List') +
      modeButton('primitive', 'Primitive Browser') +
      modeButton('witness', 'Witness Browser') +
      modeButton('source', 'Source Browser') +
      modeButton('process', 'Process Explorer') +
      '<span class="world-mode-spacer"></span>' +
      '<button class="world-command-toggle" data-world-command-toggle data-tutorial-target="world-command-toggle">Search / Command</button>' +
      '<span class="world-command-hint">Ctrl+K</span>' +
      '</nav>';
    const linkRef = id => byId[id]
      ? '<button class="world-ref-button" data-world-select="' + escapeHtml(id) + '">' + escapeHtml(id) + '</button>'
      : '<button class="world-ref-button" data-world-primitive="' + escapeHtml(String(id || '')) + '" data-world-primitive-kind="unresolved-ref">' + escapeHtml(String(id || '')) + '</button>';
    const linkKind = kind => '<button class="world-kind-button" data-world-kind="' + escapeHtml(kind) + '">' + escapeHtml(kind) + '</button>';
    const typedStringValue = value => {
      if (!value || typeof value !== 'object') return null;
      if (value.type === 'string') return String(value.value || '');
      if (value.type === 'ref') return String(value.target || '');
      return null;
    };
    const nodeValueString = (node, key) => {
      const row = (node?.values || []).find(entry => entry.key === key);
      return typedStringValue(row?.value);
    };
    const routePathFor = node => nodeValueString(node, 'path');
    const routeMethodFor = node => nodeValueString(node, 'method');
    const sourceForNode = node => (node?.sources || []).slice(-1)[0] || null;
    const processViewHref = ({ program, event }) => {
      const url = new URL('/process', window.location.origin);
      if (program) url.searchParams.set('program', program);
      if (event) url.searchParams.set('event', event);
      return url.pathname + url.search;
    };
    const currentWorldTutorialStep = commandTutorialStepById.get(state.worldTutorialProgress?.stepId || '') || null;
    const commandTutorialDisabledPageRows = () => commandTutorialDisabledPages(state.worldTutorialProgress).map(page => ({
      page,
      label: commandTutorialPageLabel(page),
      currentStepTitle: currentWorldTutorialStep?.page === page ? currentWorldTutorialStep.title : null,
      href: commandTutorialPageHref(page)
    }));
    const continueWorldTutorialOnPage = page => {
      const href = commandTutorialPageHref(page);
      if (!href) return;
      const target = new URL(href, window.location.origin);
      if (window.location.pathname === target.pathname) {
        window.location.reload();
        return;
      }
      window.location.assign(target.toString());
    };
    const queueWorldTutorialStateLoad = () => {
      if (!state.session?.authenticated || !commandTutorial?.id || state.worldTutorialLoaded === true || state.worldTutorialLoading === true) return;
      state.worldTutorialLoading = true;
      void requestWorldTutorialProgress()
        .catch(() => {})
        .finally(() => {
          state.worldTutorialLoading = false;
          if (byWidget(widget)) draw();
        });
    };
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
    const buildWorldCommandCatalog = () => {
      const selectedNode = byId[selectedId] || null;
      const items = [];
      const push = item => {
        if (!item?.id || !item?.action?.kind) return;
        items.push(item);
      };
      const modeCommands = [
        { mode: 'graph', tier: 'internal', title: 'Show Graph', subtitle: 'Operating surface / graph mode', search: 'graph surface world map objects internal operator' },
        { mode: 'things', tier: 'internal', title: 'Show Thing List', subtitle: 'Operating surface / thing list', search: 'things list widgets routes capabilities internal operator' },
        { mode: 'primitive', tier: 'internal', title: 'Show Primitive Browser', subtitle: 'Hidden surface / literals and unresolved refs', search: 'primitive browser hidden literals refs values internal operator' },
        { mode: 'witness', tier: 'internal', title: 'Show Witness Browser', subtitle: 'Witnessed history for the selected object', search: 'witness browser show witnesses selected object history internal operator' },
        { mode: 'source', tier: 'internal', title: 'Show Source Browser', subtitle: 'Hidden surface / witnessed source definitions', search: 'source browser hidden dsl file witnessed source internal operator' },
        { mode: 'process', tier: 'internal', title: 'Show Process Explorer', subtitle: 'Witnessed execution handoff surface', search: 'process explorer witnessed execution runs replay internal operator' }
      ];
      for (const command of modeCommands) {
        push({
          id: 'command:mode:' + command.mode,
          type: 'command',
          tier: command.tier,
          title: command.title,
          subtitle: command.subtitle,
          search: command.search,
          priority: 240,
          action: { kind: 'mode', mode: command.mode }
        });
      }
      if (selectedNode && sourceForNode(selectedNode)?.file) {
        push({
          id: 'command:selected-source',
          type: 'command',
          title: 'Show Source For Selected Object',
          subtitle: selectedNode.id,
          search: 'selected source show source witnesses ' + selectedNode.id,
          priority: 260,
          action: { kind: 'source', file: sourceForNode(selectedNode).file, focusId: selectedNode.id }
        });
      }
      if (selectedNode) {
        push({
          id: 'command:selected-witnesses',
          type: 'command',
          title: 'Show Witnesses For Selected Object',
          subtitle: selectedNode.id,
          search: 'show witnesses selected object history ' + selectedNode.id + ' ' + selectedNode.label,
          priority: 255,
          action: { kind: 'mode', mode: 'witness' }
        });
      }
      if (selectedNode?.processEvents?.length) {
        for (const entry of selectedNode.processEvents) {
          push({
            id: 'command:selected-process:' + selectedNode.id + ':' + entry.event,
            type: 'command',
            title: 'Show Process For ' + entry.event,
            subtitle: selectedNode.id + ' / ' + entry.stepCount + ' steps',
            search: 'show process selected object frontend program event ' + selectedNode.id + ' ' + entry.event,
            priority: 258,
            action: { kind: 'navigate', href: processViewHref({ program: selectedNode.id, event: entry.event }) }
          });
        }
      } else if (selectedNode?.processSelection?.program && selectedNode?.processSelection?.event) {
        push({
          id: 'command:selected-process:' + selectedNode.id,
          type: 'command',
          title: 'Show Process For Selected Object',
          subtitle: selectedNode.processSelection.program + ' / ' + selectedNode.processSelection.event,
          search: 'show process selected object frontend execution ' + selectedNode.id + ' ' + selectedNode.processSelection.program + ' ' + selectedNode.processSelection.event,
          priority: 257,
          action: { kind: 'navigate', href: processViewHref(selectedNode.processSelection) }
        });
      }
      const versionState = selectedNode?.widgetVersionState || null;
      const versionRows = selectedNode?.widgetVersions || [];
      if (selectedNode?.kind === 'widget' && versionRows.length) {
        for (const row of versionRows.filter(entry => !entry.isActive)) {
          push({
            id: 'command:widget-version:' + row.soul + ':' + row.version,
            type: 'command',
            title: 'Upgrade Widget To ' + row.version,
            subtitle: row.soul + (row.transitionFromActive ? ' / ' + row.transitionFromActive : ''),
            search: 'upgrade widget activate version ' + row.soul + ' ' + row.version + ' ' + (row.transitionFromActive || ''),
            priority: 250,
            action: { kind: 'widget-version-activate', soul: row.soul, version: row.version }
          });
        }
        if (versionState?.rollbackAvailable) {
          push({
            id: 'command:widget-version-rollback:' + versionState.soul,
            type: 'command',
            title: 'Rollback Widget To ' + versionState.rollbackVersion,
            subtitle: versionState.soul,
            search: 'rollback widget version ' + versionState.soul + ' ' + versionState.rollbackVersion,
            priority: 248,
            action: { kind: 'widget-version-rollback', soul: versionState.soul }
          });
        }
      }
      const builtInSurfaces = [
        { id: 'surface:home', tier: 'app', title: 'Open Home Page', subtitle: '/', search: 'home page app surface / user-facing', href: '/' },
        { id: 'surface:bootstrap', tier: 'harness', title: 'Open Bootstrap', subtitle: 'Recovery and authoring seam', search: 'bootstrap hidden recovery authoring harness /_bootstrap', href: '/_bootstrap' },
        { id: 'surface:backend-seams', tier: 'internal', title: 'Open Backend Seams', subtitle: 'Diagnostics surface', search: 'backend seams diagnostics hidden internal operator /backend-seams', href: '/backend-seams' },
        { id: 'surface:process-view', tier: 'internal', title: 'Open Process View', subtitle: 'Witnessed execution page', search: 'process view witnessed execution runs replay internal operator /process', href: '/process' }
      ];
      for (const surface of builtInSurfaces) {
        push({
          id: surface.id,
          type: 'surface',
          tier: surface.tier,
          title: surface.title,
          subtitle: surface.subtitle,
          search: surface.search,
          priority: 210,
          action: { kind: 'navigate', href: surface.href }
        });
      }
      if (state.session?.authenticated) {
        const tutorialProgress = state.worldTutorialProgress;
        if (tutorialProgress && !tutorialProgress.completedAt) {
          if (tutorialProgress.hidden && currentWorldTutorialStep?.page) {
            push({
              id: 'tutorial:resume:' + (currentWorldTutorialStep.page || 'current'),
              type: 'surface',
              tier: 'harness',
              title: 'Resume Tutorial On ' + commandTutorialPageLabel(currentWorldTutorialStep.page),
              subtitle: currentWorldTutorialStep.title || currentWorldTutorialStep.id,
              search: 'resume tutorial sourcery guidance hidden surface ' + (currentWorldTutorialStep.page || '') + ' ' + (currentWorldTutorialStep.title || ''),
              priority: 214,
              action: { kind: 'tutorial-resume', href: commandTutorialPageHref(currentWorldTutorialStep.page) || '/world' }
            });
          }
          for (const row of commandTutorialDisabledPageRows()) {
            push({
              id: 'tutorial:enable:' + row.page,
              type: 'command',
              tier: 'harness',
              title: 'Enable Tutorial On ' + row.label,
              subtitle: row.currentStepTitle || ('Guidance disabled on ' + row.label),
              search: 'enable tutorial sourcery guidance disabled surface ' + row.page + ' ' + row.label + ' ' + (row.currentStepTitle || ''),
              priority: 222,
              action: { kind: 'tutorial-enable-page', page: row.page }
            });
            if (row.href) {
              push({
                id: 'tutorial:open-disabled:' + row.page,
                type: 'surface',
                tier: 'harness',
                title: 'Open ' + row.label + ' Guidance Recovery',
                subtitle: row.currentStepTitle || ('Guidance disabled on ' + row.label),
                search: 'open disabled tutorial sourcery guidance recovery ' + row.page + ' ' + row.label + ' ' + (row.currentStepTitle || ''),
                priority: 216,
                action: { kind: 'navigate', href: row.href }
              });
            }
          }
          if (commandTutorialStep?.page && commandTutorialStep.page !== 'world') {
            const targetHref = commandTutorialPageHref(commandTutorialStep.page);
            if (targetHref) {
              push({
                id: 'tutorial:continue:' + commandTutorialStep.page,
                type: 'surface',
                tier: 'harness',
                title: 'Continue Tutorial On ' + commandTutorialPageLabel(commandTutorialStep.page),
                subtitle: commandTutorialStep.title || commandTutorialStep.id,
                search: 'continue tutorial sourcery current step surface ' + commandTutorialStep.page + ' ' + (commandTutorialStep.title || ''),
                priority: 218,
                action: { kind: 'navigate', href: targetHref }
              });
            }
          }
        }
      }
      for (const node of nodes) {
        const keywords = [node.id, node.label, node.kind, node.context, node.surfaceTier, node.surfaceLabel, ...(node.badges || []).map(b => b.label || b)].filter(Boolean).join(' ');
        push({
          id: 'node:' + node.id,
          type: node.kind || 'thing',
          tier: node.surfaceTier || null,
          title: String(node.label || node.id),
          subtitle: (node.kind || 'thing') + (node.surfaceTier ? ' / ' + node.surfaceTier : '') + (node.context ? ' / ' + node.context : ''),
          search: keywords,
          priority: node.kind === 'capability' ? 190 : node.kind === 'widget' ? 180 : node.kind === 'process' ? 175 : 150,
          action: { kind: 'select', id: node.id, mode: 'graph' }
        });
        const routePath = routePathFor(node);
        if (node.kind === 'route' && routePath && routeMethodFor(node) === 'GET') {
          push({
            id: 'route:' + node.id,
            type: 'page',
            tier: node.surfaceTier || null,
            title: 'Open Page ' + routePath,
            subtitle: node.id + (node.surfaceTier ? ' / ' + node.surfaceTier : ''),
            search: 'page route surface ' + routePath + ' ' + node.id + ' ' + (node.surfaceTier || ''),
            priority: 205,
            action: { kind: 'navigate', href: routePath }
          });
        }
        if (node.kind === 'process') {
          push({
            id: 'execution:' + node.id,
            type: 'execution',
            tier: node.surfaceTier || null,
            title: 'Inspect Witnessed Process ' + String(node.label || node.id),
            subtitle: node.context || 'process',
            search: 'witnessed execution process witnesses runs ' + keywords,
            priority: 185,
            action: { kind: 'select', id: node.id, mode: 'graph' }
          });
        }
        const source = sourceForNode(node);
        if (source?.file) {
          push({
            id: 'source:' + node.id,
            type: 'source',
            tier: node.surfaceTier || null,
            title: 'Open Source For ' + String(node.label || node.id),
            subtitle: source.file,
            search: 'source witnessed file dsl ' + keywords + ' ' + source.file,
            priority: 170,
            action: { kind: 'source', file: source.file, focusId: node.id }
          });
        }
      }
      return [...new Map(items.map(item => [item.id, item])).values()];
    };
    const scoreWorldCommandItem = (item, query) => {
      if (!query) return item.priority || 0;
      const haystack = ((item.title || '') + ' ' + (item.subtitle || '') + ' ' + (item.search || '')).toLowerCase();
      const title = String(item.title || '').toLowerCase();
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return item.priority || 0;
      let score = item.priority || 0;
      for (const term of terms) {
        if (title === term) score += 220;
        else if (title.startsWith(term)) score += 120;
        else if (title.includes(term)) score += 70;
        else if (haystack.includes(term)) score += 25;
        else return -1;
      }
      return score;
    };
    const visibleWorldCommands = () => {
      const query = String(state.worldCommandQuery || '').trim();
      return buildWorldCommandCatalog()
        .map(item => ({ ...item, score: scoreWorldCommandItem(item, query) }))
        .filter(item => item.score >= 0)
        .sort((a, b) => (b.score - a.score) || String(a.title).localeCompare(String(b.title)))
        .slice(0, query ? 24 : 12);
    };
    const renderWorldCommandPalette = () => {
      if (!state.worldCommandOpen) return '';
      const query = String(state.worldCommandQuery || '');
      const items = visibleWorldCommands();
      const results = items.length
        ? items.map((item, index) => '<button class="world-command-item" data-world-command-run="' + index + '"><strong>' + escapeHtml(item.title) + '</strong><span class="world-command-meta">' + escapeHtml(item.type) + (item.tier ? ' / ' + item.tier : '') + (item.subtitle ? ' / ' + item.subtitle : '') + '</span></button>').join('')
        : '<div class="world-command-empty">No matching surfaces, objects, or commands.</div>';
      return '<section class="world-command-palette" data-world-command-palette>' +
        '<div class="world-command-head">' +
        '<input class="world-command-input" data-world-command-input placeholder="Search pages, widgets, capabilities, execution, commands..." value="' + escapeHtml(query) + '" />' +
        '<button class="world-command-toggle" data-world-command-close>Close</button>' +
        '</div>' +
        '<div class="world-command-list">' + results + '</div>' +
        '</section>';
    };
    const renderWorldTutorialConceptList = (concepts, emptyText) => (
      '<div class="tutorial-concept-list">' +
      (concepts.length
        ? concepts.map(concept => '<div class="tutorial-concept"><strong>' + escapeHtml(concept.label) + '</strong><span>' + escapeHtml(concept.summary) + '</span></div>').join('')
        : '<div class="tutorial-concept"><span>' + escapeHtml(emptyText) + '</span></div>') +
      '</div>'
    );
    const renderWorldTutorialPanel = () => {
      if (!state.session?.authenticated) return '';
      const progress = state.worldTutorialProgress;
      const step = commandTutorialStep(progress);
      const surface = worldTutorialSurfaceState(progress);
      if (!progress && !state.worldTutorialError) return '';
      const currentConcepts = step ? commandTutorialStepConcepts(step) : [];
      const revealedConcepts = commandTutorialRevealedConcepts(progress);
      const disabledRows = commandTutorialDisabledPageRows();
      const previous = commandTutorialPreviousStep(progress);
      const summary = !progress
        ? 'Tutorial progress is not active on this surface yet.'
        : progress.completedAt
          ? 'Tutorial complete. The world surface remains available for truthful inspection and handoff into real product pages.'
          : surface.kind === 'offpage'
            ? (surface.page && commandTutorialDisabledPages(progress).includes(surface.page)
                ? ('Current guidance continues on the ' + commandTutorialPageLabel(surface.page) + ' surface, but guidance is disabled there until you re-enable it.')
                : ('Current guidance continues on the ' + commandTutorialPageLabel(surface.page) + ' surface.'))
            : surface.kind === 'disabled'
              ? 'Guidance is disabled on this page, but the current step remains recoverable without losing progress.'
              : surface.kind === 'hidden'
                ? 'Tutorial paused. Resume to continue with the current authored step.'
                : (commandTutorialReplayStepId(progress) === step?.id
                    ? ('Replaying this step from here: ' + (step?.title || '') + '. This replays guidance only and does not roll back app state.')
                    : (step ? (step.title + ' (' + step.chapterId + ' / ' + step.page + ')') : 'Tutorial in progress.'));
      const disabledList = disabledRows.length
        ? '<div class="world-tutorial-list">' + disabledRows.map(row =>
          '<div class="world-tutorial-item"><strong>' + escapeHtml(row.label) + '</strong><p>' + escapeHtml(row.currentStepTitle ? ('Current step there: ' + row.currentStepTitle + '.') : 'Guidance is disabled on this surface, but you can re-enable it without resetting progress.') + '</p></div>'
        ).join('') + '</div>'
        : '';
      return '<section class="world-tutorial-panel" data-world-tutorial-panel>' +
        '<div class="world-tutorial-meta">Sourcery / ' + escapeHtml(surface.kind) + '</div>' +
        '<h2>' + escapeHtml(step?.title || 'Tutorial status') + '</h2>' +
        '<div class="world-tutorial-summary">' + escapeHtml(summary) + '</div>' +
        '<div class="world-tutorial-actions">' +
          (step?.target && surface.kind === 'active' ? '<button type="button" class="secondary" data-world-tutorial-focus-target="' + escapeHtml(step.target) + '">Show Current Control</button>' : '') +
          (progress && !progress.completedAt ? '<button type="button" class="secondary" data-world-tutorial-resume>' + escapeHtml(surface.kind === 'offpage' ? ('Continue On ' + commandTutorialPageLabel(surface.page)) : (surface.kind === 'disabled' ? 'Enable On This Page' : 'Resume Tutorial')) + '</button>' : '') +
          (surface.kind === 'active' && previous ? '<button type="button" class="secondary" data-world-tutorial-back>Back</button>' : '') +
          (surface.kind === 'active' && step ? '<button type="button" data-world-tutorial-next>' + escapeHtml(step.nextLabel || 'Next') + '</button>' : '') +
          (progress && !progress.completedAt ? '<button type="button" class="secondary" data-world-tutorial-restart-chapter>Restart Chapter</button>' : '') +
          (progress && !progress.completedAt && step ? '<button type="button" class="secondary" data-world-tutorial-restart-step>Restart From Here</button>' : '') +
          (surface.kind === 'active' && step?.page === 'world' ? '<button type="button" class="secondary" data-world-tutorial-disable>Disable On This Page</button>' : '') +
          (progress && !progress.completedAt && !progress.hidden ? '<button type="button" class="secondary" data-world-tutorial-exit>Exit</button>' : '') +
          (progress ? '<button type="button" class="secondary" data-world-tutorial-reset>Reset</button>' : '') +
        '</div>' +
        renderWorldTutorialConceptList(currentConcepts, 'This step uses the current product surface without unlocking a new concept.') +
        renderWorldTutorialConceptList(revealedConcepts, 'No concepts revealed on this surface yet.') +
        disabledList +
      '</section>';
    };
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
        ['surface', node.surfaceLabel ? escapeHtml(String(node.surfaceLabel)) : ''],
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
      const witnessList = (node.recentWitnesses || []).length ? '<div class="world-inspector-list"><strong>Recent witnesses</strong>' + node.recentWitnesses.slice(0, 6).map(entry =>
        '<div class="world-inspector-item"><div><strong>' + escapeHtml(entry.process || entry.id) + '</strong></div><div class="world-node-kind">' + escapeHtml(entry.actor || '') + '</div><button class="world-ref-button" data-world-mode="witness">Open witness browser</button></div>'
      ).join('') + '</div>' : '';
      const processList = (node.processEvents || []).length
        ? '<div class="world-inspector-list"><strong>Process explorer</strong>' + node.processEvents.map(entry =>
          '<div class="world-inspector-item"><div><strong>' + escapeHtml(entry.event) + '</strong></div><div class="world-node-kind">' + escapeHtml(String(entry.stepCount || 0)) + ' steps / ' + escapeHtml(String(entry.asyncCount || 0)) + ' async</div><button class="world-ref-button" data-world-open-process-program="' + escapeHtml(node.id) + '" data-world-open-process-event="' + escapeHtml(entry.event) + '">Open process view</button></div>'
        ).join('') + '</div>'
        : (node.processSelection?.program && node.processSelection?.event
          ? '<div class="world-inspector-list"><strong>Process explorer</strong><div class="world-inspector-item"><div><strong>' + escapeHtml(node.processSelection.event) + '</strong></div><div class="world-node-kind">' + escapeHtml(node.processSelection.program) + '</div><button class="world-ref-button" data-world-open-process-program="' + escapeHtml(node.processSelection.program) + '" data-world-open-process-event="' + escapeHtml(node.processSelection.event) + '">Open process view</button></div></div>'
          : '');
      const versionState = node.widgetVersionState || null;
      const versionStatus = state.worldGraphVersionStatus && state.worldGraphVersionStatus.soul === node.id
        ? '<div class="world-version-status" data-level="' + escapeHtml(state.worldGraphVersionStatus.level || 'info') + '">' + escapeHtml(state.worldGraphVersionStatus.message || '') + '</div>'
        : '';
      const widgetVersionList = (node.widgetVersions || []).length ? '<div class="world-inspector-list"><strong>Widget versions</strong>' +
        '<div class="world-inspector-row"><span class="world-inspector-key">active</span><span>' + (versionState?.activeVersion ? escapeHtml(versionState.activeVersion) : 'none') + '</span></div>' +
        node.widgetVersions.map(entry => {
          const badges = [
            entry.isActive ? 'active' : '',
            entry.transitionFromActive ? ('from current: ' + entry.transitionFromActive) : '',
            entry.transitionToActive ? ('to current: ' + entry.transitionToActive) : ''
          ].filter(Boolean).map(label => '<span class="world-badge">' + escapeHtml(label) + '</span>').join('');
          const actions = entry.isActive
            ? ''
            : '<div class="world-version-actions"><button class="world-ref-button" data-world-widget-activate="' + escapeHtml(entry.soul) + '" data-world-widget-version="' + escapeHtml(entry.version) + '">Activate</button></div>';
          return '<div class="world-inspector-item world-version-item"><div><strong>' + escapeHtml(entry.version) + '</strong></div><div class="world-node-kind">' + escapeHtml(entry.kind || 'widget') + ' / index ' + escapeHtml(String(entry.index ?? 0)) + '</div><div class="world-badges">' + badges + '</div>' + actions + '<pre class="world-source-ast">' + escapeHtml(JSON.stringify(entry.propsPreview ?? {}, null, 2)) + '</pre></div>';
        }).join('') +
        (versionState?.rollbackAvailable ? '<div class="world-version-actions"><button class="world-ref-button" data-world-widget-rollback="' + escapeHtml(versionState.soul) + '">Rollback to ' + escapeHtml(versionState.rollbackVersion || '') + '</button></div>' : '') +
        ((versionState?.history || []).length ? '<div class="world-inspector-list"><strong>Activation history</strong>' + versionState.history.slice(-6).reverse().map(entry => '<div class="world-inspector-item"><strong>' + escapeHtml(entry.version || '') + '</strong><br><span class="world-node-kind">' + escapeHtml(entry.actor || '') + ' / ' + escapeHtml(entry.witnessId || '') + '</span></div>').join('') + '</div>' : '') +
        versionStatus +
        '</div>' : '';
      return '<h2>Selected Object</h2>' +
        rows.map(([k, v]) => '<div class="world-inspector-row"><span class="world-inspector-key">' + escapeHtml(k) + '</span><span>' + v + '</span></div>').join('') +
        '<div class="world-badges">' + badges + '</div>' +
        propertyList('Object properties', node.properties) +
        propertyList('Values', node.values) +
        edgeList('Associations from this object', outgoing, 'out') +
        edgeList('Associations to this object', incoming, 'in') +
        associationPropertyList +
        processList +
        widgetVersionList +
        witnessList +
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
    const renderWitnessBrowser = () => {
      const node = byId[selectedId];
      const witnesses = node?.recentWitnesses || [];
      if (!node) return '<div class="world-witness-browser"><h2>Witness Browser</h2><div class="world-command-empty">Select an object to inspect its witnessed history.</div></div>';
      return '<div class="world-witness-browser"><h2>Witness Browser</h2><div class="world-command-meta">' + escapeHtml(String(node.label || node.id)) + ' / ' + escapeHtml(node.kind || 'thing') + '</div>' +
        (witnesses.length
          ? witnesses.map(entry => '<article class="world-witness-card"><div><strong>' + escapeHtml(entry.process || entry.id) + '</strong></div><div class="world-command-meta">' + escapeHtml(entry.id || '') + (entry.actor ? ' / actor ' + escapeHtml(entry.actor) : '') + (entry.cause ? ' / cause ' + escapeHtml(entry.cause) : '') + '</div><pre>' + escapeHtml(JSON.stringify(entry.body ?? {}, null, 2)) + '</pre></article>').join('')
          : '<div class="world-command-empty">No recent witnessed history for this object.</div>') +
        '</div>';
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
      if (currentMode() === 'witness') return renderWitnessBrowser();
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
    const focusWorldTutorialTarget = targetName => {
      if (!targetName) return false;
      const target = root.querySelector('[data-tutorial-target="' + CSS.escape(targetName) + '"]');
      if (!target) return false;
      const scope = target.closest('.world-main-pane, .world-graph-inspector, .world-command-palette, nav, form, section') || target;
      root.querySelectorAll('[data-tutorial-current]').forEach(node => node.removeAttribute('data-tutorial-current'));
      root.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
      scope.setAttribute('data-tutorial-focus-scope', 'true');
      target.setAttribute('data-tutorial-current', 'true');
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const focusable = target.matches?.('input, textarea, select, button, a')
        ? target
        : target.querySelector?.('input, textarea, select, button, a, [tabindex]');
      focusable?.focus?.({ preventScroll: true });
      return true;
    };
    const updateWorldTutorialApi = () => {
      window.__witnessTutorial = {
        get currentStepId() { return state.worldTutorialProgress?.stepId || null; },
        get currentChapterId() { return state.worldTutorialProgress?.chapterId || null; },
        get currentPage() { return commandTutorialStep(state.worldTutorialProgress)?.page || null; },
        get currentConceptIds() { return commandTutorialStepConcepts(commandTutorialStep(state.worldTutorialProgress)).map(concept => concept.id); },
        get revealedConceptIds() { return commandTutorialRevealedConcepts(state.worldTutorialProgress).map(concept => concept.id); },
        get replayStepId() { return commandTutorialReplayStepId(state.worldTutorialProgress); },
        get completedAt() { return state.worldTutorialProgress?.completedAt || null; },
        get hidden() { return state.worldTutorialProgress?.hidden === true; },
        get disabledPages() { return commandTutorialDisabledPages(state.worldTutorialProgress); },
        get surfacePage() { return 'world'; },
        get surfaceStatus() { return worldTutorialSurfaceState(state.worldTutorialProgress).kind; }
      };
    };
    const advanceWorldTutorial = async () => {
      const current = state.worldTutorialProgress;
      const next = commandTutorialNextStep(current);
      if (!current) return;
      if (!next) {
        await persistWorldTutorialProgress({
          ...current,
          chapterStatus: 'completed',
          completedAt: new Date().toISOString(),
          hidden: false,
          replayStepId: null
        });
        return;
      }
      await persistWorldTutorialProgress({
        ...current,
        chapterId: next.chapterId,
        stepId: next.id,
        chapterStatus: 'in_progress',
        completedAt: null,
        hidden: false,
        replayStepId: null
      });
    };
    const backWorldTutorial = async () => {
      const current = state.worldTutorialProgress;
      const previous = commandTutorialPreviousStep(current);
      if (!current || !previous) return;
      await persistWorldTutorialProgress({
        ...current,
        chapterId: previous.chapterId,
        stepId: previous.id,
        completedAt: null,
        hidden: false,
        replayStepId: previous.id
      });
    };
    const restartWorldTutorialChapter = async () => {
      const current = state.worldTutorialProgress;
      const step = commandTutorialStep(current);
      const first = (commandTutorial?.steps || []).find(candidate => candidate.chapterId === (current?.chapterId || step?.chapterId));
      if (!current || !first) return;
      await persistWorldTutorialProgress({
        ...current,
        chapterId: first.chapterId,
        stepId: first.id,
        chapterStatus: 'in_progress',
        completedAt: null,
        hidden: false,
        replayStepId: null
      });
    };
    const restartWorldTutorialFromHere = async () => {
      const current = state.worldTutorialProgress;
      const step = commandTutorialStep(current);
      if (!current || !step) return;
      await persistWorldTutorialProgress({
        ...current,
        chapterId: step.chapterId,
        stepId: step.id,
        chapterStatus: 'in_progress',
        completedAt: null,
        hidden: false,
        replayStepId: step.id
      });
    };
    const resumeWorldTutorial = async () => {
      const current = state.worldTutorialProgress;
      const surface = worldTutorialSurfaceState(current);
      if (!current) return;
      if (surface.kind === 'offpage') {
        continueWorldTutorialOnPage(surface.page);
        return;
      }
      if (surface.kind === 'disabled') {
        await persistWorldTutorialProgress(clearWorldTutorialPageDisabled(current));
        return;
      }
      await persistWorldTutorialProgress({ ...current, hidden: false, replayStepId: null });
    };
    const executeWorldCommand = async item => {
      if (!item?.action) return;
      const action = item.action;
      state.worldCommandOpen = false;
      state.worldCommandQuery = '';
      state.worldCommandFocusRequested = false;
      if (action.kind === 'navigate') {
        window.location.assign(action.href);
        return;
      }
      if (action.kind === 'mode') {
        state.worldGraphMode = action.mode || 'graph';
        if (state.worldGraphMode !== 'source') state.worldGraphSource = null;
        if (state.worldGraphMode === 'source' && !state.worldGraphSource) await openSourceForSelected();
        draw();
        return;
      }
      if (action.kind === 'source') {
        await openSourceFile(action.file, action.focusId || selectedId);
        draw();
        return;
      }
      if (action.kind === 'tutorial-enable-page') {
        if (!state.session?.authenticated || !state.worldTutorialProgress) return;
        const nextProgress = {
          ...state.worldTutorialProgress,
          disabledPages: commandTutorialDisabledPages(state.worldTutorialProgress).filter(page => page !== action.page)
        };
        const response = await fetch('/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id), requestOptions({
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(nextProgress)
        }, { url: '/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id) }));
        const body = await response.json().catch(() => ({}));
        state.worldTutorialProgress = response.ok
          ? normalizeWorldTutorialProgress(body.progress || nextProgress)
          : state.worldTutorialProgress;
        state.worldTutorialError = response.ok ? null : (body.error || 'tutorial guidance update failed');
        state.worldTutorialLoaded = true;
        state.worldCommandOpen = false;
        state.worldCommandQuery = '';
        draw();
        return;
      }
      if (action.kind === 'tutorial-resume') {
        if (state.session?.authenticated && state.worldTutorialProgress) {
          const nextProgress = {
            ...state.worldTutorialProgress,
            hidden: false
          };
          await fetch('/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id), requestOptions({
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(nextProgress)
          }, { url: '/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id) })).catch(() => {});
          state.worldTutorialProgress = normalizeWorldTutorialProgress(nextProgress);
          state.worldTutorialLoaded = true;
        }
        window.location.assign(action.href);
        return;
      }
      if (action.kind === 'widget-version-activate') {
        await requestWidgetVersionChange({ soul: action.soul, version: action.version });
        return;
      }
      if (action.kind === 'widget-version-rollback') {
        await requestWidgetVersionRollback({ soul: action.soul });
        return;
      }
      if (action.kind === 'select') {
        selectedId = action.id;
        state.worldGraphSelectedId = action.id;
        state.worldGraphSelectedKind = '';
        state.worldGraphPrimitiveMode = false;
        state.worldGraphMode = action.mode || 'graph';
        if (state.worldGraphMode === 'source') await openSourceForSelected();
        else state.worldGraphSource = null;
        draw();
      }
    };
    const requestWidgetVersionChange = async ({ soul, version }) => {
      if (!soul || !version) return;
      const response = await fetch('/api/widget-versions/' + encodeURIComponent(soul) + '/activate', requestOptions({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version })
      }, { url: '/api/widget-versions/' + encodeURIComponent(soul) + '/activate' }));
      const body = await response.json().catch(() => ({}));
      state.worldGraphVersionStatus = {
        soul,
        level: response.ok ? 'ok' : 'error',
        message: response.ok
          ? ('Activated ' + version + (body.status ? ' (' + body.status + ')' : ''))
          : (body.error || 'Widget version activation failed')
      };
      selectedId = soul;
      state.worldGraphSelectedId = soul;
      state.worldGraphSelectedKind = '';
      state.worldGraphMode = 'graph';
      state.worldGraphSource = null;
      if (!response.ok) {
        draw();
        return;
      }
      await refreshProjection();
    };
    const requestWidgetVersionRollback = async ({ soul }) => {
      if (!soul) return;
      const response = await fetch('/api/widget-versions/' + encodeURIComponent(soul) + '/rollback', requestOptions({
        method: 'POST'
      }, { url: '/api/widget-versions/' + encodeURIComponent(soul) + '/rollback' }));
      const body = await response.json().catch(() => ({}));
      state.worldGraphVersionStatus = {
        soul,
        level: response.ok ? 'ok' : 'error',
        message: response.ok
          ? ('Rolled back to ' + (body.version || 'previous version'))
          : (body.error || 'Widget version rollback failed')
      };
      selectedId = soul;
      state.worldGraphSelectedId = soul;
      state.worldGraphSelectedKind = '';
      state.worldGraphMode = 'graph';
      state.worldGraphSource = null;
      if (!response.ok) {
        draw();
        return;
      }
      await refreshProjection();
    };
    const draw = () => {
      queueWorldTutorialStateLoad();
      root.innerHTML = '<div class="world-graph-shell"><aside class="world-graph-inspector" data-world-inspector>' + renderWorldTutorialPanel() + renderInspector() + '</aside><section class="world-main-pane">' + renderModeMenu() + renderWorldCommandPalette() + renderCanvas() + '</section></div>';
      if (state.worldGraphInitialSourcePending && currentMode() === 'source' && !state.worldGraphSource && !state.worldGraphSourceLoading) {
        state.worldGraphInitialSourcePending = false;
        state.worldGraphSourceLoading = true;
        void openSourceForSelected()
          .catch(() => {})
          .finally(() => {
            state.worldGraphSourceLoading = false;
            if (byWidget(widget)) draw();
          });
      }
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
      root.querySelectorAll('[data-world-widget-activate]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await requestWidgetVersionChange({
            soul: el.getAttribute('data-world-widget-activate') || '',
            version: el.getAttribute('data-world-widget-version') || ''
          });
        });
      });
      root.querySelectorAll('[data-world-widget-rollback]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await requestWidgetVersionRollback({
            soul: el.getAttribute('data-world-widget-rollback') || ''
          });
        });
      });
      root.querySelectorAll('[data-world-open-process-program]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          const program = el.getAttribute('data-world-open-process-program') || '';
          const processEvent = el.getAttribute('data-world-open-process-event') || '';
          if (!program || !processEvent) return;
          window.location.assign(processViewHref({ program, event: processEvent }));
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
      root.querySelectorAll('[data-world-command-toggle]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          state.worldCommandOpen = true;
          state.worldCommandFocusRequested = true;
          draw();
        });
      });
      root.querySelectorAll('[data-world-command-close]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          state.worldCommandOpen = false;
          state.worldCommandQuery = '';
          draw();
        });
      });
      root.querySelectorAll('[data-world-command-input]').forEach(el => {
        el.addEventListener('input', () => {
          state.worldCommandQuery = el.value || '';
          state.worldCommandFocusRequested = true;
          draw();
        });
        el.addEventListener('keydown', async event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const items = visibleWorldCommands();
          if (items[0]) await executeWorldCommand(items[0]);
        });
      });
      root.querySelectorAll('[data-world-command-run]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          const index = Number(el.getAttribute('data-world-command-run'));
          const items = visibleWorldCommands();
          if (Number.isFinite(index) && items[index]) await executeWorldCommand(items[index]);
        });
      });
      root.querySelectorAll('[data-world-tutorial-focus-target]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          focusWorldTutorialTarget(el.getAttribute('data-world-tutorial-focus-target') || '');
        });
      });
      root.querySelectorAll('[data-world-tutorial-resume]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await resumeWorldTutorial();
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-next]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await advanceWorldTutorial();
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-back]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await backWorldTutorial();
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-restart-chapter]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await restartWorldTutorialChapter();
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-restart-step]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await restartWorldTutorialFromHere();
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-disable]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          if (!state.worldTutorialProgress) return;
          await persistWorldTutorialProgress(disableWorldTutorialOnCurrentPage(state.worldTutorialProgress));
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-exit]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          if (!state.worldTutorialProgress) return;
          await persistWorldTutorialProgress({ ...state.worldTutorialProgress, hidden: true, replayStepId: null });
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-reset]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await clearWorldTutorialProgress();
          draw();
        });
      });
      const selected = byId[selectedId];
      const canvas = root.querySelector('.world-graph-canvas');
      if (selected && canvas && currentMode() === 'graph') {
        canvas.scrollLeft = Math.max(0, (selected.x || 0) - canvas.clientWidth / 2 + 95);
        canvas.scrollTop = Math.max(0, (selected.y || 0) - canvas.clientHeight / 2 + 28);
      }
      updateWorldTutorialApi();
      if (worldTutorialSurfaceState(state.worldTutorialProgress).kind === 'active') {
        focusWorldTutorialTarget(commandTutorialStep(state.worldTutorialProgress)?.target || '');
      } else {
        root.querySelectorAll('[data-tutorial-current]').forEach(node => node.removeAttribute('data-tutorial-current'));
        root.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
      }
      if (state.worldCommandOpen && state.worldCommandFocusRequested !== false) {
        const input = root.querySelector('[data-world-command-input]');
        if (input) {
          input.focus();
          const length = input.value.length;
          input.setSelectionRange(length, length);
        }
        state.worldCommandFocusRequested = false;
      }
    };
    if (!state.worldCommandShortcutBound) {
      state.worldCommandShortcutBound = true;
      window.addEventListener('keydown', event => {
        const active = document.activeElement;
        const typing = active?.matches?.('input, textarea, select') || active?.isContentEditable;
        const key = String(event.key || '').toLowerCase();
        if ((event.ctrlKey || event.metaKey) && key === 'k') {
          event.preventDefault();
          state.worldCommandOpen = true;
          state.worldCommandFocusRequested = true;
          draw();
          return;
        }
        if (event.key === 'Escape' && state.worldCommandOpen) {
          event.preventDefault();
          state.worldCommandOpen = false;
          state.worldCommandQuery = '';
          draw();
          return;
        }
        if (event.key === '/' && !typing && !state.worldCommandOpen) {
          event.preventDefault();
          state.worldCommandOpen = true;
          state.worldCommandFocusRequested = true;
          draw();
        }
      });
    }
    draw();
  };
  const initSession = async () => {
    const res = await fetch('/api/session', requestOptions({}, { url: '/api/session' }));
    const body = await res.json().catch(() => ({ authenticated: false }));
    if (!res.ok) throw new Error(body?.error || 'session request failed');
    syncSession(body);
    await requestWorldTutorialProgress().catch(() => {});
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
    await requestWorldTutorialProgress().catch(() => {});
  };
  const logout = async () => {
    const res = await fetch('/api/session', requestOptions({ method: 'DELETE' }, { url: '/api/session' }));
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || 'logout failed');
    }
    syncSession({ authenticated: false, identity: null, actor: null, label: null, perspective: null });
    await requestWorldTutorialProgress().catch(() => {});
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
      invalidateSurfaceInspectorGraph();
      invalidateSurfaceInspectorWidgets();
      applySurfaceInspectorHighlight(selectedSurfaceWidgetId());
      updateSurfaceInspectorUi();
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
  bootSurfaceInspector();
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    event.preventDefault();
    safeRun('click:' + button.dataset.action, { ...button.dataset, done: button.dataset.done === 'true' });
  });
  bootLiveProjection();
  updateSurfaceInspectorUi();
  safeRun('load');
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
})();`;
  return `<script type="application/json" id="witness-frontend-program">${json}</script>\n<script>\n${engine}\n</script>`;
}

function renderTutorialClient(tutorialConfig) {
  const tutorial = tutorialDefinition(tutorialConfig?.id);
  if (!tutorial) return "";
  const json = JSON.stringify(tutorial).replace(/</g, "\\u003c");
  const engine = String.raw`(() => {
  const tutorial = ${json};
  const currentSurfacePage = "app";
  const stepIndex = new Map(tutorial.steps.map((step, index) => [step.id, index]));
  const byTarget = target => document.querySelector('[data-tutorial-target="' + CSS.escape(target) + '"]');
  const dimmer = document.createElement('div');
  dimmer.className = 'tutorial-dimmer';
  dimmer.hidden = true;
  document.body.appendChild(dimmer);
  const overlay = document.createElement('aside');
  overlay.className = 'tutorial-overlay';
  overlay.hidden = true;
  overlay.innerHTML = '<div class="tutorial-overlay-handle" id="tutorial-overlay-handle"><div class="tutorial-handle-copy"><div class="tutorial-overlay-meta" id="tutorial-overlay-meta"></div><div class="tutorial-handle-kicker">Drag tutorial window</div></div><div class="tutorial-handle-grip" aria-hidden="true">::</div></div><h3 id="tutorial-overlay-title"></h3><p id="tutorial-overlay-body"></p><div class="tutorial-concept-list" id="tutorial-overlay-concepts"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="tutorial-next">Next</button><button type="button" id="tutorial-back">Back</button><button type="button" id="tutorial-restart-chapter">Restart Chapter</button><button type="button" id="tutorial-restart-step">Restart From Here</button><button type="button" id="tutorial-disable-page">Disable On This Page</button><button type="button" id="tutorial-exit">Exit</button><button type="button" id="tutorial-reset">Reset</button></div>';
  document.body.appendChild(overlay);
  const resumeButton = document.createElement('button');
  resumeButton.type = 'button';
  resumeButton.id = 'tutorial-resume-page';
  resumeButton.textContent = 'Resume Tutorial';
  resumeButton.className = 'tutorial-resume';
  resumeButton.hidden = true;
  document.body.appendChild(resumeButton);
  const overlayDrag = { active: false, manual: false, left: 16, top: 16, offsetX: 0, offsetY: 0 };
  const pulseTimers = new WeakMap();
  let progress = null;
  let lastRenderedStepId = null;
  let activeHighlightTarget = null;
  let activeFocusScope = null;
  const api = async (method, body = null) => {
    const options = { method };
    if (body != null) {
      options.headers = { 'content-type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    const res = await fetch('/api/tutorial-progress/' + encodeURIComponent(tutorial.id), options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'tutorial request failed');
    return data;
  };
  const currentStep = () => tutorial.steps.find(step => step.id === progress?.stepId) || null;
  const currentStepIndex = () => stepIndex.get(progress?.stepId || '') ?? -1;
  const conceptMap = new Map((tutorial.concepts || []).map(concept => [concept.id, concept]));
  const knownTutorialPages = [...new Set(tutorial.steps.map(step => typeof step.page === 'string' ? step.page : '').filter(Boolean))];
  const tutorialDisabledPages = current => [...new Set((Array.isArray(current?.disabledPages) ? current.disabledPages : []).map(String).filter(page => knownTutorialPages.includes(page)))];
  const tutorialReplayStepId = current => {
    const id = typeof current?.replayStepId === 'string' ? current.replayStepId : '';
    return tutorial.steps.some(step => step.id === id) ? id : null;
  };
  const tutorialPageLabel = page => page === 'app' ? 'App' : (page === 'bootstrap' ? 'Bootstrap' : (page === 'world' ? 'World' : String(page || '')));
  const tutorialStepConcepts = step => [...new Set((step?.concepts || []).map(String))].map(id => conceptMap.get(id)).filter(Boolean);
  const tutorialRevealedConcepts = current => {
    const lastIndex = current?.completedAt ? ((tutorial.steps?.length || 1) - 1) : currentStepIndex();
    if (lastIndex < 0) return [];
    const conceptIds = [];
    for (const step of tutorial.steps.slice(0, lastIndex + 1)) {
      for (const concept of tutorialStepConcepts(step)) {
        if (!conceptIds.includes(concept.id)) conceptIds.push(concept.id);
      }
    }
    return conceptIds.map(id => conceptMap.get(id)).filter(Boolean);
  };
  const tutorialSurfaceState = () => {
    const step = currentStep();
    if (!progress || !step) return { kind: 'idle', page: null };
    if (progress.completedAt) return { kind: 'completed', page: step.page || null };
    if (progress.hidden) return { kind: 'hidden', page: step.page || null };
    if ((step.page || null) !== currentSurfacePage) return { kind: 'offpage', page: step.page || null };
    if (tutorialDisabledPages(progress).includes(currentSurfacePage)) return { kind: 'disabled', page: step.page || null };
    return { kind: 'active', page: step.page || null };
  };
  const clearTutorialPageDisabled = current => ({
    ...current,
    disabledPages: tutorialDisabledPages(current).filter(page => page !== currentSurfacePage)
  });
  const disableTutorialOnCurrentPage = current => ({
    ...current,
    hidden: false,
    disabledPages: [...new Set([...tutorialDisabledPages(current), currentSurfacePage])]
  });
  const continueTutorialOnPage = async page => {
    if (page === 'bootstrap') {
      const target = new URL('/_bootstrap', window.location.href);
      if (window.location.pathname === target.pathname) {
        window.location.reload();
        return;
      }
      window.location.assign(target.toString());
      return;
    }
    if (page === 'app') {
      window.location.assign(new URL('/', window.location.href).toString());
      return;
    }
    if (page === 'world') {
      const target = new URL('/world', window.location.href);
      if (window.location.pathname === target.pathname) {
        window.location.reload();
        return;
      }
      window.location.assign(target.toString());
    }
  };
  const clearHighlight = () => {
    if (activeHighlightTarget?.isConnected) activeHighlightTarget.removeAttribute('data-tutorial-current');
    if (activeFocusScope?.isConnected) activeFocusScope.removeAttribute('data-tutorial-focus-scope');
    activeHighlightTarget = null;
    activeFocusScope = null;
    document.querySelectorAll('[data-tutorial-current]').forEach(node => node.removeAttribute('data-tutorial-current'));
    document.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
  };
  const previousStep = () => {
    const index = currentStepIndex();
    return index > 0 ? tutorial.steps[index - 1] : null;
  };
  const firstStepInChapter = chapterId => tutorial.steps.find(step => step.chapterId === chapterId) || null;
  const flashAutoClick = node => {
    if (!node) return;
    pulseNode(node, 720);
    node.classList.add('tutorial-auto-click');
    setTimeout(() => node.classList.remove('tutorial-auto-click'), 520);
    const rect = node.getBoundingClientRect();
    const pulse = document.createElement('div');
    pulse.className = 'tutorial-click-pulse';
    pulse.style.left = (rect.left + (rect.width / 2)) + 'px';
    pulse.style.top = (rect.top + (rect.height / 2)) + 'px';
    document.body.appendChild(pulse);
    setTimeout(() => pulse.remove(), 620);
  };
  const pulseNode = (node, duration = 1200) => {
    if (!node) return;
    node.setAttribute('data-tutorial-changed', 'true');
    const pending = pulseTimers.get(node);
    if (pending) clearTimeout(pending);
    pulseTimers.set(node, setTimeout(() => {
      if (node.isConnected) node.removeAttribute('data-tutorial-changed');
    }, duration));
  };
  const fillForm = (target, payload) => {
    const form = target?.matches?.('form') ? target : target?.closest?.('form') || target?.querySelector?.('form');
    if (!form || !payload) return;
    for (const [key, value] of Object.entries(payload)) {
      const field = form.elements.namedItem(key) || form.querySelector('[name="' + CSS.escape(key) + '"]');
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = value === true;
      else field.value = value == null ? '' : String(value);
      pulseNode(field, 900);
    }
  };
  const renderConceptList = (id, concepts, emptyText) => {
    const root = document.getElementById(id);
    if (!root) return;
    root.innerHTML = '';
    if (!concepts.length) {
      const empty = document.createElement('div');
      empty.className = 'tutorial-concept';
      const copy = document.createElement('span');
      copy.textContent = emptyText;
      empty.append(copy);
      root.append(empty);
      return;
    }
    for (const concept of concepts) {
      const item = document.createElement('div');
      item.className = 'tutorial-concept';
      const title = document.createElement('strong');
      title.textContent = concept.label;
      const summary = document.createElement('span');
      summary.textContent = concept.summary;
      item.append(title, summary);
      root.append(item);
    }
  };
  const submitTutorialForm = async target => {
    const form = target?.matches?.('form') ? target : target?.closest?.('form') || target?.querySelector?.('form');
    if (!form) return false;
    const submitter = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    if (!submitter) return false;
    flashAutoClick(submitter);
    await new Promise(resolve => setTimeout(resolve, 120));
    submitter.click();
    return true;
  };
  const focusScopeFor = target => target?.matches?.('form,section,main') ? target : target?.closest?.('form,section,main') || target || null;
  const setOverlayPosition = (left, top, manual = false) => {
    const maxLeft = Math.max(12, window.innerWidth - overlay.offsetWidth - 12);
    const maxTop = Math.max(12, window.innerHeight - overlay.offsetHeight - 12);
    const nextLeft = Math.max(12, Math.min(maxLeft, left));
    const nextTop = Math.max(12, Math.min(maxTop, top));
    overlay.style.left = nextLeft + 'px';
    overlay.style.top = nextTop + 'px';
    overlay.style.right = 'auto';
    overlayDrag.left = nextLeft;
    overlayDrag.top = nextTop;
    if (manual) overlayDrag.manual = true;
  };
  const saveProgress = async next => {
    progress = next;
    if (!next) await api('DELETE');
    else await api('PUT', next);
  };
  const restartCurrentChapter = async () => {
    const chapterId = progress?.chapterId || currentStep()?.chapterId || null;
    const first = firstStepInChapter(chapterId);
    if (!progress || !first) return;
    await saveProgress({
      ...progress,
      chapterId: first.chapterId,
      stepId: first.id,
      chapterStatus: 'in_progress',
      draftInputs: {},
      completedAt: null,
      hidden: false,
      replayStepId: null
    });
    render();
  };
  const restartFromHere = async () => {
    const step = currentStep();
    if (!progress || !step) return;
    await saveProgress({
      ...progress,
      chapterId: step.chapterId,
      stepId: step.id,
      chapterStatus: 'in_progress',
      draftInputs: {},
      completedAt: null,
      hidden: false,
      replayStepId: step.id
    });
    render();
  };
  const readTodos = async () => fetch('/api/todos').then(res => res.json().catch(() => ({ todos: [] })));
  const readNotes = async () => fetch('/api/private-notes').then(res => res.json().catch(() => ({ notes: [] })));
  const isComplete = async step => {
    const check = step?.completeWhen || {};
    switch (check.kind) {
      case 'manualAdvance':
      case 'complete':
        return false;
      case 'todoExists': {
        const todos = await readTodos();
        return Array.isArray(todos.todos) && todos.todos.some(todo => todo.title === check.title);
      }
      case 'todoDone': {
        const todos = await readTodos();
        return Array.isArray(todos.todos) && todos.todos.some(todo => todo.title === check.title && todo.done === true);
      }
      case 'todoMissing': {
        const todos = await readTodos();
        return !(Array.isArray(todos.todos) && todos.todos.some(todo => todo.title === check.title));
      }
      case 'noteExists': {
        const notes = await readNotes();
        return Array.isArray(notes.notes) && notes.notes.some(note => note.text === check.text);
      }
      default:
        return false;
    }
  };
  const position = target => {
    if (overlayDrag.manual) {
      setOverlayPosition(overlayDrag.left, overlayDrag.top);
      return;
    }
    if (!target) {
      setOverlayPosition(window.innerWidth - overlay.offsetWidth - 16, 16);
      return;
    }
    const rect = target.getBoundingClientRect();
    const top = Math.max(14, Math.min(window.innerHeight - overlay.offsetHeight - 14, rect.bottom + 12));
    const left = rect.left + overlay.offsetWidth + 18 > window.innerWidth ? Math.max(12, rect.right - overlay.offsetWidth) : Math.max(12, rect.left);
    setOverlayPosition(left, top);
  };
  const render = () => {
    clearHighlight();
    const step = currentStep();
    const surface = tutorialSurfaceState();
    if (!progress || progress.completedAt || !step) {
      overlay.hidden = true;
      dimmer.hidden = true;
      resumeButton.hidden = true;
      return;
    }
    if (surface.kind === 'hidden' || surface.kind === 'disabled' || surface.kind === 'offpage') {
      overlay.hidden = true;
      dimmer.hidden = true;
      resumeButton.hidden = false;
      resumeButton.textContent = surface.kind === 'offpage'
        ? ('Continue On ' + tutorialPageLabel(surface.page))
        : (surface.kind === 'disabled' ? 'Enable On This Page' : 'Resume Tutorial');
      return;
    }
    resumeButton.hidden = true;
    const target = step.target ? byTarget(step.target) : null;
    const scope = focusScopeFor(target);
    if (scope) {
      scope.setAttribute('data-tutorial-focus-scope', 'true');
      activeFocusScope = scope;
    }
    if (target) {
      target.setAttribute('data-tutorial-current', 'true');
      activeHighlightTarget = target;
      if (lastRenderedStepId !== step.id) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    document.getElementById('tutorial-overlay-meta').textContent = step.chapterId.toUpperCase();
    document.getElementById('tutorial-overlay-title').textContent = step.title;
    document.getElementById('tutorial-overlay-body').textContent = tutorialReplayStepId(progress) === step.id
      ? (step.body + ' Replaying this step does not roll back app state.')
      : step.body;
    renderConceptList('tutorial-overlay-concepts', tutorialStepConcepts(step), 'This step keeps working through the visible app without unlocking a new concept.');
    document.getElementById('tutorial-next').textContent = step.nextLabel || 'Next';
    document.getElementById('tutorial-back').disabled = !previousStep();
    document.getElementById('tutorial-restart-chapter').disabled = !firstStepInChapter(step.chapterId);
    document.getElementById('tutorial-restart-step').disabled = false;
    dimmer.hidden = false;
    overlay.hidden = false;
    position(target);
    lastRenderedStepId = step.id;
  };
  const advance = async () => {
    const index = currentStepIndex();
    const next = tutorial.steps[index + 1] || null;
    if (!next) {
      await saveProgress({ ...progress, chapterStatus: 'completed', completedAt: new Date().toISOString(), hidden: false, replayStepId: null });
    } else {
      await saveProgress({ ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: 'in_progress', completedAt: null, hidden: false, replayStepId: null });
    }
    render();
  };
  const maybeAdvance = async () => {
    let step = currentStep();
    while (progress && step && !progress.hidden && !progress.completedAt && step.page === 'app' && tutorialReplayStepId(progress) !== step.id && await isComplete(step)) {
      await advance();
      step = currentStep();
    }
  };
  let maybeAdvanceRunning = false;
  let maybeAdvanceQueued = false;
  const requestMaybeAdvance = async () => {
    if (maybeAdvanceRunning) {
      maybeAdvanceQueued = true;
      return;
    }
    maybeAdvanceRunning = true;
    try {
      do {
        maybeAdvanceQueued = false;
        await maybeAdvance();
      } while (maybeAdvanceQueued);
    } finally {
      maybeAdvanceRunning = false;
    }
  };
  const alignProgressToAppPage = async () => {
    let step = currentStep();
    while (progress && step && !progress.completedAt && step.page !== 'app') {
      const next = tutorial.steps[currentStepIndex() + 1] || null;
      if (!next || next.page !== 'app') break;
      await saveProgress({ ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: 'in_progress', completedAt: null, replayStepId: null });
      step = currentStep();
    }
  };
  const clearReplayForInteraction = async eventTarget => {
    const step = currentStep();
    const replayStepId = tutorialReplayStepId(progress);
    if (!step || replayStepId !== step.id) return;
    const target = step.target ? byTarget(step.target) : null;
    const element = eventTarget?.nodeType === Node.ELEMENT_NODE ? eventTarget : eventTarget?.parentElement || null;
    if (!target || !element) return;
    if (!(element === target || target.contains(element) || element.closest?.('[data-tutorial-target="' + CSS.escape(step.target) + '"]'))) return;
    progress = { ...progress, replayStepId: null };
    await api('PUT', progress).catch(() => {});
  };
  resumeButton.addEventListener('click', async () => {
    if (!progress) return;
    const surface = tutorialSurfaceState();
    if (surface.kind === 'offpage') {
      await continueTutorialOnPage(surface.page);
      return;
    }
    if (surface.kind === 'disabled') {
      await saveProgress(clearTutorialPageDisabled(progress));
    } else {
      await saveProgress({ ...progress, hidden: false, replayStepId: null });
    }
    render();
  });
  document.getElementById('tutorial-overlay-handle').addEventListener('pointerdown', event => {
    if (overlay.hidden) return;
    const rect = overlay.getBoundingClientRect();
    overlayDrag.active = true;
    overlayDrag.manual = true;
    overlayDrag.left = rect.left;
    overlayDrag.top = rect.top;
    overlayDrag.offsetX = event.clientX - rect.left;
    overlayDrag.offsetY = event.clientY - rect.top;
    document.body.classList.add('tutorial-dragging');
    event.preventDefault();
  });
  window.addEventListener('pointermove', event => {
    if (!overlayDrag.active) return;
    setOverlayPosition(event.clientX - overlayDrag.offsetX, event.clientY - overlayDrag.offsetY, true);
  });
  window.addEventListener('pointerup', () => {
    overlayDrag.active = false;
    document.body.classList.remove('tutorial-dragging');
  });
  document.getElementById('tutorial-next').addEventListener('click', async () => {
    const step = currentStep();
    if (!step) return;
    if (step.completeWhen?.kind === 'manualAdvance') {
      await advance();
      return;
    }
    const target = step.target ? byTarget(step.target) : null;
    if (step.payload && target) {
      fillForm(target, step.payload);
      await saveProgress({ ...progress, draftInputs: step.payload, hidden: false, replayStepId: null });
      const submitted = await submitTutorialForm(target);
      if (submitted) return;
      render();
      return;
    }
  });
  document.getElementById('tutorial-back').addEventListener('click', async () => {
    const step = previousStep();
    if (!step || !progress) return;
    await saveProgress({
      ...progress,
      chapterId: step.chapterId,
      stepId: step.id,
      completedAt: null,
      hidden: false,
      replayStepId: await isComplete(step) ? step.id : null
    });
    render();
  });
  document.getElementById('tutorial-restart-chapter').addEventListener('click', async () => {
    overlayDrag.manual = false;
    await restartCurrentChapter();
  });
  document.getElementById('tutorial-restart-step').addEventListener('click', async () => {
    overlayDrag.manual = false;
    await restartFromHere();
  });
  document.getElementById('tutorial-disable-page').addEventListener('click', async () => {
    const step = currentStep();
    if (!progress || !step || step.page !== currentSurfacePage) return;
    await saveProgress(disableTutorialOnCurrentPage(progress));
    render();
  });
  document.getElementById('tutorial-exit').addEventListener('click', async () => {
    if (!progress) return;
    await saveProgress({ ...progress, hidden: true, replayStepId: null });
    render();
  });
  document.getElementById('tutorial-reset').addEventListener('click', async () => {
    overlayDrag.manual = false;
    progress = null;
    await api('DELETE');
    render();
  });
  const boot = async () => {
    const data = await api('GET');
    progress = data.progress || null;
    await alignProgressToAppPage();
    render();
    await requestMaybeAdvance();
    render();
    window.__witnessTutorialApp = {
      get currentStepId() { return progress?.stepId || null; },
      get currentChapterId() { return progress?.chapterId || null; },
      get currentPage() { return currentStep()?.page || null; },
      get currentConceptIds() { return tutorialStepConcepts(currentStep()).map(concept => concept.id); },
      get revealedConceptIds() { return tutorialRevealedConcepts(progress).map(concept => concept.id); },
      get replayStepId() { return tutorialReplayStepId(progress); },
      get completedAt() { return progress?.completedAt || null; },
      get hidden() { return progress?.hidden === true; },
      get disabledPages() { return tutorialDisabledPages(progress); },
      get surfacePage() { return currentSurfacePage; },
      get surfaceStatus() { return tutorialSurfaceState().kind; }
    };
  };
  document.addEventListener('click', event => {
    void clearReplayForInteraction(event.target).catch(() => {});
    setTimeout(() => requestMaybeAdvance().catch(() => {}), 150);
  });
  document.addEventListener('submit', event => {
    void clearReplayForInteraction(event.target).catch(() => {});
    setTimeout(() => requestMaybeAdvance().catch(() => {}), 150);
  }, true);
  window.addEventListener('resize', render);
  window.addEventListener('scroll', render, { passive: true });
  setInterval(() => { void requestMaybeAdvance().catch(() => {}); }, 1200);
  void boot();
})();`;
  return `\n<script>\n${engine}\n</script>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}
