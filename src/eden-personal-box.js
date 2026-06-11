const DEFAULT_SURFACE_ID = "eden.surface.personal";
const ALLOWED_KINDS = new Set(["note", "link", "check"]);
const relation = (from, rel, to, meta = {}) => ({ op: "relation", from, rel, to, meta });
const randomUuid = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const randomPart = Math.random().toString(16).slice(2);
  return `uuid_${Date.now().toString(16)}_${randomPart}`;
};

const stringOrNull = value => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeKind = value => {
  const lowered = String(value || "").trim().toLowerCase();
  return ALLOWED_KINDS.has(lowered) ? lowered : "note";
};

const normalizeOrder = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function projectEdenPersonalBoxItems(witnesses, {
  actor = null,
  surfaceId = DEFAULT_SURFACE_ID
} = {}) {
  if (!actor) return [];
  const items = new Map();
  for (const witness of witnesses) {
    const body = witness.body ?? {};
    if (!body || body.surfaceId !== surfaceId || body.owner !== actor) continue;
    if (witness.process === "edenPersonalBox.item.create") {
      items.set(body.id, {
        id: body.id,
        kind: normalizeKind(body.kind),
        text: String(body.text || ""),
        href: stringOrNull(body.href),
        order: normalizeOrder(body.order),
        createdAt: String(body.createdAt || ""),
        updatedAt: String(body.createdAt || "")
      });
      continue;
    }
    if (!items.has(body.id)) continue;
    if (witness.process === "edenPersonalBox.item.update") {
      const current = items.get(body.id);
      items.set(body.id, {
        ...current,
        kind: normalizeKind(body.kind ?? current.kind),
        text: typeof body.text === "string" ? body.text : current.text,
        href: body.href === null ? null : (typeof body.href === "string" ? stringOrNull(body.href) : current.href),
        updatedAt: String(body.updatedAt || current.updatedAt || "")
      });
      continue;
    }
    if (witness.process === "edenPersonalBox.item.delete") {
      items.delete(body.id);
    }
  }
  return [...items.values()].sort((a, b) => {
    const orderDiff = normalizeOrder(a.order) - normalizeOrder(b.order);
    if (orderDiff !== 0) return orderDiff;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function requestEdenPersonalBoxItemCreate(world, {
  actor,
  backendHost,
  surfaceId = DEFAULT_SURFACE_ID,
  body
}) {
  if (!actor) return denied(world, { backendHost, process: "edenPersonalBox.item.create.failed", reason: "sign in first", status: 401, surfaceId });
  const text = stringOrNull(body?.text);
  if (!text) return denied(world, { actor, backendHost, process: "edenPersonalBox.item.create.failed", reason: "text is required", status: 400, surfaceId });
  const kind = normalizeKind(body?.kind);
  const href = kind === "link" ? stringOrNull(body?.href) : null;
  if (kind === "link" && !href) return denied(world, { actor, backendHost, process: "edenPersonalBox.item.create.failed", reason: "link widgets require href", status: 400, surfaceId });
  const id = stringOrNull(body?.id) ?? `eden.personalBox.item.${actor}.${randomUuid()}`;
  const existing = projectEdenPersonalBoxItems(world.allWitnesses(), { actor, surfaceId });
  if (existing.some(item => item.id === id)) {
    return denied(world, { actor, backendHost, process: "edenPersonalBox.item.create.failed", reason: "item id already exists", status: 409, surfaceId, id });
  }
  const createdAt = new Date().toISOString();
  const item = {
    id,
    owner: actor,
    surfaceId,
    kind,
    text,
    href,
    order: existing.length,
    createdAt
  };
  const witness = world.emit({
    process: "edenPersonalBox.item.create",
    actor,
    claims: [relation(actor, "editedProjection", surfaceId)],
    body: item
  });
  return { ok: true, status: 201, item: { ...item, updatedAt: createdAt }, witness };
}

export function requestEdenPersonalBoxItemUpdate(world, {
  actor,
  backendHost,
  surfaceId = DEFAULT_SURFACE_ID,
  itemId,
  body
}) {
  if (!actor) return denied(world, { backendHost, process: "edenPersonalBox.item.update.failed", reason: "sign in first", status: 401, surfaceId, id: itemId });
  const existing = projectEdenPersonalBoxItems(world.allWitnesses(), { actor, surfaceId }).find(item => item.id === itemId) ?? null;
  if (!existing) return denied(world, { actor, backendHost, process: "edenPersonalBox.item.update.failed", reason: "item not found", status: 404, surfaceId, id: itemId });
  const text = stringOrNull(body?.text);
  if (!text) return denied(world, { actor, backendHost, process: "edenPersonalBox.item.update.failed", reason: "text is required", status: 400, surfaceId, id: itemId });
  const kind = normalizeKind(body?.kind ?? existing.kind);
  const href = kind === "link" ? stringOrNull(body?.href) : null;
  if (kind === "link" && !href) return denied(world, { actor, backendHost, process: "edenPersonalBox.item.update.failed", reason: "link widgets require href", status: 400, surfaceId, id: itemId });
  const updatedAt = new Date().toISOString();
  const patch = {
    id: itemId,
    owner: actor,
    surfaceId,
    kind,
    text,
    href,
    updatedAt
  };
  const witness = world.emit({
    process: "edenPersonalBox.item.update",
    actor,
    claims: [relation(actor, "editedProjection", itemId)],
    body: patch
  });
  return {
    ok: true,
    status: 200,
    item: { ...existing, ...patch },
    witness
  };
}

export function requestEdenPersonalBoxItemDelete(world, {
  actor,
  backendHost,
  surfaceId = DEFAULT_SURFACE_ID,
  itemId
}) {
  if (!actor) return denied(world, { backendHost, process: "edenPersonalBox.item.delete.failed", reason: "sign in first", status: 401, surfaceId, id: itemId });
  const existing = projectEdenPersonalBoxItems(world.allWitnesses(), { actor, surfaceId }).find(item => item.id === itemId) ?? null;
  if (!existing) return denied(world, { actor, backendHost, process: "edenPersonalBox.item.delete.failed", reason: "item not found", status: 404, surfaceId, id: itemId });
  const deletedAt = new Date().toISOString();
  const witness = world.emit({
    process: "edenPersonalBox.item.delete",
    actor,
    claims: [relation(actor, "editedProjection", itemId)],
    body: {
      id: itemId,
      owner: actor,
      surfaceId,
      deletedAt
    }
  });
  return { ok: true, status: 200, id: itemId, witness };
}

function denied(world, {
  actor = null,
  backendHost,
  process,
  reason,
  status,
  surfaceId,
  id = null
}) {
  const witness = world.emit({
    process,
    actor: actor || backendHost,
    claims: [],
    body: { reason, surfaceId, id }
  });
  return { ok: false, status, error: reason, witness };
}
