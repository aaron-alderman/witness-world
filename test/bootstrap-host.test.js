import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { defineWidgetVersion, defineWidgetVersionTransition, activateWidgetVersion } from "../src/widgets.js";

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

test("bootstrap server runner authoring accepts runtimeConfigJson and preserves config structure", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body) => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    const createdRunner = await post("/api/server-runners", {
      id: "config_runner",
      backendHost: "backendHost",
      frontendHost: "frontendHost",
      runtimeConfigJson: JSON.stringify({
        publicBaseUrl: { value: "https://world.test" },
        serviceToken: { secret: "WITNESS_RUNTIME_SECRET" }
      })
    });
    assert.equal(createdRunner.status, 201);
    const createdBody = await createdRunner.json();
    assert.equal(createdBody.serverRunner.runtimeConfig.publicBaseUrl.value, "https://world.test");
    assert.equal(createdBody.serverRunner.runtimeConfig.serviceToken.secret, "WITNESS_RUNTIME_SECRET");

    const state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    const runner = state.serverRunners.find(row => row.id === "config_runner");
    assert.ok(runner);
    assert.equal(runner.runtimeConfig.publicBaseUrl.value, "https://world.test");
    assert.equal(runner.runtimeConfig.serviceToken.secret, "WITNESS_RUNTIME_SECRET");
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

