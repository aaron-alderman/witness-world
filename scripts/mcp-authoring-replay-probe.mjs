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

function assertMcpWriteOk(result, label) {
  if (result?.isError) {
    throw new Error(`${label} failed: ${JSON.stringify(result.structuredContent ?? null)}`);
  }
  return result;
}

function readSurfaceRuntimeManifest(html) {
  const match = String(html ?? "").match(/<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function exerciseAuthoredSurfaceRoutingInBrowser(baseUrl, {
  paths,
  ids
} = {}) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", error => {
    pageErrors.push(String(error?.stack || error?.message || error));
  });
  page.on("console", message => {
    if (message.type() !== "error") return;
    consoleErrors.push(message.text());
  });
  try {
    const waitForRuntime = async routeStateId => {
      try {
        await page.waitForFunction(id =>
          Boolean(window.__surfaceInteractionRuntime?.processRuntime?.value?.(id)),
        routeStateId);
      } catch (error) {
        const diagnostics = await page.evaluate(id => ({
          pathname: window.location.pathname,
          bootStarted: window.__surfaceRuntimeBootStarted === true,
          bootError: window.__surfaceRuntimeBootError ?? null,
          blocked: window.__surfaceInteractionRuntime?.blocked ?? null,
          activeSurfaceId: window.__surfaceInteractionRuntime?.activeSurfaceId ?? null,
          latestProbe: window.__surfaceInteractionRuntime?.latestProbe ?? null,
          routeStateValue: window.__surfaceInteractionRuntime?.processRuntime?.value?.(id) ?? null
        }), routeStateId);
        throw new Error(`surface runtime unavailable for ${routeStateId}: ${JSON.stringify({ ...diagnostics, pageErrors, consoleErrors })}`, { cause: error });
      }
    };
    const waitForSurfaceReady = async surfaceId => {
      await page.waitForFunction(id => {
        const probe = window.__surfaceInteractionRuntime?.latestProbe;
        return probe?.activeSurfaceId === id && Number(probe?.boundInteractionCount || 0) > 0;
      }, surfaceId);
    };
    const waitForState = async ({ routeStateId, routeState, authStatusId = null, authStatus = null }) => {
      await page.waitForFunction(args => {
        const runtime = window.__surfaceInteractionRuntime?.processRuntime;
        if (!runtime || typeof runtime.value !== "function") return false;
        if (runtime.value(args.routeStateId) !== args.routeState) return false;
        if (args.authStatusId && runtime.value(args.authStatusId) !== args.authStatus) return false;
        return true;
      }, { routeStateId, routeState, authStatusId, authStatus });
    };

    await page.goto(`${baseUrl}${paths.home}`, { waitUntil: "domcontentloaded" });
    await waitForRuntime(ids.routeState);
    await waitForSurfaceReady(ids.home);
    const directEntry = await page.evaluate(routeStateId => ({
      path: window.location.pathname,
      routeState: window.__surfaceInteractionRuntime?.processRuntime?.value?.(routeStateId) ?? null,
      homeVisible: Boolean(document.querySelector("#module-area")),
      runtimePresent: Boolean(window.__surfaceInteractionRuntime?.processRuntime)
    }), ids.routeState);

    await page.goto(`${baseUrl}${paths.login}`, { waitUntil: "domcontentloaded" });
    await waitForRuntime(ids.routeState);
    await waitForSurfaceReady(ids.login);
    const marker = await page.evaluate(() => {
      const token = `pathway-marker-${Math.random().toString(36).slice(2, 10)}`;
      window.__pathwayMarker = token;
      if (window.__surfaceInteractionRuntime) window.__surfaceInteractionRuntime.__pathwayMarker = token;
      return token;
    });

    await page.click(".ms-btn");
    await page.waitForFunction(() =>
      document.querySelector("#ms-btn-label")?.textContent?.includes("Signing in")
    );
    const pendingPhase = await page.evaluate(() => ({
      buttonLabel: document.querySelector("#ms-btn-label")?.textContent ?? null,
      submitDisabled: Boolean(document.querySelector("#login-submit")?.disabled)
    }));
    await page.waitForURL(`${baseUrl}${paths.home}`);
    await waitForState({
      routeStateId: ids.routeState,
      routeState: "home",
      authStatusId: ids.authStatus,
      authStatus: "signedIn"
    });
    await waitForSurfaceReady(ids.home);
    const loginTransition = await page.evaluate(args => ({
      path: window.location.pathname,
      routeState: window.__surfaceInteractionRuntime?.processRuntime?.value?.(args.routeStateId) ?? null,
      authStatus: window.__surfaceInteractionRuntime?.processRuntime?.value?.(args.authStatusId) ?? null,
      pendingLabel: args.pendingPhase?.buttonLabel ?? null,
      submitDisabledDuringPending: args.pendingPhase?.submitDisabled === true,
      markerPreserved: window.__pathwayMarker === args.marker
        && window.__surfaceInteractionRuntime?.__pathwayMarker === args.marker,
      loginGone: !document.querySelector("#view-login"),
      homeVisible: Boolean(document.querySelector("#module-area"))
    }), {
      routeStateId: ids.routeState,
      authStatusId: ids.authStatus,
      marker,
      pendingPhase
    });

    await page.click("#user-prof");
    await page.waitForFunction(() => !document.querySelector("#up-menu")?.hidden);
    await page.click("#up-menu-signout");
    await page.waitForURL(`${baseUrl}${paths.signout}`);
    await waitForState({
      routeStateId: ids.routeState,
      routeState: "signout",
      authStatusId: ids.authStatus,
      authStatus: "signedOut"
    });
    await waitForSurfaceReady(ids.signout);
    const signoutTransition = await page.evaluate(args => ({
      path: window.location.pathname,
      routeState: window.__surfaceInteractionRuntime?.processRuntime?.value?.(args.routeStateId) ?? null,
      authStatus: window.__surfaceInteractionRuntime?.processRuntime?.value?.(args.authStatusId) ?? null,
      markerPreserved: window.__pathwayMarker === args.marker
        && window.__surfaceInteractionRuntime?.__pathwayMarker === args.marker,
      signoutVisible: Boolean(document.querySelector("#view-signout"))
    }), {
      routeStateId: ids.routeState,
      authStatusId: ids.authStatus,
      marker
    });

    await page.getByRole("button", { name: "Sign back in" }).click();
    await page.waitForURL(`${baseUrl}${paths.login}`);
    await waitForState({
      routeStateId: ids.routeState,
      routeState: "login",
      authStatusId: ids.authStatus,
      authStatus: "idle"
    });
    await waitForSurfaceReady(ids.login);
    const signBackTransition = await page.evaluate(args => ({
      path: window.location.pathname,
      routeState: window.__surfaceInteractionRuntime?.processRuntime?.value?.(args.routeStateId) ?? null,
      authStatus: window.__surfaceInteractionRuntime?.processRuntime?.value?.(args.authStatusId) ?? null,
      markerPreserved: window.__pathwayMarker === args.marker
        && window.__surfaceInteractionRuntime?.__pathwayMarker === args.marker,
      loginVisible: Boolean(document.querySelector("#view-login"))
    }), {
      routeStateId: ids.routeState,
      authStatusId: ids.authStatus,
      marker
    });

    return {
      directEntry,
      loginTransition,
      signoutTransition,
      signBackTransition
    };
  } finally {
    await page.close();
    await browser.close();
  }
}

