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
    description: "Read bootstrap state, witnesses, source, world graph, or process projections.",
    inputSchema: jsonSchemaObject({
      view: { type: "string", enum: ["bootstrapModel", "bootstrapState", "witnesses", "worldGraph", "processView", "processRun", "source"] },
      offset: { type: "number" },
      runId: { type: "string" },
      replay: { type: "string" },
      program: { type: "string" },
      event: { type: "string" },
      node: { type: "string" },
      sourceFile: { type: "string" }
    }, ["view"]),
    scope(args) {
      return scopeResult({
        targets: args?.view === "processRun" && args?.runId ? [args.runId] : []
      });
    },
    async run({ args, callHandler }) {
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
        default:
          return errorToolResult("unknown world.read view", { view: args.view });
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
          "widget.create",
          "widget.update",
          "frontendProgram.create",
          "frontendStep.create",
          "route.create",
          "serve.create",
          "serverRunner.create",
          "capability.create",
          "capability.install",
          "capability.remove",
          "mcpServer.create",
          "mcpTool.install",
          "mcpTool.remove"
        ]
      },
      body: { type: "object" }
    }, ["action", "body"]),
    scope(args) {
      const body = args?.body && typeof args.body === "object" ? args.body : {};
      return scopeResult({
        contexts: [body.context, body.parent, body.homeContext].filter(Boolean),
        targets: [body.target, body.server, body.serverRunner, body.id].filter(Boolean)
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
        case "widget.create":
          return runJsonHandler(callHandler, { handler: "widgets.create", method: "POST", path: "/api/widgets", body });
        case "widget.update":
          return runJsonHandler(callHandler, {
            handler: "widgets.update",
            method: "PATCH",
            path: `/api/widgets/${encodeURIComponent(body.id || "")}`,
            params: { id: body.id || "" },
            body
          });
        case "frontendProgram.create":
          return runJsonHandler(callHandler, { handler: "frontendProgram.create", method: "POST", path: "/api/frontend-programs", body });
        case "frontendStep.create":
          return runJsonHandler(callHandler, { handler: "frontendStep.create", method: "POST", path: "/api/frontend-steps", body });
        case "route.create":
          return runJsonHandler(callHandler, { handler: "route.create", method: "POST", path: "/api/routes", body });
        case "serve.create":
          return runJsonHandler(callHandler, { handler: "serve.create", method: "POST", path: "/api/serve-mounts", body });
        case "serverRunner.create":
          return runJsonHandler(callHandler, { handler: "serverRunner.create", method: "POST", path: "/api/server-runners", body });
        case "capability.create":
          return runJsonHandler(callHandler, { handler: "capability.create", method: "POST", path: "/api/capabilities", body });
        case "capability.install":
          return runJsonHandler(callHandler, { handler: "capability.install", method: "POST", path: "/api/capability-installs", body });
        case "capability.remove":
          return runJsonHandler(callHandler, { handler: "capability.remove", method: "DELETE", path: "/api/capability-installs", body });
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
      if (args.action === "delete") return runJsonHandler(callHandler, { handler: "fs.blob.delete", method: "DELETE", path: "/api/fs/blobs", query });
      if (args.action === "read") {
        return rawResult(await callHandler({ handler: "fs.blob.read", method: "GET", path: "/api/fs/blobs/content", query }));
      }
      if (args.action === "write") {
        return runJsonHandler(callHandler, {
          handler: "fs.blob.write",
          method: "PUT",
          path: "/api/fs/blobs/content",
          query,
          rawBody: Buffer.from(String(args.contentBase64 || ""), "base64"),
          headers: { "content-type": args.contentType || "application/octet-stream" }
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
        return runJsonHandler(callHandler, {
          handler: "fs.stream.write",
          method: "PUT",
          path: "/api/fs/streams/content",
          query,
          rawBody: Buffer.from(String(args.contentBase64 || ""), "base64"),
          headers: { "content-type": args.contentType || "application/octet-stream" }
        });
      }
      if (args.action === "copy") {
        return runJsonHandler(callHandler, {
          handler: "fs.stream.copy",
          method: "POST",
          path: "/api/fs/streams/copy",
          body: {
            ...(args.context ? { context: args.context } : {}),
            ...(args.serverRunner ? { serverRunner: args.serverRunner } : {}),
            fromPath: args.fromPath || "",
            toPath: args.toPath || ""
          }
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
