const COVERAGE_MODES = Object.freeze([
  "direct-authority",
  "proposal-fallback",
  "operator-only"
]);

function freezeEntry({
  operationSemantics = "governed-mutation",
  governanceMode = "direct-authority",
  authorityMechanism = "unknown",
  sharedAuthorityPath = false,
  workflowRole = "direct-mutation",
  notes = ""
} = {}) {
  return Object.freeze({
    operationSemantics,
    governanceMode,
    authorityMechanism,
    sharedAuthorityPath: sharedAuthorityPath === true,
    workflowRole,
    notes: String(notes || "")
  });
}

function directAuthority(authorityMechanism, notes, options = {}) {
  return freezeEntry({
    operationSemantics: options.operationSemantics ?? "governed-mutation",
    governanceMode: "direct-authority",
    authorityMechanism,
    sharedAuthorityPath: options.sharedAuthorityPath ?? true,
    workflowRole: options.workflowRole ?? "direct-mutation",
    notes
  });
}

function proposalFallback(authorityMechanism, notes, options = {}) {
  return freezeEntry({
    operationSemantics: options.operationSemantics ?? "governed-mutation",
    governanceMode: "proposal-fallback",
    authorityMechanism,
    sharedAuthorityPath: options.sharedAuthorityPath ?? true,
    workflowRole: options.workflowRole ?? "proposal-fallback",
    notes
  });
}

function operatorOnly(notes, options = {}) {
  return freezeEntry({
    operationSemantics: options.operationSemantics ?? "governed-mutation",
    governanceMode: "operator-only",
    authorityMechanism: options.authorityMechanism ?? "bootstrap-operator",
    sharedAuthorityPath: options.sharedAuthorityPath ?? false,
    workflowRole: options.workflowRole ?? "direct-mutation",
    notes
  });
}

function cloneEntry(entry = null) {
  if (!entry || typeof entry !== "object") return null;
  return {
    operationSemantics: String(entry.operationSemantics || "governed-mutation"),
    governanceMode: String(entry.governanceMode || "direct-authority"),
    authorityMechanism: String(entry.authorityMechanism || "unknown"),
    sharedAuthorityPath: entry.sharedAuthorityPath === true,
    workflowRole: String(entry.workflowRole || "direct-mutation"),
    notes: String(entry.notes || "")
  };
}

function freezeProposalTargetEntry({
  operationSemantics = "governed-mutation",
  governanceMode = "proposal-fallback",
  authorityMechanism = "unknown",
  sharedAuthorityPath = true,
  workflowRole = "proposal-target",
  bootstrapSelectable = true,
  notes = ""
} = {}) {
  return Object.freeze({
    operationSemantics,
    governanceMode,
    authorityMechanism,
    sharedAuthorityPath: sharedAuthorityPath === true,
    workflowRole,
    bootstrapSelectable: bootstrapSelectable === true,
    notes: String(notes || "")
  });
}

function proposalTarget(authorityMechanism, notes, options = {}) {
  return freezeProposalTargetEntry({
    operationSemantics: options.operationSemantics ?? "governed-mutation",
    governanceMode: options.governanceMode ?? "proposal-fallback",
    authorityMechanism,
    sharedAuthorityPath: options.sharedAuthorityPath ?? true,
    workflowRole: options.workflowRole ?? "proposal-target",
    bootstrapSelectable: options.bootstrapSelectable ?? true,
    notes
  });
}

function proposalTargetOperatorOnly(notes, options = {}) {
  return freezeProposalTargetEntry({
    operationSemantics: options.operationSemantics ?? "governed-mutation",
    governanceMode: "operator-only",
    authorityMechanism: options.authorityMechanism ?? "bootstrap-operator",
    sharedAuthorityPath: options.sharedAuthorityPath ?? false,
    workflowRole: options.workflowRole ?? "proposal-target",
    bootstrapSelectable: options.bootstrapSelectable ?? false,
    notes
  });
}

function cloneProposalTargetEntry(entry = null) {
  if (!entry || typeof entry !== "object") return null;
  return {
    operationSemantics: String(entry.operationSemantics || "governed-mutation"),
    governanceMode: String(entry.governanceMode || "proposal-fallback"),
    authorityMechanism: String(entry.authorityMechanism || "unknown"),
    sharedAuthorityPath: entry.sharedAuthorityPath === true,
    workflowRole: String(entry.workflowRole || "proposal-target"),
    bootstrapSelectable: entry.bootstrapSelectable === true,
    notes: String(entry.notes || "")
  };
}

function routeMatcher(route = {}) {
  return route.kind === "exact"
    ? String(route.path || "")
    : String(route.pattern || route.matcher || "");
}