async function authorEngentusShellFlowThroughMcp(write, {
  runnerId,
  stamp
}) {
  const contextId = `${stamp}_engentus_context`;
  const basePath = `/${stamp}-engentus`;
  const ids = {
    routeState: `${stamp}_engentus_route_state`,
    authStatus: `${stamp}_engentus_auth_status`,
    profileMenuVisible: `${stamp}_engentus_profile_menu_visible`,
    process: `${stamp}_engentus_shell_navigation`,
    signIn: `${stamp}_engentus_sign_in`,
    signOut: `${stamp}_engentus_sign_out`,
    signBackIn: `${stamp}_engentus_sign_back_in`,
    root: `${stamp}_engentus_root`,
    login: `${stamp}_engentus_login`,
    loginBook: `${stamp}_engentus_login_book`,
    loginTitle: `${stamp}_engentus_login_title`,
    microsoftButton: `${stamp}_engentus_ms_button`,
    microsoftLabel: `${stamp}_engentus_ms_label`,
    loginSubmit: `${stamp}_engentus_login_submit`,
    loginSubmitLabel: `${stamp}_engentus_login_submit_label`,
    home: `${stamp}_engentus_home`,
    homeTitle: `${stamp}_engentus_home_title`,
    profileButton: `${stamp}_engentus_profile_button`,
    profileMenu: `${stamp}_engentus_profile_menu`,
    profileSignout: `${stamp}_engentus_profile_signout`,
    signout: `${stamp}_engentus_signout`,
    signoutBook: `${stamp}_engentus_signout_book`,
    signoutTitle: `${stamp}_engentus_signout_title`,
    signBackButton: `${stamp}_engentus_sign_back_button`,
    rootRoute: `${stamp}_engentus_root_route`,
    screenRoute: `${stamp}_engentus_screen_route`,
    rootServe: `${stamp}_engentus_root_serve`,
    screenServe: `${stamp}_engentus_screen_serve`
  };
  const paths = {
    root: basePath,
    login: `${basePath}/login`,
    home: `${basePath}/home`,
    signout: `${basePath}/signout`
  };

  assertMcpWriteOk(await write("context.create", {
    id: contextId,
    label: "MCP-authored Engentus shell flow"
  }, 100), "engentus context.create");

  for (const [offset, body] of [
    {
      id: ids.routeState,
      role: "state",
      valueType: "text",
      initial: "login"
    },
    {
      id: ids.authStatus,
      role: "state",
      valueType: "text",
      initial: "idle"
    },
    {
      id: ids.profileMenuVisible,
      role: "state",
      valueType: "boolean",
      initial: false
    }
  ].entries()) {
    assertMcpWriteOk(await write("type.create", body, 101 + offset), `engentus type.create ${body.id}`);
  }

  for (const [offset, body] of [
    { id: ids.signIn, role: "event" },
    { id: ids.signOut, role: "event" },
    { id: ids.signBackIn, role: "event" }
  ].entries()) {
    assertMcpWriteOk(await write("message.create", body, 110 + offset), `engentus message.create ${body.id}`);
  }

  assertMcpWriteOk(await write("process.create", {
    id: ids.process,
    state: [ids.routeState, ids.authStatus, ids.profileMenuVisible],
    handles: [ids.signIn, ids.signOut, ids.signBackIn],
    emits: [],
    rules: [
      {
        trigger: ids.signIn,
        steps: [
          { kind: "setState", state: ids.authStatus, value: "pending" },
          { kind: "delay", ms: 1250 },
          { kind: "setState", state: ids.authStatus, value: "folding" },
          { kind: "delay", ms: 920 },
          { kind: "setState", state: ids.routeState, value: "home" },
          { kind: "setState", state: ids.authStatus, value: "signedIn" }
        ]
      },
      {
        trigger: ids.signOut,
        steps: [
          { kind: "setState", state: ids.profileMenuVisible, value: false },
          { kind: "setState", state: ids.authStatus, value: "signingOut" },
          { kind: "setState", state: ids.routeState, value: "signout" },
          { kind: "delay", ms: 950 },
          { kind: "setState", state: ids.authStatus, value: "signedOut" }
        ]
      },
      {
        trigger: ids.signBackIn,
        steps: [
          { kind: "setState", state: ids.routeState, value: "login" },
          { kind: "setState", state: ids.authStatus, value: "idle" }
        ]
      }
    ]
  }, 120), "engentus process.create");

  const surfaceDocs = [
    {
      id: ids.root,
      context: contextId,
      surfaceKind: "app-root",
      processRef: ids.process,
      children: [ids.login, ids.home, ids.signout]
    },
    {
      id: ids.login,
      context: contextId,
      surfaceKind: "auth-screen",
      processRef: ids.process,
      props: {
        domId: "view-login",
        routeKey: "login",
        routePath: paths.login,
        documentTitle: "Welcome back"
      },
      bindings: [
        { prop: "routeUnderlay", source: { kind: "state", state: ids.authStatus, map: { folding: "home", default: "" } } }
      ],
      children: [ids.loginBook]
    },
    {
      id: ids.loginBook,
      context: contextId,
      surfaceKind: "region",
      className: "auth-book",
      props: { domId: "login-auth-book" },
      bindings: [
        { prop: "className", source: { kind: "state", state: ids.authStatus, map: { folding: "folding", default: "" } } }
      ],
      children: [ids.loginTitle, ids.microsoftButton, ids.loginSubmit]
    },
    {
      id: ids.loginTitle,
      context: contextId,
      surfaceKind: "screen-header",
      props: { text: "Welcome back" }
    },
    {
      id: ids.microsoftButton,
      context: contextId,
      surfaceKind: "action",
      className: "ms-btn",
      props: { tag: "button", domId: "ms-btn" },
      bindings: [
        { prop: "className", source: { kind: "state", state: ids.authStatus, map: { pending: "pending", folding: "pending", default: "" } } }
      ],
      interactions: [
        { target: "self", event: "click", action: { kind: "deliver", message: ids.signIn } }
      ],
      children: [ids.microsoftLabel]
    },
    {
      id: ids.microsoftLabel,
      context: contextId,
      surfaceKind: "text",
      props: { domId: "ms-btn-label", text: "Sign in with Microsoft" },
      bindings: [
        { prop: "text", source: { kind: "state", state: ids.authStatus, map: { pending: "Signing in…", folding: "Signing in…", default: "Sign in with Microsoft" } } }
      ]
    },
    {
      id: ids.loginSubmit,
      context: contextId,
      surfaceKind: "action",
      className: "auth-submit",
      props: { tag: "button", domId: "login-submit" },
      bindings: [
        { prop: "disabled", source: { kind: "state", state: ids.authStatus, map: { pending: true, folding: true, default: false } } }
      ],
      children: [ids.loginSubmitLabel]
    },
    {
      id: ids.loginSubmitLabel,
      context: contextId,
      surfaceKind: "text",
      props: { domId: "login-submit-label", text: "Sign in" }
    },
    {
      id: ids.home,
      context: contextId,
      surfaceKind: "app-shell",
      processRef: ids.process,
      props: {
        domId: "module-area",
        routeKey: "home",
        routePath: paths.home,
        title: "Analysis Modules",
        subtitle: "Select a module to begin analysis"
      },
      children: [ids.homeTitle, ids.profileButton, ids.profileMenu]
    },
    {
      id: ids.homeTitle,
      context: contextId,
      surfaceKind: "screen-header",
      props: { text: "Analysis Modules" }
    },
    {
      id: ids.profileButton,
      context: contextId,
      surfaceKind: "action",
      props: { tag: "button", domId: "user-prof", label: "AA" },
      interactions: [
        { target: "self", event: "click", action: { kind: "setState", state: ids.profileMenuVisible, value: { kind: "toggleState", state: ids.profileMenuVisible } } }
      ]
    },
    {
      id: ids.profileMenu,
      context: contextId,
      surfaceKind: "menu",
      props: { domId: "up-menu", hidden: true },
      bindings: [
        { prop: "visible", source: { kind: "state", state: ids.profileMenuVisible } }
      ],
      children: [ids.profileSignout]
    },
    {
      id: ids.profileSignout,
      context: contextId,
      surfaceKind: "action",
      className: "up-mi up-mi-signout",
      props: { tag: "button", domId: "up-menu-signout", label: "Sign out" },
      interactions: [
        { target: "self", event: "click", action: { kind: "deliver", message: ids.signOut } }
      ]
    },
    {
      id: ids.signout,
      context: contextId,
      surfaceKind: "auth-screen",
      processRef: ids.process,
      props: {
        domId: "view-signout",
        routeKey: "signout",
        routePath: paths.signout,
        documentTitle: "You've been signed out"
      },
      bindings: [
        { prop: "routeUnderlay", source: { kind: "state", state: ids.authStatus, map: { signingOut: "home", default: "" } } }
      ],
      children: [ids.signoutBook]
    },
    {
      id: ids.signoutBook,
      context: contextId,
      surfaceKind: "region",
      className: "auth-book",
      props: { domId: "signout-auth-book" },
      bindings: [
        { prop: "className", source: { kind: "state", state: ids.authStatus, map: { signingOut: "incoming", default: "" } } }
      ],
      children: [ids.signoutTitle, ids.signBackButton]
    },
    {
      id: ids.signoutTitle,
      context: contextId,
      surfaceKind: "screen-header",
      props: { text: "You've been signed out" }
    },
    {
      id: ids.signBackButton,
      context: contextId,
      surfaceKind: "action",
      className: "auth-submit",
      props: { tag: "button", domId: "sign-back-in", label: "Sign back in", href: paths.login },
      interactions: [
        { target: "self", event: "click", action: { kind: "deliver", message: ids.signBackIn } }
      ]
    }
  ];

  assertMcpWriteOk(await write("surface.create", surfaceDocs, 130), "engentus surface.create");

  for (const [offset, body] of [
    {
      id: ids.rootRoute,
      context: contextId,
      path: paths.root,
      method: "GET",
      handler: "page.surface",
      serves: ids.root,
      rootSurface: ids.root,
      defaultScreen: "login",
      routeState: { process: ids.process, state: ids.routeState }
    },
    {
      id: ids.screenRoute,
      context: contextId,
      path: `${basePath}/:screen`,
      method: "GET",
      handler: "page.surface",
      serves: ids.root,
      rootSurface: ids.root,
      defaultScreen: "login",
      routeState: { process: ids.process, state: ids.routeState }
    }
  ].entries()) {
    assertMcpWriteOk(await write("route.create", body, 150 + offset), `engentus route.create ${body.id}`);
  }

  for (const [offset, route] of [ids.rootRoute, ids.screenRoute].entries()) {
    assertMcpWriteOk(await write("serve.create", {
      serverRunner: runnerId,
      route
    }, 160 + offset), `engentus serve.create ${route}`);
  }

  return {
    contextId,
    basePath,
    ids,
    paths,
    authoredSurfaceCount: surfaceDocs.length
  };
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
  const projectionSourceTypeId = `${stamp}_projection_source`;
  const surfaceProjectionId = `${stamp}_surface_projection`;
  const routeStateProcessId = `${stamp}_route_process`;
  const routeStateMessageId = `${stamp}_route_message`;
  const surfaceStaticProjectionTextId = `${stamp}_surface_static_projection_text`;
  const surfaceAlternateProjectionTextId = `${stamp}_surface_alternate_projection_text`;
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

  const createdProjectionSourceType = await write("type.create", {
    id: projectionSourceTypeId,
    role: "state",
    valueType: "text",
    initial: "projection-ready"
  }, 13);

  const createdProcess = await write("process.create", {
    id: routeStateProcessId,
    state: [routeStateTypeId, projectionSourceTypeId],
    handles: [routeStateMessageId],
    emits: [],
    rules: []
  }, 14);

  const createdMessage = await write("message.create", {
    id: routeStateMessageId,
    role: "event",
    writes: {
      [routeStateTypeId]: surfaceRouteAltPath
    }
  }, 15);

  const createdProjection = await write("projection.create", {
    id: surfaceProjectionId,
    projectionKind: "format",
    source: projectionSourceTypeId,
    props: {
      prefix: "Derived surface label: "
    }
  }, 16);

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
      },
      children: [surfaceStaticProjectionTextId]
    },
    {
      id: surfaceStaticProjectionTextId,
      surfaceKind: "text",
      context: contextId,
      props: {
        domId: "surface-static-projection-text",
        text: "Pending projection"
      },
      bindings: [
        { prop: "text", source: { kind: "projection", projection: surfaceProjectionId } }
      ]
    },
    {
      id: surfaceAlternateId,
      surfaceKind: "content-panel",
      context: contextId,
      props: {
        routePath: surfaceRouteAltPath,
        title: "Canonical alternate surface",
        body: "This alternate text was projected from the same root through route-selected surface output."
      },
      children: [surfaceAlternateProjectionTextId]
    },
    {
      id: surfaceAlternateProjectionTextId,
      surfaceKind: "text",
      context: contextId,
      props: {
        domId: "surface-alternate-projection-text",
        text: "Pending projection"
      },
      bindings: [
        { prop: "text", source: { kind: "projection", projection: surfaceProjectionId } }
      ]
    }
  ], 17);

  const createdSurfaceRoute = await write("route.create", {
    id: surfaceRouteId,
    context: contextId,
    path: surfaceRoutePath,
    method: "GET",
    handler: "page.surface",
    serves: surfaceRootId,
    rootSurface: surfaceRootId,
    defaultScreen: surfaceStaticId
  }, 18);

  const createdSurfaceAltRoute = await write("route.create", {
    id: surfaceRouteAltId,
    context: contextId,
    path: surfaceRouteAltPath,
    method: "GET",
    handler: "page.surface",
    serves: surfaceRootId,
    rootSurface: surfaceRootId,
    defaultScreen: surfaceAlternateId
  }, 19);

  const createdSurfaceServe = await write("serve.create", {
    serverRunner: runnerId,
    route: surfaceRouteId
  }, 20);

  const createdSurfaceAltServe = await write("serve.create", {
    serverRunner: runnerId,
    route: surfaceRouteAltId
  }, 21);

  const creationErrors = [
    createdType,
    createdProjectionSourceType,
    createdProcess,
    createdMessage,
    createdProjection,
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
    && /status=composed_static_surface/i.test(surfaceHtml);
  const routeSelectedSurfaceVisible = staticSurfaceProjectionVisible
    && new RegExp(`activeSurface=${surfaceStaticId}`).test(surfaceHtml)
    && /Canonical alternate surface/.test(alternateSurfaceHtml)
    && /This alternate text was projected from the same root through route-selected surface output\./.test(alternateSurfaceHtml)
    && new RegExp(`activeSurface=${surfaceAlternateId}`).test(alternateSurfaceHtml);
  const surfaceProjectionPairingVisible = /Derived surface label: projection-ready/.test(surfaceHtml)
    && /Derived surface label: projection-ready/.test(alternateSurfaceHtml);
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
    if (surfaceProjectionPairingVisible) {
      rungResults.push(buildRungResult("surfaceProjectionPairing", "supported", "page.surface now consumes authored projection bindings through the shared runtime projection rules"));
    } else {
      firstBlocked = buildBlockedAuthoringHandoff({
        limitationType: "platform",
        goal: "consume authored projection bindings on canonical page.surface routes",
        attemptedAuthoringPath: "authoring.write(type.create/projection.create/surface.create/route.create/serve.create)",
        missingPrimitive: "page.surface could not prove authored projection consumption on the canonical route host",
        minimumHumanAction: "extend the shared page.surface projection floor so initial route output and runtime fragments honor authored projection bindings without app-local render glue",
        proof: [
          `type.create succeeded for ${projectionSourceTypeId}: ${createdProjectionSourceType?.isError !== true}`,
          `projection.create succeeded for ${surfaceProjectionId}: ${createdProjection?.isError !== true}`,
          `primary route projection text visible: ${/Derived surface label: projection-ready/.test(surfaceHtml)}`,
          `alternate route projection text visible: ${/Derived surface label: projection-ready/.test(alternateSurfaceHtml)}`
        ]
      });
      rungResults.push(buildRungResult("surfaceProjectionPairing", "blocked", firstBlocked.missingPrimitive));
      firstBlockedRung = "surfaceProjectionPairing";
    }
  }

  const engentusReauthoring = await authorEngentusShellFlowThroughMcp(write, {
    runnerId,
    stamp
  });
  const engentusLoginPage = await fetch(`${baseUrl}${engentusReauthoring.paths.login}`);
  const engentusLoginHtml = await engentusLoginPage.text();
  const engentusHomePage = await fetch(`${baseUrl}${engentusReauthoring.paths.home}`);
  const engentusHomeHtml = await engentusHomePage.text();
  const engentusSignoutPage = await fetch(`${baseUrl}${engentusReauthoring.paths.signout}`);
  const engentusSignoutHtml = await engentusSignoutPage.text();
  const engentusIds = engentusReauthoring.ids;
  const loginManifest = readSurfaceRuntimeManifest(engentusLoginHtml);
  const homeManifest = readSurfaceRuntimeManifest(engentusHomeHtml);
  const signoutManifest = readSurfaceRuntimeManifest(engentusSignoutHtml);
  const loginRuntimeIds = new Set(loginManifest?.diagnostics?.includedRuntimeIds ?? []);
  const homeRuntimeIds = new Set(homeManifest?.diagnostics?.includedRuntimeIds ?? []);
  const signoutRuntimeIds = new Set(signoutManifest?.diagnostics?.includedRuntimeIds ?? []);
  engentusReauthoring.servedChecks = {
    loginHttpStatus: engentusLoginPage.status,
    homeHttpStatus: engentusHomePage.status,
    signoutHttpStatus: engentusSignoutPage.status,
    loginVisible: /Welcome back/.test(engentusLoginHtml) && /ms-btn/.test(engentusLoginHtml),
    homeVisible: /Analysis Modules/.test(engentusHomeHtml) && /module-area/.test(engentusHomeHtml),
    signoutVisible: /You've been signed out/.test(engentusSignoutHtml) && /sign-back-in/.test(engentusSignoutHtml),
    routeStateDescriptorPresent: /routeState/.test(engentusLoginHtml),
    loginManifestPresent: Boolean(loginManifest),
    homeManifestPresent: Boolean(homeManifest),
    signoutManifestPresent: Boolean(signoutManifest),
    loginRouteLocalTransport: loginRuntimeIds.has(engentusIds.routeState)
      && loginRuntimeIds.has(engentusIds.authStatus)
      && loginRuntimeIds.has(engentusIds.signIn)
      && !loginRuntimeIds.has(engentusIds.profileMenuVisible)
      && !loginRuntimeIds.has(engentusIds.signOut)
      && !loginRuntimeIds.has(engentusIds.signBackIn),
    homeRouteLocalTransport: homeRuntimeIds.has(engentusIds.routeState)
      && homeRuntimeIds.has(engentusIds.profileMenuVisible)
      && homeRuntimeIds.has(engentusIds.signOut)
      && !homeRuntimeIds.has(engentusIds.signIn)
      && !homeRuntimeIds.has(engentusIds.signBackIn),
    signoutRouteLocalTransport: signoutRuntimeIds.has(engentusIds.routeState)
      && signoutRuntimeIds.has(engentusIds.signBackIn)
      && !signoutRuntimeIds.has(engentusIds.profileMenuVisible)
      && !signoutRuntimeIds.has(engentusIds.signIn),
    loginManifestBytes: loginManifest?.diagnostics?.serializedBytes ?? 0,
    homeManifestBytes: homeManifest?.diagnostics?.serializedBytes ?? 0,
    signoutManifestBytes: signoutManifest?.diagnostics?.serializedBytes ?? 0
  };
  engentusReauthoring.browserChecks = await exerciseAuthoredSurfaceRoutingInBrowser(baseUrl, {
    paths: engentusReauthoring.paths,
    ids: engentusReauthoring.ids
  });

  if (!firstBlocked) {
    const browserChecks = engentusReauthoring.browserChecks;
    const directEntrySupported = browserChecks?.directEntry?.path === engentusReauthoring.paths.home
      && browserChecks?.directEntry?.routeState === "home"
      && browserChecks?.directEntry?.homeVisible === true
      && browserChecks?.directEntry?.runtimePresent === true;
    if (directEntrySupported) {
      rungResults.push(buildRungResult("urlToRouteState", "supported", "direct route entry synchronizes URL state into authored route state on page.surface"));
    } else {
      firstBlocked = buildBlockedAuthoringHandoff({
        limitationType: "platform",
        goal: "synchronize URL state into authored route state on canonical page.surface",
        attemptedAuthoringPath: "authoring.write(surface.create/process.create/type.create/message.create/route.create/serve.create)",
        missingPrimitive: "page.surface could not prove canonical URL -> route-state synchronization on direct route entry",
        minimumHumanAction: "fix the generic page.surface runtime so direct route entry initializes authored route state from URL state without surface-specific browser facades",
        proof: [
          `type.create succeeded for ${routeStateTypeId}: ${createdType?.isError !== true}`,
          `process.create succeeded for ${routeStateProcessId}: ${createdProcess?.isError !== true}`,
          `message.create succeeded for ${routeStateMessageId}: ${createdMessage?.isError !== true}`,
          `home direct-entry path observed: ${browserChecks?.directEntry?.path ?? ""}`,
          `home direct-entry route state observed: ${browserChecks?.directEntry?.routeState ?? ""}`,
          `home direct-entry visible shell observed: ${browserChecks?.directEntry?.homeVisible === true}`
        ]
      });
      rungResults.push(buildRungResult("urlToRouteState", "blocked", firstBlocked.missingPrimitive));
      firstBlockedRung = "urlToRouteState";
    }
  }

  if (!firstBlocked) {
    const browserChecks = engentusReauthoring.browserChecks;
    const interactionSupported = browserChecks?.loginTransition?.routeState === "home"
      && browserChecks?.loginTransition?.authStatus === "signedIn"
      && browserChecks?.signoutTransition?.routeState === "signout"
      && browserChecks?.signoutTransition?.authStatus === "signedOut"
      && browserChecks?.signBackTransition?.routeState === "login"
      && browserChecks?.signBackTransition?.authStatus === "idle";
    if (interactionSupported) {
      rungResults.push(buildRungResult("interactionToRouteState", "supported", "authored page.surface interactions transition route state and dependent shell state"));
    } else {
      firstBlocked = buildBlockedAuthoringHandoff({
        limitationType: "platform",
        goal: "transition authored route state from page.surface interactions",
        attemptedAuthoringPath: "authoring.write(surface.create/process.create/type.create/message.create/route.create/serve.create)",
        missingPrimitive: "page.surface could not prove interaction-driven authored route-state transitions",
        minimumHumanAction: "fix the generic page.surface interaction runtime so authored interactions deliver and apply route-state transitions without app-local runtime glue",
        proof: [
          `login interaction route state observed: ${browserChecks?.loginTransition?.routeState ?? ""}`,
          `login interaction auth status observed: ${browserChecks?.loginTransition?.authStatus ?? ""}`,
          `signout interaction route state observed: ${browserChecks?.signoutTransition?.routeState ?? ""}`,
          `sign back interaction route state observed: ${browserChecks?.signBackTransition?.routeState ?? ""}`
        ]
      });
      rungResults.push(buildRungResult("interactionToRouteState", "blocked", firstBlocked.missingPrimitive));
      firstBlockedRung = "interactionToRouteState";
    }
  }

  if (!firstBlocked) {
    const browserChecks = engentusReauthoring.browserChecks;
    const routeStateToUrlSupported = browserChecks?.loginTransition?.path === engentusReauthoring.paths.home
      && browserChecks?.signoutTransition?.path === engentusReauthoring.paths.signout
      && browserChecks?.signBackTransition?.path === engentusReauthoring.paths.login;
    if (routeStateToUrlSupported) {
      rungResults.push(buildRungResult("routeStateToUrl", "supported", "authored route-state transitions synchronize back into browser URL state"));
    } else {
      firstBlocked = buildBlockedAuthoringHandoff({
        limitationType: "platform",
        goal: "synchronize authored route-state transitions back into the browser URL on page.surface",
        attemptedAuthoringPath: "authoring.write(surface.create/process.create/type.create/message.create/route.create/serve.create)",
        missingPrimitive: "page.surface could not prove route-state -> URL synchronization",
        minimumHumanAction: "fix the generic route-state runtime so authored route-state transitions update the browser URL without app-specific navigation glue",
        proof: [
          `login transition path observed: ${browserChecks?.loginTransition?.path ?? ""}`,
          `signout transition path observed: ${browserChecks?.signoutTransition?.path ?? ""}`,
          `sign-back transition path observed: ${browserChecks?.signBackTransition?.path ?? ""}`
        ]
      });
      rungResults.push(buildRungResult("routeStateToUrl", "blocked", firstBlocked.missingPrimitive));
      firstBlockedRung = "routeStateToUrl";
    }
  }

  if (!firstBlocked) {
    const browserChecks = engentusReauthoring.browserChecks;
    const sameDocumentRefreshSupported = browserChecks?.loginTransition?.markerPreserved === true
      && browserChecks?.signoutTransition?.markerPreserved === true
      && browserChecks?.signBackTransition?.markerPreserved === true;
    if (sameDocumentRefreshSupported) {
      rungResults.push(buildRungResult("sameDocumentSurfaceRefresh", "supported", "route-state transitions refresh authored page.surface output without losing same-document runtime state"));
    } else {
      firstBlocked = buildBlockedAuthoringHandoff({
        limitationType: "platform",
        goal: "refresh page.surface output after route-state changes without losing same-document runtime state",
        attemptedAuthoringPath: "authoring.write(surface.create/process.create/type.create/message.create/route.create/serve.create)",
        missingPrimitive: "page.surface could not prove same-document surface refresh after authored route-state transitions",
        minimumHumanAction: "fix the generic page.surface refresh path so route-state transitions preserve same-document runtime state instead of falling back to full page reloads",
        proof: [
          `login transition preserved same-document marker: ${browserChecks?.loginTransition?.markerPreserved === true}`,
          `signout transition preserved same-document marker: ${browserChecks?.signoutTransition?.markerPreserved === true}`,
          `sign-back transition preserved same-document marker: ${browserChecks?.signBackTransition?.markerPreserved === true}`
        ]
      });
      rungResults.push(buildRungResult("sameDocumentSurfaceRefresh", "blocked", firstBlocked.missingPrimitive));
      firstBlockedRung = "sameDocumentSurfaceRefresh";
    }
  }

  if (!firstBlocked) {
    const browserChecks = engentusReauthoring.browserChecks;
    const interactiveExecutionSupported = String(browserChecks?.loginTransition?.pendingLabel ?? "").includes("Signing in")
      && browserChecks?.loginTransition?.submitDisabledDuringPending === true
      && browserChecks?.loginTransition?.homeVisible === true
      && browserChecks?.signoutTransition?.signoutVisible === true
      && browserChecks?.signBackTransition?.loginVisible === true;
    if (interactiveExecutionSupported) {
      rungResults.push(buildRungResult("interactiveSurfaceExecution", "supported", "page.surface executes authored interactive process flow through shared runtime rules"));
    } else {
      firstBlocked = buildBlockedAuthoringHandoff({
        limitationType: "platform",
        goal: "execute interactive authored page.surface flow through shared runtime rules",
        attemptedAuthoringPath: "authoring.write(surface.create/process.create/type.create/message.create/route.create/serve.create)",
        missingPrimitive: "page.surface could not prove interactive authored execution through the shared runtime",
        minimumHumanAction: "fix the generic page.surface execution path so authored process-driven interactions render and settle without hidden app-local runtime helpers",
        proof: [
          `login pending label observed: ${browserChecks?.loginTransition?.pendingLabel ?? ""}`,
          `login submit disabled during pending: ${browserChecks?.loginTransition?.submitDisabledDuringPending === true}`,
          `login transition home visible: ${browserChecks?.loginTransition?.homeVisible === true}`,
          `signout transition visible: ${browserChecks?.signoutTransition?.signoutVisible === true}`,
          `sign-back transition visible: ${browserChecks?.signBackTransition?.loginVisible === true}`
        ]
      });
      rungResults.push(buildRungResult("interactiveSurfaceExecution", "blocked", firstBlocked.missingPrimitive));
      firstBlockedRung = "interactiveSurfaceExecution";
    }
  }

  const finalState = await mcpToolCall(baseUrl, mcpServerId, token, "world.read", {
    view: "bootstrapState"
  }, 22);
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
    surfaceProjectionPairingVisible,
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
    engentusReauthoring,
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
      surfaceProjectionPresent: finalState.structuredContent.witnesses
        ? finalState.structuredContent.witnesses.some(row => row.process === "desire.defineProjection" && row.body?.id === surfaceProjectionId)
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
  if (!result.pathwayProbe.surfaceProjectionPairingVisible) {
    process.exit(1);
  }
  if (!result.engentusReauthoring?.servedChecks?.loginVisible) {
    process.exit(1);
  }
  if (!result.engentusReauthoring?.servedChecks?.homeVisible) {
    process.exit(1);
  }
  if (!result.engentusReauthoring?.servedChecks?.signoutVisible) {
    process.exit(1);
  }
  if (result.pathwayProbe.firstBlockedRung) {
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
