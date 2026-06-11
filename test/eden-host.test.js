import assert from "node:assert/strict";
import test from "node:test";
import { startUiDemoServer } from "./support/harness.js";

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
