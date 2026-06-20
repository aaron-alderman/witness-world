import {
  buildBlockedAuthoringHandoff,
  buildRuntimeAuthoringCapabilityMatrix
} from "../../src/runtime-authoring-policy.js";
import {
  materializeCanonicalPackageBundleFromProject,
  packageApplyPreviewRowsFromProject,
  packageCoexistenceFromProject,
  packageConvergenceFromProject
} from "../../src/package-authorship-world.js";
import {
  legacyCapabilityCompatibilityModeFromProject,
  previewLegacyCapabilityMigrationFromProject
} from "../../src/capability-legacy-migration.js";
import { previewLegacyFrontendUpliftFromProject } from "../../src/frontend-legacy-uplift.js";
import { contextNamingStateFromProject } from "../../src/context-naming-world.js";
import { moduleProjectors } from "../../src/modules.js";
import { PLATFORM_PROPOSAL_ACTIONS } from "../platform/platform-proposals.js";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

function jsonSchemaObject(properties, required = []) {
  return {
    type: "object",
    properties,
    additionalProperties: false,
    ...(required.length ? { required } : {})
  };
}

function jsonToolResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent: typeof value === "string" ? { text: value } : value,
    isError: false
  };
}

function errorToolResult(message, details = null) {
  const body = details && typeof details === "object" ? { error: message, ...details } : { error: message };
  return {
    content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
    structuredContent: body,
    isError: true
  };
}

async function runJsonHandler(callHandler, request) {
  const response = await callHandler(request);
  if (response.status >= 400) {
    const message = typeof response.body?.error === "string"
      ? response.body.error
      : `request failed with status ${response.status}`;
    return errorToolResult(message, response.body && typeof response.body === "object" ? response.body : null);
  }
  return jsonToolResult(response.body ?? {});
}

async function readRuntimeDiagnostics(callHandler) {
  return callHandler({
    handler: "runtime.diagnostics.read",
    method: "GET",
    path: "/api/runtime/diagnostics"
  });
}

async function readAuthoringMatrix(callHandler) {
  const diagnostics = await readRuntimeDiagnostics(callHandler);
  if (diagnostics.status < 400 && diagnostics.body?.authoringMatrix) {
    return jsonToolResult(diagnostics.body.authoringMatrix);
  }
  const bootstrapModel = await callHandler({
    handler: "bootstrap.model.read",
    method: "GET",
    path: "/api/bootstrap-model"
  });
  if (bootstrapModel.status >= 400) {
    const message = typeof bootstrapModel.body?.error === "string"
      ? bootstrapModel.body.error
      : `request failed with status ${bootstrapModel.status}`;
    return errorToolResult(message, bootstrapModel.body && typeof bootstrapModel.body === "object" ? bootstrapModel.body : null);
  }
  return jsonToolResult(buildRuntimeAuthoringCapabilityMatrix(bootstrapModel.body?.authoringPolicy ?? null));
}

async function blockedCanonicalAuthoringAction(callHandler, {
  action,
  missingPrimitive,
  minimumHumanAction,
  proof = []
}) {
  const diagnostics = await readRuntimeDiagnostics(callHandler);
  const authoringMatrix = diagnostics.status < 400 ? (diagnostics.body?.authoringMatrix ?? null) : null;
  return errorToolResult("canonical authoring primitive is not implemented yet", {
    action,
    blockedHandoff: buildBlockedAuthoringHandoff({
      limitationType: "platform",
      goal: `author ${action} through the constrained MCP frontend surface`,
      attemptedAuthoringPath: `authoring.write(${action})`,
      missingPrimitive,
      minimumHumanAction,
      proof
    }),
    ...(authoringMatrix ? { authoringMatrix } : {})
  });
}

function blockedFileMutationToolResult({ attemptedAuthoringPath, goal }) {
  return errorToolResult("blocked by MCP compute-module package authoring policy", {
    blockedHandoff: buildBlockedAuthoringHandoff({
      limitationType: "policy",
      goal,
      attemptedAuthoringPath,
      minimumHumanAction: "use MCP compute module package authoring",
      proof: [
        "direct app-source and file mutation pathways are disabled for this AssemblyScript module tranche",
        "AssemblyScript source and smoke fixtures must be persisted as package materialized files"
      ]
    })
  });
}

function rawResult(response) {
  if (response.status >= 400) {
    const message = typeof response.body?.error === "string"
      ? response.body.error
      : `request failed with status ${response.status}`;
    return errorToolResult(message, response.body && typeof response.body === "object" ? response.body : null);
  }
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          contentType: response.contentType || "application/octet-stream",
          base64: response.buffer.toString("base64")
        }, null, 2)
      }
    ],
    structuredContent: {
      contentType: response.contentType || "application/octet-stream",
      base64: response.buffer.toString("base64")
    },
    isError: false
  };
}

function scopeResult({ contexts = [], targets = [] } = {}) {
  return {
    contextIds: [...new Set((Array.isArray(contexts) ? contexts : []).map(String).filter(Boolean))],
    targetIds: [...new Set((Array.isArray(targets) ? targets : []).map(String).filter(Boolean))]
  };
}

