import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer, waitForAppReady } from "./support/harness.js";

async function signIn(page, { username = "aaron", password = username, label = "Aaron" } = {}) {
  await page.fill('[data-widget="todo_username_input"]', username);
  await page.fill('[data-widget="todo_password_input"]', password);
  await page.locator('[data-widget="todo_open_button"]').click();
  await page.waitForFunction(expected => {
    const sessionStatus = document.querySelector('[data-widget="todo_session_status"]');
    return Boolean(sessionStatus && sessionStatus.textContent && sessionStatus.textContent.includes("Signed in as " + expected));
  }, label, { timeout: 5000 });
}

test("live page inspector exposes right-click widget inspection, version activation, and world handoff", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await signIn(page);

    await page.waitForFunction(() => {
      const banner = document.querySelector('[data-widget="todo_versioned_banner"]');
      return Boolean(banner && banner.textContent && banner.textContent.includes("Versioned widget: v1"));
    });

    await page.locator('[data-surface-inspector-toggle]').click();
    await page.locator('[data-widget="todo_versioned_banner"]').click({ button: "right" });

    const menu = page.locator('.surface-inspector-menu');
    await menu.waitFor();
    assert.equal(await menu.isVisible(), true);
    assert.match((await menu.textContent()) || "", /todo_versioned_banner/);

    const panel = page.locator('.surface-inspector-panel');
    await panel.waitFor();
    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("todo_versioned_banner")
        && inspector.textContent.includes("Runtime Owner")
        && inspector.textContent.includes("Runtime Profile")
        && inspector.textContent.includes("demo_server")
        && inspector.textContent.includes("plugin.inspect")
        && inspector.textContent.includes("Widget Versions")
        && inspector.textContent.includes("todo_versioned_banner_v2")
      );
    });

    await page.locator('[data-surface-inspector-activate="todo_versioned_banner"][data-surface-inspector-version="todo_versioned_banner_v2"]').click();
    await page.waitForFunction(() => {
      const banner = document.querySelector('[data-widget="todo_versioned_banner"]');
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        banner
        && banner.textContent
        && banner.textContent.includes("Versioned widget: v2")
        && inspector
        && inspector.textContent
        && inspector.textContent.includes("Activated todo_versioned_banner_v2")
      );
    });

    await page.locator('[data-surface-inspector-world]').click();
    await page.waitForURL(url => url.pathname === "/world" && url.searchParams.get("select") === "todo_versioned_banner");
    await page.waitForFunction(() => {
      const inspector = document.querySelector('.world-graph-inspector');
      return Boolean(inspector && inspector.textContent && inspector.textContent.includes("todo_versioned_banner"));
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live page inspector can derive a truthful process handoff from a live widget selection", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    const routeId = await page.evaluate(() => document.body.dataset.surfaceRoute || "");
    assert.equal(Boolean(routeId), true);

    await page.locator('[data-surface-inspector-toggle]').click();
    await page.locator('[data-widget="todo_add_button"]').click({ button: "right" });
    await page.locator('.surface-inspector-menu').waitFor();
    await page.locator('.surface-inspector-menu [data-surface-inspector-open-process]').click();

    await page.waitForURL(url =>
      url.pathname === "/process"
      && url.searchParams.get("program") === "todo_frontend_program"
      && url.searchParams.get("event") === "submit:todo_form"
    );
    await page.locator('[data-process-view]').waitFor();

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live page inspector can hand off a selected widget to its owning route object", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    const routeId = await page.evaluate(() => document.body.dataset.surfaceRoute || "");
    assert.equal(Boolean(routeId), true);

    await page.locator('[data-surface-inspector-toggle]').click();
    await page.locator('[data-widget="todo_add_button"]').click({ button: "right" });
    await page.locator('.surface-inspector-menu').waitFor();
    await page.locator('.surface-inspector-menu [data-surface-inspector-select]').click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("todo_add_button")
        && inspector.textContent.includes("Show Route")
        && inspector.textContent.includes("Runtime Correlation")
        && inspector.textContent.includes("submit:todo_form")
      );
    });

    await page.locator(`[data-surface-inspector-world-select="${routeId}"]`).click();
    await page.waitForURL(url => url.pathname === "/world" && url.searchParams.get("select") === routeId);
    await page.waitForFunction(expected => {
      const inspector = document.querySelector('.world-graph-inspector');
      return Boolean(inspector && inspector.textContent && inspector.textContent.includes(expected));
    }, routeId);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live page inspector can hand off a selected widget to its owning backend program", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);

    await page.locator('[data-surface-inspector-toggle]').click();
    await page.locator('[data-widget="todo_add_button"]').click({ button: "right" });
    await page.locator('.surface-inspector-menu').waitFor();
    await page.locator('.surface-inspector-menu [data-surface-inspector-select]').click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("todo_add_button")
        && inspector.textContent.includes("Runtime Correlation")
        && inspector.textContent.includes("submit:todo_form")
      );
    });

    await page.locator('[data-surface-inspector-runtime-select]').first().waitFor();
    const backendTarget = await page.locator('[data-surface-inspector-runtime-select]').first().getAttribute('data-surface-inspector-runtime-select');
    assert.equal(Boolean(backendTarget), true);

    await page.locator('[data-surface-inspector-runtime-select]').first().click();
    await page.waitForURL(url => url.pathname === "/world" && url.searchParams.get("select") === backendTarget);
    await page.waitForFunction(expected => {
      const inspector = document.querySelector('.world-graph-inspector');
      return Boolean(inspector && inspector.textContent && inspector.textContent.includes(expected));
    }, backendTarget);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live page inspector can save a narrow widget edit back into the world when the actor stewards the frontend context", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await signIn(page, { username: "aaron", password: "aaron", label: "Aaron" });

    await page.locator('[data-surface-inspector-toggle]').click();
    await page.locator('[data-widget="todo_title"]').click({ button: "right" });
    await page.locator('.surface-inspector-menu').waitFor();
    await page.locator('.surface-inspector-menu [data-surface-inspector-select]').click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("todo_title")
        && inspector.textContent.includes("Live Save-Back")
      );
    });
    await page.locator('[data-surface-inspector-edit-form] textarea[name="text"]').fill("Witness Todo Edited");
    const saveRequest = page.waitForResponse(response =>
      response.request().method() === "PATCH"
      && new URL(response.url()).pathname === "/api/widgets/todo_title"
      && response.status() === 200
    );
    await page.locator('[data-surface-inspector-save]').click();
    await saveRequest;

    await page.waitForFunction(() => {
      const title = document.querySelector('[data-widget="todo_title"]');
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        title
        && title.textContent
        && title.textContent.includes("Witness Todo Edited")
        && inspector
        && inspector.textContent
        && inspector.textContent.includes("Saved todo_title.")
      );
    });

    assert.equal(await page.locator('[data-surface-inspector-edit-form]').count(), 1);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live page inspector can hide and show a rendered widget through real widget.update witnesses", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await signIn(page, { username: "aaron", password: "aaron", label: "Aaron" });

    await page.locator('[data-surface-inspector-toggle]').click();
    await page.locator('[data-widget="todo_title"]').click({ button: "right" });
    await page.locator('.surface-inspector-menu').waitFor();
    await page.locator('.surface-inspector-menu [data-surface-inspector-select]').click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("todo_title")
        && inspector.textContent.includes("hidden")
      );
    });

    await page.locator('[data-surface-inspector-edit-form] input[name="hidden"]').check();
    const hideRequest = page.waitForResponse(response =>
      response.request().method() === "PATCH"
      && new URL(response.url()).pathname === "/api/widgets/todo_title"
      && response.status() === 200
    );
    await page.locator('[data-surface-inspector-save]').click();
    await hideRequest;

    await page.waitForFunction(() => {
      const title = document.querySelector('[data-widget="todo_title"]');
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        title
        && title.hidden === true
        && inspector
        && inspector.textContent
        && inspector.textContent.includes("Saved todo_title.")
      );
    });

    await page.locator('[data-surface-inspector-edit-form] input[name="hidden"]').uncheck();
    const showRequest = page.waitForResponse(response =>
      response.request().method() === "PATCH"
      && new URL(response.url()).pathname === "/api/widgets/todo_title"
      && response.status() === 200
    );
    await page.locator('[data-surface-inspector-save]').click();
    await showRequest;

    await page.waitForFunction(() => {
      const title = document.querySelector('[data-widget="todo_title"]');
      return Boolean(title && title.hidden === false);
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live page inspector can create a real widget.update proposal for a read-only widget and live-refresh after approval", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    browser,
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();
  let approverContext = null;
  let approverPage = null;

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await signIn(page, { username: "callan", password: "callan", label: "Callan" });

    await page.locator('[data-surface-inspector-toggle]').click();
    await page.locator('[data-widget="todo_title"]').click({ button: "right" });
    await page.locator('.surface-inspector-menu').waitFor();
    await page.locator('.surface-inspector-menu [data-surface-inspector-select]').click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("todo_title")
        && inspector.textContent.includes("Live Save-Back")
        && inspector.textContent.includes("Read-only:")
        && inspector.textContent.includes("context frontend")
        && inspector.textContent.includes("Propose Save-Back")
      );
    });
    assert.equal(await page.locator('[data-surface-inspector-edit-form]').count(), 0);
    assert.equal(await page.locator('[data-surface-inspector-proposal-form]').count(), 1);

    await page.locator('[data-surface-inspector-proposal-form] textarea[name="text"]').fill("Witness Todo Proposed");
    await page.locator('[data-surface-inspector-proposal-form] input[name="reason"]').fill("Shared title should change");

    const proposalResponse = page.waitForResponse(response =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/proposals"
      && response.status() === 201
    );
    await page.locator('[data-surface-inspector-propose]').click();
    const proposalBody = await (await proposalResponse).json();
    const proposalId = proposalBody?.proposal?.id || "";
    assert.match(proposalId, /^proposal\.widget\.update\.todo_title\./);

    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("Proposed todo_title as proposal.widget.update.todo_title.")
      );
    });

    approverContext = await browser.newContext();
    approverPage = await approverContext.newPage();
    await approverPage.goto(`${server.url}/`);
    await waitForAppReady(approverPage);
    await signIn(approverPage, { username: "aaron", password: "aaron", label: "Aaron" });

    const approved = await approverPage.evaluate(async id => {
      const response = await fetch(`/api/proposals/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const body = await response.json().catch(() => ({}));
      return { status: response.status, body };
    }, proposalId);
    assert.equal(approved.status, 200);

    await page.waitForFunction(expected => {
      const title = document.querySelector('[data-widget="todo_title"]');
      return Boolean(title && title.textContent && title.textContent.includes(expected));
    }, "Witness Todo Proposed");

    await expectNoRuntimeErrors(runtime);
  } finally {
    if (approverContext) await approverContext.close();
    await closeBrowser();
    await closeServer();
  }
});

test("live page inspector can create a real widgetVersion.activate proposal for a read-only shared versioned widget and live-refresh after approval", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    browser,
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();
  let approverContext = null;
  let approverPage = null;

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await signIn(page, { username: "callan", password: "callan", label: "Callan" });

    await page.locator('[data-surface-inspector-toggle]').click();
    await page.locator('[data-widget="todo_versioned_banner"]').click({ button: "right" });
    await page.locator('.surface-inspector-menu').waitFor();
    await page.locator('.surface-inspector-menu [data-surface-inspector-select]').click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("todo_versioned_banner")
        && inspector.textContent.includes("Widget Versions")
        && inspector.textContent.includes("Propose Activate")
      );
    });

    await page.locator('[data-surface-inspector-version-proposal-form][data-surface-inspector-proposal-process="widgetVersion.activate"] input[name="reason"]').fill("Promote the shared banner draft");

    const proposalResponse = page.waitForResponse(response =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/proposals"
      && response.status() === 201
    );
    await page.locator('[data-surface-inspector-propose-version="activate"]').first().click();
    const proposalBody = await (await proposalResponse).json();
    const proposalId = proposalBody?.proposal?.id || "";
    assert.match(proposalId, /^proposal\.widgetVersion\.activate\.todo_versioned_banner\./);

    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("Proposed activate todo_versioned_banner_v2 as proposal.widgetVersion.activate.todo_versioned_banner.")
      );
    });

    approverContext = await browser.newContext();
    approverPage = await approverContext.newPage();
    await approverPage.goto(`${server.url}/`);
    await waitForAppReady(approverPage);
    await signIn(approverPage, { username: "aaron", password: "aaron", label: "Aaron" });

    const approved = await approverPage.evaluate(async id => {
      const response = await fetch(`/api/proposals/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const body = await response.json().catch(() => ({}));
      return { status: response.status, body };
    }, proposalId);
    assert.equal(approved.status, 200);

    await page.waitForFunction(expected => {
      const banner = document.querySelector('[data-widget="todo_versioned_banner"]');
      return Boolean(banner && banner.textContent && banner.textContent.includes(expected));
    }, "Versioned widget: v2");

    await expectNoRuntimeErrors(runtime);
  } finally {
    if (approverContext) await approverContext.close();
    await closeBrowser();
    await closeServer();
  }
});

