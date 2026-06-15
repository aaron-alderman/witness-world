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
  const surfaceAlternateId = `${stamp}_surface_alternate`;
  const routeStateTypeId = `${stamp}_route_state`;
  const routeStateProcessId = `${stamp}_route_process`;
  const routeStateMessageId = `${stamp}_route_message`;
  const surfaceRouteId = `${stamp}_surface_route`;
  const surfaceRouteAltId = `${stamp}_surface_route_alt`;
  const surfaceRoutePath = `/${stamp}-surface`;
  const surfaceRouteAltPath = `/${stamp}-surface-alt`;

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

  const createdType = await write("type.create", {
    id: routeStateTypeId,
    role: "state",
    valueType: "text",
    initial: surfaceRoutePath
  }, 12);

  const createdProcess = await write("process.create", {
    id: routeStateProcessId,
    state: [routeStateTypeId],
    handles: [routeStateMessageId],
    emits: [],
    rules: []
  }, 13);

  const createdMessage = await write("message.create", {
    id: routeStateMessageId,
    role: "event",
    writes: {
      [routeStateTypeId]: surfaceRouteAltPath
    }
  }, 14);

  const createdSurfaces = await write("surface.create", [
    {
      id: surfaceRootId,
      surfaceKind: "app-root",
      context: contextId,
      processRef: routeStateProcessId,
      children: [surfaceStaticId, surfaceAlternateId]
    },
    {
      id: surfaceStaticId,
      surfaceKind: "content-panel",
      context: contextId,
      props: {
        routePath: surfaceRoutePath,
        title: "Canonical authored surface",
        body: "This text was projected from a surface witness through page.surface."
      }
    },
    {
      id: surfaceAlternateId,
      surfaceKind: "content-panel",
      context: contextId,
      props: {
        routePath: surfaceRouteAltPath,
        title: "Canonical alternate surface",
        body: "This alternate text was projected from the same root through route-selected surface output."
      }
    }
  ], 15);

  const createdSurfaceRoute = await write("route.create", {
    id: surfaceRouteId,
    context: contextId,
    path: surfaceRoutePath,
    method: "GET",
    handler: "page.surface",
    serves: surfaceRootId,
    rootSurface: surfaceRootId,
    defaultScreen: surfaceStaticId
  }, 16);

  const createdSurfaceAltRoute = await write("route.create", {
    id: surfaceRouteAltId,
    context: contextId,
    path: surfaceRouteAltPath,
    method: "GET",
    handler: "page.surface",
    serves: surfaceRootId,
    rootSurface: surfaceRootId,
    defaultScreen: surfaceAlternateId
  }, 17);

  const createdSurfaceServe = await write("serve.create", {
    serverRunner: runnerId,
    route: surfaceRouteId
  }, 18);

  const createdSurfaceAltServe = await write("serve.create", {
    serverRunner: runnerId,
    route: surfaceRouteAltId
  }, 19);

  const creationErrors = [
    createdType,
    createdProcess,
    createdMessage,
    createdSurfaces,
    createdSurfaceRoute,
    createdSurfaceAltRoute,
    createdSurfaceServe,
    createdSurfaceAltServe
  ].filter(result => result?.isError);
  if (creationErrors.length) {
    throw new Error(`pathway probe surface authoring failed: ${JSON.stringify(creationErrors[0]?.structuredContent ?? null)}`);
  }

  const surfacePage = await fetch(`${baseUrl}${surfaceRoutePath}`);
  const surfaceHtml = await surfacePage.text();
  const alternateSurfacePage = await fetch(`${baseUrl}${surfaceRouteAltPath}`);
  const alternateSurfaceHtml = await alternateSurfacePage.text();
  const staticSurfaceProjectionVisible = /Canonical authored surface/.test(surfaceHtml)
    && /This text was projected from a surface witness through page\.surface\./.test(surfaceHtml)
    && /status<\/dt><dd>static_surface_projection<\/dd>/i.test(surfaceHtml);
  const routeSelectedSurfaceVisible = staticSurfaceProjectionVisible
    && /activeSurface\.id<\/dt><dd>.*_surface_static<\/dd>/i.test(surfaceHtml)
    && /Canonical alternate surface/.test(alternateSurfaceHtml)
    && /This alternate text was projected from the same root through route-selected surface output\./.test(alternateSurfaceHtml)
    && /activeSurface\.id<\/dt><dd>.*_surface_alternate<\/dd>/i.test(alternateSurfaceHtml);
  const blockedResetHostVisible = (
    /page\.surface reset host/i.test(surfaceHtml) && /blocked_reset_host/i.test(surfaceHtml)
  ) || (
    /page\.surface reset host/i.test(alternateSurfaceHtml) && /blocked_reset_host/i.test(alternateSurfaceHtml)
  );

  let firstBlocked = null;
  let firstBlockedRung = null;
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
    firstBlockedRung = "staticSurfaceProjection";
  }

  if (!firstBlocked) {
    if (routeSelectedSurfaceVisible) {
      rungResults.push(buildRungResult("routeSelectedSurface", "supported", "page.surface can now serve alternate authored surface output by route"));
    } else {
      firstBlocked = buildBlockedAuthoringHandoff({
        limitationType: "platform",
        goal: "serve alternate authored surface output by route through page.surface",
        attemptedAuthoringPath: "authoring.write(surface.create/route.create/serve.create)",
        missingPrimitive: "page.surface could not prove route-selected alternate authored surface output",
        minimumHumanAction: "extend the mechanical page.surface host only enough to select alternate authored surface output by route without introducing bespoke shell logic",
        proof: [
          `primary route ${surfaceRoutePath} served with HTTP ${surfacePage.status}`,
          `alternate route ${surfaceRouteAltPath} served with HTTP ${alternateSurfacePage.status}`,
          `primary authored static surface visible: ${staticSurfaceProjectionVisible}`,
          `route-selected alternate authored surface visible: ${routeSelectedSurfaceVisible}`,
          `either route fell back to blocked reset host: ${blockedResetHostVisible}`
        ]
      });
      rungResults.push(buildRungResult("routeSelectedSurface", "blocked", firstBlocked.missingPrimitive));
      firstBlockedRung = "routeSelectedSurface";
    }
  }

  if (!firstBlocked) {
    firstBlocked = buildBlockedAuthoringHandoff({
      limitationType: "platform",
      goal: "synchronize URL state into authored route state on canonical page.surface",
      attemptedAuthoringPath: "authoring.write(surface.create/process.create/type.create/message.create/route.create/serve.create)",
      missingPrimitive: "page.surface does not yet execute canonical URL -> route-state synchronization",
      minimumHumanAction: "add a clean generic interactive page.surface consumer that synchronizes URL state into authored route state without surface-kind-specific view logic or hidden DOM contracts",
      proof: [
        `type.create succeeded for ${routeStateTypeId}: ${createdType?.isError !== true}`,
        `process.create succeeded for ${routeStateProcessId}: ${createdProcess?.isError !== true}`,
        `message.create succeeded for ${routeStateMessageId}: ${createdMessage?.isError !== true}`,
        `route-selected alternate authored surface output is proven: ${routeSelectedSurfaceVisible}`,
        "page.surface does not yet wire a canonical generic interactive route-state consumer into the served path"
      ]
    });
    rungResults.push(buildRungResult("urlToRouteState", "blocked", firstBlocked.missingPrimitive));
    firstBlockedRung = "urlToRouteState";
  }

  const finalState = await mcpToolCall(baseUrl, mcpServerId, token, "world.read", {
    view: "bootstrapState"
  }, 20);
  if (finalState.isError) {
    throw new Error(`world.read failed: ${JSON.stringify(finalState.structuredContent ?? null)}`);
  }

  const pathwayProbe = {
    runnerId,
    mcpServerId,
    surfaceRouteId,
    surfaceRouteAltId,
    surfaceRoutePath,
    surfaceRouteAltPath,
    surfaceHttpStatus: surfacePage.status,
    alternateSurfaceHttpStatus: alternateSurfacePage.status,
    staticSurfaceProjectionVisible,
    routeSelectedSurfaceVisible,
    blockedResetHostVisible,
    rungResults,
    firstBlockedRung,
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
      publicMessageCreate: actionEnum.includes("message.create"),
      legacyWidgetCreateHidden: !actionEnum.includes("widget.create"),
      legacyFrontendProgramHidden: !actionEnum.includes("frontendProgram.create")
    },
    stateChecks: {
      runnerPresent: finalState.structuredContent.serverRunners.some(row => row.id === runnerId),
      surfaceRoutePresent: finalState.structuredContent.routes.some(row => row.id === surfaceRouteId && row.handler === "page.surface"),
      alternateSurfaceRoutePresent: finalState.structuredContent.routes.some(row => row.id === surfaceRouteAltId && row.handler === "page.surface"),
      surfaceServedRoutePresent: finalState.structuredContent.servedRoutes.some(row => row.id === surfaceRouteId && row.serverRunner === runnerId),
      alternateSurfaceServedRoutePresent: finalState.structuredContent.servedRoutes.some(row => row.id === surfaceRouteAltId && row.serverRunner === runnerId),
      rootSurfacePresent: finalState.structuredContent.witnesses
        ? finalState.structuredContent.witnesses.some(row => row.process === "desire.defineSurface" && row.body?.id === surfaceRootId)
        : true,
      routeStateProcessPresent: finalState.structuredContent.witnesses
        ? finalState.structuredContent.witnesses.some(row => row.process === "desire.defineProcess" && row.body?.id === routeStateProcessId)
        : true,
      routeStateTypePresent: finalState.structuredContent.witnesses
        ? finalState.structuredContent.witnesses.some(row => row.process === "desire.defineType" && row.body?.id === routeStateTypeId)
        : true,
      routeStateMessagePresent: finalState.structuredContent.witnesses
        ? finalState.structuredContent.witnesses.some(row => row.process === "desire.defineMessage" && row.body?.id === routeStateMessageId)
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
  if (!result.pathwayProbe.routeSelectedSurfaceVisible) {
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
