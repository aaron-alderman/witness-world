import { projectors } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

function titleMap(witnesses) {
  return new Map(
    projectors.currentRelations(witnesses)
      .filter(row => row.rel === "hasTitle")
      .map(row => [row.from, row.to])
  );
}

function defaultSecretRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    provider: "local-json",
    status: "configured",
    createdAt: null,
    updatedAt: null,
    hasValue: false,
    lastError: null,
    deleted: false
  };
}

export function secrets(witnesses, options = {}) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "secret") continue;
    rows.set(id, defaultSecretRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (!witness.process.startsWith("secret.store.") || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? defaultSecretRow(id, { titles, owners, contexts });
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.provider = typeof witness.body.provider === "string" ? witness.body.provider : row.provider;
    row.status = typeof witness.body.status === "string" ? witness.body.status : row.status;
    row.createdAt = typeof witness.body.createdAt === "string" ? witness.body.createdAt : row.createdAt;
    row.updatedAt = typeof witness.body.updatedAt === "string" ? witness.body.updatedAt : row.updatedAt;
    row.hasValue = typeof witness.body.hasValue === "boolean" ? witness.body.hasValue : row.hasValue;
    if (witness.body.lastError === null) {
      row.lastError = null;
    } else if (typeof witness.body.reason === "string") {
      row.lastError = witness.body.reason;
    } else if (typeof witness.body.lastError === "string") {
      row.lastError = witness.body.lastError;
    }
    if (witness.process === "secret.store.delete") row.deleted = true;
    row.title = titles.get(id) ?? row.title;
    rows.set(id, row);
  }

  return [...rows.values()]
    .filter(row => row.deleted !== true)
    .map(({ deleted, ...row }) => row)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function secretIndex(witnesses, options = {}) {
  const rows = secrets(witnesses, options);
  const byId = Object.create(null);
  for (const row of rows) byId[row.id] = row;
  return { rows, byId };
}

export const secretModuleProjectors = Object.freeze({
  secrets,
  secretIndex
});
