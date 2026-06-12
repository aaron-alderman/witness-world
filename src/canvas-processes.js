import { thing, relation, retract, projectors, canAcceptInto, canCreateInContext, canMutateTarget } from "./kernel.js";
import { thingId } from "./ids.js";
import { runGates, actorRequired, textRequired } from "./gates.js";
import { compensationClaims, undoState } from "./canvas-undo.js";

const DEFAULT_GEOMETRY = { x: 40, y: 40, w: 160, h: 56 };
const STYLE_KEYS = ["color", "textColor", "shape"];
const MIN_W = 40;
const MIN_H = 24;

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

function geometryFrom(params, fallback = DEFAULT_GEOMETRY) {
  return {
    x: num(params.x, fallback.x),
    y: num(params.y, fallback.y),
    w: Math.max(MIN_W, num(params.w, fallback.w)),
    h: Math.max(MIN_H, num(params.h, fallback.h))
  };
}

function styleFrom(params) {
  const style = {};
  const source = params.style && typeof params.style === "object" ? params.style : {};
  for (const key of STYLE_KEYS) {
    if (typeof source[key] === "string" && source[key].trim()) style[key] = source[key].trim();
  }
  return style;
}

function blockedWitness(world, { actor, process, gates, context }) {
  const result = runGates(world, { actor, process, gates, context });
  if (result.ok) return null;
  // runGates just appended the `${process}.blocked` witness; surface it to the caller
  return world.allWitnesses().at(-1);
}

function failed(world, { process, actor, body }) {
  return world.emit({ process: `${process}.failed`, actor, claims: [], body });
}

function isPerspective(world, id) {
  return world
    .project(projectors.currentRelations)
    .some(r => r.from === id && r.rel === "hasModuleKind" && r.to === "perspective");
}

function perspectiveContains(world, perspective, instance) {
  return world
    .project(projectors.currentRelations)
    .some(r => r.from === perspective && r.rel === "contains" && r.to === instance);
}

function moduleKindOf(world, id) {
  return world
    .project(projectors.currentRelations)
    .find(r => r.from === id && r.rel === "hasModuleKind")
    ?.to ?? null;
}

export function createPerspective(world, { actor, title, context = null }) {
  const blocked = blockedWitness(world, { actor, process: "canvas.perspective.create", gates: [actorRequired, textRequired("title")], context: { actor, title, context } });
  if (blocked) return blocked;
  const id = thingId("perspective", { actor, title, ordinal: world.allWitnesses().length });
  const normalizedContext = typeof context === "string" && context.trim() ? context.trim() : null;
  if (normalizedContext) {
    const gate = canCreateInContext(world, actor, normalizedContext);
    if (!gate.ok) {
      return failed(world, {
        process: "canvas.perspective.create",
        actor,
        body: { title: title.trim(), context: normalizedContext, reason: gate.reason, status: gate.status || 403 }
      });
    }
  }
  return world.emit({
    process: "canvas.perspective.create",
    actor,
    claims: [
      thing(id),
      relation(actor, "owns", id),
      relation(actor, "created", id),
      relation(id, "hasModuleKind", "perspective"),
      relation(id, "hasTitle", title.trim()),
      ...(normalizedContext ? [relation(id, "inContext", normalizedContext)] : [])
    ],
    body: { id, title: title.trim(), context: normalizedContext }
  });
}

function placementClaims({ actor, perspective, instance, target, geometry }) {
  return [
    thing(instance),
    relation(actor, "owns", instance),
    relation(instance, "hasModuleKind", "projectionInstance"),
    relation(instance, "proxies", target),
    relation(perspective, "contains", instance),
    relation(instance, "hasGeometry", "geometry", geometry)
  ];
}

export function placeThing(world, { actor, perspective, thing: target, ...params }) {
  const process = "canvas.place";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  if (!isPerspective(world, perspective)) {
    return failed(world, { process, actor, body: { perspective, thing: target, reason: "unknown perspective" } });
  }
  if (!world.project(projectors.things).has(target)) {
    return failed(world, { process, actor, body: { perspective, thing: target, reason: "unknown thing" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, thing: target, reason: "actor does not own or steward perspective" } });
  }
  const geometry = geometryFrom(params);
  const instance = thingId("projection-instance", { perspective, thing: target, ordinal: world.allWitnesses().length });
  return world.emit({
    process,
    actor,
    claims: placementClaims({ actor, perspective, instance, target, geometry }),
    body: { perspective, thing: target, instance, ...geometry }
  });
}

