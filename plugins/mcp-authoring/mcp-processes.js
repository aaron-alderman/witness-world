import { projectors, relation } from "../../src/kernel.js";
import {
  createMcpServer,
  installMcpTool,
  removeMcpTool,
  moduleProjectors,
  resolveContextualRef
} from "../../src/modules.js";
import { processSpecFor, typeModelProjection, validateProcessInput } from "../../src/type-model.js";

function fail(world, { process, actor, body }) {
  return world.emit({ process, actor, claims: [], body });
}

function exists(world, id) {
  return world.project(projectors.things).has(id);
}

function parseJsonField(raw, field) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return { ok: false, error: `${field} must be a JSON string` };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: `${field} is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function validateInput(world, process, body) {
  const typeModel = typeModelProjection(world.allWitnesses());
  if (!processSpecFor(typeModel, process)) {
    return {
      ok: true,
      value: body && typeof body === "object" ? { ...body } : {},
      failures: [],
      spec: null
    };
  }
  const validated = validateProcessInput(typeModel, process, body, { coerceStrings: false });
  if (!validated.ok) return validated;
  return {
    ...validated,
    value: body && typeof body === "object"
      ? { ...body, ...validated.value }
      : validated.value
  };
}

function normalizeJsonArray(parsed, field) {
  if (!parsed) return { ok: true, value: [] };
  if (!Array.isArray(parsed.value)) return { ok: false, error: `${field} must be a JSON array` };
  return { ok: true, value: parsed.value };
}

function normalizeStringArrayInput(body, {
  field,
  jsonField = null,
  fallback = []
}) {
  const direct = body?.[field];
  if (Array.isArray(direct)) return { ok: true, value: [...new Set(direct.map(String).filter(Boolean))] };
  if (direct == null && jsonField) {
    const parsed = normalizeJsonArray(parseJsonField(body?.[jsonField], jsonField), jsonField);
    if (!parsed.ok) return parsed;
    return { ok: true, value: [...new Set(parsed.value.map(String).filter(Boolean))] };
  }
  if (direct == null) return { ok: true, value: [...fallback] };
  return { ok: false, error: `${field} must be an array` };
}

function resolveBodyRef(world, body, {
  contextField = "context",
  idField,
  refField,
  label
}) {
  return resolveContextualRef(world.allWitnesses(), {
    context: body?.[contextField] ?? null,
    id: body?.[idField] ?? null,
    ref: body?.[refField] ?? null,
    label
  });
}

export function resolveMcpServerInput(world, body, {
  contextField = "context",
  idField = "server",
  refField = "serverRef",
  label = "mcp server"
} = {}) {
  const resolved = resolveBodyRef(world, body, {
    contextField,
    idField,
    refField,
    label
  });
  if (!resolved.ok) return resolved;
  if (!resolved.target) return { ok: false, error: `${label} is required` };
  return resolved;
}

export function requestBootstrapMcpServerDefine(world, {
  actor,
  backendHost,
  body,
  appContext = null
}) {
  const project = appContext?.project ?? (projector => world.project(projector));
  const validated = validateInput(world, "mcpServer.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "mcpServer.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.id)) {
    const witness = fail(world, {
      process: "mcpServer.define.failed",
      actor: actor || backendHost,
      body: { reason: "mcp server id already exists", id: input.id }
    });
    return { ok: false, status: 409, error: "mcp server id already exists", witness };
  }
  const serverRunnerResolved = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "serverRunner",
    refField: "serverRunnerRef",
    label: "server runner"
  });
  if (!serverRunnerResolved.ok) {
    const witness = fail(world, { process: "mcpServer.define.failed", actor: actor || backendHost, body: { reason: serverRunnerResolved.error } });
    return { ok: false, status: 400, error: serverRunnerResolved.error, witness };
  }
  const resolvedServerRunner = serverRunnerResolved.target ?? input.serverRunner ?? null;
  if (!resolvedServerRunner) {
    const witness = fail(world, { process: "mcpServer.define.failed", actor: actor || backendHost, body: { reason: "serverRunner is required" } });
    return { ok: false, status: 400, error: "serverRunner is required", witness };
  }
  if (!project(moduleProjectors.serverRunners).some(row => row.id === resolvedServerRunner)) {
    const witness = fail(world, { process: "mcpServer.define.failed", actor: actor || backendHost, body: { reason: "server runner not found", serverRunner: resolvedServerRunner } });
    return { ok: false, status: 404, error: "server runner not found", witness };
  }
  const transports = normalizeStringArrayInput(body, { field: "transports", jsonField: "transportsJson", fallback: ["stdio", "http"] });
  if (!transports.ok) {
    const witness = fail(world, { process: "mcpServer.define.failed", actor: actor || backendHost, body: { reason: transports.error } });
    return { ok: false, status: 400, error: transports.error, witness };
  }
  const invalidTransports = transports.value.filter(transport => !["stdio", "http"].includes(transport));
  if (!transports.value.length || invalidTransports.length) {
    const witness = fail(world, {
      process: "mcpServer.define.failed",
      actor: actor || backendHost,
      body: { reason: "unsupported mcp transport", transports: invalidTransports.length ? invalidTransports : transports.value }
    });
    return { ok: false, status: 400, error: "unsupported mcp transport", witness };
  }
  createMcpServer(world, {
    actor: actor || backendHost,
    id: input.id,
    label: input.label ?? input.id,
    serverRunner: resolvedServerRunner,
    serviceIdentity: input.serviceIdentity ?? null,
    transports: transports.value,
    context: input.context ?? null,
    owner: actor || backendHost
  });
  const mcpServer = project(moduleProjectors.mcpServerIndex).byId[input.id] ?? {
    id: input.id,
    label: input.label ?? input.id,
    serverRunner: resolvedServerRunner,
    serviceIdentity: input.serviceIdentity ?? null,
    transports: transports.value,
    context: input.context ?? null
  };
  const witness = world.emit({
    process: "mcpServer.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.id)],
    body: { mcpServer }
  });
  return { ok: true, status: 201, mcpServer, witness };
}

export function requestBootstrapMcpToolInstall(world, {
  actor,
  backendHost,
  body,
  allowedTools = [],
  appContext = null
}) {
  const project = appContext?.project ?? (projector => world.project(projector));
  const validated = validateInput(world, "mcpTool.install", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "mcpTool.install.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const resolvedServer = resolveMcpServerInput(world, validated.value, {
    label: "mcp server"
  });
  if (!resolvedServer.ok) {
    const witness = fail(world, {
      process: "mcpTool.install.failed",
      actor: actor || backendHost,
      body: { reason: resolvedServer.error }
    });
    return { ok: false, status: 400, error: resolvedServer.error, witness };
  }
  const input = {
    ...validated.value,
    server: resolvedServer.target
  };
  const server = project(moduleProjectors.mcpServerIndex).byId[input.server] ?? null;
  if (!server) {
    const witness = fail(world, { process: "mcpTool.install.failed", actor: actor || backendHost, body: { reason: "mcp server not found", server: input.server } });
    return { ok: false, status: 404, error: "mcp server not found", witness };
  }
  if (allowedTools.length && !allowedTools.includes(input.tool)) {
    const witness = fail(world, { process: "mcpTool.install.failed", actor: actor || backendHost, body: { reason: "unknown mcp tool", tool: input.tool } });
    return { ok: false, status: 400, error: "unknown mcp tool", witness };
  }
  const existing = project(moduleProjectors.mcpToolInstalls)
    .find(row => row.server === input.server && row.tool === input.tool);
  if (existing) {
    const witness = fail(world, { process: "mcpTool.install.failed", actor: actor || backendHost, body: { reason: "mcp tool already installed on server", server: input.server, tool: input.tool } });
    return { ok: false, status: 409, error: "mcp tool already installed on server", witness };
  }
  const actingMode = input.actingMode ?? "delegated";
  if (!["delegated", "service"].includes(actingMode)) {
    const witness = fail(world, { process: "mcpTool.install.failed", actor: actor || backendHost, body: { reason: "unsupported acting mode", actingMode } });
    return { ok: false, status: 400, error: "unsupported acting mode", witness };
  }
  if (actingMode === "service" && !server.serviceIdentity) {
    const witness = fail(world, { process: "mcpTool.install.failed", actor: actor || backendHost, body: { reason: "service acting mode requires a service identity", server: input.server } });
    return { ok: false, status: 400, error: "service acting mode requires a service identity", witness };
  }
  const scopeContexts = normalizeStringArrayInput(body, { field: "scopeContexts", jsonField: "scopeContextsJson" });
  if (!scopeContexts.ok) {
    const witness = fail(world, { process: "mcpTool.install.failed", actor: actor || backendHost, body: { reason: scopeContexts.error } });
    return { ok: false, status: 400, error: scopeContexts.error, witness };
  }
  const scopeTargets = normalizeStringArrayInput(body, { field: "scopeTargets", jsonField: "scopeTargetsJson" });
  if (!scopeTargets.ok) {
    const witness = fail(world, { process: "mcpTool.install.failed", actor: actor || backendHost, body: { reason: scopeTargets.error } });
    return { ok: false, status: 400, error: scopeTargets.error, witness };
  }
  installMcpTool(world, {
    actor: actor || backendHost,
    server: input.server,
    tool: input.tool,
    actingMode,
    scopeContexts: scopeContexts.value,
    scopeTargets: scopeTargets.value
  });
  const install = project(moduleProjectors.mcpToolInstalls)
    .find(row => row.server === input.server && row.tool === input.tool) ?? {
      server: input.server,
      tool: input.tool,
      actingMode,
      scopeContexts: scopeContexts.value,
      scopeTargets: scopeTargets.value
    };
  const witness = world.emit({
    process: "mcpTool.install",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.server)],
    body: { mcpToolInstall: install }
  });
  return { ok: true, status: 201, mcpToolInstall: install, witness };
}

export function requestBootstrapMcpToolRemove(world, {
  actor,
  backendHost,
  body,
  appContext = null
}) {
  const project = appContext?.project ?? (projector => world.project(projector));
  const validated = validateInput(world, "mcpTool.remove", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "mcpTool.remove.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const resolvedServer = resolveMcpServerInput(world, validated.value, {
    label: "mcp server"
  });
  if (!resolvedServer.ok) {
    const witness = fail(world, {
      process: "mcpTool.remove.failed",
      actor: actor || backendHost,
      body: { reason: resolvedServer.error }
    });
    return { ok: false, status: 400, error: resolvedServer.error, witness };
  }
  const input = {
    ...validated.value,
    server: resolvedServer.target
  };
  const existing = project(moduleProjectors.mcpToolInstalls)
    .find(row => row.server === input.server && row.tool === input.tool);
  if (!existing) {
    const witness = fail(world, { process: "mcpTool.remove.failed", actor: actor || backendHost, body: { reason: "mcp tool install not found", server: input.server, tool: input.tool } });
    return { ok: false, status: 404, error: "mcp tool install not found", witness };
  }
  removeMcpTool(world, {
    actor: actor || backendHost,
    server: input.server,
    tool: input.tool
  });
  const witness = world.emit({
    process: "mcpTool.remove",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.server)],
    body: { server: input.server, tool: input.tool }
  });
  return { ok: true, status: 200, mcpToolInstall: existing, witness };
}
