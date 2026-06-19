export function createOperatorSession(snapshot = {}) {
  return {
    mode: snapshot.mode === "attached" ? "attached" : "detached",
    selectionReference: typeof snapshot.selectionReference === "string" ? snapshot.selectionReference : null,
    aliases: typeof snapshot.aliases === "object" && snapshot.aliases
      ? { ...snapshot.aliases }
      : {}
  };
}

function followAlias(session, reference, seen = new Set()) {
  if (!reference) return null;
  if (reference === "this") return session.selectionReference;
  if (!Object.hasOwn(session.aliases, reference)) return reference;
  if (seen.has(reference)) return null;
  seen.add(reference);
  return followAlias(session, session.aliases[reference], seen);
}

function uniqueRow(rows = []) {
  return rows.length === 1 ? rows[0] : null;
}

export function resolveOperatorReference(session, model, reference) {
  const raw = String(reference || "").trim() || "this";
  const resolved = followAlias(session, raw);
  if (!resolved) return null;
  if (model.index.byReference.has(resolved)) return model.index.byReference.get(resolved);
  return uniqueRow(model.index.byId.get(resolved))
    || uniqueRow(model.index.byRelativePath.get(resolved))
    || uniqueRow(model.index.byBasename.get(resolved))
    || null;
}

export function setOperatorSelection(session, node) {
  return {
    ...session,
    selectionReference: node?.reference ?? null
  };
}

export function assignOperatorAlias(session, alias, node) {
  return {
    ...session,
    aliases: {
      ...session.aliases,
      [alias]: node.reference
    }
  };
}
