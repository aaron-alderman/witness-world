import {
  activeWidgetVersions,
  activateWidgetVersion,
  widgetVersions,
  widgetVersionActivationHistory,
  widgetVersionTransitionIndex
} from "../../src/widgets.js";

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
