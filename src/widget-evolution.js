import { relation } from "./kernel.js";
import {
  activeWidgetVersions,
  activateWidgetVersion,
  stableJson,
  updateWidget,
  widgetDefinitions,
  widgetVersionActivationHistory,
  widgetVersionTransitionIndex,
  widgetVersions
} from "./widgets.js";

export const WIDGET_EVOLUTION_MIGRATION_STATUS = Object.freeze({
  compatible: "compatible",
  migrate: "migrate",
  forkRequired: "forkRequired",
  blocked: "blocked"
});

export const SUPPORTED_WIDGET_REPLACE_FIELDS = Object.freeze([
  "text",
  "title",
  "class",
  "hidden",
  "role",
  "href",
  "name",
  "placeholder",
  "autocomplete",
  "type",
  "action",
  "label",
  "valueType",
  "eventSoul",
  "eventVersion",
  "dataId",
  "dataDone",
  "guidanceTarget",
  "tutorialTarget",
  "template",
  "level"
]);

const KNOWN_WIDGET_KINDS = new Set([
  "Fragment",
  "Page",
  "Box",
  "Section",
  "Header",
  "Heading",
  "Paragraph",
  "Small",
  "Text",
  "Label",
  "Form",
  "Input",
  "Textarea",
  "Select",
  "Option",
  "Details",
  "Summary",
  "ValueEditor",
  "Button",
  "Link",
  "List"
]);

export const WIDGET_REPLACE_KIND_OPTIONS = Object.freeze([...KNOWN_WIDGET_KINDS]);

const COMPATIBLE_FAMILIES = [
  new Set(["Fragment", "Box", "Section"]),
  new Set(["Header", "Heading", "Paragraph", "Small", "Text", "Label", "Summary"])
];

function cloneWidgetState(widget = null) {
  if (!widget || typeof widget !== "object") return null;
  return {
    id: widget.id ?? null,
    kind: widget.kind ?? null,
    props: { ...(widget.props ?? {}) },
    context: widget.context ?? null
  };
}

function familyForKind(kind) {
  for (const family of COMPATIBLE_FAMILIES) {
    if (family.has(kind)) return family;
  }
  return null;
}

function hasOwn(body, key) {
  return Object.prototype.hasOwnProperty.call(body ?? {}, key);
}

function setStringProp(nextProps, propKey, input, fieldKey) {
  if (!hasOwn(input, fieldKey)) return;
  const value = input?.[fieldKey];
  if (typeof value !== "string") return;
  if (value === "") delete nextProps[propKey];
  else nextProps[propKey] = value;
}

function setBooleanProp(nextProps, propKey, input, fieldKey) {
  if (!hasOwn(input, fieldKey)) return;
  if (input?.[fieldKey] === true) nextProps[propKey] = true;
  else delete nextProps[propKey];
}

export function isKnownWidgetKind(kind) {
  return KNOWN_WIDGET_KINDS.has(String(kind ?? "").trim());
}

export function widgetVersionMigrationStatus(status = "") {
  switch (String(status || "")) {
    case "activated":
      return WIDGET_EVOLUTION_MIGRATION_STATUS.compatible;
    case "migrated":
      return WIDGET_EVOLUTION_MIGRATION_STATUS.migrate;
    case "forkRequired":
      return WIDGET_EVOLUTION_MIGRATION_STATUS.forkRequired;
    default:
      return WIDGET_EVOLUTION_MIGRATION_STATUS.blocked;
  }
}

export function widgetVersionMigrationStatusFromStrategy(strategy = "") {
  switch (String(strategy || "")) {
    case "compatible":
      return WIDGET_EVOLUTION_MIGRATION_STATUS.compatible;
    case "migrate":
      return WIDGET_EVOLUTION_MIGRATION_STATUS.migrate;
    case "fork":
      return WIDGET_EVOLUTION_MIGRATION_STATUS.forkRequired;
    default:
      return WIDGET_EVOLUTION_MIGRATION_STATUS.blocked;
  }
}

export function widgetReplacementPropsFromInput(currentProps = {}, input = {}) {
  const nextProps = { ...(currentProps ?? {}) };
  for (const key of [
    "text",
    "title",
    "class",
    "role",
    "href",
    "name",
    "placeholder",
    "autocomplete",
    "type",
    "action",
    "label",
    "valueType",
    "eventSoul",
    "eventVersion"
  ]) {
    setStringProp(nextProps, key, input, key);
  }
  setBooleanProp(nextProps, "hidden", input, "hidden");
  setBooleanProp(nextProps, "template", input, "template");
  setStringProp(nextProps, "data-id", input, "dataId");
  setStringProp(nextProps, "data-done", input, "dataDone");

  if (hasOwn(input, "guidanceTarget") || hasOwn(input, "tutorialTarget")) {
    const guidanceTarget = typeof input?.guidanceTarget === "string"
      ? input.guidanceTarget
      : (typeof input?.tutorialTarget === "string" ? input.tutorialTarget : "");
    if (guidanceTarget === "") {
      delete nextProps["data-guidance-target"];
      delete nextProps["data-tutorial-target"];
    } else {
      nextProps["data-guidance-target"] = guidanceTarget;
      nextProps["data-tutorial-target"] = guidanceTarget;
    }
  }

  if (hasOwn(input, "level")) {
    const numeric = Number(input?.level);
    if (Number.isFinite(numeric)) nextProps.level = numeric;
    else delete nextProps.level;
  }

  return nextProps;
}

