import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";

async function tempRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "witness-bootstrap-host-"));
}

function cookieHeader(setCookie) {
  return (setCookie || "").split(";")[0];
}

async function openSession(serverUrl, { username = "aaron", password = username } = {}) {
  const response = await fetch(`${serverUrl}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return {
    response,
    body: await response.json(),
    cookie: cookieHeader(response.headers.get("set-cookie"))
  };
}

async function startBlankServer() {
  const world = createWorld();
  declareBackendHost(world, { actor: "system", id: "backendHost" });
  declareFrontendHost(world, { actor: "system", id: "frontendHost" });
  const server = await startServer(world, {
    actor: "system",
    runtimeRoot: await tempRuntimeRoot()
  });
  assert.equal(server.ok, true);
  return { world, server };
}

test("blank world falls back to bootstrap instead of failing hard", async () => {
  const { server } = await startBlankServer();
  try {
    const rootHtml = await fetch(`${server.url}/`).then(response => response.text());
    const bootstrapHtml = await fetch(`${server.url}/_bootstrap`).then(response => response.text());
    const model = await fetch(`${server.url}/api/bootstrap-model`).then(response => response.json());

    assert.match(rootHtml, /Recover And Author The App Boundary/);
    assert.match(bootstrapHtml, /Semi-Internal Bootstrap Seam/);
    assert.equal(model.appReady, false);
    assert(model.supportedHandlers.includes("page.home"));
    assert(model.supportedFrontendOps.includes("renderCollection"));
  } finally {
    await server.close();
  }
});

test("bootstrap write auth allows first identity unauthenticated and then requires session", async () => {
  const { server } = await startBlankServer();
  try {
    const createdIdentity = await fetch(`${server.url}/api/identities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "identity.aaron",
        actor: "aaron",
        label: "Aaron",
        username: "aaron",
        password: "aaron",
        homePerspective: "aaron:personal"
      })
    });
    assert.equal(createdIdentity.status, 201);

    const denied = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "root", kind: "Page", title: "Blocked", attach: false })
    });
    assert.equal(denied.status, 401);

    const login = await openSession(server.url);
    assert.equal(login.response.status, 200);

    const createdWidget = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ id: "root", kind: "Page", title: "Authorized", attach: false })
    });
    assert.equal(createdWidget.status, 201);
  } finally {
    await server.close();
  }
});

test("a bootstrap-authored runner and home route take over without restarting the server", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body) => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    assert.equal((await post("/api/widgets", { id: "bootstrap_home", kind: "Page", title: "Bootstrap App", attach: false })).status, 201);
    assert.equal((await post("/api/server-runners", {
      id: "demo_server",
      backendHost: "backendHost",
      frontendHost: "frontendHost"
    })).status, 201);
    assert.equal((await post("/api/routes", {
      id: "home_route",
      path: "/",
      serves: "homePage",
      method: "GET",
      handler: "page.home",
      rootWidget: "bootstrap_home",
      page: "home",
      liveProjection: true
    })).status, 201);
    assert.equal((await post("/api/serve-mounts", {
      serverRunner: "demo_server",
      route: "home_route"
    })).status, 201);

    const html = await fetch(`${server.url}/`).then(response => response.text());
    assert.match(html, /Bootstrap App/);
    assert.doesNotMatch(html, /Recover And Author The App Boundary/);
  } finally {
    await server.close();
  }
});

