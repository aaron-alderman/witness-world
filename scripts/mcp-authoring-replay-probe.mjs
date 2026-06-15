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
  const rootWidgetId = `${stamp}_root`;
  const headingWidgetId = `${stamp}_heading`;
  const bodyWidgetId = `${stamp}_body`;
  const programId = `${stamp}_program`;
  const routeId = `${stamp}_route`;
  const routePath = `/${stamp}`;
  const surfaceRootId = `${stamp}_surface_root`;
  const surfaceLoginId = `${stamp}_surface_login`;
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

  created.push(await write("context.create", { id: contextId, label: "Replay Frontend" }, 10));
  created.push(await write("widget.create", {
    id: rootWidgetId,
    kind: "Page",
    title: "Replay Landing",
    context: contextId,
    attach: false
  }, 11));
  created.push(await write("widget.create", {
    id: headingWidgetId,
    kind: "Heading",
    context: contextId,
    parent: rootWidgetId,
    text: "Hello from MCP authoring",
    level: 1,
    order: 0
  }, 12));
  created.push(await write("widget.create", {
    id: bodyWidgetId,
    kind: "Text",
    context: contextId,
    parent: rootWidgetId,
    text: "This page was authored through MCP replay only.",
    order: 1
  }, 13));
  created.push(await write("frontendProgram.create", {
    id: programId,
    context: contextId,
    rootWidget: rootWidgetId
  }, 14));
  created.push(await write("route.create", {
    id: routeId,
    context: contextId,
    path: routePath,
    method: "GET",
    handler: "page.home",
    serves: programId,
    rootWidget: rootWidgetId,
    frontendProgram: programId
  }, 15));
  created.push(await write("serve.create", {
    serverRunner: runnerId,
    route: routeId
  }, 16));

  const creationErrors = created.filter(result => result?.isError);
  if (creationErrors.length) {
    throw new Error(`replay authoring write failed: ${JSON.stringify(creationErrors[0]?.structuredContent ?? null)}`);
  }

  const state = await mcpToolCall(baseUrl, mcpServerId, token, "world.read", {
    view: "bootstrapState"
  }, 17);
  if (state.isError) {
    throw new Error(`world.read failed: ${JSON.stringify(state.structuredContent ?? null)}`);
  }

  const page = await fetch(`${baseUrl}${routePath}`);
  const html = await page.text();
  const fallbackActive = /Widget rendering is not active in this runtime composition\./.test(html);
  const authoredContentVisible = /Hello from MCP authoring/.test(html);
  const widgetProjectionBlocked = fallbackActive || !authoredContentVisible
    ? buildBlockedAuthoringHandoff({
        goal: "project an MCP-authored widget page as live HTML",
        attemptedAuthoringPath: "authoring.write(widget.create/frontendProgram.create/route.create/serve.create)",
        missingPrimitive: "the authoring runtime composition does not currently install a live widget page renderer hook",
        minimumHumanAction: "install or expose the generic widget-page projection hook in the authoring runtime before using MCP replay as a live frontend proof",
        proof: [
          `the authored route ${routePath} serves with HTTP ${page.status}`,
          "the returned HTML is the shared inactive widget fallback instead of the authored widget tree"
        ]
      })
    : null;

  const authoringTool = listSupportedMcpTools().find(tool => tool.name === "authoring.write");
  const actionEnum = authoringTool?.inputSchema?.properties?.action?.enum ?? [];
  const createdSurfaces = await write("surface.create", [
    {
      id: surfaceRootId,
      surfaceKind: "app-root",
      context: contextId,
      children: [surfaceLoginId],
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
        title: "Replay surface login",
        subtitle: "Surface projection is live",
        heroTitle: "Hello from MCP surface authoring",
        heroBody: "This shell was authored through MCP replay only.",
        primaryActionLabel: "Continue",
        primaryActionHref: surfaceRoutePath
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

  const surfaceCreationErrors = [createdSurfaces, createdSurfaceRoute, createdSurfaceServe].filter(result => result?.isError);
  if (surfaceCreationErrors.length) {
    throw new Error(`replay surface authoring failed: ${JSON.stringify(surfaceCreationErrors[0]?.structuredContent ?? null)}`);
  }

  const surfacePage = await fetch(`${baseUrl}${surfaceRoutePath}`);
  const surfaceHtml = await surfacePage.text();
  const surfaceAuthoredContentVisible = /Replay surface login/.test(surfaceHtml) && /Hello from MCP surface authoring/.test(surfaceHtml);
  const surfaceBlocked = !surfaceAuthoredContentVisible
    ? buildBlockedAuthoringHandoff({
        goal: "author and serve a minimal page.surface shell through MCP-only replay",
        attemptedAuthoringPath: "authoring.write(surface.create/route.create/serve.create)",
        missingPrimitive: "surface authoring is exposed but the authored shell did not project live through page.surface",
        minimumHumanAction: "fix the generic surface authoring-to-page.surface projection path before advancing to richer frontend expressivity gaps",
        proof: [
          `authoring.write advertises surface.create: ${actionEnum.includes("surface.create")}`,
          `surface route ${surfaceRoutePath} served with HTTP ${surfacePage.status}`,
          `surface HTML contained authored shell content: ${surfaceAuthoredContentVisible}`
        ]
      })
    : null;

  return {
    ok: true,
    serverUrl: baseUrl,
    diagnostics: {
      runtimeProfile: diagnostics.activeProfile,
      authoringPolicy: diagnostics.authoringPolicy
    },
    replay: {
      runnerId,
      mcpServerId,
      routeId,
      routePath,
      surfaceRouteId,
      surfaceRoutePath,
      rootWidgetId,
      programId,
      httpStatus: page.status,
      fallbackActive,
      authoredContentVisible,
      surfaceHttpStatus: surfacePage.status,
      surfaceAuthoredContentVisible
    },
    stateChecks: {
      runnerPresent: state.structuredContent.serverRunners.some(row => row.id === runnerId),
      routePresent: state.structuredContent.routes.some(row => row.id === routeId && row.handler === "page.home"),
      servedRoutePresent: state.structuredContent.servedRoutes.some(row => row.id === routeId && row.serverRunner === runnerId),
      surfaceRoutePresent: state.structuredContent.routes.some(row => row.id === surfaceRouteId && row.handler === "page.surface"),
      surfaceServedRoutePresent: state.structuredContent.servedRoutes.some(row => row.id === surfaceRouteId && row.serverRunner === runnerId),
      programPresent: state.structuredContent.frontendPrograms.some(row => row.id === programId && row.rootWidget === rootWidgetId),
      rootWidgetPresent: state.structuredContent.widgets.some(row => row.id === rootWidgetId),
      rootSurfacePresent: state.structuredContent.witnesses
        ? state.structuredContent.witnesses.some(row => row.process === "desire.defineSurface" && row.body?.id === surfaceRootId)
        : true
    },
    blockers: {
      widgetProjection: widgetProjectionBlocked,
      surfaceAuthoring: surfaceBlocked
    }
  };
}

async function main(argv = process.argv.slice(2)) {
  const serverUrl = argv[0] || process.env.WITNESS_SERVER_URL || "http://127.0.0.1:3000";
  const username = process.env.WITNESS_BOOTSTRAP_USER || "aaron";
  const password = process.env.WITNESS_BOOTSTRAP_PASSWORD || "aaron";
  const result = await runReplayProbe(serverUrl, { username, password });
  console.log(JSON.stringify(result, null, 2));

  if (!result.stateChecks.runnerPresent || !result.stateChecks.routePresent || !result.stateChecks.servedRoutePresent) {
    process.exit(1);
  }
  if (result.replay.httpStatus !== 200 || result.replay.surfaceHttpStatus !== 200) {
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