const HANDLER_GOVERNANCE = Object.freeze({
  "app.source.write": directAuthority(
    "authoring-policy",
    "Persists source edits immediately through the snapshot manager after authoring-policy checks; there is no proposal fallback.",
    { operationSemantics: "operational-mutation", sharedAuthorityPath: false }
  ),
  "asset.attach": proposalFallback(
    "context-or-target-authority",
    "Attempts shared target authority first and routes to bootstrap proposal creation when direct attachment is not allowed."
  ),
  "asset.detach": proposalFallback(
    "context-or-target-authority",
    "Attempts shared target authority first and routes to bootstrap proposal creation when direct detachment is not allowed."
  ),
  "asset.ingest.retry": directAuthority(
    "context-or-target-authority",
    "Requires authority over the asset target before restarting ingest."
  ),
  "asset.search.reindex": directAuthority(
    "context-or-target-authority",
    "Requires authority over the asset target before rebuilding derived search data."
  ),
  "asset.upload": directAuthority(
    "context-or-target-authority",
    "Resolves the destination context and writes the asset immediately when the actor can create or mutate in that scope."
  ),
  "auth.oauth.start": directAuthority(
    "oauth-flow",
    "Starts a login or account-link flow immediately from runtime config and the current session state.",
    { operationSemantics: "operational-mutation", sharedAuthorityPath: false, workflowRole: "session-ingress" }
  ),
  "authority.grants.create": directAuthority(
    "bootstrap-identity-authority",
    "Requires a bootstrap actor plus shared identity-authority checks before granting actor assumption."
  ),
  "authority.grants.revoke": directAuthority(
    "bootstrap-identity-authority",
    "Requires a bootstrap actor plus shared identity-authority checks before revoking actor assumption."
  ),
  "context.create": proposalFallback(
    "bootstrap-context-or-target-authority",
    "Context creation attempts shared parent-target authority first and routes to proposal creation when direct child-context definition is not allowed."
  ),
  "contextBinding.create": proposalFallback(
    "bootstrap-context-authority",
    "Context-binding creation attempts shared context authority first and routes to proposal creation when direct binding is not allowed."
  ),
  "contextBinding.remove": proposalFallback(
    "bootstrap-context-authority",
    "Context-binding removal attempts shared context authority first and routes to proposal creation when direct unbinding is not allowed."
  ),
  "contextExport.create": proposalFallback(
    "bootstrap-context-authority",
    "Context-export creation attempts shared context authority first and routes to proposal creation when direct export is not allowed."
  ),
  "contextExport.remove": proposalFallback(
    "bootstrap-context-authority",
    "Context-export removal attempts shared context authority first and routes to proposal creation when direct unexport is not allowed."
  ),
  "contextImport.create": proposalFallback(
    "bootstrap-context-authority",
    "Context-import creation attempts shared context authority first and routes to proposal creation when direct import is not allowed."
  ),
  "contextImport.remove": proposalFallback(
    "bootstrap-context-authority",
    "Context-import removal attempts shared context authority first and routes to proposal creation when direct unimport is not allowed."
  ),
  "backendProgram.create": proposalFallback(
    "bootstrap-target-authority",
    "Bootstrap authoring attempts shared context authority first and routes to proposal creation when direct backend-program creation is not allowed."
  ),
  "backendProgramVersion.create": proposalFallback(
    "bootstrap-target-authority",
    "Bootstrap authoring attempts shared backend-program authority first and routes to proposal creation when direct version definition is not allowed."
  ),
  "backendProgramVersions.activate": proposalFallback(
    "bootstrap-target-authority",
    "Bootstrap authoring attempts shared backend-program authority first and routes to proposal creation when direct activation is not allowed."
  ),
  "backendProgramVersions.rollback": proposalFallback(
    "bootstrap-target-authority",
    "Bootstrap authoring attempts shared backend-program authority first and routes to proposal creation when direct rollback is not allowed."
  ),
  "backendStep.create": proposalFallback(
    "bootstrap-target-authority",
    "Bootstrap authoring attempts shared backend-program-version authority first and routes to proposal creation when direct backend-step creation is not allowed."
  ),
  "capability.create": proposalFallback(
    "bootstrap-target-authority",
    "Capability creation attempts shared context authority first and routes to proposal creation when direct definition is not allowed."
  ),
  "capability.install": proposalFallback(
    "bootstrap-target-authority",
    "Capability installation attempts shared target authority first and routes to proposal creation when direct installation is not allowed."
  ),
  "capability.remove": proposalFallback(
    "bootstrap-target-authority",
    "Capability removal attempts shared target authority first and routes to proposal creation when direct removal is not allowed."
  ),
  "db.sql.command": directAuthority(
    "server-runner-authority",
    "SQL command execution is immediate but always runs through the shared server-runner mutation gate.",
    { operationSemantics: "operational-mutation" }
  ),
  "db.sql.datasource.create": directAuthority(
    "server-runner-authority",
    "Datasource creation writes a first-class runtime datasource record under the shared server-runner authority gate."
  ),
  "db.sql.datasource.delete": directAuthority(
    "server-runner-authority",
    "Datasource deletion writes a first-class runtime datasource tombstone under the shared server-runner authority gate."
  ),
  "db.sql.datasource.test": directAuthority(
    "server-runner-authority",
    "Datasource testing updates test status and operation records through the shared server-runner authority gate.",
    { operationSemantics: "operational-mutation" }
  ),
  "db.sql.datasource.testDraft": directAuthority(
    "server-runner-authority",
    "Draft datasource testing does not persist a datasource row but still emits operational records through the shared server-runner authority gate.",
    { operationSemantics: "operational-mutation" }
  ),
  "db.sql.datasource.update": directAuthority(
    "server-runner-authority",
    "Datasource updates mutate a first-class runtime datasource record through the shared server-runner authority gate."
  ),
  "db.sql.migrate": directAuthority(
    "server-runner-authority",
    "Migration execution is immediate but always runs through the shared server-runner mutation gate.",
    { operationSemantics: "operational-mutation" }
  ),
  "db.sql.query": directAuthority(
    "server-runner-authority",
    "Queries are immediate and still increment runtime SQL operation state, so they remain under the shared server-runner mutation gate.",
    { operationSemantics: "operational-mutation", workflowRole: "read-with-operational-state" }
  ),
  "db.sql.transaction": directAuthority(
    "server-runner-authority",
    "Transactions are immediate and always run through the shared server-runner mutation gate.",
    { operationSemantics: "operational-mutation" }
  ),
  "frontendProgram.create": proposalFallback(
    "bootstrap-target-authority",
    "Bootstrap authoring attempts shared context authority first and routes to proposal creation when direct frontend-program creation is not allowed."
  ),
  "frontendStep.create": proposalFallback(
    "bootstrap-target-authority",
    "Bootstrap authoring attempts shared frontend-program authority first and routes to proposal creation when direct frontend-step creation is not allowed."
  ),
  "fs.blob.delete": directAuthority(
    "storage-scope-authority",
    "Blob deletion is immediate but scoped through shared storage and context authority helpers.",
    { operationSemantics: "operational-mutation" }
  ),
  "fs.blob.write": directAuthority(
    "storage-scope-authority",
    "Blob writes are immediate but scoped through shared storage and context authority helpers.",
    { operationSemantics: "operational-mutation" }
  ),
  "fs.stream.copy": directAuthority(
    "storage-scope-authority",
    "Stream copies are immediate but scoped through shared storage and context authority helpers.",
    { operationSemantics: "operational-mutation" }
  ),
  "fs.stream.write": directAuthority(
    "storage-scope-authority",
    "Stream writes are immediate but scoped through shared storage and context authority helpers.",
    { operationSemantics: "operational-mutation" }
  ),
  "guidance.progress.delete": directAuthority(
    "session-state",
    "Guidance progress lives inside the caller session and mutates only that per-user session state.",
    { operationSemantics: "operational-mutation", sharedAuthorityPath: false, workflowRole: "session-state" }
  ),
  "guidance.progress.write": directAuthority(
    "session-state",
    "Guidance progress lives inside the caller session and mutates only that per-user session state.",
    { operationSemantics: "operational-mutation", sharedAuthorityPath: false, workflowRole: "session-state" }
  ),
  "http.outbound.send": directAuthority(
    "server-runner-authority",
    "Outbound HTTP requests are immediate but always run through the shared server-runner mutation gate.",
    { operationSemantics: "operational-mutation" }
  ),
  "identity.create": directAuthority(
    "bootstrap-identity-authority",
    "Identity creation writes immediately once a bootstrap actor is present; there is no proposal fallback."
  ),
  "identity.update": directAuthority(
    "bootstrap-identity-authority",
    "Identity updates write immediately once the bootstrap actor passes the shared identity-authority gate; there is no proposal fallback."
  ),
  "jobs.queue.enqueue": directAuthority(
    "server-runner-authority",
    "Job enqueue mutates the runtime queue immediately under the shared server-runner mutation gate.",
    { operationSemantics: "operational-mutation" }
  ),
  "mcp.http": directAuthority(
    "mcp-principal-scope",
    "MCP calls resolve an acting principal, origin policy, and tool scope before dispatching; tool calls may become downstream mutations.",
    { operationSemantics: "mixed", workflowRole: "relay" }
  ),
  "mcpServer.create": proposalFallback(
    "bootstrap-target-authority",
    "MCP server creation attempts shared server-runner authority first and routes to bootstrap proposal creation when direct creation is not allowed."
  ),
  "mcpTool.install": proposalFallback(
    "bootstrap-target-authority",
    "MCP tool installation attempts shared MCP-server authority first and routes to bootstrap proposal creation when direct installation is not allowed."
  ),
  "mcpTool.remove": proposalFallback(
    "bootstrap-target-authority",
    "MCP tool removal attempts shared MCP-server authority first and routes to bootstrap proposal creation when direct removal is not allowed."
  ),
  "notify.email.enqueue": directAuthority(
    "server-runner-authority",
    "Notification enqueue mutates runtime queue state immediately under the shared server-runner mutation gate.",
    { operationSemantics: "operational-mutation" }
  ),
  "notify.sms.enqueue": directAuthority(
    "server-runner-authority",
    "Notification enqueue mutates runtime queue state immediately under the shared server-runner mutation gate.",
    { operationSemantics: "operational-mutation" }
  ),
  "message.create": proposalFallback(
    "bootstrap-context-authority",
    "Message definition attempts shared context authority first and routes to proposal creation when direct authored definition is not allowed."
  ),
  "package.create": proposalFallback(
    "bootstrap-context-authority",
    "Package creation attempts shared package-scope context authority first and routes to proposal creation when direct package definition is not allowed."
  ),
  "packageRevision.create": proposalFallback(
    "bootstrap-target-authority",
    "Package-revision creation attempts shared package authority first and routes to proposal creation when direct revision definition is not allowed."
  ),
  "packageRevision.publish": proposalFallback(
    "bootstrap-target-authority",
    "Package-revision publish attempts shared package-revision authority first and routes to proposal creation when direct publication is not allowed."
  ),
  "packagePatch.create": proposalFallback(
    "bootstrap-target-authority",
    "Package-patch creation attempts shared package-revision authority first and routes to proposal creation when direct patch definition is not allowed."
  ),
  "packageNamespace.create": proposalFallback(
    "bootstrap-context-authority",
    "Package-namespace binding attempts shared context authority first and routes to proposal creation when direct namespace definition is not allowed."
  ),
  "packageDependency.create": proposalFallback(
    "bootstrap-target-authority",
    "Package-dependency creation attempts shared package-revision authority first and routes to proposal creation when direct dependency definition is not allowed."
  ),
  "packageTransformer.create": proposalFallback(
    "bootstrap-target-authority",
    "Package-transformer creation attempts shared package or package-revision authority first and routes to proposal creation when direct convergence definition is not allowed."
  ),
  "operator.backup": operatorOnly(
    "Operator backup writes host-managed runtime artifacts and is intentionally limited to the bootstrap operator.",
    { operationSemantics: "operational-mutation" }
  ),
  "operator.export": operatorOnly(
    "Operator export writes host-managed runtime artifacts and is intentionally limited to the bootstrap operator.",
    { operationSemantics: "operational-mutation" }
  ),
  "operator.import": operatorOnly(
    "Operator import writes host-managed runtime artifacts and is intentionally limited to the bootstrap operator.",
    { operationSemantics: "operational-mutation" }
  ),
  "operator.restore": operatorOnly(
    "Operator restore writes host-managed runtime artifacts and is intentionally limited to the bootstrap operator.",
    { operationSemantics: "operational-mutation" }
  ),
  "platform.branch.create": operatorOnly(
    "Platform branches are first-class platform nouns, but this route is still bootstrap-operator-only instead of shared target authority."
  ),
  "platform.changeSet.abandon": operatorOnly(
    "Platform change-set lifecycle is first-class, but this route is still bootstrap-operator-only instead of shared target authority."
  ),
  "platform.changeSet.apply": operatorOnly(
    "Platform change-set apply is first-class, but execution is still bootstrap-operator-only instead of shared target authority."
  ),
  "platform.changeSet.create": operatorOnly(
    "Platform change sets are first-class platform nouns, but creation is still bootstrap-operator-only instead of shared target authority."
  ),
  "platform.changeSet.edit": operatorOnly(
    "Platform staged edits are first-class platform nouns, but staging is still bootstrap-operator-only instead of shared target authority."
  ),
  "platform.changeSet.reject": operatorOnly(
    "Platform change-set lifecycle is first-class, but this route is still bootstrap-operator-only instead of shared target authority."
  ),
  "platform.changeSet.removeEdit": operatorOnly(
    "Platform staged edits are first-class platform nouns, but removal is still bootstrap-operator-only instead of shared target authority."
  ),
  "platform.changeSet.validate": operatorOnly(
    "Platform change-set validation is first-class, but this route is still bootstrap-operator-only instead of shared target authority."
  ),
  "platform.proposal.approve": operatorOnly(
    "Platform proposal approval reuses the bootstrap proposal executor and remains bootstrap-operator-only.",
    { workflowRole: "proposal-review" }
  ),
  "platform.proposal.create": operatorOnly(
    "Platform proposal creation emits a bootstrap proposal artifact and remains bootstrap-operator-only.",
    { workflowRole: "proposal-entry" }
  ),
  "platform.proposal.reject": operatorOnly(
    "Platform proposal rejection mutates the bootstrap proposal lane and remains bootstrap-operator-only.",
    { workflowRole: "proposal-review" }
  ),
  "platform.testRun.create": operatorOnly(
    "Platform test runs mutate verification records and runtime evidence, but execution is still bootstrap-operator-only.",
    { operationSemantics: "operational-mutation", workflowRole: "verification-run" }
  ),
  "proposal.approve": operatorOnly(
    "Bootstrap proposal approval remains in the operator lane; it is the shared review path, but not yet target-derived authority.",
    { workflowRole: "proposal-review" }
  ),
  "proposal.create": operatorOnly(
    "Bootstrap proposal creation is the canonical proposal entry lane and remains operator-owned.",
    { workflowRole: "proposal-entry" }
  ),
  "proposal.reject": operatorOnly(
    "Bootstrap proposal rejection remains in the operator lane; it is the shared review path, but not yet target-derived authority.",
    { workflowRole: "proposal-review" }
  ),
  "perspective.create": proposalFallback(
    "bootstrap-context-authority",
    "Perspective creation attempts shared context authority first and routes to proposal creation when direct definition is not allowed."
  ),
  "process.create": proposalFallback(
    "bootstrap-context-authority",
    "Process definition attempts shared context authority first and routes to proposal creation when direct authored definition is not allowed."
  ),
  "projection.create": proposalFallback(
    "bootstrap-context-authority",
    "Projection definition attempts shared context authority first and routes to proposal creation when direct authored definition is not allowed."
  ),
  "route.create": proposalFallback(
    "bootstrap-context-authority",
    "Route creation attempts shared context authority first and routes to bootstrap proposal creation when direct route definition is not allowed."
  ),
  "runtimePlugin.install": proposalFallback(
    "bootstrap-target-authority",
    "Runtime plugin installation attempts shared server-runner authority first and routes to bootstrap proposal creation when direct installation is not allowed."
  ),
  "runtimePlugin.remove": proposalFallback(
    "bootstrap-target-authority",
    "Runtime plugin removal attempts shared server-runner authority first and routes to bootstrap proposal creation when direct removal is not allowed."
  ),
  "search.index.build": directAuthority(
    "server-runner-authority",
    "Search index build mutates runtime index state immediately under the shared server-runner mutation gate.",
    { operationSemantics: "operational-mutation" }
  ),
  "search.index.query": directAuthority(
    "server-runner-authority",
    "Search queries are immediate and still mutate runtime query counters and history under the shared server-runner mutation gate.",
    { operationSemantics: "operational-mutation", workflowRole: "read-with-operational-state" }
  ),
  "search.index.reindex": directAuthority(
    "server-runner-authority",
    "Search index reindex mutates runtime index state immediately under the shared server-runner mutation gate.",
    { operationSemantics: "operational-mutation" }
  ),
  "secret.store.create": directAuthority(
    "server-runner-authority",
    "Secret store creation mutates first-class secret records under the shared server-runner mutation gate."
  ),
  "secret.store.delete": directAuthority(
    "server-runner-authority",
    "Secret deletion mutates first-class secret records under the shared server-runner mutation gate."
  ),
  "secret.store.write": directAuthority(
    "server-runner-authority",
    "Secret value writes mutate first-class secret records under the shared server-runner mutation gate."
  ),
  "serverRunner.create": proposalFallback(
    "bootstrap-context-authority",
    "Server-runner creation attempts shared context authority first and routes to bootstrap proposal creation when direct creation is not allowed."
  ),
  "serve.create": proposalFallback(
    "bootstrap-target-authority",
    "Serve-mount creation attempts shared server-runner or context authority first and routes to bootstrap proposal creation when direct mounting is not allowed."
  ),
  "stewardship.create": proposalFallback(
    "bootstrap-target-authority",
    "Stewardship grants attempt shared target authority first and route to proposal creation when direct grant is not allowed."
  ),
  "stewardship.remove": proposalFallback(
    "bootstrap-target-authority",
    "Stewardship revocations attempt shared target authority first and route to proposal creation when direct revoke is not allowed."
  ),
  "surface.create": proposalFallback(
    "bootstrap-context-authority",
    "Surface definition attempts shared context authority on each authored document first and routes to proposal creation when direct authored definition is not allowed."
  ),
  "session.logout": directAuthority(
    "credential-session",
    "Session logout clears only the caller session and does not use proposal or shared target authority.",
    { operationSemantics: "operational-mutation", sharedAuthorityPath: false, workflowRole: "session-access" }
  ),
  "session.open": directAuthority(
    "credential-session",
    "Session open creates only the caller session from credentials and assumption rules; it does not use proposal or shared target authority.",
    { operationSemantics: "operational-mutation", sharedAuthorityPath: false, workflowRole: "session-access" }
  ),
  "type.create": proposalFallback(
    "bootstrap-context-authority",
    "Type definition attempts shared context authority first and routes to proposal creation when direct authored definition is not allowed."
  ),
  "webhook.inbound.receive": directAuthority(
    "external-signature",
    "Inbound webhooks are accepted or rejected by transport signature and replay rules rather than actor-derived authority.",
    { operationSemantics: "operational-mutation", sharedAuthorityPath: false, workflowRole: "ingress" }
  ),
  "widgets.create": proposalFallback(
    "bootstrap-context-or-target-authority",
    "Widget creation attempts shared context or parent-widget authority first and routes to proposal creation when direct definition is not allowed."
  ),
  "widgets.update": proposalFallback(
    "bootstrap-target-authority",
    "Widget updates attempt shared widget authority first and route to proposal creation when direct mutation is not allowed."
  )
});

