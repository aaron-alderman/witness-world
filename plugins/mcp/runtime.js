import {
  executeMcpTool,
  mcpToolDefinition,
  mcpToolNames,
  resolveMcpToolScope,
  MCP_PROTOCOL_VERSION
} from "./mcp-tools.js";
import { createMcpBundleSupportServices } from "./mcp-support-services.js";
import { mcpModuleProjectors } from "./projections.js";

export const bundleId = "bundle-mcp";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze(["mcp.http"]),
  handlerMetadata: Object.freeze({
    "mcp.http": Object.freeze({ routeKind: "json", responseKind: "json" })
  }),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze(["mcp.http"])
});

function patternRoute(method, pattern, handler, paramNames = []) {
  return { kind: "pattern", method, pattern, handler, paramNames };
}

export const routes = Object.freeze([
  patternRoute("POST", /^\/mcp\/([^/]+)$/, "mcp.http", ["id"]),
  patternRoute("GET", /^\/mcp\/([^/]+)$/, "mcp.http", ["id"])
]);

export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "moduleProjectors",
    id: "mcp.projections",
    projectors: mcpModuleProjectors
  },
  {
    kind: "supportServiceFactory",
    id: "mcp.support",
    factory: () => ({
      executeMcpTool,
      mcpToolDefinition,
      mcpToolNames,
      resolveMcpToolScope,
      MCP_PROTOCOL_VERSION,
      createMcpBundleSupportServices
    })
  }
]);

export function createHandlers({
  currentMcpServerIndex,
  currentMcpToolInstalls,
  mcpToolAvailable,
  validateMcpOrigin,
  resolveMcpPrincipal,
  readBody,
  headerValue,
  MCP_PROTOCOL_VERSION,
  mcpToolDefinition,
  mcpScopeAllows,
  executeMcpTool,
  invokeRouteHandler,
  sendJson
}) {
  return {
    "mcp.http": async ({ req, res, params, requestActor, requestIdentity, requestSession, appContext }) => {
      const mcpServer = currentMcpServerIndex(appContext).byId[params.id || ""] ?? null;
      if (!mcpServer) {
        sendJson(res, 404, { error: "mcp server not found", id: params.id || "" });
        return;
      }
      if (mcpServer.serverRunner !== appContext?.serverRunnerId) {
        sendJson(res, 404, { error: "mcp server not available on this runtime", id: mcpServer.id, serverRunner: mcpServer.serverRunner });
        return;
      }
      const originGate = validateMcpOrigin(req);
      if (!originGate.ok) {
        sendJson(res, 403, { error: originGate.reason });
        return;
      }
      const principal = resolveMcpPrincipal({
        req,
        requestActor,
        requestIdentity,
        requestSession,
        mcpServer,
        appContext
      });
      if (!principal.ok) {
        sendJson(res, principal.status || 403, { error: principal.reason || "forbidden" });
        return;
      }
      if (!mcpServer.transports.includes(principal.transport)) {
        sendJson(res, 404, { error: "mcp transport not enabled on server", transport: principal.transport, server: mcpServer.id });
        return;
      }
      if ((req.method || "GET").toUpperCase() === "GET") {
        sendJson(res, 405, { error: "streaming GET not implemented" }, { allow: "POST" });
        return;
      }
      const bodyBuffer = await readBody(req);
      let message = null;
      try {
        message = bodyBuffer.length ? JSON.parse(bodyBuffer.toString("utf8")) : null;
      } catch (error) {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: `parse error: ${error instanceof Error ? error.message : String(error)}` }
        });
        return;
      }
      if (!message || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: message?.id ?? null,
          error: { code: -32600, message: "invalid request" }
        });
        return;
      }
      const method = message.method;
      const isNotification = !Object.prototype.hasOwnProperty.call(message, "id");
      const protocolHeader = headerValue(req.headers["mcp-protocol-version"]).trim();
      if (principal.transport === "http" && method !== "initialize" && !protocolHeader) {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: isNotification ? null : (message.id ?? null),
          error: {
            code: -32602,
            message: "mcp-protocol-version header required",
            data: { supported: [MCP_PROTOCOL_VERSION] }
          }
        });
        return;
      }
      if (principal.transport === "http" && method !== "initialize" && protocolHeader !== MCP_PROTOCOL_VERSION) {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: isNotification ? null : (message.id ?? null),
          error: {
            code: -32602,
            message: "unsupported protocol version",
            data: { supported: [MCP_PROTOCOL_VERSION], requested: protocolHeader }
          }
        });
        return;
      }
      if (method === "initialize") {
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id ?? null,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false }
            },
            serverInfo: {
              name: mcpServer.id,
              title: mcpServer.label || mcpServer.id,
              version: "0.36.0"
            },
            instructions: "Witness World MCP server"
          }
        });
        return;
      }
      if (isNotification) {
        res.writeHead(202, {});
        res.end();
        return;
      }
      if (method === "ping") {
        sendJson(res, 200, { jsonrpc: "2.0", id: message.id, result: {} });
        return;
      }
      const requestSessionMatchesPrincipal = Boolean(
        requestSession
        && requestSession.effectiveActor === principal.effectiveActor
        && (requestSession.effectiveIdentity ?? null) === (principal.effectiveIdentity ?? null)
        && (requestSession.authorityMode ?? "direct") === (principal.authorityMode ?? "direct")
        && (requestSession.assumptionGrantId ?? null) === (principal.assumptionGrantId ?? null)
      );
      const installs = currentMcpToolInstalls(appContext)
        .filter(row => row.server === mcpServer.id)
        .filter(row => row.actingMode === principal.actingMode)
        .filter(row => mcpToolAvailable(row.tool));
      if (method === "tools/list") {
        const toolRows = installs
          .map(row => mcpToolDefinition(row.tool))
          .filter(Boolean)
          .map(tool => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema
          }));
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            tools: toolRows,
            nextCursor: null
          }
        });
        return;
      }
      if (method === "tools/call") {
        const toolName = typeof message.params?.name === "string" ? message.params.name : "";
        const install = installs.find(row => row.tool === toolName) ?? null;
        if (!install) {
          sendJson(res, 200, {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [{ type: "text", text: JSON.stringify({ error: "tool not installed for this principal", tool: toolName }, null, 2) }],
              structuredContent: { error: "tool not installed for this principal", tool: toolName },
              isError: true
            }
          });
          return;
        }
        const args = message.params?.arguments && typeof message.params.arguments === "object"
          ? message.params.arguments
          : {};
        const scopeGate = mcpScopeAllows(install, args, appContext);
        if (!scopeGate.ok) {
          sendJson(res, 200, {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [{ type: "text", text: JSON.stringify({ error: scopeGate.reason, tool: toolName }, null, 2) }],
              structuredContent: { error: scopeGate.reason, tool: toolName },
              isError: true
            }
          });
          return;
        }
        const result = await executeMcpTool(toolName, {
          args,
          appContext,
          callHandler: request => invokeRouteHandler({
            ...request,
            requestActor: principal.effectiveActor,
            requestIdentity: principal.effectiveIdentity ?? null,
            requestSession: requestSessionMatchesPrincipal ? requestSession : null,
            appContext
          })
        });
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id,
          result
        });
        return;
      }
      sendJson(res, 400, {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "method not found" }
      });
    }
  };
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