test("identity update lets the signed-in actor edit their own record and refreshes the current session", async () => {
  const { world, server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    assert.equal((await request("/api/contexts", { id: "ctx.platform", label: "Platform" }, aaron.cookie)).status, 201);

    const updated = await request("/api/identities/identity.aaron", {
      label: "Aaron Updated",
      username: "aaron-updated",
      password: "newpass",
      homeContext: "ctx.platform",
      homePerspective: "aaron:workspace"
    }, aaron.cookie, "PATCH");
    assert.equal(updated.status, 200);
    const updatedBody = await updated.json();
    assert.equal(updatedBody.identity.label, "Aaron Updated");
    assert.equal(updatedBody.identity.username, "aaron-updated");
    assert.equal(updatedBody.identity.homeContext, "ctx.platform");
    assert.equal(updatedBody.session.label, "Aaron Updated");
    assert.equal(updatedBody.session.homeContext, "ctx.platform");
    assert.equal(updatedBody.session.perspective, "aaron:workspace");

    const session = await fetch(`${server.url}/api/session`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    assert.equal(session.label, "Aaron Updated");
    assert.equal(session.homeContext, "ctx.platform");
    assert.equal(session.perspective, "aaron:workspace");

    const oldLogin = await openSession(server.url, { username: "aaron", password: "aaron" });
    assert.equal(oldLogin.response.status, 401);
    const newLogin = await openSession(server.url, { username: "aaron-updated", password: "newpass" });
    assert.equal(newLogin.response.status, 200);

    await request("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const denied = await request("/api/identities/identity.aaron", {
      label: "Nope"
    }, callan.cookie, "PATCH");
    assert.equal(denied.status, 403);

    assert.equal(world.allWitnesses().some(w => w.process === "updateIdentity" && w.body?.id === "identity.aaron"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "identity.update" && w.body?.identity?.id === "identity.aaron"), true);
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
        hidden: false,
        disabledPages: ["app", "unknown"],
        replayStepId: "identity:create"
      })
    }).then(response => response.json());
    assert.equal(written.progress.stepId, "identity:create");

    const readBack = await fetch(`${server.url}/api/tutorial-progress/todo-from-scratch`, {
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    assert.equal(readBack.progress.chapterId, "identity");
    assert.deepEqual(readBack.progress.draftInputs, { id: "identity.aaron" });
    assert.deepEqual(readBack.progress.disabledPages, ["app"]);
    assert.equal(readBack.progress.replayStepId, "identity:create");

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

test("live-surface style widget.update proposals can be created without direct authority and approved once by an authorized actor", async () => {
  const { server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);

    assert.equal((await request("/api/widgets", {
      id: "shared_title",
      kind: "Text",
      text: "Original",
      attach: false
    }, aaron.cookie)).status, 201);

    await request("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    const denied = await request("/api/widgets/shared_title", { text: "Denied" }, callan.cookie, "PATCH");
    assert.equal(denied.status, 403);

    const proposed = await request("/api/proposals", {
      id: "proposal.widget.update.shared-title",
      targetProcess: "widget.update",
      targetKind: "widget",
      targetId: "shared_title",
      bodyJson: JSON.stringify({ id: "shared_title", text: "Proposed" }),
      reason: "Need a wording change"
    }, callan.cookie);
    assert.equal(proposed.status, 201);

    const approved = await request("/api/proposals/proposal.widget.update.shared-title/approve", {}, aaron.cookie);
    assert.equal(approved.status, 200);
    const approveAgain = await request("/api/proposals/proposal.widget.update.shared-title/approve", {}, aaron.cookie);
    assert.equal(approveAgain.status, 409);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    const proposal = state.proposals.find(row => row.id === "proposal.widget.update.shared-title");
    assert.equal(proposal.status, "approved");
    assert.equal(Array.isArray(proposal.executedWitnessIds), true);
    assert.equal(proposal.executedWitnessIds.length > 0, true);
    assert.equal(state.widgets.some(row => row.id === "shared_title" && row.props?.text === "Proposed"), true);
  } finally {
    await server.close();
  }
});

test("widgetVersion.activate proposals can be created without direct authority and approved once by an authorized steward", async () => {
  const { world, server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    assert.equal((await request("/api/contexts", { id: "ctx.shared", label: "Shared", stewards: ["aaron"] }, aaron.cookie)).status, 201);

    await request("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    defineWidgetVersion(world, {
      actor: "system",
      owner: "system",
      context: "ctx.shared",
      soul: "shared_banner",
      version: "shared_banner_v1",
      kind: "Text",
      props: { text: "Shared banner v1" },
      index: 0
    });
    defineWidgetVersion(world, {
      actor: "system",
      owner: "system",
      context: "ctx.shared",
      soul: "shared_banner",
      version: "shared_banner_v2",
      kind: "Text",
      props: { text: "Shared banner v2" },
      index: 1
    });
    defineWidgetVersionTransition(world, {
      actor: "system",
      owner: "system",
      soul: "shared_banner",
      from: "shared_banner_v1",
      to: "shared_banner_v2",
      strategy: "compatible"
    });
    activateWidgetVersion(world, { actor: "system", soul: "shared_banner", version: "shared_banner_v1" });

    const proposed = await request("/api/proposals", {
      id: "proposal.widgetVersion.activate.shared-banner",
      targetProcess: "widgetVersion.activate",
      targetKind: "widget",
      targetId: "shared_banner",
      bodyJson: JSON.stringify({ soul: "shared_banner", version: "shared_banner_v2" }),
      reason: "Promote the shared banner"
    }, callan.cookie);
    assert.equal(proposed.status, 201);

    const approved = await request("/api/proposals/proposal.widgetVersion.activate.shared-banner/approve", {}, aaron.cookie);
    assert.equal(approved.status, 200);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    const proposal = state.proposals.find(row => row.id === "proposal.widgetVersion.activate.shared-banner");
    assert.equal(proposal.status, "approved");
    assert.equal(Array.isArray(proposal.executedWitnessIds), true);
    assert.equal(proposal.executedWitnessIds.length > 0, true);
    assert.equal(world.allWitnesses().some(w => w.process === "activateWidgetVersion" && w.actor === "aaron" && w.body?.soul === "shared_banner" && w.body?.version === "shared_banner_v2"), true);
  } finally {
    await server.close();
  }
});

test("widgetVersion.rollback proposals can be created without direct authority and approved once by an authorized steward", async () => {
  const { world, server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    assert.equal((await request("/api/contexts", { id: "ctx.shared", label: "Shared", stewards: ["aaron"] }, aaron.cookie)).status, 201);

    await request("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    defineWidgetVersion(world, {
      actor: "system",
      owner: "system",
      context: "ctx.shared",
      soul: "shared_banner",
      version: "shared_banner_v1",
      kind: "Text",
      props: { text: "Shared banner v1" },
      index: 0
    });
    defineWidgetVersion(world, {
      actor: "system",
      owner: "system",
      context: "ctx.shared",
      soul: "shared_banner",
      version: "shared_banner_v2",
      kind: "Text",
      props: { text: "Shared banner v2" },
      index: 1
    });
    defineWidgetVersionTransition(world, {
      actor: "system",
      owner: "system",
      soul: "shared_banner",
      from: "shared_banner_v1",
      to: "shared_banner_v2",
      strategy: "compatible"
    });
    activateWidgetVersion(world, { actor: "system", soul: "shared_banner", version: "shared_banner_v1" });
    activateWidgetVersion(world, { actor: "system", soul: "shared_banner", version: "shared_banner_v2" });

    const proposed = await request("/api/proposals", {
      id: "proposal.widgetVersion.rollback.shared-banner",
      targetProcess: "widgetVersion.rollback",
      targetKind: "widget",
      targetId: "shared_banner",
      bodyJson: JSON.stringify({ soul: "shared_banner" }),
      reason: "Restore the previous shared banner"
    }, callan.cookie);
    assert.equal(proposed.status, 201);

    const approved = await request("/api/proposals/proposal.widgetVersion.rollback.shared-banner/approve", {}, aaron.cookie);
    assert.equal(approved.status, 200);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    const proposal = state.proposals.find(row => row.id === "proposal.widgetVersion.rollback.shared-banner");
    assert.equal(proposal.status, "approved");
    assert.equal(Array.isArray(proposal.executedWitnessIds), true);
    assert.equal(proposal.executedWitnessIds.length > 0, true);
    assert.equal(world.allWitnesses().some(w => w.process === "widgetVersion.rollback" && w.actor === "aaron" && w.body?.soul === "shared_banner" && w.body?.to === "shared_banner_v1"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "activateWidgetVersion" && w.actor === "aaron" && w.body?.soul === "shared_banner" && w.body?.version === "shared_banner_v1"), true);
  } finally {
    await server.close();
  }
});