const PROPOSAL_TARGET_GOVERNANCE = Object.freeze({
  "identity.update": proposalTarget(
    "bootstrap-identity-authority",
    "Identity update proposals execute through the shared identity-authority helper once approved."
  ),
  "todo.create": proposalTarget(
    "bootstrap-context-authority",
    "Todo creation proposals execute through shared context authority on the target todo scope once approved."
  ),
  "todo.update": proposalTarget(
    "bootstrap-context-authority",
    "Todo update proposals execute through shared context authority on the target todo scope once approved."
  ),
  "todo.delete": proposalTarget(
    "bootstrap-context-authority",
    "Todo delete proposals execute through shared context authority on the target todo scope once approved."
  ),
  "canvas.place": proposalTarget(
    "bootstrap-context-authority",
    "Canvas placement proposals execute through shared context authority on the authored perspective scope once approved."
  ),
  "canvas.move": proposalTarget(
    "bootstrap-context-authority",
    "Canvas move proposals execute through shared context authority on the authored perspective scope once approved."
  ),
  "canvas.moveMany": proposalTarget(
    "bootstrap-context-authority",
    "Canvas batch move proposals execute through shared context authority on the authored perspective scope once approved."
  ),
  "canvas.style": proposalTarget(
    "bootstrap-context-authority",
    "Canvas styling proposals execute through shared context authority on the authored perspective scope once approved."
  ),
  "canvas.remove": proposalTarget(
    "bootstrap-context-authority",
    "Canvas remove proposals execute through shared context authority on the authored perspective scope once approved."
  ),
  "canvas.removeMany": proposalTarget(
    "bootstrap-context-authority",
    "Canvas bulk remove proposals execute through shared context authority on the authored perspective scope once approved."
  ),
  "canvas.duplicate": proposalTarget(
    "bootstrap-context-authority",
    "Canvas duplicate proposals execute through shared context authority on the authored perspective scope once approved."
  ),
  "canvas.camera": proposalTarget(
    "bootstrap-context-authority",
    "Canvas camera proposals execute through shared context authority on the authored perspective scope once approved."
  ),
  "canvas.grid": proposalTarget(
    "bootstrap-context-authority",
    "Canvas grid proposals execute through shared context authority on the authored perspective scope once approved."
  ),
  "canvas.batch": proposalTarget(
    "bootstrap-context-authority",
    "Canvas batch proposals execute through shared context authority on the authored perspective scope once approved."
  ),
  "canvas.createThing": proposalTarget(
    "bootstrap-context-authority",
    "Canvas thing-creation proposals execute through shared context authority on the authored perspective scope once approved."
  ),
  "canvas.perspective.create": proposalTarget(
    "bootstrap-context-authority",
    "Canvas perspective-create proposals execute through shared context authority on the target context once approved."
  ),
  "canvas.thing.setTitle": proposalTarget(
    "bootstrap-target-authority",
    "Canvas title proposals execute through shared target authority on the authored thing once approved."
  ),
  "canvas.relate": proposalTarget(
    "bootstrap-target-authority",
    "Canvas relation proposals execute through shared target authority on the authored source thing once approved."
  ),
  "canvas.unrelate": proposalTarget(
    "bootstrap-target-authority",
    "Canvas unrelate proposals execute through shared target authority on the authored source thing once approved."
  ),
  "asset.attach": proposalTarget(
    "context-or-target-authority",
    "Asset attach proposals execute through shared target authority on both the asset and the target once approved."
  ),
  "asset.detach": proposalTarget(
    "context-or-target-authority",
    "Asset detach proposals execute through shared target authority on both the asset and the target once approved."
  ),
  "context.define": proposalTarget(
    "bootstrap-context-authority",
    "Context-define proposals execute through the shared context-authority helper once approved."
  ),
  "context.bind": proposalTarget(
    "bootstrap-context-authority",
    "Context-binding proposals execute through shared context authority and contextual visibility helpers once approved."
  ),
  "context.unbind": proposalTarget(
    "bootstrap-context-authority",
    "Context-unbind proposals execute through shared context authority and contextual visibility helpers once approved."
  ),
  "context.export": proposalTarget(
    "bootstrap-context-authority",
    "Context-export proposals execute through shared context authority and contextual visibility helpers once approved."
  ),
  "context.unexport": proposalTarget(
    "bootstrap-context-authority",
    "Context-unexport proposals execute through shared context authority and contextual visibility helpers once approved."
  ),
  "context.import": proposalTarget(
    "bootstrap-context-authority",
    "Context-import proposals execute through shared context authority and contextual visibility helpers once approved."
  ),
  "context.unimport": proposalTarget(
    "bootstrap-context-authority",
    "Context-unimport proposals execute through shared context authority and contextual visibility helpers once approved."
  ),
  "perspective.define": proposalTarget(
    "bootstrap-context-authority",
    "Perspective-define proposals execute through shared context authority once approved."
  ),
  "stewardship.grant": proposalTarget(
    "bootstrap-target-authority",
    "Stewardship-grant proposals execute through shared target authority and identity checks once approved."
  ),
  "stewardship.revoke": proposalTarget(
    "bootstrap-target-authority",
    "Stewardship-revoke proposals execute through shared target authority and identity checks once approved."
  ),
  "surface.define": proposalTarget(
    "bootstrap-context-authority",
    "Surface-define proposals execute through shared context authority on each authored document once approved."
  ),
  "process.define": proposalTarget(
    "bootstrap-context-authority",
    "Process-define proposals execute through shared context authority on the authored process context once approved."
  ),
  "type.define": proposalTarget(
    "bootstrap-context-authority",
    "Type-define proposals execute through shared context authority on the authored type context once approved."
  ),
  "projection.define": proposalTarget(
    "bootstrap-context-authority",
    "Projection-define proposals execute through shared context authority on the authored projection context once approved."
  ),
  "message.define": proposalTarget(
    "bootstrap-context-authority",
    "Message-define proposals execute through shared context authority on the authored message context once approved."
  ),
  "package.define": proposalTarget(
    "bootstrap-context-authority",
    "Package-define proposals execute through shared package-scope context authority once approved."
  ),
  "packageRevision.define": proposalTarget(
    "bootstrap-target-authority",
    "Package-revision define proposals execute through shared package target authority once approved."
  ),
  "packageRevision.publish": proposalTarget(
    "bootstrap-target-authority",
    "Package-revision publish proposals execute through shared package-revision target authority once approved."
  ),
  "packagePatch.define": proposalTarget(
    "bootstrap-target-authority",
    "Package-patch define proposals execute through shared package-revision target authority once approved."
  ),
  "packageNamespace.define": proposalTarget(
    "bootstrap-context-authority",
    "Package-namespace define proposals execute through shared context authority on the bound namespace scope once approved."
  ),
  "packageDependency.define": proposalTarget(
    "bootstrap-target-authority",
    "Package-dependency define proposals execute through shared package-revision target authority once approved."
  ),
  "packageTransformer.define": proposalTarget(
    "bootstrap-target-authority",
    "Package-transformer define proposals execute through shared package or package-revision target authority once approved."
  ),
  "widget.define": proposalTarget(
    "bootstrap-target-authority",
    "Widget-define proposals execute through shared target authority and contextual visibility checks once approved."
  ),
  "widget.update": proposalTarget(
    "bootstrap-target-authority",
    "Widget-update proposals execute through shared target authority on the widget once approved."
  ),
  "widgetVersion.activate": proposalTarget(
    "bootstrap-target-authority",
    "Widget-version activation proposals execute through shared target authority on the widget soul once approved."
  ),
  "widgetVersion.rollback": proposalTarget(
    "bootstrap-target-authority",
    "Widget-version rollback proposals execute through shared target authority on the widget soul once approved."
  ),
  "edenVersions.activate": proposalTarget(
    "bootstrap-target-authority",
    "Eden version activation proposals execute through the shared Eden version helper and target authority on the versioned soul once approved.",
    { bootstrapSelectable: false }
  ),
  "edenVersions.rollback": proposalTarget(
    "bootstrap-target-authority",
    "Eden version rollback proposals execute through the shared Eden version helper and target authority on the versioned soul once approved.",
    { bootstrapSelectable: false }
  ),
  "edenVersions.publish": proposalTarget(
    "bootstrap-target-authority",
    "Eden version publish proposals execute through shared target authority on the versioned soul once approved."
  ),
  "frontendProgram.define": proposalTarget(
    "bootstrap-target-authority",
    "Frontend-program define proposals execute through shared target authority and contextual visibility checks once approved."
  ),
  "frontendStep.define": proposalTarget(
    "bootstrap-target-authority",
    "Frontend-step define proposals execute through shared target authority and supported-ops checks once approved."
  ),
  "backendProgram.define": proposalTarget(
    "bootstrap-target-authority",
    "Backend-program define proposals execute through shared target authority and contextual visibility checks once approved."
  ),
  "backendProgramVersion.define": proposalTarget(
    "bootstrap-target-authority",
    "Backend-program version define proposals execute through shared target authority on the backend-program soul once approved."
  ),
  "backendStep.define": proposalTarget(
    "bootstrap-target-authority",
    "Backend-step define proposals execute through shared target authority and supported-ops checks once approved."
  ),
  "backendProgramVersion.activate": proposalTarget(
    "bootstrap-target-authority",
    "Backend-program activation proposals execute through shared target authority on the backend-program soul once approved."
  ),
  "backendProgramVersion.rollback": proposalTarget(
    "bootstrap-target-authority",
    "Backend-program rollback proposals execute through shared target authority on the backend-program soul once approved."
  ),
  "route.define": proposalTarget(
    "bootstrap-target-authority",
    "Route-define proposals execute through shared target authority and contextual visibility checks once approved."
  ),
  "serve.define": proposalTarget(
    "bootstrap-target-authority",
    "Serve-define proposals execute through shared target authority and contextual visibility checks once approved."
  ),
  "serverRunner.define": proposalTarget(
    "bootstrap-context-authority",
    "Server-runner define proposals execute through shared context authority on the authored runner context once approved."
  ),
  "mcpServer.define": proposalTarget(
    "bootstrap-target-authority",
    "MCP-server define proposals execute through shared server-runner target authority once approved."
  ),
  "capability.define": proposalTarget(
    "bootstrap-target-authority",
    "Capability-define proposals execute through shared target authority on the authored capability target once approved."
  ),
  "capability.install": proposalTarget(
    "bootstrap-target-authority",
    "Capability-install proposals execute through shared target authority on the install target once approved."
  ),
  "capability.remove": proposalTarget(
    "bootstrap-target-authority",
    "Capability-remove proposals execute through shared target authority on the install target once approved."
  ),
  "runtimePlugin.install": proposalTarget(
    "bootstrap-target-authority",
    "Runtime-plugin install proposals execute through shared server-runner target authority once approved."
  ),
  "runtimePlugin.remove": proposalTarget(
    "bootstrap-target-authority",
    "Runtime-plugin remove proposals execute through shared server-runner target authority once approved."
  ),
  "mcpTool.install": proposalTarget(
    "bootstrap-target-authority",
    "MCP-tool install proposals execute through shared MCP-server target authority once approved."
  ),
  "mcpTool.remove": proposalTarget(
    "bootstrap-target-authority",
    "MCP-tool remove proposals execute through shared MCP-server target authority once approved."
  ),
  "branch.create": proposalTargetOperatorOnly(
    "Platform branch-create proposals currently execute only through the platform operator lane."
  ),
  "branch.merge": proposalTargetOperatorOnly(
    "Platform branch-merge proposals currently execute only through the platform operator lane."
  ),
  "branch.rebase": proposalTargetOperatorOnly(
    "Platform branch-rebase proposals currently execute only through the platform operator lane."
  ),
  "changeSet.create": proposalTargetOperatorOnly(
    "Platform change-set create proposals currently execute only through the platform operator lane."
  ),
  "changeSet.edit": proposalTargetOperatorOnly(
    "Platform change-set edit proposals currently execute only through the platform operator lane."
  ),
  "changeSet.validate": proposalTargetOperatorOnly(
    "Platform change-set validate proposals currently execute only through the platform operator lane."
  ),
  "changeSet.apply": proposalTargetOperatorOnly(
    "Platform change-set apply proposals currently execute only through the platform operator lane."
  )
});