const TOOL_DEFINITIONS = [
  {
    name: "world.read",
    title: "World Read",
    description: "Read bootstrap state, witnesses, source, world graph, process projections, contextual naming state, authored package coexistence, or authoring capability state.",
    inputSchema: jsonSchemaObject({
      view: { type: "string", enum: ["bootstrapModel", "bootstrapState", "witnesses", "worldGraph", "processView", "processRun", "source", "computeModules", "computeModuleSources", "computeModuleSmokeTests", "contextNaming", "packageCoexistence", "packageConvergence", "packageApplyPreview", "capabilityLegacyMigration", "frontendLegacyUplift", "capabilityRevisionHistory", "authoringMatrix"] },
      id: { type: "string" },
      context: { type: "string" },
      name: { type: "string" },
      target: { type: "string" },
      offset: { type: "number" },
      runId: { type: "string" },
      replay: { type: "string" },
      program: { type: "string" },
      event: { type: "string" },
      node: { type: "string" },
      sourceFile: { type: "string" },
      includeDeleted: { type: "boolean" }
    }, ["view"]),
    scope(args) {
      const packageViews = new Set([
        "packageCoexistence",
        "packageConvergence",
        "packageApplyPreview",
        "capabilityLegacyMigration",
        "frontendLegacyUplift",
        "capabilityRevisionHistory"
      ]);
      const targets = args?.view === "processRun" && args?.runId
        ? [args.runId]
        : args?.view === "contextNaming"
          ? [args?.id, args?.target].filter(Boolean)
          : (args?.view === "computeModules" || args?.view === "computeModuleSources" || args?.view === "computeModuleSmokeTests") && args?.id
            ? [args.id]
            : packageViews.has(args?.view) && args?.id
              ? [args.id]
              : [];
      return scopeResult({
        contexts: args?.view === "contextNaming" && args?.context ? [args.context] : [],
        targets
      });
    },
    async run({ args, callHandler, appContext }) {
      switch (args.view) {
        case "bootstrapModel":
          return runJsonHandler(callHandler, { handler: "bootstrap.model.read", method: "GET", path: "/api/bootstrap-model" });
        case "bootstrapState":
          return runJsonHandler(callHandler, { handler: "bootstrap.state.read", method: "GET", path: "/api/bootstrap-state" });
        case "witnesses":
          return runJsonHandler(callHandler, {
            handler: "witnesses.list",
            method: "GET",
            path: "/api/witnesses",
            query: args.offset != null ? { offset: String(args.offset) } : {}
          });
        case "worldGraph":
          return runJsonHandler(callHandler, { handler: "worldGraph.read", method: "GET", path: "/api/world-graph" });
        case "processView":
          return runJsonHandler(callHandler, {
            handler: "processView.read",
            method: "GET",
            path: "/api/process-view",
            query: {
              ...(args.program ? { program: args.program } : {}),
              ...(args.event ? { event: args.event } : {}),
              ...(args.node ? { node: args.node } : {})
            }
          });
        case "processRun":
          return runJsonHandler(callHandler, {
            handler: "processRun.read",
            method: "GET",
            path: `/api/process-runs/${encodeURIComponent(args.runId || "")}`,
            params: { runId: args.runId || "" },
            query: args.replay ? { replay: args.replay } : {}
          });
        case "source":
          return runJsonHandler(callHandler, {
            handler: "source.read",
            method: "GET",
            path: "/api/source",
            query: { file: args.sourceFile || "" }
          });
        case "computeModules":
          if (typeof appContext?.project !== "function") {
            return errorToolResult("computeModules read requires projected world access");
          }
          try {
            const rows = appContext.project(moduleProjectors.computeModules) ?? [];
            return jsonToolResult({
              computeModules: args.id
                ? rows.filter(row => row.id === args.id || row.hostOperation === args.id)
                : rows
            });
          } catch (error) {
            return errorToolResult(error instanceof Error ? error.message : String(error), {
              view: args.view,
              id: args.id ?? null
            });
          }
        case "computeModuleSources":
          if (typeof appContext?.project !== "function") {
            return errorToolResult("computeModuleSources read requires projected world access");
          }
          try {
            const rows = appContext.project(args.includeDeleted
              ? moduleProjectors.packageMaterializedFileHistory
              : moduleProjectors.packageMaterializedFiles) ?? [];
            const modules = appContext.project(moduleProjectors.computeModules) ?? [];
            const sourcePathSet = new Set(modules.map(row => row.source).filter(Boolean));
            const sourceRows = rows.filter(row => sourcePathSet.has(row.path));
            return jsonToolResult({
              computeModuleSources: args.id
                ? sourceRows.filter(row =>
                  row.id === args.id
                  || row.path === args.id
                  || row.revision === args.id
                  || row.package === args.id
                )
                : sourceRows
            });
          } catch (error) {
            return errorToolResult(error instanceof Error ? error.message : String(error), {
              view: args.view,
              id: args.id ?? null
            });
          }
        case "computeModuleSmokeTests":
          if (typeof appContext?.project !== "function") {
            return errorToolResult("computeModuleSmokeTests read requires projected world access");
          }
          try {
            const rows = appContext.project(args.includeDeleted
              ? moduleProjectors.computeModuleSmokeTestHistory
              : moduleProjectors.computeModuleSmokeTests) ?? [];
            return jsonToolResult({
              computeModuleSmokeTests: args.id
                ? rows.filter(row =>
                  row.id === args.id
                  || row.module === args.id
                  || row.hostOperation === args.id
                  || row.revision === args.id
                  || row.package === args.id
                )
                : rows
            });
          } catch (error) {
            return errorToolResult(error instanceof Error ? error.message : String(error), {
              view: args.view,
              id: args.id ?? null
            });
          }
        case "contextNaming":
          if (typeof appContext?.project !== "function") {
            return errorToolResult("contextNaming read requires projected world access");
          }
          try {
            return jsonToolResult({
              contextNaming: contextNamingStateFromProject(appContext.project, {
                id: args.id ?? null,
                context: args.context ?? null,
                name: args.name ?? null,
                target: args.target ?? null
              })
            });
          } catch (error) {
            return errorToolResult(error instanceof Error ? error.message : String(error), {
              view: args.view,
              id: args.id ?? null,
              context: args.context ?? null,
              name: args.name ?? null,
              target: args.target ?? null
            });
          }
        case "packageCoexistence":
          if (typeof appContext?.project !== "function") {
            return errorToolResult("packageCoexistence read requires projected world access");
          }
          try {
            return jsonToolResult({
              packageCoexistence: packageCoexistenceFromProject(appContext.project, {
                id: args.id ?? null
              })
            });
          } catch (error) {
            return errorToolResult(error instanceof Error ? error.message : String(error), {
              view: args.view,
              id: args.id ?? null
            });
          }
        case "packageConvergence":
          if (typeof appContext?.project !== "function") {
            return errorToolResult("packageConvergence read requires projected world access");
          }
          try {
            return jsonToolResult({
              packageConvergence: packageConvergenceFromProject(appContext.project, {
                id: args.id ?? null
              })
            });
          } catch (error) {
            return errorToolResult(error instanceof Error ? error.message : String(error), {
              view: args.view,
              id: args.id ?? null
            });
          }
        case "packageApplyPreview":
          if (typeof appContext?.project !== "function") {
            return errorToolResult("packageApplyPreview read requires projected world access");
          }
          try {
            return jsonToolResult({
              packageApplyPreview: packageApplyPreviewRowsFromProject(appContext.project, {
                id: args.id ?? null
              })
            });
          } catch (error) {
            return errorToolResult(error instanceof Error ? error.message : String(error), {
              view: args.view,
              id: args.id ?? null
            });
          }
        case "capabilityLegacyMigration":
          if (typeof appContext?.project !== "function") {
            return errorToolResult("capabilityLegacyMigration read requires projected world access");
          }
          try {
            return jsonToolResult({
              legacyCapabilityCompatibilityMode: legacyCapabilityCompatibilityModeFromProject(appContext.project),
              legacyCapabilityMigration: previewLegacyCapabilityMigrationFromProject(appContext.project)
            });
          } catch (error) {
            return errorToolResult(error instanceof Error ? error.message : String(error), {
              view: args.view,
              id: args.id ?? null
            });
          }
        case "frontendLegacyUplift":
          if (typeof appContext?.project !== "function") {
            return errorToolResult("frontendLegacyUplift read requires projected world access");
          }
          try {
            return jsonToolResult({
              legacyFrontendUplift: previewLegacyFrontendUpliftFromProject(appContext.project)
            });
          } catch (error) {
            return errorToolResult(error instanceof Error ? error.message : String(error), {
              view: args.view,
              id: args.id ?? null
            });
          }
        case "capabilityRevisionHistory":
          if (typeof appContext?.project !== "function") {
            return errorToolResult("capabilityRevisionHistory read requires projected world access");
          }
          try {
            const rows = appContext.project(moduleProjectors.capabilityRevisionHistory) ?? [];
            return jsonToolResult({
              capabilityRevisionHistory: args.id
                ? rows.filter(row => row.capabilityId === args.id || row.witnessId === args.id)
                : rows
            });
          } catch (error) {
            return errorToolResult(error instanceof Error ? error.message : String(error), {
              view: args.view,
              id: args.id ?? null
            });
          }
        case "authoringMatrix":
          return readAuthoringMatrix(callHandler);
        default:
          return errorToolResult("unknown world.read view", { view: args.view });
      }
    }
  },
  {
    name: "package.bundle",
    title: "Package Bundle",
    description: "Preview the canonical emitted bundle or authored apply impact for a package revision from current world state.",
    inputSchema: jsonSchemaObject({
      operation: { type: "string", enum: ["preview", "previewApply"] },
      revisionId: { type: "string" }
    }, ["operation", "revisionId"]),
    scope(args) {
      return scopeResult({ targets: args?.revisionId ? [args.revisionId] : [] });
    },
    async run({ args, appContext }) {
      if (args.operation !== "preview" && args.operation !== "previewApply") {
        return errorToolResult("unknown package.bundle operation", { operation: args.operation });
      }
      if (typeof appContext?.project !== "function") {
        return errorToolResult(`package.bundle ${args.operation} requires projected world access`);
      }
          try {
            return jsonToolResult(
              args.operation === "previewApply"
                ? packageApplyPreviewRowsFromProject(appContext.project, {
                  id: args.revisionId
                })[0]
                : materializeCanonicalPackageBundleFromProject(appContext.project, {
                  revisionId: args.revisionId
                })
            );
      } catch (error) {
        return errorToolResult(error instanceof Error ? error.message : String(error), {
          operation: args.operation,
          revisionId: args.revisionId ?? null
        });
      }
    }
  },
  {
    name: "authoring.write",
    title: "Authoring Write",
    description: "Create or update witnessed authored objects through the shared bootstrap mutation surface.",
    inputSchema: jsonSchemaObject({
      action: {
        type: "string",
        enum: [
          "identity.create",
          "identity.update",
          "context.create",
          "contextBinding.create",
          "contextBinding.remove",
          "contextExport.create",
          "contextExport.remove",
          "contextImport.create",
          "contextImport.remove",
          "perspective.create",
          "stewardship.create",
          "stewardship.remove",
          "surface.create",
          "collection.create",
          "process.create",
          "type.create",
          "projection.create",
          "message.create",
          "boundary.create",
          "policy.create",
          "computeModule.create",
          "computeModule.source.upsert",
          "computeModule.source.markDeleted",
          "computeModuleSmokeTest.upsert",
          "computeModuleSmokeTest.markDeleted",
          "computeModuleSmokeTest.run",
          "package.create",
          "packageRevision.create",
          "packageRevision.publish",
          "packagePatch.create",
          "packageNamespace.create",
          "packageDependency.create",
          "packageTransformer.create",
          "route.create",
          "serve.create",
          "serverRunner.create",
          "frontend.upliftLegacy",
          "capability.create",
          "capability.update",
          "capability.install",
          "capability.remove",
          "capability.rollback",
          "capability.migrateLegacy",
          "mcpServer.create",
          "mcpTool.install",
          "mcpTool.remove"
        ]
      },
      body: {
        anyOf: [
          { type: "object" },
          { type: "array" }
        ]
      }
    }, ["action", "body"]),
    scope(args) {
      const body = args?.body;
      const docs = Array.isArray(body)
        ? body.filter(entry => entry && typeof entry === "object")
        : (body && typeof body === "object" ? [body] : []);
      return scopeResult({
        contexts: docs.flatMap(doc => [doc.context, doc.parent, doc.homeContext]).filter(Boolean),
        targets: docs.flatMap(doc => [
          doc.target,
          doc.server,
          doc.serverRunner,
          doc.id,
          doc.module,
          doc.path,
          doc.subject,
          doc.stateField,
          doc.hostOperation,
          doc.package,
          doc.revision,
          doc.sourcePackage,
          doc.sourceRevision
          ,
          doc.targetRevision,
          doc.sourceNamespace,
          doc.targetNamespace
        ]).filter(Boolean)
      });
    },
    async run({ args, callHandler }) {
      const body = args.body && typeof args.body === "object" ? args.body : {};
      switch (args.action) {
        case "identity.create":
          return runJsonHandler(callHandler, { handler: "identity.create", method: "POST", path: "/api/identities", body });
        case "identity.update":
          return runJsonHandler(callHandler, {
            handler: "identity.update",
            method: "PATCH",
            path: `/api/identities/${encodeURIComponent(body.id || "")}`,
            params: { id: body.id || "" },
            body
          });
        case "context.create":
          return runJsonHandler(callHandler, { handler: "context.create", method: "POST", path: "/api/contexts", body });
        case "contextBinding.create":
          return runJsonHandler(callHandler, { handler: "contextBinding.create", method: "POST", path: "/api/context-bindings", body });
        case "contextBinding.remove":
          return runJsonHandler(callHandler, { handler: "contextBinding.remove", method: "DELETE", path: "/api/context-bindings", body });
        case "contextExport.create":
          return runJsonHandler(callHandler, { handler: "contextExport.create", method: "POST", path: "/api/context-exports", body });
        case "contextExport.remove":
          return runJsonHandler(callHandler, { handler: "contextExport.remove", method: "DELETE", path: "/api/context-exports", body });
        case "contextImport.create":
          return runJsonHandler(callHandler, { handler: "contextImport.create", method: "POST", path: "/api/context-imports", body });
        case "contextImport.remove":
          return runJsonHandler(callHandler, { handler: "contextImport.remove", method: "DELETE", path: "/api/context-imports", body });
        case "perspective.create":
          return runJsonHandler(callHandler, { handler: "perspective.create", method: "POST", path: "/api/perspectives", body });
        case "stewardship.create":
          return runJsonHandler(callHandler, { handler: "stewardship.create", method: "POST", path: "/api/stewardships", body });
        case "stewardship.remove":
          return runJsonHandler(callHandler, { handler: "stewardship.remove", method: "DELETE", path: "/api/stewardships", body });
        case "surface.create":
          return runJsonHandler(callHandler, { handler: "surface.create", method: "POST", path: "/api/surfaces", body });
        case "collection.create":
          return runJsonHandler(callHandler, { handler: "collection.create", method: "POST", path: "/api/collections", body });
        case "process.create":
          return runJsonHandler(callHandler, { handler: "process.create", method: "POST", path: "/api/processes", body });
        case "type.create":
          return runJsonHandler(callHandler, { handler: "type.create", method: "POST", path: "/api/types", body });
        case "projection.create":
          return runJsonHandler(callHandler, { handler: "projection.create", method: "POST", path: "/api/projections", body });
        case "message.create":
          return runJsonHandler(callHandler, { handler: "message.create", method: "POST", path: "/api/messages", body });
        case "boundary.create":
          return runJsonHandler(callHandler, { handler: "boundary.create", method: "POST", path: "/api/boundaries", body });
        case "policy.create":
          return runJsonHandler(callHandler, { handler: "policy.create", method: "POST", path: "/api/policies", body });
        case "computeModule.create":
          return runJsonHandler(callHandler, { handler: "computeModule.create", method: "POST", path: "/api/compute-modules", body });
        case "computeModule.source.upsert":
          return runJsonHandler(callHandler, { handler: "computeModule.source.upsert", method: "POST", path: "/api/compute-module-sources", body });
        case "computeModule.source.markDeleted":
          return runJsonHandler(callHandler, { handler: "computeModule.source.markDeleted", method: "DELETE", path: "/api/compute-module-sources", body });
        case "computeModuleSmokeTest.upsert":
          return runJsonHandler(callHandler, { handler: "computeModuleSmokeTest.upsert", method: "POST", path: "/api/compute-module-smoke-tests", body });
        case "computeModuleSmokeTest.markDeleted":
          return runJsonHandler(callHandler, { handler: "computeModuleSmokeTest.markDeleted", method: "DELETE", path: "/api/compute-module-smoke-tests", body });
        case "computeModuleSmokeTest.run":
          return runJsonHandler(callHandler, { handler: "computeModuleSmokeTest.run", method: "POST", path: "/api/compute-module-smoke-tests/run", body });
        case "package.create":
          return runJsonHandler(callHandler, { handler: "package.create", method: "POST", path: "/api/packages", body });
        case "packageRevision.create":
          return runJsonHandler(callHandler, { handler: "packageRevision.create", method: "POST", path: "/api/package-revisions", body });
        case "packageRevision.publish":
          return runJsonHandler(callHandler, {
            handler: "packageRevision.publish",
            method: "POST",
            path: `/api/package-revisions/${encodeURIComponent(body.id || "")}/publish`,
            params: { id: body.id || "" },
            body
          });
        case "packagePatch.create":
          return runJsonHandler(callHandler, { handler: "packagePatch.create", method: "POST", path: "/api/package-patches", body });
        case "packageNamespace.create":
          return runJsonHandler(callHandler, { handler: "packageNamespace.create", method: "POST", path: "/api/package-namespaces", body });
        case "packageDependency.create":
          return runJsonHandler(callHandler, { handler: "packageDependency.create", method: "POST", path: "/api/package-dependencies", body });
        case "packageTransformer.create":
          return runJsonHandler(callHandler, { handler: "packageTransformer.create", method: "POST", path: "/api/package-transformers", body });
        case "route.create":
          return runJsonHandler(callHandler, { handler: "route.create", method: "POST", path: "/api/routes", body });
        case "serve.create":
          return runJsonHandler(callHandler, { handler: "serve.create", method: "POST", path: "/api/serve-mounts", body });
        case "serverRunner.create":
          return runJsonHandler(callHandler, { handler: "serverRunner.create", method: "POST", path: "/api/server-runners", body });
        case "frontend.upliftLegacy":
          return runJsonHandler(callHandler, { handler: "frontend.upliftLegacy", method: "POST", path: "/api/frontend-uplifts/legacy", body });
        case "capability.create":
          return runJsonHandler(callHandler, { handler: "capability.create", method: "POST", path: "/api/capabilities", body });
        case "capability.update":
          return runJsonHandler(callHandler, {
            handler: "capability.update",
            method: "PATCH",
            path: `/api/capabilities/${encodeURIComponent(body.id || "")}`,
            params: { id: body.id || "" },
            body
          });
        case "capability.install":
          return runJsonHandler(callHandler, { handler: "capability.install", method: "POST", path: "/api/capability-installs", body });
        case "capability.remove":
          return runJsonHandler(callHandler, { handler: "capability.remove", method: "DELETE", path: "/api/capability-installs", body });
        case "capability.rollback":
          return runJsonHandler(callHandler, {
            handler: "capability.rollback",
            method: "POST",
            path: `/api/capabilities/${encodeURIComponent(body.id || "")}/rollback`,
            params: { id: body.id || "" },
            body
          });
        case "capability.migrateLegacy":
          return runJsonHandler(callHandler, { handler: "capability.migrateLegacy", method: "POST", path: "/api/capability-migrations/legacy", body });
        case "mcpServer.create":
          return runJsonHandler(callHandler, { handler: "mcpServer.create", method: "POST", path: "/api/mcp-servers", body });
        case "mcpTool.install":
          return runJsonHandler(callHandler, { handler: "mcpTool.install", method: "POST", path: "/api/mcp-tool-installs", body });
        case "mcpTool.remove":
          return runJsonHandler(callHandler, { handler: "mcpTool.remove", method: "DELETE", path: "/api/mcp-tool-installs", body });
        default:
          return errorToolResult("unknown authoring action", { action: args.action });
      }
    }
  },
  {
    name: "proposal.create",
    title: "Proposal Create",
    description: "Create a guarded proposal for a shared mutation.",
    inputSchema: jsonSchemaObject({
      id: { type: "string" },
      targetProcess: { type: "string" },
      targetKind: { type: "string" },
      targetId: { type: "string" },
      body: { type: "object" },
      reason: { type: "string" }
    }, ["id", "targetProcess", "targetKind", "body"]),
    scope(args) {
      return scopeResult({ targets: args?.targetId ? [args.targetId] : [] });
    },
    async run({ args, callHandler }) {
      return runJsonHandler(callHandler, {
        handler: "proposal.create",
        method: "POST",
        path: "/api/proposals",
        body: {
          id: args.id,
          targetProcess: args.targetProcess,
          targetKind: args.targetKind,
          targetId: args.targetId ?? null,
          bodyJson: JSON.stringify(args.body ?? {}),
          reason: args.reason ?? null
        }
      });
    }
  },
  {
    name: "proposal.review",
    title: "Proposal Review",
    description: "Approve or reject an existing proposal.",
    inputSchema: jsonSchemaObject({
      action: { type: "string", enum: ["approve", "reject"] },
      id: { type: "string" },
      reason: { type: "string" }
    }, ["action", "id"]),
    scope(args) {
      return scopeResult({ targets: args?.id ? [args.id] : [] });
    },
    async run({ args, callHandler }) {
      if (args.action === "approve") {
        return runJsonHandler(callHandler, {
          handler: "proposal.approve",
          method: "POST",
          path: `/api/proposals/${encodeURIComponent(args.id)}/approve`,
          params: { id: args.id }
        });
      }
      if (args.action === "reject") {
        return runJsonHandler(callHandler, {
          handler: "proposal.reject",
          method: "POST",
          path: `/api/proposals/${encodeURIComponent(args.id)}/reject`,
          params: { id: args.id },
          body: args.reason ? { reason: args.reason } : {}
        });
      }
      return errorToolResult("unknown proposal review action", { action: args.action });
    }
  },
  {
    name: "platform.read",
    title: "Platform Read",
    description: "Read the platform self-model (including first-class docs with knowledge relations, folders from this.folder.wtoml, and durable artifacts), gaps, docs, folders, roadmap, telemetry, defects, security, artifacts, sessions, profiles, compatibility bridges, mutable-surface semantics, governance, branches, change sets, package coexistence, test gates, red/green test state, test runs, candidate snapshots, runtime revisions, plugin, bundle, capability, MCP, or verification gate views.",
    inputSchema: jsonSchemaObject({
      view: { type: "string", enum: ["model", "gaps", "docs", "folders", "roadmap", "telemetry", "defects", "security", "artifacts", "sessions", "pushes", "ships", "profiles", "plugin", "bundle", "capability", "mcp", "bridges", "semantics", "governance", "gates", "proposals", "branches", "changeSets", "contextNaming", "packageCoexistence", "packageConvergence", "packageApplyPreview", "capabilityRevisionHistory", "testGates", "testRedGreen", "testRuns", "candidateSnapshots", "runtimeRevisions"] },
      id: { type: "string" },
      context: { type: "string" },
      name: { type: "string" },
      target: { type: "string" }
    }, ["view"]),
    scope(args) {
      return scopeResult({
        contexts: args?.context ? [args.context] : [],
        targets: [args?.id, args?.target].filter(Boolean)
      });
    },
    async run({ args, callHandler }) {
      const query = {
        view: args.view || "model",
        ...(args.id ? { id: args.id } : {}),
        ...(args.context ? { context: args.context } : {}),
        ...(args.name ? { name: args.name } : {}),
        ...(args.target ? { target: args.target } : {})
      };
      if (args.view === "gaps") {
        return runJsonHandler(callHandler, { handler: "platform.gaps.read", method: "GET", path: "/api/platform-gaps" });
      }
      return runJsonHandler(callHandler, {
        handler: "platform.model.read",
        method: "GET",
        path: "/api/platform-model",
        query
      });
    }
  },
  {
    name: "platform.docs",
    title: "Platform Docs",
    description: "First-class access to governed platform docs (including intent docs and modeled knowledge relations). Supports list, read (structured + full when available), search, readFull (rich content), and getRelations (doc↔doc + doc↔code from knowledge model).",
    inputSchema: jsonSchemaObject({
      operation: { type: "string", enum: ["list", "read", "search", "readFull", "getRelations"] },
      id: { type: "string" },
      query: { type: "string", description: "Search query for operation=search" },
      includeRelations: { type: "boolean", description: "Include authored doc/code relations when true" }
    }),
    scope(args) {
      return scopeResult({ targets: args?.id ? [args.id] : [] });
    },
    async run({ args, callHandler }) {
      const operation = args.operation || "list";
      const validOps = ["list", "read", "search", "readFull", "getRelations"];
      if (!validOps.includes(operation)) {
        return errorToolResult("unknown platform docs operation", { operation });
      }
      const docId = (operation === "read" || operation === "readFull" || operation === "getRelations") ? (args.id || "") : (args.id || "");
      if ((operation === "read" || operation === "readFull" || operation === "getRelations") && !docId) {
        return errorToolResult("doc id is required for read/readFull/getRelations", { operation });
      }
      const query = {
        view: "docs",
        ...(docId ? { id: docId } : {}),
        ...(args.query ? { q: args.query } : {}),
        ...(args.includeRelations ? { includeRelations: "true" } : {})
      };
      // For search and getRelations we still route to the docs view but the backend/model
      // (enriched with knowledge-relations.wtoml) will provide the data. getRelations can be
      // implemented as a client-side extraction or future dedicated backend view.
      return runJsonHandler(callHandler, {
        handler: "platform.model.read",
        method: "GET",
        path: "/api/platform-model",
        query
      });
    }
  },
  {
    name: "platform.folder",
    title: "Platform Folder",
    description: "First-class access to folder metadata from this.folder.wtoml (contains, links to docs/intents/code). Supports list and read.",
    inputSchema: jsonSchemaObject({
      operation: { type: "string", enum: ["list", "read", "pack"] },
      id: { type: "string" },
      maxRelations: { type: "number" }
    }),
    scope(args) {
      return scopeResult({ targets: args?.id ? [args.id] : [] });
    },
    async run({ args, callHandler }) {
      const operation = args.operation || "list";
      if (!["list", "read", "pack"].includes(operation)) {
        return errorToolResult("unknown platform folder operation", { operation });
      }
      const fid = (operation === "read" || operation === "pack") ? (args.id || "") : "";
      if ((operation === "read" || operation === "pack") && !fid) return errorToolResult("folder id is required", { operation });
      const query = {
        view: operation === "pack" ? "model" : "folders",  // pack uses full model for rich relations
        ...(fid ? { id: fid } : {}),
        ...(args.maxRelations ? { maxRelations: args.maxRelations } : {})
      };
      const resp = await runJsonHandler(callHandler, {
        handler: "platform.model.read",
        method: "GET",
        path: "/api/platform-model",
        query
      });
      if (operation === "pack" && !resp.isError) {
        // Build a simple rich pack from the model data (folders + related via knowledgeRelations etc.)
        const data = typeof resp.structuredContent === 'object' ? resp.structuredContent : {};
        const pack = {
          packFor: fid,
          folder: (data.folders || []).find(f => f.id === fid) || fid,
          contains: (data.edges || []).filter(e => e.from === fid && e.rel === 'contains').map(e => e.to),
          linkedDocs: (data.knowledgeRelations || []).filter(r => (r.from === fid || r.to === fid) && String(r.to || r.from).startsWith('doc:')).map(r => r.to || r.from),
          linkedIntents: (data.knowledgeRelations || []).filter(r => (r.from === fid || r.to === fid) && String(r.to || r.from).startsWith('intent:')).map(r => r.to || r.from),
          summary: `Rich folder pack for ${fid} with contains, linked docs and intents from the model.`
        };
        return jsonToolResult(pack);
      }
      return resp;
    }
  },
  // First-class dedicated documentation tools (richer than thin proxies; consume
  // the modeled knowledge relations, intent docs, and governed docs).
  {
    name: "docs.list",
    title: "Docs List",
    description: "List all governed platform docs (including intent knowledge docs) with their modeled relations and links.",
    inputSchema: jsonSchemaObject({
      includeRelations: { type: "boolean" }
    }),
    scope() { return scopeResult({}); },
    async run({ args, callHandler }) {
      return runJsonHandler(callHandler, {
        handler: "platform.model.read",
        method: "GET",
        path: "/api/platform-model",
        query: {
          view: "docs",
          ...(args?.includeRelations ? { includeRelations: "true" } : {})
        }
      });
    }
  },
  {
    name: "docs.read",
    title: "Docs Read",
    description: "Read a specific document (governed or intent) with full structured content, sections, tasks, and explicit doc↔doc / doc↔code relations from the knowledge model.",
    inputSchema: jsonSchemaObject({
      id: { type: "string" },
      includeRelations: { type: "boolean" }
    }, ["id"]),
    scope(args) {
      return scopeResult({ targets: args?.id ? [args.id] : [] });
    },
    async run({ args, callHandler }) {
      if (!args.id) return errorToolResult("id is required");
      return runJsonHandler(callHandler, {
        handler: "platform.model.read",
        method: "GET",
        path: "/api/platform-model",
        query: {
          view: "docs",
          id: args.id,
          ...(args.includeRelations ? { includeRelations: "true" } : {})
        }
      });
    }
  },
  {
    name: "docs.search",
    title: "Docs Search",
    description: "Search across governed docs, intent docs, and knowledge graph. Returns matching docs with relevance and linked code/docs from the authored relations.",
    inputSchema: jsonSchemaObject({
      query: { type: "string" },
      facet: { type: "string" }
    }, ["query"]),
    scope() { return scopeResult({}); },
    async run({ args, callHandler }) {
      return runJsonHandler(callHandler, {
        handler: "platform.model.read",
        method: "GET",
        path: "/api/platform-model",
        query: {
          view: "docs",
          q: args.query,
          ...(args.facet ? { facet: args.facet } : {})
        }
      });
    }
  },
  {
    name: "docs.pack",
    title: "Docs Context Pack",
    description: "First-class MCP context pack for a document: the full doc projection (with sections/tasks), plus explicit authored doc↔doc and doc↔code relations from the knowledge model (knowledge-relations.wtoml), linked intents, and recommended nearby items. Ideal for LLM co-development.",
    inputSchema: jsonSchemaObject({
      id: { type: "string" },
      maxRelations: { type: "number", description: "Limit on relations to include (default 20)" }
    }, ["id"]),
    scope(args) {
      return scopeResult({ targets: args?.id ? [args.id] : [] });
    },
    async run({ args, callHandler }) {
      if (!args.id) return errorToolResult("id is required for docs.pack");
      const maxR = Number(args.maxRelations || 20);
      // Get the rich doc view (which now includes knowledgeRelations slice thanks to model)
      const docResp = await runJsonHandler(callHandler, {
        handler: "platform.model.read",
        method: "GET",
        path: "/api/platform-model",
        query: { view: "docs", id: args.id, includeRelations: "true" }
      });
      if (docResp.isError) return docResp;
      let pack = typeof docResp.structuredContent === 'object' ? { ...docResp.structuredContent } : { doc: docResp.structuredContent };
      // Enrich with top-level knowledgeRelations if available (call model without view to get full if needed, but reuse)
      // For now, the docs view projection includes a filtered knowledgeRelations when present.
      if (pack.knowledgeRelations && Array.isArray(pack.knowledgeRelations)) {
        pack.knowledgeRelations = pack.knowledgeRelations.slice(0, maxR);
      }
      pack.packId = `docPack:${args.id}`;
      pack.summary = `Context pack for ${args.id} with ${pack.knowledgeRelations?.length || 0} modeled relations (doc/code links from authored WTOML).`;
      return jsonToolResult(pack);
    }
  },
  {
    name: "platform.roadmap",
    title: "Platform Roadmap",
    description: "Inspect the ingested platform roadmap doc, sections, and checkbox task nodes through the shared platform handlers.",
    inputSchema: jsonSchemaObject({
      operation: { type: "string", enum: ["list", "read"] },
      id: { type: "string" }
    }),
    scope(args) {
      return scopeResult({ targets: args?.id ? [args.id] : [] });
    },
    async run({ args, callHandler }) {
      const operation = args.operation || "list";
      if (operation !== "list" && operation !== "read") {
        return errorToolResult("unknown platform roadmap operation", { operation });
      }
      const roadmapId = operation === "read" ? (args.id || "") : (args.id || "");
      if (operation === "read" && !roadmapId) return errorToolResult("roadmap id is required", { operation });
      return runJsonHandler(callHandler, {
        handler: "platform.model.read",
        method: "GET",
        path: "/api/platform-model",
        query: {
          view: "roadmap",
          ...(roadmapId ? { id: roadmapId } : {})
        }
      });
    }
  },
  {
    name: "platform.telemetry",
    title: "Platform Telemetry",
    description: "Inspect the current telemetry platform model, including metrics, live samples, windows, regressions, and linked gate context through the shared platform handlers.",
    inputSchema: jsonSchemaObject({
      operation: { type: "string", enum: ["list", "read"] },
      id: { type: "string" }
    }),
    scope(args) {
      return scopeResult({ targets: args?.id ? [args.id] : [] });
    },
    async run({ args, callHandler }) {
      const operation = args.operation || "list";
      if (operation !== "list" && operation !== "read") {
        return errorToolResult("unknown platform telemetry operation", { operation });
      }
      const telemetryId = operation === "read" ? (args.id || "") : (args.id || "");
      if (operation === "read" && !telemetryId) return errorToolResult("telemetry id is required", { operation });
      return runJsonHandler(callHandler, {
        handler: "platform.model.read",
        method: "GET",
        path: "/api/platform-model",
        query: {
          view: "telemetry",
          ...(telemetryId ? { id: telemetryId } : {})
        }
      });
    }
  },
  {
    name: "platform.defect",
    title: "Platform Defect",
    description: "Inspect defect rows, observations, clusters, and linked proposals through the shared platform handlers.",
    inputSchema: jsonSchemaObject({
      operation: { type: "string", enum: ["list", "read"] },
      id: { type: "string" }
    }),
    scope(args) {
      return scopeResult({ targets: args?.id ? [args.id] : [] });
    },
    async run({ args, callHandler }) {
      const operation = args.operation || "list";
      if (operation !== "list" && operation !== "read") {
        return errorToolResult("unknown platform defect operation", { operation });
      }
      const defectId = operation === "read" ? (args.id || "") : (args.id || "");
      if (operation === "read" && !defectId) return errorToolResult("defect id is required", { operation });
      return runJsonHandler(callHandler, {
        handler: "platform.model.read",
        method: "GET",
        path: "/api/platform-model",
        query: {
          view: "defects",
          ...(defectId ? { id: defectId } : {})
        }
      });
    }
  },
  {
    name: "platform.branch",
    title: "Platform Branch",
    description: "Inspect platform branches or create a new branch through the shared platform handlers.",
    inputSchema: jsonSchemaObject({
      operation: { type: "string", enum: ["list", "read", "create", "push", "ship"] },
      id: { type: "string" },
      title: { type: "string" },
      parentBranchId: { type: "string" },
      epic: { type: "string" },
      feature: { type: "string" },
      defect: { type: "string" },
      remoteName: { type: "string" },
      gitBranchName: { type: "string" },
      dryRun: { type: "boolean" },
      releaseChannelId: { type: "string" },
      proposalId: { type: "string" }
    }),
    scope(args) {
      return scopeResult({
        targets: [args?.id].filter(Boolean)
      });
    },
    async run({ args, callHandler }) {
      const operation = args.operation || "list";
      if (operation === "list") {
        return runJsonHandler(callHandler, {
          handler: "platform.branch.list",
          method: "GET",
          path: "/api/platform-branches"
        });
      }
      const branchId = args.id || "";
      if (!branchId) return errorToolResult("branch id is required", { operation });
      if (operation === "read") {
        return runJsonHandler(callHandler, {
          handler: "platform.branch.read",
          method: "GET",
          path: `/api/platform-branches/${encodeURIComponent(branchId)}`,
          params: { id: branchId }
        });
      }
      if (operation === "create") {
        return runJsonHandler(callHandler, {
          handler: "platform.branch.create",
          method: "POST",
          path: "/api/platform-branches",
          body: {
            id: branchId,
            title: args.title ?? null,
            parentBranchId: args.parentBranchId ?? null,
            epic: args.epic ?? null,
            feature: args.feature ?? null,
            defect: args.defect ?? null
          }
        });
      }
      if (operation === "push") {
        return runJsonHandler(callHandler, {
          handler: "platform.branch.push",
          method: "POST",
          path: `/api/platform-branches/${encodeURIComponent(branchId)}/push`,
          params: { id: branchId },
          body: {
            remoteName: args.remoteName ?? null,
            gitBranchName: args.gitBranchName ?? null,
            dryRun: args.dryRun === true
          }
        });
      }
      if (operation === "ship") {
        return runJsonHandler(callHandler, {
          handler: "platform.branch.ship",
          method: "POST",
          path: `/api/platform-branches/${encodeURIComponent(branchId)}/ship`,
          params: { id: branchId },
          body: {
            releaseChannelId: args.releaseChannelId ?? "releaseChannel:local",
            proposalId: args.proposalId ?? null
          }
        });
      }
      return errorToolResult("unknown platform branch operation", { operation });
    }
  },
  {
    name: "platform.proposal",
    title: "Platform Proposal",
    description: "Create, approve, or reject supported platform stewardship proposals without bypassing review.",
    inputSchema: jsonSchemaObject({
      operation: { type: "string", enum: ["create", "approve", "reject"] },
      action: {
        type: "string",
        enum: PLATFORM_PROPOSAL_ACTIONS
      },
      id: { type: "string" },
      proposalId: { type: "string" },
      targetKind: { type: "string" },
      targetId: { type: "string" },
      body: { type: "object" },
      reason: { type: "string" }
    }),
    scope(args) {
      return scopeResult({ targets: [args?.proposalId, args?.id, args?.targetId, args?.body?.serverRunner, args?.body?.server, args?.body?.plugin].filter(Boolean) });
    },
    async run({ args, callHandler }) {
      const operation = args.operation || "create";
      if (operation === "approve" || operation === "reject") {
        const proposalId = args.proposalId || args.id || "";
        if (!proposalId) return errorToolResult("proposal id is required", { operation });
        return runJsonHandler(callHandler, {
          handler: operation === "approve" ? "platform.proposal.approve" : "platform.proposal.reject",
          method: "POST",
          path: `/api/platform-proposals/${encodeURIComponent(proposalId)}/${operation}`,
          params: { id: proposalId },
          body: operation === "reject" ? { reason: args.reason ?? null } : {}
        });
      }
      if (!args.action || !args.id || !args.body || typeof args.body !== "object") {
        return errorToolResult("platform proposal create requires action, id, and body", { operation });
      }
      return runJsonHandler(callHandler, {
        handler: "platform.proposal.create",
        method: "POST",
        path: "/api/platform-proposals",
        body: {
          id: args.id,
          action: args.action,
          targetKind: args.targetKind ?? null,
          targetId: args.targetId ?? null,
          body: args.body ?? {},
          reason: args.reason ?? null
        }
      });
    }
  },
  {
    name: "platform.changeSet",
    title: "Platform Change Set",
    description: "Inspect platform change sets, stage or remove overlay edits, validate candidate snapshots, and apply or close change sets through the shared platform handlers.",
    inputSchema: jsonSchemaObject({
      operation: { type: "string", enum: ["list", "read", "create", "edit", "removeEdit", "validate", "apply", "reject", "abandon"] },
      id: { type: "string" },
      changeSetId: { type: "string" },
      branchId: { type: "string" },
      pathHash: { type: "string" },
      title: { type: "string" },
      reason: { type: "string" },
      edits: {
        type: "array",
        items: jsonSchemaObject({
          path: { type: "string" },
          content: { type: "string" },
          previousHash: { type: ["string", "null"] }
        }, ["path", "content"])
      }
    }),
    scope(args) {
      return scopeResult({
        targets: [args?.id, args?.changeSetId, args?.branchId, ...(Array.isArray(args?.edits) ? args.edits.map(edit => edit?.path).filter(Boolean) : [])].filter(Boolean)
      });
    },
    async run({ args, callHandler }) {
      const operation = args.operation || "create";
      if (operation === "list") {
        return runJsonHandler(callHandler, {
          handler: "platform.changeSet.list",
          method: "GET",
          path: "/api/platform-change-sets"
        });
      }
      if (operation === "create") {
        return runJsonHandler(callHandler, {
          handler: "platform.changeSet.create",
          method: "POST",
          path: "/api/platform-change-sets",
          body: {
            id: args.id ?? null,
            branchId: args.branchId ?? null,
            title: args.title ?? null,
            reason: args.reason ?? null
          }
        });
      }
      const changeSetId = args.changeSetId || args.id || "";
      if (!changeSetId) return errorToolResult("change set id is required", { operation });
      if (operation === "read") {
        return runJsonHandler(callHandler, {
          handler: "platform.changeSet.read",
          method: "GET",
          path: `/api/platform-change-sets/${encodeURIComponent(changeSetId)}`,
          params: { id: changeSetId }
        });
      }
      if (operation === "edit") {
        return blockedFileMutationToolResult({
          attemptedAuthoringPath: "platform.changeSet(edit)",
          goal: "stage file edits through platform change sets"
        });
      }
      if (operation === "removeEdit") {
        return blockedFileMutationToolResult({
          attemptedAuthoringPath: "platform.changeSet(removeEdit)",
          goal: "remove staged file edits through platform change sets"
        });
      }
      if (operation === "validate") {
        return runJsonHandler(callHandler, {
          handler: "platform.changeSet.validate",
          method: "POST",
          path: `/api/platform-change-sets/${encodeURIComponent(changeSetId)}/validate`,
          params: { id: changeSetId }
        });
      }
      if (operation === "apply") {
        return blockedFileMutationToolResult({
          attemptedAuthoringPath: "platform.changeSet(apply)",
          goal: "apply file edits through platform change sets"
        });
      }
      if (operation === "reject" || operation === "abandon") {
        const handler = operation === "reject" ? "platform.changeSet.reject" : "platform.changeSet.abandon";
        return runJsonHandler(callHandler, {
          handler,
          method: "POST",
          path: `/api/platform-change-sets/${encodeURIComponent(changeSetId)}/${operation}`,
          params: { id: changeSetId },
          body: { reason: args.reason ?? null }
        });
      }
      return errorToolResult("unknown platform change set operation", { operation });
    }
  },
  {
    name: "platform.test",
    title: "Platform Test",
    description: "Inspect platform test runs or execute a modeled test gate or selected gate set through the shared platform handlers.",
    inputSchema: jsonSchemaObject({
      operation: { type: "string", enum: ["list", "read", "run", "runSelected"] },
      id: { type: "string" },
      gateId: { type: "string" },
      branchId: { type: "string" },
      changeSetId: { type: "string" },
      candidateSnapshotId: { type: "string" }
    }),
    scope(args) {
      return scopeResult({
        targets: [args?.id, args?.gateId, args?.branchId, args?.changeSetId, args?.candidateSnapshotId].filter(Boolean)
      });
    },
    async run({ args, callHandler }) {
      const operation = args.operation || "list";
      if (operation === "list") {
        return runJsonHandler(callHandler, {
          handler: "platform.model.read",
          method: "GET",
          path: "/api/platform-model",
          query: {
            view: "testRuns",
            ...(args.id ? { id: args.id } : {})
          }
        });
      }
      const testRunId = args.id || "";
      if (operation === "read") {
        if (!testRunId) return errorToolResult("test run id is required", { operation });
        return runJsonHandler(callHandler, {
          handler: "platform.testRun.read",
          method: "GET",
          path: `/api/platform-test-runs/${encodeURIComponent(testRunId)}`,
          params: { id: testRunId }
        });
      }
      if (operation === "run") {
        if (!args.gateId) return errorToolResult("gate id is required", { operation });
        return runJsonHandler(callHandler, {
          handler: "platform.testRun.create",
          method: "POST",
          path: "/api/platform-test-runs",
          body: {
            id: testRunId || null,
            gateId: args.gateId,
            branchId: args.branchId ?? null,
            changeSetId: args.changeSetId ?? null,
            candidateSnapshotId: args.candidateSnapshotId ?? null
          }
        });
      }
      if (operation === "runSelected") {
        if (testRunId) return errorToolResult("explicit run id requires a specific gate id", { operation });
        if (!args.branchId && !args.changeSetId) {
          return errorToolResult("branch id or change set id is required", { operation });
        }
        return runJsonHandler(callHandler, {
          handler: "platform.testRun.create",
          method: "POST",
          path: "/api/platform-test-runs",
          body: {
            branchId: args.branchId ?? null,
            changeSetId: args.changeSetId ?? null,
            candidateSnapshotId: args.candidateSnapshotId ?? null
          }
        });
      }
      return errorToolResult("unknown platform test operation", { operation });
    }
  },
  {
    name: "canvas.read",
    title: "Canvas Read",
    description: "Read perspective lists or a canvas projection.",
    inputSchema: jsonSchemaObject({
      view: { type: "string", enum: ["perspectives", "canvas"] },
      perspective: { type: "string" }
    }, ["view"]),
    scope(args) {
      return scopeResult({ targets: args?.perspective ? [args.perspective] : [] });
    },
    async run({ args, callHandler }) {
      if (args.view === "perspectives") {
        return runJsonHandler(callHandler, { handler: "canvas.perspectives.list", method: "GET", path: "/api/canvas/perspectives" });
      }
      if (args.view === "canvas") {
        return runJsonHandler(callHandler, {
          handler: "canvas.read",
          method: "GET",
          path: "/api/canvas",
          query: { perspective: args.perspective || "" }
        });
      }
      return errorToolResult("unknown canvas.read view", { view: args.view });
    }
  },
  {
    name: "canvas.process",
    title: "Canvas Process",
    description: "Invoke a witnessed canvas process.",
    inputSchema: jsonSchemaObject({
      process: { type: "string" },
      params: { type: "object" }
    }, ["process"]),
    scope(args) {
      const params = args?.params && typeof args.params === "object" ? args.params : {};
      return scopeResult({
        contexts: params.context ? [params.context] : [],
        targets: [params.perspective, params.instance, params.thing].filter(Boolean)
      });
    },
    async run({ args, callHandler }) {
      return runJsonHandler(callHandler, {
        handler: "canvas.process",
        method: "POST",
        path: "/api/canvas/process",
        body: { process: args.process, params: args.params ?? {} }
      });
    }
  },
  {
    name: "storage.blob",
    title: "Blob Storage",
    description: "List, read, write, inspect, or delete blob-backed files in a context or server runner scope.",
    inputSchema: jsonSchemaObject({
      action: { type: "string", enum: ["list", "meta", "read", "write", "delete"] },
      context: { type: "string" },
      serverRunner: { type: "string" },
      path: { type: "string" },
      contentBase64: { type: "string" },
      contentType: { type: "string" }
    }, ["action"]),
    scope(args) {
      return scopeResult({
        contexts: args?.context ? [args.context] : [],
        targets: args?.serverRunner ? [args.serverRunner] : []
      });
    },
    async run({ args, callHandler }) {
      const query = {
        ...(args.context ? { context: args.context } : {}),
        ...(args.serverRunner ? { serverRunner: args.serverRunner } : {}),
        ...(args.path ? { path: args.path } : {})
      };
      if (args.action === "list") return runJsonHandler(callHandler, { handler: "fs.blob.list", method: "GET", path: "/api/fs/blobs", query });
      if (args.action === "meta") return runJsonHandler(callHandler, { handler: "fs.blob.meta", method: "GET", path: "/api/fs/blobs/meta", query });
      if (args.action === "delete") {
        return blockedFileMutationToolResult({
          attemptedAuthoringPath: "storage.blob(delete)",
          goal: "delete blob-backed files through MCP storage"
        });
      }
      if (args.action === "read") {
        return rawResult(await callHandler({ handler: "fs.blob.read", method: "GET", path: "/api/fs/blobs/content", query }));
      }
      if (args.action === "write") {
        return blockedFileMutationToolResult({
          attemptedAuthoringPath: "storage.blob(write)",
          goal: "write blob-backed files through MCP storage"
        });
      }
      return errorToolResult("unknown storage.blob action", { action: args.action });
    }
  },
  {
    name: "storage.stream",
    title: "Stream Storage",
    description: "Read, write, or copy streamed file storage in a context or server runner scope.",
    inputSchema: jsonSchemaObject({
      action: { type: "string", enum: ["read", "write", "copy"] },
      context: { type: "string" },
      serverRunner: { type: "string" },
      path: { type: "string" },
      fromPath: { type: "string" },
      toPath: { type: "string" },
      contentBase64: { type: "string" },
      contentType: { type: "string" }
    }, ["action"]),
    scope(args) {
      return scopeResult({
        contexts: args?.context ? [args.context] : [],
        targets: args?.serverRunner ? [args.serverRunner] : []
      });
    },
    async run({ args, callHandler }) {
      const query = {
        ...(args.context ? { context: args.context } : {}),
        ...(args.serverRunner ? { serverRunner: args.serverRunner } : {}),
        ...(args.path ? { path: args.path } : {})
      };
      if (args.action === "read") {
        return rawResult(await callHandler({ handler: "fs.stream.read", method: "GET", path: "/api/fs/streams/content", query }));
      }
      if (args.action === "write") {
        return blockedFileMutationToolResult({
          attemptedAuthoringPath: "storage.stream(write)",
          goal: "write streamed files through MCP storage"
        });
      }
      if (args.action === "copy") {
        return blockedFileMutationToolResult({
          attemptedAuthoringPath: "storage.stream(copy)",
          goal: "copy streamed files through MCP storage"
        });
      }
      return errorToolResult("unknown storage.stream action", { action: args.action });
    }
  },
  {
    name: "asset.manage",
    title: "Asset Management",
    description: "Upload assets, manage attachments, and trigger ingestion or search refresh.",
    inputSchema: jsonSchemaObject({
      action: { type: "string", enum: ["upload", "attachments", "attach", "detach", "retryIngest", "reindexSearch", "readText"] },
      id: { type: "string" },
      target: { type: "string" },
      perspective: { type: "string" },
      dropContext: { type: "string" },
      visibility: { type: "string" },
      filename: { type: "string" },
      contentType: { type: "string" },
      contentBase64: { type: "string" }
    }, ["action"]),
    scope(args) {
      return scopeResult({
        contexts: [args?.dropContext].filter(Boolean),
        targets: [args?.id, args?.target, args?.perspective].filter(Boolean)
      });
    },
    async run({ args, callHandler }) {
      switch (args.action) {
        case "upload":
          return runJsonHandler(callHandler, {
            handler: "asset.upload",
            method: "POST",
            path: "/api/assets",
            rawBody: Buffer.from(String(args.contentBase64 || ""), "base64"),
            headers: {
              "content-type": args.contentType || "application/octet-stream",
              "x-witness-file-name": args.filename || "",
              ...(args.dropContext ? { "x-witness-drop-context": args.dropContext } : {}),
              ...(args.visibility ? { "x-witness-visibility": args.visibility } : {})
            },
            query: args.perspective ? { perspective: args.perspective } : {}
          });
        case "attachments":
          return runJsonHandler(callHandler, {
            handler: "asset.attachments.list",
            method: "GET",
            path: `/api/assets/${encodeURIComponent(args.id || "")}/attachments`,
            params: { id: args.id || "" }
          });
        case "attach":
          return runJsonHandler(callHandler, {
            handler: "asset.attach",
            method: "POST",
            path: `/api/assets/${encodeURIComponent(args.id || "")}/attachments`,
            params: { id: args.id || "" },
            body: { target: args.target || "", perspective: args.perspective || null }
          });
        case "detach":
          return runJsonHandler(callHandler, {
            handler: "asset.detach",
            method: "DELETE",
            path: `/api/assets/${encodeURIComponent(args.id || "")}/attachments`,
            params: { id: args.id || "" },
            body: { target: args.target || "" }
          });
        case "retryIngest":
          return runJsonHandler(callHandler, {
            handler: "asset.ingest.retry",
            method: "POST",
            path: `/api/assets/${encodeURIComponent(args.id || "")}/ingest/retry`,
            params: { id: args.id || "" }
          });
        case "reindexSearch":
          return runJsonHandler(callHandler, {
            handler: "asset.search.reindex",
            method: "POST",
            path: `/api/assets/${encodeURIComponent(args.id || "")}/search/reindex`,
            params: { id: args.id || "" }
          });
        case "readText":
          return runJsonHandler(callHandler, {
            handler: "asset.text.read",
            method: "GET",
            path: `/api/assets/${encodeURIComponent(args.id || "")}/text`,
            params: { id: args.id || "" }
          });
        default:
          return errorToolResult("unknown asset.manage action", { action: args.action });
      }
    }
  },
  {
    name: "runtime.config.read",
    title: "Runtime Config Read",
    description: "Inspect resolved runtime config fields for the active server runner.",
    inputSchema: jsonSchemaObject({}),
    scope(_args, appContext) {
      return scopeResult({ targets: appContext?.serverRunnerId ? [appContext.serverRunnerId] : [] });
    },
    async run({ callHandler }) {
      return runJsonHandler(callHandler, { handler: "runtimeConfig.read", method: "GET", path: "/api/runtime-config" });
    }
  },
  {
    name: "db.sql",
    title: "SQL Database",
    description: "Inspect, migrate, query, or mutate the SQL seam for the active server runner.",
    inputSchema: jsonSchemaObject({
      action: { type: "string", enum: ["inspect", "migrate", "query", "command", "transaction"] },
      body: { type: "object" }
    }, ["action"]),
    scope(_args, appContext) {
      return scopeResult({ targets: appContext?.serverRunnerId ? [appContext.serverRunnerId] : [] });
    },
    async run({ args, callHandler }) {
      const mapping = {
        inspect: { handler: "db.sql.inspect", method: "GET", path: "/api/db/sql" },
        migrate: { handler: "db.sql.migrate", method: "POST", path: "/api/db/sql/migrate" },
        query: { handler: "db.sql.query", method: "POST", path: "/api/db/sql/query" },
        command: { handler: "db.sql.command", method: "POST", path: "/api/db/sql/command" },
        transaction: { handler: "db.sql.transaction", method: "POST", path: "/api/db/sql/transaction" }
      };
      const request = mapping[args.action];
      if (!request) return errorToolResult("unknown db.sql action", { action: args.action });
      return runJsonHandler(callHandler, { ...request, body: args.body ?? {} });
    }
  },
  {
    name: "search.index",
    title: "Search Index",
    description: "Inspect, build, reindex, or query the active search index.",
    inputSchema: jsonSchemaObject({
      action: { type: "string", enum: ["inspect", "build", "reindex", "query"] },
      body: { type: "object" }
    }, ["action"]),
    scope(_args, appContext) {
      return scopeResult({ targets: appContext?.serverRunnerId ? [appContext.serverRunnerId] : [] });
    },
    async run({ args, callHandler }) {
      const mapping = {
        inspect: { handler: "search.index.inspect", method: "GET", path: "/api/search/index" },
        build: { handler: "search.index.build", method: "POST", path: "/api/search/index/build" },
        reindex: { handler: "search.index.reindex", method: "POST", path: "/api/search/index/reindex" },
        query: { handler: "search.index.query", method: "POST", path: "/api/search/index/query" }
      };
      const request = mapping[args.action];
      if (!request) return errorToolResult("unknown search.index action", { action: args.action });
      return runJsonHandler(callHandler, { ...request, body: args.body ?? {} });
    }
  },
  {
    name: "jobs.queue",
    title: "Jobs Queue",
    description: "Inspect jobs or enqueue a new job.",
    inputSchema: jsonSchemaObject({
      action: { type: "string", enum: ["list", "read", "enqueue"] },
      id: { type: "string" },
      body: { type: "object" }
    }, ["action"]),
    scope(_args, appContext) {
      return scopeResult({ targets: appContext?.serverRunnerId ? [appContext.serverRunnerId] : [] });
    },
    async run({ args, callHandler }) {
      if (args.action === "list") return runJsonHandler(callHandler, { handler: "jobs.queue.list", method: "GET", path: "/api/jobs" });
      if (args.action === "read") {
        return runJsonHandler(callHandler, {
          handler: "jobs.queue.read",
          method: "GET",
          path: `/api/jobs/${encodeURIComponent(args.id || "")}`,
          params: { id: args.id || "" }
        });
      }
      if (args.action === "enqueue") {
        return runJsonHandler(callHandler, { handler: "jobs.queue.enqueue", method: "POST", path: "/api/jobs", body: args.body ?? {} });
      }
      return errorToolResult("unknown jobs.queue action", { action: args.action });
    }
  },
  {
    name: "http.outbound",
    title: "HTTP Outbound",
    description: "Inspect or send outbound HTTP requests through the active runner seam.",
    inputSchema: jsonSchemaObject({
      action: { type: "string", enum: ["list", "read", "send"] },
      id: { type: "string" },
      body: { type: "object" }
    }, ["action"]),
    scope(_args, appContext) {
      return scopeResult({ targets: appContext?.serverRunnerId ? [appContext.serverRunnerId] : [] });
    },
    async run({ args, callHandler }) {
      if (args.action === "list") return runJsonHandler(callHandler, { handler: "http.outbound.list", method: "GET", path: "/api/http/outbound" });
      if (args.action === "read") {
        return runJsonHandler(callHandler, {
          handler: "http.outbound.read",
          method: "GET",
          path: `/api/http/outbound/${encodeURIComponent(args.id || "")}`,
          params: { id: args.id || "" }
        });
      }
      if (args.action === "send") {
        return runJsonHandler(callHandler, { handler: "http.outbound.send", method: "POST", path: "/api/http/outbound", body: args.body ?? {} });
      }
      return errorToolResult("unknown http.outbound action", { action: args.action });
    }
  },
  {
    name: "webhook.inbound",
    title: "Webhook Inbound",
    description: "Inspect inbound webhook deliveries or submit a webhook payload.",
    inputSchema: jsonSchemaObject({
      action: { type: "string", enum: ["list", "read", "receive"] },
      id: { type: "string" },
      target: { type: "string" },
      contentType: { type: "string" },
      payload: { type: "object" },
      headers: { type: "object" }
    }, ["action"]),
    scope(_args, appContext) {
      return scopeResult({ targets: appContext?.serverRunnerId ? [appContext.serverRunnerId] : [] });
    },
    async run({ args, callHandler }) {
      if (args.action === "list") return runJsonHandler(callHandler, { handler: "webhook.inbound.list", method: "GET", path: "/api/webhooks" });
      if (args.action === "read") {
        return runJsonHandler(callHandler, {
          handler: "webhook.inbound.read",
          method: "GET",
          path: `/api/webhooks/${encodeURIComponent(args.id || "")}`,
          params: { id: args.id || "" }
        });
      }
      if (args.action === "receive") {
        const payload = args.payload ?? {};
        return runJsonHandler(callHandler, {
          handler: "webhook.inbound.receive",
          method: "POST",
          path: `/api/webhooks/inbound/${encodeURIComponent(args.target || "")}`,
          params: { target: args.target || "" },
          headers: {
            "content-type": args.contentType || "application/json",
            ...Object.fromEntries(Object.entries(args.headers && typeof args.headers === "object" ? args.headers : {}).map(([key, value]) => [String(key).toLowerCase(), String(value)]))
          },
          rawBody: Buffer.from(JSON.stringify(payload))
        });
      }
      return errorToolResult("unknown webhook.inbound action", { action: args.action });
    }
  },
  {
    name: "notifications",
    title: "Notifications",
    description: "Inspect notifications or enqueue email and SMS notifications.",
    inputSchema: jsonSchemaObject({
      action: { type: "string", enum: ["list", "read", "sendEmail", "sendSms"] },
      id: { type: "string" },
      body: { type: "object" }
    }, ["action"]),
    scope(_args, appContext) {
      return scopeResult({ targets: appContext?.serverRunnerId ? [appContext.serverRunnerId] : [] });
    },
    async run({ args, callHandler }) {
      if (args.action === "list") return runJsonHandler(callHandler, { handler: "notifications.list", method: "GET", path: "/api/notifications" });
      if (args.action === "read") {
        return runJsonHandler(callHandler, {
          handler: "notifications.read",
          method: "GET",
          path: `/api/notifications/${encodeURIComponent(args.id || "")}`,
          params: { id: args.id || "" }
        });
      }
      if (args.action === "sendEmail") {
        return runJsonHandler(callHandler, { handler: "notify.email.enqueue", method: "POST", path: "/api/notify/email", body: args.body ?? {} });
      }
      if (args.action === "sendSms") {
        return runJsonHandler(callHandler, { handler: "notify.sms.enqueue", method: "POST", path: "/api/notify/sms", body: args.body ?? {} });
      }
      return errorToolResult("unknown notifications action", { action: args.action });
    }
  }
];

const TOOL_MAP = Object.fromEntries(TOOL_DEFINITIONS.map(tool => [tool.name, tool]));

export function listSupportedMcpTools() {
  return TOOL_DEFINITIONS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema }));
}

export function mcpToolNames() {
  return TOOL_DEFINITIONS.map(tool => tool.name);
}

export function mcpToolDefinition(name) {
  return TOOL_MAP[name] ?? null;
}

export function resolveMcpToolScope(name, args, appContext) {
  const tool = mcpToolDefinition(name);
  if (!tool) return scopeResult();
  return tool.scope ? tool.scope(args, appContext) : scopeResult();
}

export async function executeMcpTool(name, {
  args,
  appContext,
  callHandler
}) {
  const tool = mcpToolDefinition(name);
  if (!tool) return errorToolResult("unknown tool", { name });
  return tool.run({ args: args ?? {}, appContext, callHandler });
}