test("widget update writes real save-back witnesses and blocks versioned widget souls", async () => {
  const { world, server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);

    assert.equal((await request("/api/widgets", {
      id: "editable_page",
      kind: "Page",
      title: "Original title",
      attach: false
    }, aaron.cookie)).status, 201);

    defineWidgetVersion(world, {
      actor: "system",
      owner: "aaron",
      soul: "versioned_banner",
      version: "versioned_banner_v1",
      kind: "Text",
      props: { text: "Versioned banner" }
    });
    activateWidgetVersion(world, { actor: "system", soul: "versioned_banner", version: "versioned_banner_v1" });

    const updated = await request("/api/widgets/editable_page", { title: "Updated title" }, aaron.cookie, "PATCH");
    assert.equal(updated.status, 200);
    const updatedBody = await updated.json();
    assert.equal(updatedBody.widget.props.title, "Updated title");

    const hidden = await request("/api/widgets/editable_page", { hidden: true }, aaron.cookie, "PATCH");
    assert.equal(hidden.status, 200);
    const hiddenBody = await hidden.json();
    assert.equal(hiddenBody.widget.props.hidden, true);

    const shown = await request("/api/widgets/editable_page", { hidden: false }, aaron.cookie, "PATCH");
    assert.equal(shown.status, 200);
    const shownBody = await shown.json();
    assert.equal(Object.prototype.hasOwnProperty.call(shownBody.widget.props || {}, "hidden"), false);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    assert.equal(state.widgets.some(row => row.id === "editable_page" && row.props?.title === "Updated title"), true);
    assert.equal(state.widgets.some(row => row.id === "editable_page" && Object.prototype.hasOwnProperty.call(row.props || {}, "hidden")), false);
    assert.equal(world.allWitnesses().some(w => w.process === "widget.update" && w.body?.widget?.id === "editable_page"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "widget.update" && w.body?.patch?.hidden === true && w.body?.widget?.id === "editable_page"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "widget.update" && w.body?.patch?.hidden === false && w.body?.widget?.id === "editable_page"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "updateWidget" && w.body?.id === "editable_page"), true);

    const blocked = await request("/api/widgets/versioned_banner", { text: "Nope" }, aaron.cookie, "PATCH");
    assert.equal(blocked.status, 409);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.error, "versioned widgets must be edited through widget versions");
  } finally {
    await server.close();
  }
});