export function moveInstance(world, { actor, perspective, instance, ...params }) {
  const process = "canvas.move";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  if (!perspectiveContains(world, perspective, instance)) {
    return failed(world, { process, actor, body: { perspective, instance, reason: "instance not in perspective" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, instance, reason: "actor does not own or steward perspective" } });
  }
  const current = world
    .project(projectors.currentRelations)
    .find(r => r.from === instance && r.rel === "hasGeometry" && r.to === "geometry");
  const geometry = geometryFrom(params, current?.meta ?? DEFAULT_GEOMETRY);
  return world.emit({
    process,
    actor,
    claims: [relation(instance, "hasGeometry", "geometry", geometry)],
    body: { perspective, instance, ...geometry }
  });
}

export function styleInstance(world, { actor, perspective, instance, ...params }) {
  const process = "canvas.style";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  if (!perspectiveContains(world, perspective, instance)) {
    return failed(world, { process, actor, body: { perspective, instance, reason: "instance not in perspective" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, instance, reason: "actor does not own or steward perspective" } });
  }
  const style = styleFrom(params);
  return world.emit({
    process,
    actor,
    claims: [relation(instance, "hasStyle", "style", style)],
    body: { perspective, instance, style }
  });
}

export function removeInstance(world, { actor, perspective, instance }) {
  const process = "canvas.remove";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  if (!perspectiveContains(world, perspective, instance)) {
    return failed(world, { process, actor, body: { perspective, instance, reason: "instance not in perspective" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, instance, reason: "actor does not own or steward perspective" } });
  }
  return world.emit({
    process,
    actor,
    claims: [retract(perspective, "contains", instance)],
    body: { perspective, instance }
  });
}

export function moveManyInstances(world, { actor, perspective, moves }) {
  const process = "canvas.moveMany";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  if (!Array.isArray(moves) || !moves.length || moves.some(m => !m || typeof m.instance !== "string")) {
    return failed(world, { process, actor, body: { perspective, reason: "moves required" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, reason: "actor does not own or steward perspective" } });
  }
  const current = world.project(projectors.currentRelations);
  const contained = new Set(current.filter(r => r.from === perspective && r.rel === "contains").map(r => r.to));
  const invalid = moves.filter(m => !contained.has(m.instance)).map(m => m.instance);
  if (invalid.length) {
    return failed(world, { process, actor, body: { perspective, invalid, reason: "instance not in perspective" } });
  }
  const resolved = moves.map(m => {
    const prior = current.find(r => r.from === m.instance && r.rel === "hasGeometry" && r.to === "geometry");
    return { instance: m.instance, ...geometryFrom(m, prior?.meta ?? DEFAULT_GEOMETRY) };
  });
  return world.emit({
    process,
    actor,
    claims: resolved.map(m => relation(m.instance, "hasGeometry", "geometry", { x: m.x, y: m.y, w: m.w, h: m.h })),
    body: { perspective, moves: resolved }
  });
}

export function removeManyInstances(world, { actor, perspective, instances }) {
  const process = "canvas.removeMany";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  const unique = Array.isArray(instances) ? [...new Set(instances)] : [];
  if (!unique.length || unique.some(i => typeof i !== "string")) {
    return failed(world, { process, actor, body: { perspective, reason: "instances required" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, reason: "actor does not own or steward perspective" } });
  }
  const invalid = unique.filter(i => !perspectiveContains(world, perspective, i));
  if (invalid.length) {
    return failed(world, { process, actor, body: { perspective, invalid, reason: "instance not in perspective" } });
  }
  return world.emit({
    process,
    actor,
    claims: unique.map(i => retract(perspective, "contains", i)),
    body: { perspective, instances: unique }
  });
}

export function duplicateInstance(world, { actor, perspective, instance, x, y }) {
  const process = "canvas.duplicate";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  if (!perspectiveContains(world, perspective, instance)) {
    return failed(world, { process, actor, body: { perspective, instance, reason: "instance not in perspective" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, instance, reason: "actor does not own or steward perspective" } });
  }
  const current = world.project(projectors.currentRelations);
  const target = current.find(r => r.from === instance && r.rel === "proxies")?.to;
  if (!target) {
    return failed(world, { process, actor, body: { perspective, instance, reason: "instance proxies nothing" } });
  }
  const source = current.find(r => r.from === instance && r.rel === "hasGeometry" && r.to === "geometry")?.meta ?? DEFAULT_GEOMETRY;
  const style = current.find(r => r.from === instance && r.rel === "hasStyle" && r.to === "style")?.meta ?? {};
  const geometry = geometryFrom({ x: num(x, source.x + 24), y: num(y, source.y + 24) }, source);
  const clone = thingId("projection-instance", { perspective, thing: target, ordinal: world.allWitnesses().length });
  return world.emit({
    process,
    actor,
    claims: [
      ...placementClaims({ actor, perspective, instance: clone, target, geometry }),
      ...(Object.keys(style).length ? [relation(clone, "hasStyle", "style", style)] : [])
    ],
    body: { perspective, source: instance, instance: clone, thing: target, ...geometry, style }
  });
}

