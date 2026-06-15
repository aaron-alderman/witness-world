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

export async function runReplayProbe(serverUrl, {
  username = "aaron",
  password = "aaron"
} = {}) {
  const baseUrl = String(serverUrl || "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("serverUrl is required");

  const sessionCookie = await ensureSession(baseUrl, { username, password });
  const diagnostics = await fetch(`${baseUrl}/api/runtime/diagnostics`).then(response => response.json());
  const stamp = stampId("replay");
  const runnerId = `${stamp}_runner`;
  const mcpServerId = `${stamp}_mcp`;
  const token = `${stamp}_token`;
  const contextId = `${stamp}_context`;
  const surfaceRootId = `${stamp}_surface_root`;
  const surfaceLoginId = `${stamp}_surface_login`;
  const surfaceHomeId = `${stamp}_surface_home`;
  const surfaceRouteId = `${stamp}_surface_route`;
  const surfaceRoutePath = `/${stamp}-surface`;
  const surfaceScreenRouteId = `${stamp}_surface_screen_route`;
  const surfaceHomePath = `${surfaceRoutePath}/home`;

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
    throw new Error(`failed to create replay runner: ${createRunner.response.status} ${JSON.stringify(createRunner.body)}`);
  }

  const createMcpServer = await requestJson(baseUrl, "/api/mcp-servers", {
    cookie: sessionCookie,
    body: {
      id: mcpServerId,
      label: "Authoring Replay MCP",
      serverRunner: runnerId,
      serviceIdentity: username,
      transports: ["http"]
    }
  });
  if (createMcpServer.response.status !== 201) {
    throw new Error(`failed to create replay mcp server: ${createMcpServer.response.status} ${JSON.stringify(createMcpServer.body)}`);
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
    throw new Error(`failed to initialize replay mcp server: ${initialize.response.status} ${JSON.stringify(initialize.body)}`);
  }

  const write = (action, body, id) => mcpToolCall(baseUrl, mcpServerId, token, "authoring.write", { action, body }, id);
  const created = [];

  const authoringMatrixRead = await mcpToolCall(baseUrl, mcpServerId, token, "world.read", {
    view: "authoringMatrix"
  }, 10);
  if (authoringMatrixRead.isError) {
    throw new Error(`authoring matrix read failed: ${JSON.stringify(authoringMatrixRead.structuredContent ?? null)}`);
  }
  const authoringMatrix = authoringMatrixRead.structuredContent;
  created.push(await write("context.create", { id: contextId, label: "Replay Frontend" }, 11));

  const creationErrors = created.filter(result => result?.isError);
  if (creationErrors.length) {
    throw new Error(`replay authoring write failed: ${JSON.stringify(creationErrors[0]?.structuredContent ?? null)}`);
  }

  const authoringTool = listSupportedMcpTools().find(tool => tool.name === "authoring.write");
  const actionEnum = authoringTool?.inputSchema?.properties?.action?.enum ?? [];
  const createdSurfaces = await write("surface.create", [
    {
      id: surfaceRootId,
      surfaceKind: "app-root",
      context: contextId,
      children: [surfaceLoginId, surfaceHomeId],
      props: {
        brandName: "DESIRE",
        productName: "Replay Surface"
      }
    },
    {
      id: surfaceLoginId,
      surfaceKind: "auth-screen",
      context: contextId,
      props: {
        routeKey: "login",
        routePath: surfaceRoutePath,
        title: "Replay surface login",
        subtitle: "Canonical surface route seed",
        heroTitle: "Replay seed login",
        heroBody: "Surface witnesses exist even while page.surface is reset.",
        primaryActionLabel: "Continue",
        primaryActionHref: surfaceHomePath
      }
    },
    {
      id: surfaceHomeId,
      surfaceKind: "auth-screen",
      context: contextId,
      props: {
        routeKey: "home",
        routePath: surfaceHomePath,
        title: "Replay surface home",
        subtitle: "Canonical surface route seed",
        heroTitle: "Replay seed home",
        heroBody: "This witness exists only to prove the blocked reset route host.",
        primaryActionLabel: "Stay here",
        primaryActionHref: surfaceHomePath
      }
    }
  ], 18);

  const createdSurfaceRoute = await write("route.create", {
    id: surfaceRouteId,
    context: contextId,
    path: surfaceRoutePath,
    method: "GET",
    handler: "page.surface",
    serves: surfaceRootId,
    rootSurface: surfaceRootId,
    defaultScreen: "login"
  }, 19);

  const createdSurfaceServe = await write("serve.create", {
    serverRunner: runnerId,
    route: surfaceRouteId
  }, 20);

  const createdSurfaceScreenRoute = await write("route.create", {
    id: surfaceScreenRouteId,
    context: contextId,
    path: `${surfaceRoutePath}/:screen`,
    method: "GET",
    handler: "page.surface",
    serves: surfaceRootId,
    rootSurface: surfaceRootId,
    defaultScreen: "login"
  }, 21);

  const createdSurfaceScreenServe = await write("serve.create", {
    serverRunner: runnerId,
    route: surfaceScreenRouteId
  }, 22);

  const processAttempt = await write("process.create", {
    id: `${stamp}_process`,
    context: contextId,
    state: [`${stamp}_title_state`, `${stamp}_open_state`],
    handles: [],
    emits: [],
    rules: []
  }, 23);
  const titleTypeAttempt = await write("type.create", {
    id: `${stamp}_title_state`,
    context: contextId,
    role: "state",
    valueType: "text",
    initial: "Replay title"
  }, 24);
  const openTypeAttempt = await write("type.create", {
    id: `${stamp}_open_state`,
    context: contextId,
    role: "state",
    valueType: "bool",
    initial: false
  }, 25);
  const projectionAttempt = await write("projection.create", {
    id: `${stamp}_projection`,
    context: contextId,
    projectionKind: "bool_not",
    source: `${stamp}_open_state`,
    props: {}
  }, 26);

  const surfaceCreationErrors = [
    createdSurfaces,
    createdSurfaceRoute,
    createdSurfaceServe,
    createdSurfaceScreenRoute,
    createdSurfaceScreenServe,
    processAttempt,
    titleTypeAttempt,
    openTypeAttempt,
    projectionAttempt
  ].filter(result => result?.isError);
  if (surfaceCreationErrors.length) {
    throw new Error(`replay surface authoring failed: ${JSON.stringify(surfaceCreationErrors[0]?.structuredContent ?? null)}`);
  }

  const surfacePage = await fetch(`${baseUrl}${surfaceRoutePath}`);
  const surfaceHtml = await surfacePage.text();
  const surfaceBlockedHostVisible = /page\.surface reset host/i.test(surfaceHtml)
    && /blocked_reset_host/i.test(surfaceHtml)
    && /Canonical projection must restart through the constrained replay\s+pathway/i.test(surfaceHtml);
  const surfaceHomePage = await fetch(`${baseUrl}${surfaceHomePath}`);
  const surfaceHomeHtml = await surfaceHomePage.text();
  const surfaceHomeBlockedHostVisible = /page\.surface reset host/i.test(surfaceHomeHtml)
    && /blocked_reset_host/i.test(surfaceHomeHtml)
    && /activeSurface\.routeKey/.test(surfaceHomeHtml);
  const blockedHandoff = buildBlockedAuthoringHandoff({
    limitationType: "platform",
    goal: "project or execute canonical page.surface frontend behavior through constrained replay",
    attemptedAuthoringPath: "authoring.write(surface.create/process.create/type.create/projection.create/route.create/serve.create)",
    missingPrimitive: "page.surface currently exposes only the blocked reset host after removal of the false-authority renderer",
    minimumHumanAction: "rebuild canonical page.surface projection and execution through the replay lane instead of restoring shell-local authority",
    proof: [
      `authoring.write advertises surface.create: ${actionEnum.includes("surface.create")}`,
      `authoring.write advertises process.create: ${actionEnum.includes("process.create")}`,
      `authoring.write advertises projection.create: ${actionEnum.includes("projection.create")}`,
      `surface route ${surfaceRoutePath} served with HTTP ${surfacePage.status}`,
      `surface home route ${surfaceHomePath} served with HTTP ${surfaceHomePage.status}`,
      `surface route returned blocked reset host: ${surfaceBlockedHostVisible}`,
      `surface home route returned blocked reset host: ${surfaceHomeBlockedHostVisible}`
    ]
  });
  const finalState = await mcpToolCall(baseUrl, mcpServerId, token, "world.read", {
    view: "bootstrapState"
  }, 27);
  if (finalState.isError) {
    throw new Error(`world.read failed: ${JSON.stringify(finalState.structuredContent ?? null)}`);
  }

  return {
    ok: true,
    serverUrl: baseUrl,
    diagnostics: {
      runtimeProfile: diagnostics.activeProfile,
      authoringPolicy: diagnostics.authoringPolicy
    },
    authoringMatrix,
    replay: {
      runnerId,
      mcpServerId,
      surfaceRouteId,
      surfaceScreenRouteId,
      surfaceRoutePath,
      surfaceHomePath,
      surfaceHttpStatus: surfacePage.status,
      surfaceBlockedHostVisible,
      surfaceHomeHttpStatus: surfaceHomePage.status,
      surfaceHomeBlockedHostVisible,
      firstBlockedRung: "page.surface",
      blockedHandoff
    },
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
      surfaceScreenRoutePresent: finalState.structuredContent.routes.some(row => row.id === surfaceScreenRouteId && row.handler === "page.surface"),
      surfaceServedRoutePresent: finalState.structuredContent.servedRoutes.some(row => row.id === surfaceRouteId && row.serverRunner === runnerId),
      surfaceScreenServedRoutePresent: finalState.structuredContent.servedRoutes.some(row => row.id === surfaceScreenRouteId && row.serverRunner === runnerId),
      processPresent: finalState.structuredContent.witnesses
        ? finalState.structuredContent.witnesses.some(row => row.process === "desire.defineProcess" && row.body?.id === `${stamp}_process`)
        : true,
      typePresent: finalState.structuredContent.witnesses
        ? finalState.structuredContent.witnesses.some(row => row.process === "desire.defineType" && row.body?.id === `${stamp}_title_state`)
        : true,
      projectionPresent: finalState.structuredContent.witnesses
        ? finalState.structuredContent.witnesses.some(row => row.process === "desire.defineProjection" && row.body?.id === `${stamp}_projection`)
        : true,
      rootSurfacePresent: finalState.structuredContent.witnesses
        ? finalState.structuredContent.witnesses.some(row => row.process === "desire.defineSurface" && row.body?.id === surfaceRootId)
        : true
    },
    blockers: {
      firstBlocked: blockedHandoff
    }
  };
}

async function main(argv = process.argv.slice(2)) {
  const serverUrl = argv[0] || process.env.WITNESS_SERVER_URL || "http://127.0.0.1:3000";
  const username = process.env.WITNESS_BOOTSTRAP_USER || "aaron";
  const password = process.env.WITNESS_BOOTSTRAP_PASSWORD || "aaron";
  const result = await runReplayProbe(serverUrl, { username, password });
  console.log(JSON.stringify(result, null, 2));

  if (!result.stateChecks.runnerPresent) {
    process.exit(1);
  }
  if (result.replay.surfaceHttpStatus !== 200 || result.replay.surfaceHomeHttpStatus !== 200) {
    process.exit(1);
  }
  if (!result.replay.surfaceBlockedHostVisible || !result.replay.surfaceHomeBlockedHostVisible) {
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