export function runtimeGovernanceCoverageModes() {
  return [...COVERAGE_MODES];
}

export function isPotentiallyMutatingMethod(method = "GET") {
  const normalized = String(method || "GET").toUpperCase();
  return !["GET", "HEAD", "OPTIONS"].includes(normalized);
}

export function runtimeGovernanceEntry(handlerId) {
  return cloneEntry(HANDLER_GOVERNANCE[String(handlerId || "")] ?? null);
}

export function runtimeGovernanceCatalog() {
  return Object.fromEntries(
    Object.entries(HANDLER_GOVERNANCE)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([handlerId, entry]) => [handlerId, cloneEntry(entry)])
  );
}

export function proposalTargetGovernanceEntry(targetProcess) {
  return cloneProposalTargetEntry(PROPOSAL_TARGET_GOVERNANCE[String(targetProcess || "")] ?? null);
}

export function proposalTargetGovernanceCatalog({
  bootstrapSelectableOnly = false
} = {}) {
  return Object.fromEntries(
    Object.entries(PROPOSAL_TARGET_GOVERNANCE)
      .filter(([, entry]) => !bootstrapSelectableOnly || entry.bootstrapSelectable === true)
      .map(([targetProcess, entry]) => [targetProcess, cloneProposalTargetEntry(entry)])
  );
}