export function createThingOnCanvas(world, { actor, perspective, name, ...params }) {
  const process = "canvas.createThing";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired, textRequired("name")], context: { actor, name } });
  if (blocked) return blocked;
  if (!isPerspective(world, perspective)) {
    return failed(world, { process, actor, body: { perspective, name, reason: "unknown perspective" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, name, reason: "actor does not own or steward perspective" } });
  }
  const title = name.trim();
  const ordinal = world.allWitnesses().length;
  const id = thingId("thing", { name: title, ordinal });
  const instance = thingId("projection-instance", { perspective, thing: id, ordinal });
  const geometry = geometryFrom(params);
  return world.emit({
    process,
    actor,
    claims: [
      thing(id),
      relation(actor, "owns", id),
      relation(actor, "created", id),
      relation(id, "hasTitle", title),
      ...placementClaims({ actor, perspective, instance, target: id, geometry })
    ],
    body: { perspective, thing: id, instance, name: title, ...geometry }
  });
}

export function relateThings(world, { actor, from, rel, to, perspective = null }) {
  const process = "canvas.relate";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired, textRequired("rel")], context: { actor, rel } });
  if (blocked) return blocked;
  const things = world.project(projectors.things);
  if (!things.has(from) || !things.has(to)) {
    return failed(world, { process, actor, body: { from, rel, to, reason: "unknown thing" } });
  }
  const gate = canMutateTarget(world, actor, from);
  if (!gate.ok) {
    return failed(world, { process, actor, body: { from, rel, to, perspective, reason: gate.reason, blockedTarget: from, status: gate.status || 403 } });
  }
  return world.emit({
    process,
    actor,
    claims: [relation(from, rel.trim(), to)],
    body: { from, rel: rel.trim(), to, perspective }
  });
}

export function unrelateThings(world, { actor, from, rel, to, perspective = null }) {
  const process = "canvas.unrelate";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired, textRequired("rel")], context: { actor, rel } });
  if (blocked) return blocked;
  const gate = canMutateTarget(world, actor, from);
  if (!gate.ok) {
    return failed(world, { process, actor, body: { from, rel, to, perspective, reason: gate.reason, blockedTarget: from, status: gate.status || 403 } });
  }
  const exists = world
    .project(projectors.currentRelations)
    .some(r => r.from === from && r.rel === rel && r.to === to);
  if (!exists) {
    return failed(world, { process, actor, body: { from, rel, to, reason: "relation not current" } });
  }
  return world.emit({
    process,
    actor,
    claims: [retract(from, rel, to)],
    body: { from, rel, to, perspective }
  });
}

export function setThingTitle(world, { actor, thing: target, title, perspective = null }) {
  const process = "canvas.thing.setTitle";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired, textRequired("title")], context: { actor, title } });
  if (blocked) return blocked;
  if (!world.project(projectors.things).has(target)) {
    return failed(world, { process, actor, body: { thing: target, reason: "unknown thing" } });
  }
  const gate = canMutateTarget(world, actor, target);
  if (!gate.ok) {
    return failed(world, { process, actor, body: { thing: target, title: title.trim(), perspective, reason: gate.reason, blockedTarget: target, status: gate.status || 403 } });
  }
  // titles live in the relation's `to`, so a new title is a new triple — retract the old ones
  const previous = world
    .project(projectors.currentRelations)
    .filter(r => r.from === target && r.rel === "hasTitle" && r.to !== title.trim());
  return world.emit({
    process,
    actor,
    claims: [...previous.map(r => retract(r.from, r.rel, r.to)), relation(target, "hasTitle", title.trim())],
    body: { thing: target, title: title.trim(), perspective }
  });
}

