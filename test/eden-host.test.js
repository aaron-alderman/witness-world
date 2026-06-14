import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { moduleProjectors } from "../src/modules.js";
import { startUiDemoServer as startUiDemoServerBase } from "./support/harness.js";

const edenDslPath = path.join(process.cwd(), "examples", "eden/app.wtoml");

function startUiDemoServer(options = {}) {
  return startUiDemoServerBase({
    dslPath: edenDslPath,
    ...options
  });
}

test("eden canvas route renders the neighborhood shell without mutating root", async () => {
  const { server, url, close } = await startUiDemoServer();
  try {
    const response = await fetch(`${url}/eden-canvas`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Eden Canvas/);
    assert.match(html, /eden-stage/);
    assert.match(html, /eden.surface.todo/);
    assert.match(html, /Use the mouse wheel to zoom out/);

    const root = await fetch(`${url}/`);
    assert.equal(root.status, 200);
    const rootHtml = await root.text();
    assert.match(rootHtml, /Witness Todo/);
    assert.doesNotMatch(rootHtml, /eden-stage/);
  } finally {
    await close();
  }
});

test("eden personal box API requires sign-in and then supports create, update, and delete", async () => {
  const { server, url, close } = await startUiDemoServer();
  try {
    const unauthenticated = await fetch(`${url}/api/eden/personal-box`);
    assert.equal(unauthenticated.status, 200);
    const initial = await unauthenticated.json();
    assert.equal(initial.authenticated, false);
    assert.deepEqual(initial.items, []);

    const login = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

    const created = await fetch(`${url}/api/eden/personal-box/items`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ kind: "note", text: "Garden shelf" })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.item.text, "Garden shelf");

    const listed = await fetch(`${url}/api/eden/personal-box`, {
      headers: { cookie }
    });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.authenticated, true);
    assert.equal(listedBody.items.some(item => item.text === "Garden shelf"), true);

    const updated = await fetch(`${url}/api/eden/personal-box/items/${encodeURIComponent(createdBody.item.id)}`, {
      method: "PATCH",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ kind: "link", text: "World graph", href: "/world" })
    });
    assert.equal(updated.status, 200);
    const updatedBody = await updated.json();
    assert.equal(updatedBody.item.kind, "link");
    assert.equal(updatedBody.item.href, "/world");

    const removed = await fetch(`${url}/api/eden/personal-box/items/${encodeURIComponent(createdBody.item.id)}`, {
      method: "DELETE",
      headers: { cookie }
    });
    assert.equal(removed.status, 200);

    const afterDelete = await fetch(`${url}/api/eden/personal-box`, {
      headers: { cookie }
    }).then(response => response.json());
    assert.equal(afterDelete.items.length, 0);
  } finally {
    await close();
  }
});

test("eden edit page theme API updates the real Todo page render for the signed-in actor", async () => {
  const { server, url, close } = await startUiDemoServer();
  try {
    const login = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

    const updated = await fetch(`${url}/api/eden/page-theme`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ themeId: "moss", material: "stone", typography: "serif" })
    });
    assert.equal(updated.status, 200);
    const updatedBody = await updated.json();
    assert.equal(updatedBody.pageTheme.themeId, "moss");
    assert.equal(updatedBody.pageTheme.material, "stone");
    assert.equal(updatedBody.pageTheme.typography, "serif");

    const readBack = await fetch(`${url}/api/eden/page-theme`, {
      headers: { cookie }
    }).then(response => response.json());
    assert.equal(readBack.pageTheme.themeId, "moss");

    const themedHome = await fetch(`${url}/`, {
      headers: { cookie }
    }).then(response => response.text());
    assert.match(themedHome, /data-page-theme="moss"/);
    assert.match(themedHome, /data-page-material="stone"/);
    assert.match(themedHome, /data-page-typography="serif"/);

    const anonymousHome = await fetch(`${url}/`).then(response => response.text());
    assert.match(anonymousHome, /data-page-theme="paper"/);
  } finally {
    await close();
  }
});