test("tutorial progress syncs into the authenticated session store", async () => {
  const { server } = await startBlankServer();
  try {
    await fetch(`${server.url}/api/identities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "identity.aaron",
        actor: "aaron",
        label: "Aaron",
        username: "aaron",
        password: "aaron",
        homePerspective: "aaron:personal"
      })
    });

    const login = await openSession(server.url);
    assert.equal(login.response.status, 200);

    const empty = await fetch(`${server.url}/api/tutorial-progress/todo-from-scratch`, {
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    assert.equal(empty.progress, null);

    const written = await fetch(`${server.url}/api/tutorial-progress/todo-from-scratch`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({
        tutorialId: "todo-from-scratch",
        chapterId: "identity",
        stepId: "identity:create",
        chapterStatus: "in_progress",
        draftInputs: { id: "identity.aaron" },
        completedAt: null,
        hidden: false
      })
    }).then(response => response.json());
    assert.equal(written.progress.stepId, "identity:create");

    const readBack = await fetch(`${server.url}/api/tutorial-progress/todo-from-scratch`, {
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    assert.equal(readBack.progress.chapterId, "identity");
    assert.deepEqual(readBack.progress.draftInputs, { id: "identity.aaron" });

    const cleared = await fetch(`${server.url}/api/tutorial-progress/todo-from-scratch`, {
      method: "DELETE",
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    assert.equal(cleared.ok, true);

    const emptyAgain = await fetch(`${server.url}/api/tutorial-progress/todo-from-scratch`, {
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    assert.equal(emptyAgain.progress, null);
  } finally {
    await server.close();
  }
});

test("bootstrap capability catalog and install lifecycle are exposed through the generic API", async () => {
  const { server } = await startBlankServer();
  try {
    const initialState = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(initialState.capabilityCatalog.some(row => row.id === "dom.render"), true);

    const post = (pathname, body, method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    assert.equal((await post("/api/server-runners", {
      id: "demo_server",
      backendHost: "backendHost",
      frontendHost: "frontendHost"
    })).status, 201);

    const created = await post("/api/capabilities", {
      id: "notes.sidebar",
      label: "Notes Sidebar",
      version: "0.1.0",
      provenanceJson: JSON.stringify({ source: "local" }),
      dependsOnJson: "[]",
      publicApiJson: "[]",
      configJson: "[]",
      internalsJson: "[]",
      authorityJson: "[]",
      placementJson: JSON.stringify(["serverRunner", "routePage"])
    });
    assert.equal(created.status, 201);

    const installed = await post("/api/capability-installs", {
      capability: "notes.sidebar",
      target: "demo_server",
      targetKind: "serverRunner"
    });
    assert.equal(installed.status, 201);

    const duplicate = await post("/api/capability-installs", {
      capability: "notes.sidebar",
      target: "demo_server",
      targetKind: "serverRunner"
    });
    assert.equal(duplicate.status, 409);

    const afterInstall = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(afterInstall.capabilityInstalls.some(row => row.capability === "notes.sidebar" && row.target === "demo_server" && row.targetKind === "serverRunner"), true);

    const removed = await post("/api/capability-installs", {
      capability: "notes.sidebar",
      target: "demo_server",
      targetKind: "serverRunner"
    }, "DELETE");
    assert.equal(removed.status, 200);

    const afterRemove = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(afterRemove.capabilityInstalls.some(row => row.capability === "notes.sidebar" && row.target === "demo_server" && row.targetKind === "serverRunner"), false);
  } finally {
    await server.close();
  }
});

test("context, perspective, and stewardship flows expose authority through bootstrap state", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body, cookie = "") => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await post("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homeContext: "ctx.platform",
      homePerspective: "aaron:personal"
    });
    await post("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, (await openSession(server.url)).cookie);

    const aaron = await openSession(server.url);
    assert.equal((await post("/api/contexts", { id: "ctx.platform", label: "Platform" }, aaron.cookie)).status, 201);
    assert.equal((await post("/api/perspectives", { id: "platform.board", title: "Platform Board", context: "ctx.platform" }, aaron.cookie)).status, 201);
    assert.equal((await post("/api/stewardships", { steward: "callan", target: "ctx.platform", targetKind: "context" }, aaron.cookie)).status, 201);

    const session = await fetch(`${server.url}/api/session`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    assert.equal(session.homeContext, "ctx.platform");

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    assert.equal(state.contexts.some(row => row.id === "ctx.platform"), true);
    assert.equal(state.perspectives.some(row => row.id === "platform.board" && row.context === "ctx.platform"), true);
    assert.equal(state.stewardships.some(row => row.steward === "callan" && row.target === "ctx.platform"), true);
    assert.equal(state.authority.mutationContexts.includes("ctx.platform"), true);
  } finally {
    await server.close();
  }
});

test("unauthorized scoped writes return 403 and proposals can be approved exactly once", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await post("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    await post("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    assert.equal((await post("/api/contexts", { id: "ctx.platform", label: "Platform" }, aaron.cookie)).status, 201);

    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const denied = await post("/api/widgets", { id: "blocked_root", kind: "Page", title: "Blocked", attach: false, context: "ctx.platform" }, callan.cookie);
    assert.equal(denied.status, 403);

    const proposed = await post("/api/proposals", {
      id: "proposal.widget.root",
      targetProcess: "widget.define",
      targetKind: "widget",
      targetId: "blocked_root",
      bodyJson: JSON.stringify({ id: "proposed_root", kind: "Page", title: "Proposed", attach: false, context: "ctx.platform" }),
      reason: "Need a root page"
    }, callan.cookie);
    assert.equal(proposed.status, 201);

    const approved = await post("/api/proposals/proposal.widget.root/approve", {}, aaron.cookie);
    assert.equal(approved.status, 200);
    const approveAgain = await post("/api/proposals/proposal.widget.root/approve", {}, aaron.cookie);
    assert.equal(approveAgain.status, 409);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    const proposal = state.proposals.find(row => row.id === "proposal.widget.root");
    assert.equal(proposal.status, "approved");
    assert.equal(Array.isArray(proposal.executedWitnessIds), true);
    assert.equal(proposal.executedWitnessIds.length > 0, true);
    assert.equal(state.widgets.some(row => row.id === "proposed_root" && row.context === "ctx.platform"), true);
  } finally {
    await server.close();
  }
});