export function attachAsset(world, { actor, asset, target, perspective = null }) {
  const process = "asset.attach";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor, asset, target } });
  if (blocked) return blocked;
  const things = world.project(projectors.things);
  if (!things.has(asset) || !things.has(target)) {
    return failed(world, { process, actor, body: { asset, target, perspective, reason: "unknown thing" } });
  }
  if (asset === target) {
    return failed(world, { process, actor, body: { asset, target, perspective, reason: "asset cannot attach to itself" } });
  }
  if (moduleKindOf(world, asset) !== "asset") {
    return failed(world, { process, actor, body: { asset, target, perspective, reason: "asset id is not an asset" } });
  }
  const targetKind = moduleKindOf(world, target);
  if (targetKind === "asset" || targetKind === "projectionInstance" || targetKind === "perspective") {
    return failed(world, { process, actor, body: { asset, target, perspective, reason: "target cannot hold asset attachments" } });
  }
  const assetGate = canMutateTarget(world, actor, asset);
  if (!assetGate.ok) {
    return failed(world, { process, actor, body: { asset, target, perspective, reason: assetGate.reason, blockedTarget: asset } });
  }
  const targetGate = canMutateTarget(world, actor, target);
  if (!targetGate.ok) {
    return failed(world, { process, actor, body: { asset, target, perspective, reason: targetGate.reason, blockedTarget: target } });
  }
  const exists = world
    .project(projectors.currentRelations)
    .some(r => r.from === target && r.rel === "attachedAsset" && r.to === asset);
  if (exists) {
    return failed(world, { process, actor, body: { asset, target, perspective, reason: "asset already attached to target" } });
  }
  return world.emit({
    process,
    actor,
    claims: [relation(target, "attachedAsset", asset)],
    body: { asset, target, perspective }
  });
}

export function detachAsset(world, { actor, asset, target, perspective = null }) {
  const process = "asset.detach";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor, asset, target } });
  if (blocked) return blocked;
  const exists = world
    .project(projectors.currentRelations)
    .some(r => r.from === target && r.rel === "attachedAsset" && r.to === asset);
  if (!exists) {
    return failed(world, { process, actor, body: { asset, target, perspective, reason: "asset attachment not current" } });
  }
  const assetGate = canMutateTarget(world, actor, asset);
  if (!assetGate.ok) {
    return failed(world, { process, actor, body: { asset, target, perspective, reason: assetGate.reason, blockedTarget: asset } });
  }
  const targetGate = canMutateTarget(world, actor, target);
  if (!targetGate.ok) {
    return failed(world, { process, actor, body: { asset, target, perspective, reason: targetGate.reason, blockedTarget: target } });
  }
  return world.emit({
    process,
    actor,
    claims: [retract(target, "attachedAsset", asset)],
    body: { asset, target, perspective }
  });
}

export function setCamera(world, { actor, perspective, x, y, zoom }) {
  const process = "canvas.camera";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  if (!isPerspective(world, perspective)) {
    return failed(world, { process, actor, body: { perspective, reason: "unknown perspective" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, reason: "actor does not own or steward perspective" } });
  }
  const camera = { x: num(x, 0), y: num(y, 0), zoom: Math.min(4, Math.max(0.2, num(zoom, 1))) };
  return world.emit({
    process,
    actor,
    claims: [relation(perspective, "hasCamera", "camera", camera)],
    body: { perspective, ...camera }
  });
}

export function setGrid(world, { actor, perspective, snap, size }) {
  const process = "canvas.grid";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  if (!isPerspective(world, perspective)) {
    return failed(world, { process, actor, body: { perspective, reason: "unknown perspective" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, reason: "actor does not own or steward perspective" } });
  }
  const grid = { snap: snap === true || snap === "true", size: Math.min(400, Math.max(4, num(size, 20))) };
  return world.emit({
    process,
    actor,
    claims: [relation(perspective, "hasGrid", "grid", grid)],
    body: { perspective, ...grid }
  });
}