test("eden versions API drives published, draft, and last-good state for the live Todo board seam", async () => {
  const { server, url, close } = await startUiDemoServer();
  try {
    const initial = await fetch(`${url}/api/eden/versions`).then(response => response.json());
    assert.equal(initial.versionState.activeVersion, "todo_versioned_banner_v1");
    assert.equal(initial.versionState.publishedVersion, "todo_versioned_banner_v1");
    assert.equal(initial.versionState.draftVersion, "todo_versioned_banner_v2");

    const login = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

    const activateDraft = await fetch(`${url}/api/eden/versions/activate`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    assert.equal(activateDraft.status, 200);
    const activatedBody = await activateDraft.json();
    assert.equal(activatedBody.versionState.activeVersion, "todo_versioned_banner_v2");
    assert.equal(activatedBody.versionState.lastGoodVersion, "todo_versioned_banner_v1");

    const draftHome = await fetch(`${url}/`, {
      headers: { cookie }
    }).then(response => response.text());
    assert.match(draftHome, /Versioned widget: v2/);

    const publish = await fetch(`${url}/api/eden/versions/publish`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    assert.equal(publish.status, 200);
    const publishBody = await publish.json();
    assert.equal(publishBody.versionState.publishedVersion, "todo_versioned_banner_v2");

    const rollback = await fetch(`${url}/api/eden/versions/rollback`, {
      method: "POST",
      headers: { cookie }
    });
    assert.equal(rollback.status, 200);
    const rollbackBody = await rollback.json();
    assert.equal(rollbackBody.versionState.activeVersion, "todo_versioned_banner_v1");

    const rolledBackHome = await fetch(`${url}/`, {
      headers: { cookie }
    }).then(response => response.text());
    assert.match(rolledBackHome, /Versioned widget: v1/);
  } finally {
    await close();
  }
});

test("eden versions API rejects signed-in actors without authority over the shared widget soul", async () => {
  const { server, url, close } = await startUiDemoServer();
  try {
    const login = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "callan", password: "callan" })
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

    const activate = await fetch(`${url}/api/eden/versions/activate`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    assert.equal(activate.status, 403);

    const publish = await fetch(`${url}/api/eden/versions/publish`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    assert.equal(publish.status, 403);

    const rollback = await fetch(`${url}/api/eden/versions/rollback`, {
      method: "POST",
      headers: { cookie }
    });
    assert.equal(rollback.status, 403);

    const readBack = await fetch(`${url}/api/eden/versions`, {
      headers: { cookie }
    }).then(response => response.json());
    assert.equal(readBack.versionState.authority.authenticated, true);
    assert.equal(readBack.versionState.authority.canMutate, false);
    assert.equal(readBack.versionState.authority.canPropose, true);
  } finally {
    await close();
  }
});

test("eden version publish proposals can be created without direct authority and approved once by an authorized steward", async () => {
  const { world, server, url, close } = await startUiDemoServer();
  try {
    const loginAaron = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    assert.equal(loginAaron.status, 200);
    const aaronCookie = (loginAaron.headers.get("set-cookie") || "").split(";")[0];

    const activateDraft = await fetch(`${url}/api/eden/versions/activate`, {
      method: "POST",
      headers: {
        cookie: aaronCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    assert.equal(activateDraft.status, 200);

    const loginCallan = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "callan", password: "callan" })
    });
    assert.equal(loginCallan.status, 200);
    const callanCookie = (loginCallan.headers.get("set-cookie") || "").split(";")[0];

    const proposed = await fetch(`${url}/api/proposals`, {
      method: "POST",
      headers: {
        cookie: callanCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "proposal.eden.publish.shared-banner",
        targetProcess: "edenVersions.publish",
        targetKind: "widgetVersion",
        targetId: "todo_versioned_banner",
        bodyJson: JSON.stringify({
          surfaceId: "eden.surface.versions",
          soul: "todo_versioned_banner",
          version: "todo_versioned_banner_v2",
          publishedVersion: "todo_versioned_banner_v1",
          draftVersion: "todo_versioned_banner_v2"
        }),
        reason: "Publish the current shared banner through proposal review"
      })
    });
    assert.equal(proposed.status, 201);

    const approved = await fetch(`${url}/api/proposals/proposal.eden.publish.shared-banner/approve`, {
      method: "POST",
      headers: { cookie: aaronCookie }
    });
    assert.equal(approved.status, 200);

    const approveAgain = await fetch(`${url}/api/proposals/proposal.eden.publish.shared-banner/approve`, {
      method: "POST",
      headers: { cookie: aaronCookie }
    });
    assert.equal(approveAgain.status, 409);

    const proposal = world.project(moduleProjectors.proposals).find(row => row.id === "proposal.eden.publish.shared-banner");
    assert.equal(proposal.status, "approved");
    assert.equal(Array.isArray(proposal.executedWitnessIds), true);
    assert.equal(proposal.executedWitnessIds.length > 0, true);

    const versions = await fetch(`${url}/api/eden/versions`, {
      headers: { cookie: callanCookie }
    }).then(response => response.json());
    assert.equal(versions.versionState.publishedVersion, "todo_versioned_banner_v2");
    assert.equal(world.allWitnesses().some(witness =>
      witness.process === "edenVersions.publish"
      && witness.actor === "aaron"
      && witness.body?.soul === "todo_versioned_banner"
      && witness.body?.version === "todo_versioned_banner_v2"
    ), true);
  } finally {
    await close();
  }
});