test("bootstrap context composition endpoints expose scope state and lower contextual refs across covered authoring flows", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body, method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const model = await fetch(`${server.url}/api/bootstrap-model`).then(response => response.json());
    const backendHost = model.backendHosts[0]?.id;
    const frontendHost = model.frontendHosts[0]?.id;

    assert.equal((await post("/api/contexts", { id: "ctx.source", label: "Source" })).status, 201);
    assert.equal((await post("/api/contexts", { id: "ctx.target", label: "Target", parent: "ctx.source" })).status, 201);
    assert.equal((await post("/api/widgets", { id: "page_root", kind: "Page", title: "Home", attach: false, context: "ctx.source" })).status, 201);
    assert.equal((await post("/api/widgets", { id: "secret_page", kind: "Page", title: "Secret", attach: false, context: "ctx.source" })).status, 201);
    assert.equal((await post("/api/widgets", { id: "shell_box", kind: "Box", attach: false, context: "ctx.target" })).status, 201);
    assert.equal((await post("/api/widgets", { id: "legacy_shell", kind: "Box", attach: false })).status, 201);
    assert.equal((await post("/api/widgets", { id: "local_note", kind: "Text", text: "Note", attach: false })).status, 201);

    assert.equal((await post("/api/context-bindings", { context: "ctx.source", name: "homePage", target: "page_root" })).status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.source", name: "backendNode", target: backendHost })).status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.source", name: "frontendNode", target: frontendHost })).status, 201);
    assert.equal((await post("/api/context-exports", { context: "ctx.source", name: "homePage", target: "page_root" })).status, 201);
    assert.equal((await post("/api/context-exports", { context: "ctx.source", name: "backendNode", target: backendHost })).status, 201);
    assert.equal((await post("/api/context-exports", { context: "ctx.source", name: "frontendNode", target: frontendHost })).status, 201);
    assert.equal((await post("/api/context-imports", { context: "ctx.target", sourceContext: "ctx.source", exportName: "homePage", name: "landingPage" })).status, 201);
    assert.equal((await post("/api/context-imports", { context: "ctx.target", sourceContext: "ctx.source", exportName: "backendNode", name: "backendAlias" })).status, 201);
    assert.equal((await post("/api/context-imports", { context: "ctx.target", sourceContext: "ctx.source", exportName: "frontendNode", name: "frontendAlias" })).status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.target", name: "shellBox", target: "shell_box" })).status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.target", name: "legacyShell", target: "legacy_shell" })).status, 201);

    const childWidget = await post("/api/widgets", {
      id: "shell_child",
      kind: "Text",
      context: "ctx.target",
      parentRef: "shellBox",
      text: "Child"
    });
    assert.equal(childWidget.status, 201);
    const childWidgetBody = await childWidget.json();
    assert.equal(childWidgetBody.widget.parent, "shell_box");
    const legacyChildWidget = await post("/api/widgets", {
      id: "legacy_child",
      kind: "Text",
      context: "ctx.target",
      parentRef: "legacyShell",
      text: "Legacy Child"
    });
    assert.equal(legacyChildWidget.status, 201);
    const legacyChildWidgetBody = await legacyChildWidget.json();
    assert.equal(legacyChildWidgetBody.widget.parent, "legacy_shell");

    const createdProgram = await post("/api/frontend-programs", {
      id: "landing_program",
      context: "ctx.target",
      rootWidgetRef: "landingPage"
    });
    assert.equal(createdProgram.status, 201);
    const canonicalProgram = await post("/api/frontend-programs", {
      id: "canonical_program",
      context: "ctx.target",
      rootWidget: "page_root"
    });
    assert.equal(canonicalProgram.status, 201);
    const hiddenCanonicalProgram = await post("/api/frontend-programs", {
      id: "hidden_canonical_program",
      context: "ctx.target",
      rootWidget: "secret_page"
    });
    assert.equal(hiddenCanonicalProgram.status, 400);
    assert.equal((await post("/api/context-bindings", { context: "ctx.target", name: "landingProgram", target: "landing_program" })).status, 201);

    const createdRunner = await post("/api/server-runners", {
      id: "demo_server",
      context: "ctx.target",
      backendHostRef: "backendAlias",
      frontendHostRef: "frontendAlias"
    });
    assert.equal(createdRunner.status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.target", name: "runnerNode", target: "demo_server" })).status, 201);

    const createdRoute = await post("/api/routes", {
      id: "landing_route",
      context: "ctx.target",
      path: "/landing",
      method: "GET",
      handler: "page.home",
      servesRef: "landingProgram",
      rootWidgetRef: "landingPage"
    });
    assert.equal(createdRoute.status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.target", name: "landingRoute", target: "landing_route" })).status, 201);

    const createdServe = await post("/api/serve-mounts", {
      context: "ctx.target",
      serverRunnerRef: "runnerNode",
      routeRef: "landingRoute"
    });
    assert.equal(createdServe.status, 201);

    const unresolved = await post("/api/frontend-programs", {
      id: "broken_program",
      context: "ctx.target",
      rootWidgetRef: "missingPage"
    });
    assert.equal(unresolved.status, 400);
    const unresolvedParent = await post("/api/widgets", {
      id: "broken_child",
      kind: "Text",
      context: "ctx.target",
      parentRef: "missingShell",
      text: "Broken"
    });
    assert.equal(unresolvedParent.status, 400);

    const collision = await post("/api/context-bindings", { context: "ctx.target", name: "landingPage", target: "local_note" });
    assert.equal(collision.status, 409);
    const foreignScopedBind = await post("/api/context-bindings", { context: "ctx.target", name: "foreignPage", target: "page_root" });
    assert.equal(foreignScopedBind.status, 400);

    const state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(state.contextBindings.some(row => row.context === "ctx.source" && row.name === "homePage" && row.target === "page_root"), true);
    assert.equal(state.contextExports.some(row => row.context === "ctx.source" && row.name === "homePage" && row.target === "page_root"), true);
    assert.equal(state.contextImports.some(row => row.context === "ctx.target" && row.sourceContext === "ctx.source" && row.exportName === "homePage" && row.name === "landingPage"), true);
    assert.equal(state.contextScopes.some(row => row.context === "ctx.target" && row.name === "landingPage" && row.target === "page_root" && row.sourceKind === "import" && row.sourceContext === "ctx.source" && row.exportName === "homePage"), true);
    assert.equal(state.contextScopes.some(row => row.context === "ctx.target" && row.name === "homePage"), false);
    assert.equal(state.contextScopes.some(row => row.context === "ctx.target" && row.name === "backendAlias" && row.target === backendHost && row.sourceKind === "import"), true);
    assert.equal(state.widgets.some(row => row.id === "shell_child" && row.context === "ctx.target"), true);
    assert.equal(state.widgets.some(row => row.id === "legacy_child" && row.context === "ctx.target"), true);
    assert.equal(state.frontendPrograms.some(row => row.id === "landing_program" && row.rootWidget === "page_root"), true);
    assert.equal(state.frontendPrograms.some(row => row.id === "canonical_program" && row.rootWidget === "page_root"), true);
    assert.equal(state.frontendPrograms.some(row => row.id === "hidden_canonical_program"), false);
    assert.equal(state.serverRunners.some(row => row.id === "demo_server" && row.backendHost === backendHost && row.frontendHost === frontendHost), true);
    assert.equal(state.routes.some(row => row.id === "landing_route" && row.serves === "landing_program" && row.params?.rootWidget === "page_root"), true);
    assert.equal(state.servedRoutes.some(row => row.id === "landing_route" && row.serverRunner === "demo_server"), true);

    assert.equal((await post("/api/context-imports", { context: "ctx.target", sourceContext: "ctx.source", exportName: "homePage", name: "landingPage" }, "DELETE")).status, 200);
    assert.equal((await post("/api/context-exports", { context: "ctx.source", name: "homePage", target: "page_root" }, "DELETE")).status, 200);
    assert.equal((await post("/api/context-bindings", { context: "ctx.source", name: "homePage", target: "page_root" }, "DELETE")).status, 200);
  } finally {
    await server.close();
  }
});
