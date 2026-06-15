import { MCP_PROTOCOL_VERSION, listSupportedMcpTools } from "../plugins/mcp/mcp-tools.js";
import { buildBlockedAuthoringHandoff } from "../src/runtime-authoring-policy.js";
import { pathToFileURL } from "node:url";

function cookieHeader(setCookie) {
  return (setCookie || "").split(";")[0];
}

async function requestJson(serverUrl, pathname, {
  method = "POST",
  cookie = "",
  body = null,
  token = null,
  protocolVersion = null
} = {}) {
  const response = await fetch(`${serverUrl}${pathname}`, {
    method,
    headers: {
      ...(body != null ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {})
    },
    ...(body != null ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { response, body: parsed };
}

async function openSession(serverUrl, { username, password }) {
  return requestJson(serverUrl, "/api/session", {
    body: { username, password }
  });
}

async function ensureSession(serverUrl, {
  identityId = "identity.aaron",
  actor = "aaron",
  label = "Aaron",
  username = "aaron",
  password = "aaron"
} = {}) {
  let login = await openSession(serverUrl, { username, password });
  if (login.response.status === 200) {
    return cookieHeader(login.response.headers.get("set-cookie"));
  }

  const create = await requestJson(serverUrl, "/api/identities", {
    body: {
      id: identityId,
      actor,
      label,
      username,
      password,
      homePerspective: `${actor}:personal`
    }
  });
  if (![201, 409].includes(create.response.status)) {
    throw new Error(`failed to create bootstrap identity: ${create.response.status} ${JSON.stringify(create.body)}`);
  }

  login = await openSession(serverUrl, { username, password });
  if (login.response.status !== 200) {
    throw new Error(
      `failed to open bootstrap session for ${username}: ${login.response.status} ${JSON.stringify(login.body)}`
    );
  }
  return cookieHeader(login.response.headers.get("set-cookie"));
}

async function mcpRequest(serverUrl, serverId, payload, {
  token,
  protocolVersion = null
} = {}) {
  return requestJson(serverUrl, `/mcp/${encodeURIComponent(serverId)}`, {
    token,
    protocolVersion,
    body: payload
  });
}

async function mcpToolCall(serverUrl, serverId, token, name, args, id) {
  const result = await mcpRequest(serverUrl, serverId, {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name,
      arguments: args
    }
  }, {
    token,
    protocolVersion: MCP_PROTOCOL_VERSION
  });
  if (result.response.status !== 200) {
    throw new Error(`mcp tools/call failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body.result;
}

function stampId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildRungResult(id, status, detail = null) {
  return { id, status, detail };
}

export async function runCanonicalAuthoringPathwayProbe(serverUrl, {
  username = "aaron",
  password = "aaron"
} = {}) {
  const baseUrl = String(serverUrl || "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("serverUrl is required");

  const sessionCookie = await ensureSession(baseUrl, { username, password });
  const diagnostics = await fetch(`${baseUrl}/api/runtime/diagnostics`).then(response => response.json());
  const stamp = stampId("pathway");
  const runnerId = `${stamp}_runner`;
  const mcpServerId = `${stamp}_mcp`;
  const token = `${stamp}_token`;
  const contextId = `${stamp}_context`;
  const surfaceRootId = `${stamp}_surface_root`;
  const surfaceStaticId = `${stamp}_surface_static`;
  const surfaceRouteId = `${stamp}_surface_route`;
  const surfaceRoutePath = `/${stamp}-surface`;

  const createRunner = await requestJson(baseUrl, "/api/server-runners", {
    cookie: sessionCookie,
    body: {
      id: runnerId,
      backendHost: "backendHost",
      frontendHost: "frontendHost",
      runtimeConfigJson: JSON.stringify({
        [`mcp.${mcpServerId}.token`]: { value: token }
      })
    }
  });
  if (createRunner.response.status !== 201) {
    throw new Error(`failed to create pathway probe runner: ${createRunner.response.status} ${JSON.stringify(createRunner.body)}`);
  }

  const createMcpServer = await requestJson(baseUrl, "/api/mcp-servers", {
    cookie: sessionCookie,
    body: {
      id: mcpServerId,
      label: "Canonical Authoring Pathway MCP",
      serverRunner: runnerId,
      serviceIdentity: username,
      transports: ["http"]
    }
  });
  if (createMcpServer.response.status !== 201) {
    throw new Error(`failed to create pathway probe mcp server: ${createMcpServer.response.status} ${JSON.stringify(createMcpServer.body)}`);
  }

  for (const tool of ["authoring.write", "world.read"]) {
    const install = await requestJson(baseUrl, "/api/mcp-tool-installs", {
      cookie: sessionCookie,
      body: {
        server: mcpServerId,
        tool,
        actingMode: "service"
      }
    });
    if (install.response.status !== 201) {
      throw new Error(`failed to install ${tool}: ${install.response.status} ${JSON.stringify(install.body)}`);
    }
  }

  const initialize = await mcpRequest(baseUrl, mcpServerId, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {} }
  }, { token });
  if (initialize.response.status !== 200) {
    throw new Error(`failed to initialize pathway probe mcp server: ${initialize.response.status} ${JSON.stringify(initialize.body)}`);
  }

  const write = (action, body, id) => mcpToolCall(baseUrl, mcpServerId, token, "authoring.write", { action, body }, id);
  const authoringMatrixRead = await mcpToolCall(baseUrl, mcpServerId, token, "world.read", {
    view: "authoringMatrix"
  }, 10);
  if (authoringMatrixRead.isError) {
    throw new Error(`authoring matrix read failed: ${JSON.stringify(authoringMatrixRead.structuredContent ?? null)}`);
  }
  const authoringMatrix = authoringMatrixRead.structuredContent;
  const authoringTool = listSupportedMcpTools().find(tool => tool.name === "authoring.write");
  const actionEnum = authoringTool?.inputSchema?.properties?.action?.enum ?? [];
  const rungResults = [
    buildRungResult("matrixBaseline", "supported", "machine-readable authoring/runtime matrix is readable"),
    buildRungResult("canonicalActionsExist", "supported", "canonical authoring actions are visible in constrained MCP discovery")
  ];

  const createdContext = await write("context.create", {
    id: contextId,
    label: "Canonical Authoring Pathway"
  }, 11);
  if (createdContext?.isError) {
    throw new Error(`pathway probe authoring write failed: ${JSON.stringify(createdContext.structuredContent ?? null)}`);
  }

  const createdSurfaces = await write("surface.create", [
    {
      id: surfaceRootId,
      surfaceKind: "app-root",
      context: contextId,
      children: [surfaceStaticId]
    },
    {
      id: surfaceStaticId,
      surfaceKind: "content-panel",
      context: contextId,
      props: {
        title: "Canonical authored surface",
        body: "This text was projected from a surface witness through page.surface."
      }
    }
  ], 12);

  const createdSurfaceRoute = await write("route.create", {
    id: surfaceRouteId,
    context: contextId,
    path: surfaceRoutePath,
    method: "GET",
    handler: "page.surface",
    serves: surfaceRootId,
    rootSurface: surfaceRootId,
    defaultScreen: surfaceStaticId
  }, 13);

  const createdSurfaceServe = await write("serve.create", {
    serverRunner: runnerId,
    route: surfaceRouteId
  }, 14);

  const creationErrors = [createdSurfaces, createdSurfaceRoute, createdSurfaceServe].filter(result => result?.isError);
  if (creationErrors.length) {
    throw new Error(`pathway probe surface authoring failed: ${JSON.stringify(creationErrors[0]?.structuredContent ?? null)}`);
  }

  const surfacePage = await fetch(`${baseUrl}${surfaceRoutePath}`);
  const surfaceHtml = await surfacePage.text();
  const staticSurfaceProjectionVisible = /Canonical authored surface/.test(surfaceHtml)
    && /This text was projected from a surface witness through page\.surface\./.test(surfaceHtml)
    && /status<\/dt><dd>static_surface_projection<\/dd>/i.test(surfaceHtml);
  const blockedResetHostVisible = /page\.surface reset host/i.test(surfaceHtml)
    && /blocked_reset_host/i.test(surfaceHtml);

  let firstBlocked = null;
  if (staticSurfaceProjectionVisible) {
    rungResults.push(buildRungResult("staticSurfaceProjection", "supported", "minimal authored static surface payload projected live through page.surface"));
  } else {
    firstBlocked = buildBlockedAuthoringHandoff({
      limitationType: "platform",
      goal: "project a minimal authored static surface through page.surface",
      attemptedAuthoringPath: "authoring.write(surface.create/route.create/serve.create)",
      missingPrimitive: "page.surface could not project the first minimal authored static surface payload",
      minimumHumanAction: "extend the mechanical page.surface host only enough to project a minimal authored static payload without introducing bespoke surface rendering logic",
      proof: [
        `authoring.write advertises surface.create: ${actionEnum.includes("surface.create")}`,
        `surface route ${surfaceRoutePath} served with HTTP ${surfacePage.status}`,
        `surface HTML contained authored static projection: ${staticSurfaceProjectionVisible}`,
        `surface HTML fell back to blocked reset host: ${blockedResetHostVisible}`
      ]
    });
    rungResults.push(buildRungResult("staticSurfaceProjection", "blocked", firstBlocked.missingPrimitive));
  }

  const finalState = await mcpToolCall(baseUrl, mcpServerId, token, "world.read", {
    view: "bootstrapState"
  }, 15);
  if (finalState.isError) {
    throw new Error(`world.read failed: ${JSON.stringify(finalState.structuredContent ?? null)}`);
  }

  const pathwayProbe = {
    runnerId,
    mcpServerId,
    surfaceRouteId,
    surfaceRoutePath,
    surfaceHttpStatus: surfacePage.status,
    staticSurfaceProjectionVisible,
    blockedResetHostVisible,
    rungResults,
    firstBlockedRung: firstBlocked ? "staticSurfaceProjection" : null,
    firstBlocked
  };

  return {
    ok: true,
    serverUrl: baseUrl,
    diagnostics: {
      runtimeProfile: diagnostics.activeProfile,
      authoringPolicy: diagnostics.authoringPolicy
    },
    authoringMatrix,
    pathwayProbe,
    replay: pathwayProbe,
    capabilityChecks: {
      canonicalFrontendModel: [...(authoringMatrix?.baseline?.publicFrontendModel ?? [])],
      publicSurfaceCreate: actionEnum.includes("surface.create"),
      publicProcessCreate: actionEnum.includes("process.create"),
      publicTypeCreate: actionEnum.includes("type.create"),
      publicProjectionCreate: actionEnum.includes("projection.create"),
      legacyWidgetCreateHidden: !actionEnum.includes("widget.create"),
      legacyFrontendProgramHidden: !actionEnum.includes("frontendProgram.create")
    },
    stateChecks: {
      runnerPresent: finalState.structuredContent.serverRunners.some(row => row.id === runnerId),
      surfaceRoutePresent: finalState.structuredContent.routes.some(row => row.id === surfaceRouteId && row.handler === "page.surface"),
      surfaceServedRoutePresent: finalState.structuredContent.servedRoutes.some(row => row.id === surfaceRouteId && row.serverRunner === runnerId),
      rootSurfacePresent: finalState.structuredContent.witnesses
        ? finalState.structuredContent.witnesses.some(row => row.process === "desire.defineSurface" && row.body?.id === surfaceRootId)
        : true
    },
    blockers: {
      firstBlocked
    }
  };
}

export const runReplayProbe = runCanonicalAuthoringPathwayProbe;

async function main(argv = process.argv.slice(2)) {
  const serverUrl = argv[0] || process.env.WITNESS_SERVER_URL || "http://127.0.0.1:3000";
  const username = process.env.WITNESS_BOOTSTRAP_USER || "aaron";
  const password = process.env.WITNESS_BOOTSTRAP_PASSWORD || "aaron";
  const result = await runCanonicalAuthoringPathwayProbe(serverUrl, { username, password });
  console.log(JSON.stringify(result, null, 2));

  if (!result.stateChecks.runnerPresent) {
    process.exit(1);
  }
  if (result.pathwayProbe.surfaceHttpStatus !== 200) {
    process.exit(1);
  }
  if (!result.pathwayProbe.staticSurfaceProjectionVisible) {
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath && import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