test("eden capability install API exposes curated capabilities and installs one onto the frontend context", async () => {
  const { server, url, close } = await startUiDemoServer();
  try {
    const initial = await fetch(`${url}/api/eden/capability-installs`).then(response => response.json());
    assert.equal(initial.authenticated, false);
    assert.equal(initial.capabilityState.target, "frontend");
    assert.equal(initial.capabilityState.suggestedCapabilities.some(capability => capability.id === "notes.sidebar" && capability.installed === false), true);

    const blocked = await fetch(`${url}/api/eden/capability-installs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capability: "notes.sidebar" })
    });
    assert.equal(blocked.status, 401);

    const login = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

    const installed = await fetch(`${url}/api/eden/capability-installs`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ capability: "notes.sidebar" })
    });
    assert.equal(installed.status, 200);
    const installedBody = await installed.json();
    assert.equal(installedBody.capabilityState.suggestedCapabilities.some(capability => capability.id === "notes.sidebar" && capability.installed), true);

    const readBack = await fetch(`${url}/api/eden/capability-installs`, {
      headers: { cookie }
    }).then(response => response.json());
    assert.equal(readBack.capabilityState.installedCapabilities.some(capability => capability.id === "notes.sidebar"), true);
  } finally {
    await close();
  }
});

test("eden capability install proposals can be created without direct authority and approved once by an authorized steward", async () => {
  const { world, server, url, close } = await startUiDemoServer();
  try {
    const loginAaron = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    assert.equal(loginAaron.status, 200);
    const aaronCookie = (loginAaron.headers.get("set-cookie") || "").split(";")[0];

    const loginCallan = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "callan", password: "callan" })
    });
    assert.equal(loginCallan.status, 200);
    const callanCookie = (loginCallan.headers.get("set-cookie") || "").split(";")[0];

    const readBack = await fetch(`${url}/api/eden/capability-installs`, {
      headers: { cookie: callanCookie }
    }).then(response => response.json());
    assert.equal(readBack.capabilityState.authority.authenticated, true);
    assert.equal(readBack.capabilityState.authority.canMutate, false);
    assert.equal(readBack.capabilityState.authority.canPropose, true);

    const proposed = await fetch(`${url}/api/proposals`, {
      method: "POST",
      headers: {
        cookie: callanCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "proposal.eden.capability.install.frontend.notes-sidebar",
        targetProcess: "capability.install",
        targetKind: "context",
        targetId: "frontend",
        bodyJson: JSON.stringify({
          capability: "notes.sidebar",
          target: "frontend",
          targetKind: "context"
        }),
        reason: "Install Notes Sidebar on the shared frontend context through proposal review"
      })
    });
    assert.equal(proposed.status, 201);

    const approved = await fetch(`${url}/api/proposals/proposal.eden.capability.install.frontend.notes-sidebar/approve`, {
      method: "POST",
      headers: { cookie: aaronCookie }
    });
    assert.equal(approved.status, 200);

    const approveAgain = await fetch(`${url}/api/proposals/proposal.eden.capability.install.frontend.notes-sidebar/approve`, {
      method: "POST",
      headers: { cookie: aaronCookie }
    });
    assert.equal(approveAgain.status, 409);

    const proposal = world.project(moduleProjectors.proposals).find(row => row.id === "proposal.eden.capability.install.frontend.notes-sidebar");
    assert.equal(proposal.status, "approved");
    assert.equal(Array.isArray(proposal.executedWitnessIds), true);
    assert.equal(proposal.executedWitnessIds.length > 0, true);

    const installed = await fetch(`${url}/api/eden/capability-installs`, {
      headers: { cookie: callanCookie }
    }).then(response => response.json());
    assert.equal(installed.capabilityState.installedCapabilities.some(capability => capability.id === "notes.sidebar"), true);
    assert.equal(world.allWitnesses().some(witness =>
      proposal.executedWitnessIds.includes(witness.id)
      && witness.process === "capability.install"
      && witness.body?.install?.target === "frontend"
      && witness.body?.install?.capability === "notes.sidebar"
    ), true);
  } finally {
    await close();
  }
});

test("eden academy API reflects real quest progression and unlocks after practical work", async () => {
  const { server, url, close } = await startUiDemoServer();
  try {
    const initial = await fetch(`${url}/api/eden/academy`).then(response => response.json());
    assert.equal(initial.academy.quests.some(quest => quest.id === "claim_room" && quest.status === "available"), true);
    assert.equal(initial.surfaces.some(surface => surface.id === "eden.surface.personal" && surface.actions.some(action => action.id === "personal_shared" && action.state === "locked")), true);

    const login = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

    await fetch(`${url}/api/eden/personal-box/items`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ kind: "note", text: "Claim the room" })
    });
    await fetch(`${url}/api/eden/page-theme`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ themeId: "moss", material: "stone", typography: "serif" })
    });
    await fetch(`${url}/api/eden/versions/activate`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    await fetch(`${url}/api/eden/versions/rollback`, {
      method: "POST",
      headers: { cookie }
    });
    await fetch(`${url}/api/eden/capability-installs`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ capability: "notes.sidebar" })
    });

    const progressed = await fetch(`${url}/api/eden/academy`, {
      headers: { cookie }
    }).then(response => response.json());
    assert.equal(progressed.academy.completedQuestIds.includes("claim_room"), true);
    assert.equal(progressed.academy.completedQuestIds.includes("restyle_page"), true);
    assert.equal(progressed.academy.completedQuestIds.includes("restore_last_good"), true);
    assert.equal(progressed.academy.completedQuestIds.includes("install_missing_power"), true);
    assert.equal(progressed.academy.tracks.some(track => track.id === "stewardship" && track.count >= 3 && track.signals.includes("practice.stewardship.steady")), true);
    assert.equal(progressed.surfaces.some(surface => surface.id === "eden.surface.personal" && surface.actions.some(action => action.id === "personal_shared" && action.state === "open")), true);
    assert.equal(progressed.surfaces.some(surface => surface.id === "eden.surface.tree" && surface.actions.some(action => action.id === "tree_shared" && action.state === "open")), true);
    assert.equal(progressed.checkpoints.some(checkpoint => checkpoint.id === "structure" && checkpoint.quests.some(quest => quest.id === "install_missing_power" && quest.status === "completed")), true);
  } finally {
    await close();
  }
});

test("eden commons API drives real context, stewardship, and proposal practice", async () => {
  const { server, url, close } = await startUiDemoServer();
  try {
    const initial = await fetch(`${url}/api/eden/organization`).then(response => response.json());
    assert.equal(initial.authenticated, false);
    assert.equal(initial.organizationState.contextExists, false);
    assert.equal(initial.organizationState.hasGuestStewardship, false);

    const blocked = await fetch(`${url}/api/eden/organization/context`, { method: "POST" });
    assert.equal(blocked.status, 401);

    const login = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

    await fetch(`${url}/api/eden/personal-box/items`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ kind: "note", text: "Practice the commons" })
    });
    await fetch(`${url}/api/eden/page-theme`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ themeId: "moss", material: "stone", typography: "serif" })
    });
    await fetch(`${url}/api/eden/versions/activate`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    await fetch(`${url}/api/eden/versions/rollback`, {
      method: "POST",
      headers: { cookie }
    });
    await fetch(`${url}/api/eden/capability-installs`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ capability: "notes.sidebar" })
    });
    await fetch(`${url}/api/eden/versions/activate`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    await fetch(`${url}/api/eden/versions/publish`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    await fetch(`${url}/api/process-view?program=todo_frontend_program&event=load`, {
      headers: { cookie }
    });
    await fetch(`${url}/api/simulate-network-error`, {
      headers: { cookie }
    });
    await fetch(`${url}/api/eden/page-theme`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ themeId: "straw", material: "wood", typography: "mono" })
    });
    await fetch(`${url}/api/eden/versions/publish`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });

    const created = await fetch(`${url}/api/eden/organization/context`, {
      method: "POST",
      headers: { cookie }
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.context.id, "ctx.eden.guild.aaron");

    const granted = await fetch(`${url}/api/eden/organization/stewardship`, {
      method: "POST",
      headers: { cookie }
    });
    assert.equal(granted.status, 201);

    const proposed = await fetch(`${url}/api/eden/organization/proposals`, {
      method: "POST",
      headers: { cookie }
    });
    assert.equal(proposed.status, 201);
    const proposedBody = await proposed.json();
    assert.equal(proposedBody.proposal.status, "open");

    const approved = await fetch(`${url}/api/eden/organization/proposals/approve`, {
      method: "POST",
      headers: { cookie }
    });
    assert.equal(approved.status, 200);
    const approvedBody = await approved.json();
    assert.equal(approvedBody.proposal.status, "approved");

    const readBack = await fetch(`${url}/api/eden/organization`, {
      headers: { cookie }
    }).then(response => response.json());
    assert.equal(readBack.organizationState.contextExists, true);
    assert.equal(readBack.organizationState.hasGuestStewardship, true);
    assert.equal(readBack.organizationState.approvedProposalCount, 1);
    assert.equal(readBack.organizationState.noticeWidgetExists, true);

    const academy = await fetch(`${url}/api/eden/academy`, {
      headers: { cookie }
    }).then(response => response.json());
    assert.equal(academy.academy.completedQuestIds.includes("run_open_organization"), true);
    assert.equal(academy.academy.tracks.some(track => track.id === "governance" && track.count >= 4), true);
    assert.equal(academy.surfaces.some(surface => surface.id === "eden.surface.tree" && surface.actions.some(action => action.id === "tree_commons" && action.state === "open")), true);
    assert.equal(academy.surfaces.some(surface => surface.id === "eden.surface.process" && surface.actions.some(action => action.id === "process_shared" && action.state === "open")), true);
  } finally {
    await close();
  }
});

test("eden academy API opens the operator gate after process inspection and publish, then records the runtime drill", async () => {
  const { server, url, close } = await startUiDemoServer();
  try {
    const login = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

    await fetch(`${url}/api/eden/versions/activate`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    await fetch(`${url}/api/eden/versions/rollback`, {
      method: "POST",
      headers: { cookie }
    });
    await fetch(`${url}/api/eden/versions/activate`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    await fetch(`${url}/api/eden/versions/publish`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    const processRead = await fetch(`${url}/api/process-view?program=todo_frontend_program&event=load`, {
      headers: { cookie }
    });
    assert.equal(processRead.status, 200);

    const progressed = await fetch(`${url}/api/eden/academy`, {
      headers: { cookie }
    }).then(response => response.json());
    assert.equal(progressed.academy.completedQuestIds.includes("inspect_machine_room"), true);
    assert.equal(progressed.academy.completedQuestIds.includes("publish_current_cut"), true);
    assert.equal(progressed.surfaces.some(surface => surface.id === "eden.surface.process" && surface.actions.some(action => action.id === "process_alter" && action.state === "open")), true);

    const drill = await fetch(`${url}/api/simulate-network-error`, {
      headers: { cookie }
    });
    assert.equal(drill.status, 503);

    const afterDrill = await fetch(`${url}/api/eden/academy`, {
      headers: { cookie }
    }).then(response => response.json());
    assert.equal(afterDrill.academy.completedQuestIds.includes("run_failure_drill"), true);
    assert.equal(afterDrill.academy.tracks.some(track => track.id === "operator" && track.count === 3 && track.statusLabel === "steady operator work"), true);
    assert.equal(afterDrill.checkpoints.some(checkpoint => checkpoint.id === "routes" && checkpoint.quests.some(quest => quest.id === "run_failure_drill" && quest.status === "completed")), true);
  } finally {
    await close();
  }
});

test("eden theory API studies lessons in the Tree annex and then earns the trained mark", async () => {
  const { server, url, close } = await startUiDemoServer();
  try {
    const login = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

    const locked = await fetch(`${url}/api/eden/theory/lessons/why_contexts/study`, {
      method: "POST",
      headers: { cookie }
    });
    assert.equal(locked.status, 409);

    await fetch(`${url}/api/eden/personal-box/items`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ kind: "note", text: "Claim the room" })
    });
    await fetch(`${url}/api/eden/page-theme`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ themeId: "moss", material: "stone", typography: "serif" })
    });
    await fetch(`${url}/api/eden/versions/activate`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    await fetch(`${url}/api/eden/versions/rollback`, {
      method: "POST",
      headers: { cookie }
    });
    await fetch(`${url}/api/eden/capability-installs`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ capability: "notes.sidebar" })
    });

    const theory = await fetch(`${url}/api/eden/theory`, {
      headers: { cookie }
    }).then(response => response.json());
    assert.equal(theory.surface.actions.some(action => action.id === "tree_theory" && action.state === "open"), true);

    for (const lessonId of ["why_contexts", "witnesses_truth", "authority_without_illusion", "shells_and_expressions"]) {
      const studied = await fetch(`${url}/api/eden/theory/lessons/${lessonId}/study`, {
        method: "POST",
        headers: { cookie }
      });
      assert.equal(studied.status, 200);
    }

    const assessed = await fetch(`${url}/api/eden/theory/assessment`, {
      method: "POST",
      headers: { cookie }
    });
    assert.equal(assessed.status, 200);
    const assessedBody = await assessed.json();
    assert.equal(assessedBody.theoryState.trained, true);

    const teachBack = await fetch(`${url}/api/eden/theory/teach-back`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ note: "Explain the world back until another builder can see the boundary too." })
    });
    assert.equal(teachBack.status, 200);
    const teachBackBody = await teachBack.json();
    assert.equal(teachBackBody.theoryState.teachBackCount, 1);

    const academy = await fetch(`${url}/api/eden/academy`, {
      headers: { cookie }
    }).then(response => response.json());
    assert.equal(academy.academy.completedQuestIds.includes("trained_mark"), true);
    assert.equal(academy.academy.tracks.some(track => track.id === "teaching" && track.count === 1 && track.statusLabel === "first teach-back witnessed"), true);
    assert.equal(academy.surfaces.some(surface => surface.id === "eden.surface.tree" && surface.actions.some(action => action.id === "tree_theory" && action.state === "open")), true);
  } finally {
    await close();
  }
});