export function classifyWidgetReplacement({ currentWidget, nextKind, nextProps }) {
  if (!currentWidget?.id) {
    return {
      migrationStatus: WIDGET_EVOLUTION_MIGRATION_STATUS.blocked,
      reason: "widget not found"
    };
  }
  const normalizedKind = String(nextKind ?? "").trim();
  if (!normalizedKind) {
    return {
      migrationStatus: WIDGET_EVOLUTION_MIGRATION_STATUS.blocked,
      reason: "replacement kind is required"
    };
  }
  if (!isKnownWidgetKind(normalizedKind)) {
    return {
      migrationStatus: WIDGET_EVOLUTION_MIGRATION_STATUS.blocked,
      reason: "unsupported replacement kind"
    };
  }
  const currentKind = String(currentWidget.kind ?? "").trim();
  if (
    currentKind === normalizedKind
    && stableJson(currentWidget.props ?? {}) === stableJson(nextProps ?? {})
  ) {
    return {
      migrationStatus: WIDGET_EVOLUTION_MIGRATION_STATUS.blocked,
      reason: "replacement does not change widget kind or supported props"
    };
  }
  if (currentKind === normalizedKind) {
    return {
      migrationStatus: WIDGET_EVOLUTION_MIGRATION_STATUS.compatible,
      reason: null
    };
  }
  const currentFamily = familyForKind(currentKind);
  const nextFamily = familyForKind(normalizedKind);
  if (currentFamily && nextFamily && currentFamily === nextFamily) {
    return {
      migrationStatus: WIDGET_EVOLUTION_MIGRATION_STATUS.compatible,
      reason: null
    };
  }
  return {
    migrationStatus: WIDGET_EVOLUTION_MIGRATION_STATUS.migrate,
    reason: null
  };
}

export function applyWidgetReplace(world, {
  actor,
  id,
  kind,
  props = {},
  context = null,
  previous = null,
  migrationStatus = WIDGET_EVOLUTION_MIGRATION_STATUS.compatible
}) {
  const priorState = cloneWidgetState(previous ?? widgetDefinitions(world.allWitnesses()).find(row => row.id === id) ?? null);
  const nextState = { id, kind, props: { ...(props ?? {}) }, context: context ?? null };
  const projected = updateWidget(world, {
    actor,
    id,
    kind,
    props: nextState.props,
    context: nextState.context
  });
  const witness = world.emit({
    process: "widget.replace",
    actor,
    claims: [relation(actor, "editedProjection", id)],
    body: {
      id,
      migrationStatus,
      previous: priorState,
      next: cloneWidgetState(nextState),
      updateWitnessId: projected.id
    }
  });
  return {
    ok: true,
    status: "replaced",
    migrationStatus,
    widget: nextState,
    witness,
    witnesses: [projected, witness]
  };
}

export function latestWidgetReplaceWitness(witnesses, id, { includeRolledBack = false } = {}) {
  const rolledBackIds = includeRolledBack
    ? new Set()
    : new Set(
        (witnesses ?? [])
          .filter(witness => witness?.process === "widget.replace.rollback" && witness?.body?.replacedWitnessId)
          .map(witness => witness.body.replacedWitnessId)
      );
  for (let index = (witnesses?.length ?? 0) - 1; index >= 0; index -= 1) {
    const witness = witnesses[index];
    if (witness?.process !== "widget.replace") continue;
    if ((witness?.body?.next?.id ?? witness?.body?.id ?? null) !== id) continue;
    if (!includeRolledBack && rolledBackIds.has(witness.id)) continue;
    return witness;
  }
  return null;
}

export function rollbackWidgetReplace(world, { actor, id }) {
  const witnesses = world.allWitnesses();
  const replaceWitness = latestWidgetReplaceWitness(witnesses, id);
  if (!replaceWitness?.body?.previous?.id) {
    const witness = world.emit({
      process: "widget.replace.rollback.failed",
      actor,
      claims: [],
      body: { id, reason: "no previous widget.replace witness" }
    });
    return {
      ok: false,
      status: "failed",
      migrationStatus: WIDGET_EVOLUTION_MIGRATION_STATUS.blocked,
      witness,
      witnesses: [witness]
    };
  }
  const current = widgetDefinitions(witnesses).find(row => row.id === id) ?? null;
  const previous = cloneWidgetState(replaceWitness.body.previous);
  const classification = classifyWidgetReplacement({
    currentWidget: current,
    nextKind: previous.kind,
    nextProps: previous.props ?? {}
  });
  const projected = updateWidget(world, {
    actor,
    id,
    kind: previous.kind,
    props: previous.props ?? {},
    context: previous.context ?? null
  });
  const witness = world.emit({
    process: "widget.replace.rollback",
    actor,
    claims: [relation(actor, "editedProjection", id)],
    body: {
      id,
      replacedWitnessId: replaceWitness.id,
      migrationStatus: classification.migrationStatus,
      previous: cloneWidgetState(current),
      next: previous,
      updateWitnessId: projected.id
    }
  });
  return {
    ok: true,
    status: "rolledBack",
    migrationStatus: classification.migrationStatus,
    widget: previous,
    witness,
    witnesses: [projected, witness]
  };
}

export function requestWidgetVersionActivationShared(world, { actor, soul, version }) {
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
  if (!current || current === version) {
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

export function rollbackWidgetVersionShared(world, { actor, soul }) {
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
