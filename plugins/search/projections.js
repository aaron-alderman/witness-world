import { projectors } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

function titleMap(witnesses) {
  return new Map(
    projectors.currentRelations(witnesses)
      .filter(row => row.rel === "hasTitle")
      .map(row => [row.from, row.to])
  );
}

export function searchIndexes(witnesses, options = {}) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "searchIndex") continue;
    rows.set(id, {
      id,
      title: titles.get(id) ?? id,
      owner: owners.get(id) ?? null,
      context: contexts.get(id) ?? null,
      serverRunner: null,
      provider: null,
      name: "main",
      status: "pending",
      sourceCount: 0,
      documentCount: 0,
      assetCount: 0,
      queryCount: 0,
      lastBuiltAt: null,
      lastQueryAt: null,
      path: null,
      lastError: null
    });
  }

  for (const witness of witnesses) {
    if (!witness.process.startsWith("search.index.") || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? {
      id,
      title: titles.get(id) ?? id,
      owner: owners.get(id) ?? null,
      context: contexts.get(id) ?? null,
      serverRunner: null,
      provider: null,
      name: "main",
      status: "pending",
      sourceCount: 0,
      documentCount: 0,
      assetCount: 0,
      queryCount: 0,
      lastBuiltAt: null,
      lastQueryAt: null,
      path: null,
      lastError: null
    };
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.provider = typeof witness.body.provider === "string" ? witness.body.provider : row.provider;
    row.name = typeof witness.body.name === "string" ? witness.body.name : row.name;
    row.sourceCount = Number.isFinite(witness.body.sourceCount) ? witness.body.sourceCount : row.sourceCount;
    row.documentCount = Number.isFinite(witness.body.documentCount) ? witness.body.documentCount : row.documentCount;
    row.assetCount = Number.isFinite(witness.body.assetCount) ? witness.body.assetCount : row.assetCount;
    row.queryCount = Number.isFinite(witness.body.queryCount) ? witness.body.queryCount : row.queryCount;
    row.lastBuiltAt = typeof witness.body.lastBuiltAt === "string" ? witness.body.lastBuiltAt : row.lastBuiltAt;
    row.lastQueryAt = typeof witness.body.lastQueryAt === "string" ? witness.body.lastQueryAt : row.lastQueryAt;
    row.path = typeof witness.body.path === "string" ? witness.body.path : row.path;
    row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
    if (witness.process === "search.index.build" || witness.process === "search.index.reindex" || witness.process === "search.index.query") row.status = "ready";
    if (witness.process.endsWith(".failed")) row.status = "failed";
    row.title = titles.get(id) ?? row.title;
    rows.set(id, row);
  }

  return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function searchIndexIndex(witnesses, options = {}) {
  const rows = searchIndexes(witnesses, options);
  const byId = Object.create(null);
  for (const row of rows) byId[row.id] = row;
  return { rows, byId };
}

export const searchModuleProjectors = Object.freeze({
  searchIndexes,
  searchIndexIndex
});
