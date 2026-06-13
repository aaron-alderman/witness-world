import { projectors } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

const MCP_TOOL_ACTING_MODES = new Set(["delegated", "service"]);
const MCP_SERVER_TRANSPORTS = new Set(["stdio", "http"]);

export function mcpServers(witnesses) {
  const contexts = moduleProjectors.objectContexts(witnesses);
  const rows = new Map();
  const rels = projectors.currentRelations(witnesses);
  for (const witness of witnesses) {
    if (witness.process !== "defineMcpServer" || !witness.body?.id) continue;
    rows.set(witness.body.id, {
      id: witness.body.id,
      label: typeof witness.body.label === "string" && witness.body.label.trim() ? witness.body.label.trim() : witness.body.id,
      serverRunner: witness.body.serverRunner ? String(witness.body.serverRunner) : null,
      serviceIdentity: witness.body.serviceIdentity ? String(witness.body.serviceIdentity) : null,
      transports: Array.isArray(witness.body.transports) ? [...new Set(witness.body.transports.map(String).filter(Boolean))] : [],
      context: contexts.get(witness.body.id) ?? (witness.body.context ? String(witness.body.context) : null)
    });
  }
  for (const row of rels) {
    if (!rows.has(row.from)) continue;
    const current = rows.get(row.from);
    if (row.rel === "usesServerRunner") current.serverRunner = row.to;
    if (row.rel === "serviceIdentity") current.serviceIdentity = row.to;
    if (row.rel === "supportsTransport" && !current.transports.includes(String(row.to))) current.transports.push(String(row.to));
  }
  return [...rows.values()]
    .map(row => ({
      ...row,
      transports: row.transports.filter(transport => MCP_SERVER_TRANSPORTS.has(transport)).sort()
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function mcpServerIndex(witnesses) {
  const rows = mcpServers(witnesses);
  const byId = Object.create(null);
  for (const row of rows) byId[row.id] = row;
  return { rows, byId };
}

export function mcpToolInstalls(witnesses) {
  const rows = [];
  const seen = new Set();
  for (const row of projectors.currentRelations(witnesses)) {
    if (row.rel !== "exposesMcpTool") continue;
    const key = `${row.from}\u0000${row.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      server: row.from,
      tool: String(row.to),
      actingMode: MCP_TOOL_ACTING_MODES.has(String(row.meta?.actingMode || ""))
        ? String(row.meta.actingMode)
        : "delegated",
      scopeContexts: Array.isArray(row.meta?.scopeContexts)
        ? [...new Set(row.meta.scopeContexts.map(String).filter(Boolean))].sort()
        : [],
      scopeTargets: Array.isArray(row.meta?.scopeTargets)
        ? [...new Set(row.meta.scopeTargets.map(String).filter(Boolean))].sort()
        : [],
      witness: row.witness
    });
  }
  return rows.sort((a, b) =>
    String(a.server).localeCompare(String(b.server))
    || String(a.tool).localeCompare(String(b.tool))
  );
}

export function mcpToolInstallIndex(witnesses) {
  const rows = mcpToolInstalls(witnesses);
  const byServer = Object.create(null);
  for (const row of rows) {
    if (!byServer[row.server]) byServer[row.server] = [];
    byServer[row.server].push(row);
  }
  return { rows, byServer };
}

export const mcpModuleProjectors = Object.freeze({
  mcpServers,
  mcpServerIndex,
  mcpToolInstalls,
  mcpToolInstallIndex
});
