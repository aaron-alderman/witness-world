export const PLATFORM_PROPOSAL_ACTIONS = Object.freeze([
  "branch.create",
  "branch.merge",
  "branch.rebase",
  "changeSet.create",
  "changeSet.edit",
  "changeSet.validate",
  "changeSet.apply",
  "runtimePlugin.install",
  "runtimePlugin.remove",
  "mcpServer.define",
  "mcpTool.install",
  "mcpTool.remove",
  "capability.install",
  "capability.remove",
  "stewardship.grant",
  "stewardship.revoke"
]);

export const PLATFORM_PROPOSAL_TEMPLATES = Object.freeze({
  "branch.create": Object.freeze({
    action: "branch.create",
    title: "Create branch",
    targetKind: "branch",
    requiredBodyFields: Object.freeze(["id"]),
    sampleBody: Object.freeze({
      id: "branch.platform.console",
      title: "Platform Console Branch",
      parentBranchId: "branch.platform.root",
      epic: "platform-self-model",
      feature: "branch-api",
      defect: "none"
    })
  }),
  "branch.merge": Object.freeze({
    action: "branch.merge",
    title: "Merge branch",
    targetKind: "branch",
    requiredBodyFields: Object.freeze(["branchId", "intoBranchId"]),
    sampleBody: Object.freeze({
      branchId: "branch.platform.console",
      intoBranchId: "branch.platform.root",
      reason: "Ready to merge after validation"
    })
  }),
  "branch.rebase": Object.freeze({
    action: "branch.rebase",
    title: "Rebase branch",
    targetKind: "branch",
    requiredBodyFields: Object.freeze(["branchId", "ontoBranchId"]),
    sampleBody: Object.freeze({
      branchId: "branch.platform.console",
      ontoBranchId: "branch.platform.root",
      reason: "Refresh branch against latest parent"
    })
  }),
  "changeSet.create": Object.freeze({
    action: "changeSet.create",
    title: "Create change set",
    targetKind: "changeSet",
    requiredBodyFields: Object.freeze(["id"]),
    sampleBody: Object.freeze({ id: "changeset.platform.console", branchId: "branch.platform.console", title: "Platform console change" })
  }),
  "changeSet.edit": Object.freeze({
    action: "changeSet.edit",
    title: "Stage change set edit",
    targetKind: "changeSet",
    requiredBodyFields: Object.freeze(["changeSetId", "edits"]),
    sampleBody: Object.freeze({
      changeSetId: "changeset.platform.console",
      edits: [{ path: "plugins/platform/platform-console.rvm", content: "module plugin.platform.console {}" }]
    })
  }),
  "changeSet.validate": Object.freeze({
    action: "changeSet.validate",
    title: "Validate change set",
    targetKind: "changeSet",
    requiredBodyFields: Object.freeze(["changeSetId"]),
    sampleBody: Object.freeze({ changeSetId: "changeset.platform.console" })
  }),
  "changeSet.apply": Object.freeze({
    action: "changeSet.apply",
    title: "Apply change set",
    targetKind: "changeSet",
    requiredBodyFields: Object.freeze(["changeSetId"]),
    sampleBody: Object.freeze({ changeSetId: "changeset.platform.console" })
  }),
  "runtimePlugin.install": Object.freeze({
    action: "runtimePlugin.install",
    title: "Install runtime plugin",
    targetKind: "serverRunner",
    requiredBodyFields: Object.freeze(["serverRunner", "plugin"]),
    sampleBody: Object.freeze({ serverRunner: "demo_server", plugin: "plugin.inspect" })
  }),
  "runtimePlugin.remove": Object.freeze({
    action: "runtimePlugin.remove",
    title: "Remove runtime plugin",
    targetKind: "serverRunner",
    requiredBodyFields: Object.freeze(["serverRunner", "plugin"]),
    sampleBody: Object.freeze({ serverRunner: "demo_server", plugin: "plugin.inspect" })
  }),
  "mcpServer.define": Object.freeze({
    action: "mcpServer.define",
    title: "Define MCP server",
    targetKind: "serverRunner",
    requiredBodyFields: Object.freeze(["id", "serverRunner"]),
    sampleBody: Object.freeze({ id: "platform_mcp", label: "Platform MCP", serverRunner: "demo_server", transports: ["http"] })
  }),
  "mcpTool.install": Object.freeze({
    action: "mcpTool.install",
    title: "Install MCP tool",
    targetKind: "mcpServer",
    requiredBodyFields: Object.freeze(["server", "tool"]),
    sampleBody: Object.freeze({ server: "platform_mcp", tool: "platform.read", actingMode: "delegated", scopeContexts: [], scopeTargets: [] })
  }),
  "mcpTool.remove": Object.freeze({
    action: "mcpTool.remove",
    title: "Remove MCP tool",
    targetKind: "mcpServer",
    requiredBodyFields: Object.freeze(["server", "tool"]),
    sampleBody: Object.freeze({ server: "platform_mcp", tool: "platform.read" })
  }),
  "capability.install": Object.freeze({
    action: "capability.install",
    title: "Install capability",
    targetKind: "serverRunner",
    requiredBodyFields: Object.freeze(["capability", "target", "targetKind"]),
    sampleBody: Object.freeze({ capability: "platform.self", target: "demo_server", targetKind: "serverRunner" })
  }),
  "capability.remove": Object.freeze({
    action: "capability.remove",
    title: "Remove capability",
    targetKind: "serverRunner",
    requiredBodyFields: Object.freeze(["capability", "target", "targetKind"]),
    sampleBody: Object.freeze({ capability: "platform.self", target: "demo_server", targetKind: "serverRunner" })
  }),
  "stewardship.grant": Object.freeze({
    action: "stewardship.grant",
    title: "Grant stewardship",
    targetKind: "context",
    requiredBodyFields: Object.freeze(["steward", "target"]),
    sampleBody: Object.freeze({ steward: "aaron", target: "ctx.platform", targetKind: "context" })
  }),
  "stewardship.revoke": Object.freeze({
    action: "stewardship.revoke",
    title: "Revoke stewardship",
    targetKind: "context",
    requiredBodyFields: Object.freeze(["steward", "target"]),
    sampleBody: Object.freeze({ steward: "aaron", target: "ctx.platform", targetKind: "context" })
  })
});

function normalizeObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: `${label} must be an object` };
  }
  return { ok: true, value: { ...value } };
}

export function parsePlatformProposalInput(raw = {}) {
  const action = String(raw.action || raw.targetProcess || "").trim();
  if (!PLATFORM_PROPOSAL_ACTIONS.includes(action)) {
    return { ok: false, status: 400, error: "unsupported platform proposal action" };
  }
  let body = raw.body;
  if (body === undefined && raw.bodyJson !== undefined) {
    try {
      body = raw.bodyJson ? JSON.parse(String(raw.bodyJson)) : {};
    } catch (error) {
      return {
        ok: false,
        status: 400,
        error: `bodyJson is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  const normalized = normalizeObject(body ?? {}, "body");
  if (!normalized.ok) return { ...normalized, status: 400 };
  const template = PLATFORM_PROPOSAL_TEMPLATES[action];
  const missing = template.requiredBodyFields.filter(field => normalized.value[field] === undefined || normalized.value[field] === null || normalized.value[field] === "");
  if (missing.length) {
    return { ok: false, status: 400, error: `missing required body fields: ${missing.join(", ")}` };
  }
  if (action === "changeSet.edit") {
    if (!Array.isArray(normalized.value.edits) || normalized.value.edits.length === 0) {
      return { ok: false, status: 400, error: "changeSet.edit requires a non-empty edits array" };
    }
  }
  return {
    ok: true,
    value: {
      id: String(raw.id || `proposal.platform.${action}.${Date.now().toString(36)}`).trim(),
      action,
      targetKind: raw.targetKind ? String(raw.targetKind) : null,
      targetId: raw.targetId ? String(raw.targetId) : null,
      body: normalizePlatformProposalBody(action, normalized.value),
      reason: raw.reason ? String(raw.reason) : null
    }
  };
}

function stringifyArrayField(body, from, to) {
  if (body[to] !== undefined || !Array.isArray(body[from])) return;
  body[to] = JSON.stringify(body[from]);
  delete body[from];
}

export function normalizePlatformProposalBody(action, body) {
  const next = { ...body };
  if (action === "mcpServer.define") stringifyArrayField(next, "transports", "transportsJson");
  if (action === "mcpTool.install") {
    stringifyArrayField(next, "scopeContexts", "scopeContextsJson");
    stringifyArrayField(next, "scopeTargets", "scopeTargetsJson");
  }
  return next;
}

export function platformProposalTarget(action, body, explicit = {}) {
  if (explicit.targetKind && explicit.targetId) {
    return { targetKind: String(explicit.targetKind), targetId: String(explicit.targetId) };
  }
  switch (action) {
    case "branch.create":
      return { targetKind: "branch", targetId: String(body.id || "") };
    case "branch.merge":
    case "branch.rebase":
      return { targetKind: "branch", targetId: String(body.branchId || "") };
    case "changeSet.create":
      return { targetKind: "changeSet", targetId: String(body.id || "") };
    case "changeSet.edit":
    case "changeSet.validate":
    case "changeSet.apply":
      return { targetKind: "changeSet", targetId: String(body.changeSetId || "") };
    case "runtimePlugin.install":
    case "runtimePlugin.remove":
    case "mcpServer.define":
      return { targetKind: "serverRunner", targetId: String(body.serverRunner || "") };
    case "mcpTool.install":
    case "mcpTool.remove":
      return { targetKind: "mcpServer", targetId: String(body.server || "") };
    case "capability.install":
    case "capability.remove":
    case "stewardship.grant":
    case "stewardship.revoke":
      return { targetKind: String(body.targetKind || explicit.targetKind || PLATFORM_PROPOSAL_TEMPLATES[action].targetKind), targetId: String(body.target || explicit.targetId || "") };
    default:
      return { targetKind: explicit.targetKind || "platform", targetId: explicit.targetId || null };
  }
}

export function buildPlatformProposalCreateBody(raw = {}) {
  const parsed = parsePlatformProposalInput(raw);
  if (!parsed.ok) return parsed;
  const { action, body, id, reason, targetKind, targetId } = parsed.value;
  const target = platformProposalTarget(action, body, { targetKind, targetId });
  if (!target.targetId) return { ok: false, status: 400, error: "platform proposal target id is required" };
  return {
    ok: true,
    value: {
      id,
      targetProcess: action,
      targetKind: target.targetKind,
      targetId: target.targetId,
      bodyJson: JSON.stringify(body),
      reason
    }
  };
}

export function platformProposalTemplates() {
  return PLATFORM_PROPOSAL_ACTIONS.map(action => ({
    ...PLATFORM_PROPOSAL_TEMPLATES[action],
    requiredBodyFields: [...PLATFORM_PROPOSAL_TEMPLATES[action].requiredBodyFields],
    sampleBody: { ...PLATFORM_PROPOSAL_TEMPLATES[action].sampleBody }
  }));
}