export function proposalTargetGovernanceRows({
  bootstrapSelectableOnly = false
} = {}) {
  return Object.entries(proposalTargetGovernanceCatalog({ bootstrapSelectableOnly }))
    .map(([targetProcess, entry]) => ({
      id: `governanceProposalTarget:${targetProcess}`,
      targetProcess,
      ...entry
    }))
    .sort((left, right) => left.targetProcess.localeCompare(right.targetProcess));
}

export function proposalTargetProcessIds({
  bootstrapSelectableOnly = false
} = {}) {
  return Object.keys(proposalTargetGovernanceCatalog({ bootstrapSelectableOnly }));
}

export function buildGovernanceRouteInventory(routes = []) {
  return routes
    .filter(route => isPotentiallyMutatingMethod(route?.method))
    .map(route => {
      const handlerId = String(route?.handler || "");
      const governance = runtimeGovernanceEntry(handlerId);
      return governance ? {
        id: `governanceRoute:${String(route?.method || "GET").toUpperCase()} ${routeMatcher(route)}`,
        routeId: `route:${String(route?.method || "GET").toUpperCase()} ${routeMatcher(route)}`,
        method: String(route?.method || "GET").toUpperCase(),
        matcher: routeMatcher(route),
        handler: handlerId,
        operationSemantics: governance.operationSemantics,
        governanceMode: governance.governanceMode,
        authorityMechanism: governance.authorityMechanism,
        sharedAuthorityPath: governance.sharedAuthorityPath,
        workflowRole: governance.workflowRole,
        notes: governance.notes,
        ownerClass: route?.ownerClass ?? route?.handlerMetadata?.ownerClass ?? null,
        ownerBundleId: route?.ownerBundleId ?? route?.handlerMetadata?.ownerBundleId ?? null,
        ownerPluginId: route?.ownerPluginId ?? route?.handlerMetadata?.ownerPluginId ?? null
      } : {
        id: `governanceRoute:${String(route?.method || "GET").toUpperCase()} ${routeMatcher(route)}`,
        routeId: `route:${String(route?.method || "GET").toUpperCase()} ${routeMatcher(route)}`,
        method: String(route?.method || "GET").toUpperCase(),
        matcher: routeMatcher(route),
        handler: handlerId,
        operationSemantics: "unknown",
        governanceMode: "missing",
        authorityMechanism: "missing",
        sharedAuthorityPath: false,
        workflowRole: "missing",
        notes: "No governance annotation is registered for this mutating handler.",
        ownerClass: route?.ownerClass ?? route?.handlerMetadata?.ownerClass ?? null,
        ownerBundleId: route?.ownerBundleId ?? route?.handlerMetadata?.ownerBundleId ?? null,
        ownerPluginId: route?.ownerPluginId ?? route?.handlerMetadata?.ownerPluginId ?? null
      };
    })
    .sort((left, right) =>
      left.handler.localeCompare(right.handler)
      || left.method.localeCompare(right.method)
      || left.matcher.localeCompare(right.matcher)
    );
}

export function describeMountedRouteGovernance({
  route = {},
  governanceRoutes = []
} = {}) {
  const method = String(route?.method || "GET").toUpperCase();
  const matcher = String(route?.path || route?.matcher || route?.pattern || "");
  const handler = String(route?.handler || "");
  const governance = Array.isArray(governanceRoutes)
    ? governanceRoutes.find(row =>
      String(row?.method || "GET").toUpperCase() === method
        && String(row?.matcher || "") === matcher
        && String(row?.handler || "") === handler
    )
    : null;
  if (!governance) {
    return {
      governanceRouteId: null,
      operationSemantics: null,
      governanceMode: null,
      authorityMechanism: null,
      sharedAuthorityPath: null,
      workflowRole: null,
      governanceNotes: null
    };
  }
  return {
    governanceRouteId: String(governance.id || ""),
    operationSemantics: String(governance.operationSemantics || ""),
    governanceMode: String(governance.governanceMode || ""),
    authorityMechanism: String(governance.authorityMechanism || ""),
    sharedAuthorityPath: governance.sharedAuthorityPath === true,
    workflowRole: String(governance.workflowRole || ""),
    governanceNotes: String(governance.notes || "")
  };
}