export function batchApply(world, { actor, perspective, moves, styles, camera, grid }) {
  const process = "canvas.batch";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  if (!isPerspective(world, perspective)) {
    return failed(world, { process, actor, body: { perspective, reason: "unknown perspective" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, reason: "actor does not own or steward perspective" } });
  }
  const malformedList = list => list !== undefined && (!Array.isArray(list) || list.some(entry => !entry || typeof entry.instance !== "string"));
  const malformedObject = value => value !== undefined && (value === null || typeof value !== "object");
  if (malformedList(moves) || malformedList(styles) || malformedObject(camera) || malformedObject(grid)) {
    return failed(world, { process, actor, body: { perspective, reason: "malformed batch" } });
  }
  // last entry wins per instance, so the witness never carries conflicting claims
  const dedupe = list => [...new Map((list ?? []).map(entry => [entry.instance, entry])).values()];
  const moveEntries = dedupe(moves);
  const styleEntries = dedupe(styles);
  if (!moveEntries.length && !styleEntries.length && camera === undefined && grid === undefined) {
    return failed(world, { process, actor, body: { perspective, reason: "empty batch" } });
  }
  const current = world.project(projectors.currentRelations);
  const contained = new Set(current.filter(r => r.from === perspective && r.rel === "contains").map(r => r.to));
  const invalid = [...new Set([...moveEntries, ...styleEntries].filter(e => !contained.has(e.instance)).map(e => e.instance))];
  if (invalid.length) {
    return failed(world, { process, actor, body: { perspective, invalid, reason: "instance not in perspective" } });
  }
  const resolvedMoves = moveEntries.map(m => {
    const prior = current.find(r => r.from === m.instance && r.rel === "hasGeometry" && r.to === "geometry");
    return { instance: m.instance, ...geometryFrom(m, prior?.meta ?? DEFAULT_GEOMETRY) };
  });
  const resolvedStyles = styleEntries.map(s => ({ instance: s.instance, style: styleFrom({ style: s.style }) }));
  const resolvedCamera = camera === undefined ? null : { x: num(camera.x, 0), y: num(camera.y, 0), zoom: Math.min(4, Math.max(0.2, num(camera.zoom, 1))) };
  const resolvedGrid = grid === undefined ? null : { snap: grid.snap === true || grid.snap === "true", size: Math.min(400, Math.max(4, num(grid.size, 20))) };
  return world.emit({
    process,
    actor,
    claims: [
      ...resolvedMoves.map(m => relation(m.instance, "hasGeometry", "geometry", { x: m.x, y: m.y, w: m.w, h: m.h })),
      ...resolvedStyles.map(s => relation(s.instance, "hasStyle", "style", s.style)),
      ...(resolvedCamera ? [relation(perspective, "hasCamera", "camera", resolvedCamera)] : []),
      ...(resolvedGrid ? [relation(perspective, "hasGrid", "grid", resolvedGrid)] : [])
    ],
    body: {
      perspective,
      ...(resolvedMoves.length ? { moves: resolvedMoves } : {}),
      ...(resolvedStyles.length ? { styles: resolvedStyles } : {}),
      ...(resolvedCamera ? { camera: resolvedCamera } : {}),
      ...(resolvedGrid ? { grid: resolvedGrid } : {})
    }
  });
}

function compensate(world, { actor, perspective, process, target, link }) {
  if (!isPerspective(world, perspective)) {
    return failed(world, { process, actor, body: { perspective, reason: "unknown perspective" } });
  }
  if (!canAcceptInto(world, actor, perspective)) {
    return failed(world, { process, actor, body: { perspective, reason: "actor does not own or steward perspective" } });
  }
  if (!target) {
    return failed(world, { process, actor, body: { perspective, reason: link === "undoes" ? "nothing to undo" : "nothing to redo" } });
  }
  return world.emit({
    process,
    actor,
    claims: compensationClaims(world.allWitnesses(), target),
    body: { perspective, [link]: target.id }
  });
}

export function undoLastAction(world, { actor, perspective }) {
  const process = "canvas.undo";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  const { undoTarget } = undoState(world.allWitnesses(), actor, perspective);
  return compensate(world, { actor, perspective, process, target: undoTarget, link: "undoes" });
}

export function redoLastUndo(world, { actor, perspective }) {
  const process = "canvas.redo";
  const blocked = blockedWitness(world, { actor, process, gates: [actorRequired], context: { actor } });
  if (blocked) return blocked;
  const { redoTarget } = undoState(world.allWitnesses(), actor, perspective);
  return compensate(world, { actor, perspective, process, target: redoTarget, link: "redoes" });
}

export const canvasProcessHandlers = {
  "canvas.perspective.create": createPerspective,
  "canvas.place": placeThing,
  "canvas.move": moveInstance,
  "canvas.moveMany": moveManyInstances,
  "canvas.style": styleInstance,
  "canvas.remove": removeInstance,
  "canvas.removeMany": removeManyInstances,
  "canvas.duplicate": duplicateInstance,
  "canvas.createThing": createThingOnCanvas,
  "canvas.relate": relateThings,
  "canvas.unrelate": unrelateThings,
  "canvas.thing.setTitle": setThingTitle,
  "asset.attach": attachAsset,
  "asset.detach": detachAsset,
  "canvas.camera": setCamera,
  "canvas.grid": setGrid,
  "canvas.batch": batchApply,
  "canvas.undo": undoLastAction,
  "canvas.redo": redoLastUndo
};
