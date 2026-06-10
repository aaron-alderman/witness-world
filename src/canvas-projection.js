import { projectors } from "./projectors-core.js";

const DEFAULT_GEOMETRY = { x: 40, y: 40, w: 160, h: 56 };
const CANVAS_VOCABULARY_RELS = new Set(["contains", "proxies", "cloneOf", "hasGeometry", "hasStyle", "hasCamera", "hasGrid", "hasModuleKind", "hasTitle", "hasDone"]);
const HIDDEN_THING_KINDS = new Set(["projectionInstance", "perspective", "widget", "widgetVersion", "frontendProgram", "route", "description", "compiledArtifact", "context"]);

const byId = key => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);

function indexCurrentRelations(witnesses) {
  const current = projectors.currentRelations(witnesses);
  const kinds = new Map();
  const titles = new Map();
  for (const r of current) {
    if (r.rel === "hasModuleKind") kinds.set(r.from, r.to);
    if (r.rel === "hasTitle") titles.set(r.from, r.to);
  }
  return { current, kinds, titles };
}

export function perspectivesProjection(witnesses) {
  const { kinds, titles } = indexCurrentRelations(witnesses);
  const owners = projectors.owners(witnesses);
  const perspectives = [];
  for (const [id, kind] of kinds) {
    if (kind !== "perspective") continue;
    perspectives.push({ id, title: titles.get(id) ?? id, owner: owners.get(id) ?? null });
  }
  return perspectives.sort(byId("id"));
}

export function canvasProjection(witnesses, perspectiveId) {
  const { current, kinds, titles } = indexCurrentRelations(witnesses);
  if (kinds.get(perspectiveId) !== "perspective") return null;
  const owners = projectors.owners(witnesses);

  const labelFor = id => titles.get(id) ?? id;

  let camera = null;
  let grid = null;
  const instances = [];
  const proxied = new Map();
  for (const r of current) {
    if (r.from === perspectiveId && r.rel === "hasCamera" && r.to === "camera") camera = { ...r.meta };
    if (r.from === perspectiveId && r.rel === "hasGrid" && r.to === "grid") grid = { ...r.meta };
    if (r.from !== perspectiveId || r.rel !== "contains") continue;
    const instance = r.to;
    if (kinds.get(instance) !== "projectionInstance") continue;
    const target = current.find(x => x.from === instance && x.rel === "proxies")?.to ?? null;
    if (!target) continue;
    const geometry = current.find(x => x.from === instance && x.rel === "hasGeometry" && x.to === "geometry")?.meta ?? DEFAULT_GEOMETRY;
    const style = current.find(x => x.from === instance && x.rel === "hasStyle" && x.to === "style")?.meta ?? {};
    const relations = current
      .filter(x => (x.from === target || x.to === target) && !CANVAS_VOCABULARY_RELS.has(x.rel))
      .map(x => ({ from: x.from, rel: x.rel, to: x.to }));
    instances.push({ id: instance, thing: target, label: labelFor(target), x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h, style, relations });
    if (!proxied.has(target)) proxied.set(target, []);
    proxied.get(target).push(instance);
  }
  instances.sort(byId("id"));

  const connectors = [];
  for (const r of current) {
    if (CANVAS_VOCABULARY_RELS.has(r.rel)) continue;
    if (!proxied.has(r.from) || !proxied.has(r.to)) continue;
    for (const fromInstance of proxied.get(r.from)) {
      for (const toInstance of proxied.get(r.to)) {
        if (fromInstance === toInstance) continue;
        connectors.push({ from: r.from, rel: r.rel, to: r.to, fromInstance, toInstance, witness: r.witness });
      }
    }
  }
  connectors.sort((a, b) =>
    `${a.from} ${a.rel} ${a.to} ${a.fromInstance} ${a.toInstance}`.localeCompare(`${b.from} ${b.rel} ${b.to} ${b.fromInstance} ${b.toInstance}`)
  );

  const availableThings = [];
  for (const id of projectors.things(witnesses)) {
    if (HIDDEN_THING_KINDS.has(kinds.get(id))) continue;
    availableThings.push({ id, label: labelFor(id), placed: proxied.get(id)?.length ?? 0 });
  }
  availableThings.sort(byId("id"));

  return {
    perspective: { id: perspectiveId, title: labelFor(perspectiveId), owner: owners.get(perspectiveId) ?? null, camera, grid },
    instances,
    connectors,
    availableThings
  };
}

export function thingDetails(witnesses, thingId) {
  const { current, titles } = indexCurrentRelations(witnesses);
  const relations = current
    .filter(r => (r.from === thingId || r.to === thingId) && !["hasGeometry", "hasStyle", "hasCamera"].includes(r.rel))
    .map(r => ({ from: r.from, rel: r.rel, to: r.to }));
  return { id: thingId, label: titles.get(thingId) ?? thingId, relations };
}