test("live page inspector can create a real widgetVersion.rollback proposal for a read-only shared versioned widget and live-refresh after approval", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    browser,
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();
  let approverContext = null;
  let approverPage = null;

  try {
    approverContext = await browser.newContext();
    approverPage = await approverContext.newPage();
    await approverPage.goto(`${server.url}/`);
    await waitForAppReady(approverPage);
    await signIn(approverPage, { username: "aaron", password: "aaron", label: "Aaron" });

    const activated = await approverPage.evaluate(async () => {
      const response = await fetch("/api/widget-versions/todo_versioned_banner/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "todo_versioned_banner_v2" })
      });
      const body = await response.json().catch(() => ({}));
      return { status: response.status, body };
    });
    assert.equal(activated.status, 200);

    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await signIn(page, { username: "callan", password: "callan", label: "Callan" });

    await page.locator('[data-surface-inspector-toggle]').click();
    await page.locator('[data-widget="todo_versioned_banner"]').click({ button: "right" });
    await page.locator('.surface-inspector-menu').waitFor();
    await page.locator('.surface-inspector-menu [data-surface-inspector-select]').click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("todo_versioned_banner")
        && inspector.textContent.includes("Propose Rollback To todo_versioned_banner_v1")
      );
    });

    await page.locator('[data-surface-inspector-version-proposal-form][data-surface-inspector-proposal-process="widgetVersion.rollback"] input[name="reason"]').fill("Restore the previous shared banner");

    const proposalResponse = page.waitForResponse(response =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/proposals"
      && response.status() === 201
    );
    await page.locator('[data-surface-inspector-propose-version="rollback"]').first().click();
    const proposalBody = await (await proposalResponse).json();
    const proposalId = proposalBody?.proposal?.id || "";
    assert.match(proposalId, /^proposal\.widgetVersion\.rollback\.todo_versioned_banner\./);

    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("Proposed rollback todo_versioned_banner as proposal.widgetVersion.rollback.todo_versioned_banner.")
      );
    });

    const approved = await approverPage.evaluate(async id => {
      const response = await fetch(`/api/proposals/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const body = await response.json().catch(() => ({}));
      return { status: response.status, body };
    }, proposalId);
    assert.equal(approved.status, 200);

    await page.waitForFunction(expected => {
      const banner = document.querySelector('[data-widget="todo_versioned_banner"]');
      return Boolean(banner && banner.textContent && banner.textContent.includes(expected));
    }, "Versioned widget: v1");

    await expectNoRuntimeErrors(runtime);
  } finally {
    if (approverContext) await approverContext.close();
    await closeBrowser();
    await closeServer();
  }
});

test("live page command surface can inspect a current-page widget and open its real process view", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);

    await page.locator('[data-surface-command-toggle]').click();
    await page.locator('[data-surface-command-input]').fill("todo_add_button");
    await page.locator('.world-command-item', { hasText: "Inspect Widget todo_add_button" }).click();

    await page.waitForFunction(() => {
      const inspector = document.querySelector('.surface-inspector-panel');
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("todo_add_button")
        && inspector.textContent.includes("submit:todo_form")
      );
    });

    await page.locator('[data-surface-command-toggle]').click();
    await page.locator('[data-surface-command-input]').fill("open process for selected widget");
    await page.locator('.world-command-item', { hasText: "Open Process For Selected Widget" }).click();

    await page.waitForURL(url =>
      url.pathname === "/process"
      && url.searchParams.get("program") === "todo_frontend_program"
      && url.searchParams.get("event") === "submit:todo_form"
    );
    await page.locator('[data-process-view]').waitFor();

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live page command surface exposes the whoami shortcut, edits the current identity inline, and still hands off into bootstrap", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await signIn(page, { username: "aaron", password: "aaron", label: "Aaron" });

    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }));
    });

    await page.waitForFunction(() => {
      const input = document.querySelector('[data-surface-command-input]');
      const result = document.querySelector('[data-surface-command-result="whoami"]');
      return Boolean(
        input
        && input.value === 'whoami'
        && result
        && result.textContent
        && result.textContent.includes('identity.aaron')
        && result.textContent.includes('sourcerer')
        && result.textContent.includes('TRUE')
      );
    });

    await page.waitForFunction(() => Boolean(document.querySelector('[data-surface-command-identity-form]')));
    await page.fill('[data-surface-command-identity-form] input[name="label"]', "Aaron Inline");
    const inlineUpdate = page.waitForResponse(response =>
      response.request().method() === "PATCH"
      && new URL(response.url()).pathname === "/api/identities/identity.aaron"
      && response.status() === 200
    );
    await page.locator('[data-surface-command-identity-form]').evaluate(form => form.requestSubmit());
    await inlineUpdate;
    await page.waitForFunction(() => {
      const result = document.querySelector('[data-surface-command-result="whoami"]');
      return Boolean(
        result
        && result.textContent
        && result.textContent.includes("Aaron Inline")
        && result.textContent.includes("Saved identity.aaron.")
      );
    });

    await page.locator('[data-surface-command-result-bootstrap]').click();
    await page.waitForURL(url => url.pathname === "/_bootstrap" && url.searchParams.get("identity") === "identity.aaron");
    await page.waitForFunction(() => {
      const heading = document.getElementById("identity-heading");
      const submit = document.getElementById("identity-submit-button");
      const idField = document.querySelector('#identity-form input[name="id"]');
      const actorField = document.querySelector('#identity-form input[name="actor"]');
      const labelField = document.querySelector('#identity-form input[name="label"]');
      return Boolean(
        heading
        && heading.textContent.includes("Edit Identity")
        && submit
        && submit.textContent.includes("Save Identity")
        && idField
        && idField.value === "identity.aaron"
        && idField.disabled === true
        && actorField
        && actorField.value === "aaron"
        && actorField.disabled === true
        && labelField
        && labelField.value === "Aaron Inline"
      );
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live page command surface can reach capabilities in world and hidden bootstrap surfaces", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);

    await page.locator('[data-surface-command-toggle]').click();
    await page.locator('[data-surface-command-input]').fill("dom.render");
    await page.locator('.world-command-item', { hasText: "dom.render" }).click();

    await page.waitForURL(url => url.pathname === "/world" && url.searchParams.get("select") === "dom.render");
    await page.waitForFunction(() => {
      const inspector = document.querySelector('.world-graph-inspector');
      return Boolean(inspector && inspector.textContent && inspector.textContent.includes("dom.render"));
    });

    await page.goto(`${server.url}/`);
    await waitForAppReady(page);

    await page.locator('[data-surface-command-toggle]').click();
    await page.locator('[data-surface-command-input]').fill("bootstrap");
    await page.locator('.world-command-item', { hasText: "Open Bootstrap" }).click();

    await page.waitForURL(url => url.pathname === "/_bootstrap");
    await page.locator('text=Semi-Internal Bootstrap Seam').waitFor();

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
