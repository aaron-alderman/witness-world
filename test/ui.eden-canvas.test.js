import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { moduleProjectors } from "../src/modules.js";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer as startUiDemoServerBase } from "./support/harness.js";

const edenDslPath = path.join(process.cwd(), "examples", "eden/app.wtoml");

function startUiDemoServer(options = {}) {
  return startUiDemoServerBase({
    dslPath: edenDslPath,
    ...options
  });
}

async function openSessionCookie(url, { username = "aaron", password = username } = {}) {
  const response = await fetch(`${url}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  assert.equal(response.status, 200);
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

async function apiRequest(url, pathname, { cookie = null, method = "GET", body = null } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body != null) headers["content-type"] = "application/json";
  return fetch(`${url}${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  });
}

async function addSessionCookieToPage(page, url, cookie) {
  const [name, ...rest] = String(cookie || "").split("=");
  const value = rest.join("=");
  assert.ok(name && value, "expected a session cookie");
  await page.context().addCookies([{ url, name, value }]);
}

async function seedGovernanceReadyState(url) {
  const cookie = await openSessionCookie(url);

  await apiRequest(url, "/api/eden/personal-box/items", {
    cookie,
    method: "POST",
    body: { kind: "note", text: "Practice the commons" }
  });
  await apiRequest(url, "/api/eden/page-theme", {
    cookie,
    method: "PUT",
    body: { themeId: "moss", material: "stone", typography: "serif" }
  });
  await apiRequest(url, "/api/eden/versions/activate", {
    cookie,
    method: "POST",
    body: { version: "todo_versioned_banner_v2" }
  });
  await apiRequest(url, "/api/eden/versions/rollback", {
    cookie,
    method: "POST"
  });
  await apiRequest(url, "/api/eden/capability-installs", {
    cookie,
    method: "POST",
    body: { capability: "notes.sidebar" }
  });
  await apiRequest(url, "/api/eden/versions/activate", {
    cookie,
    method: "POST",
    body: { version: "todo_versioned_banner_v2" }
  });
  await apiRequest(url, "/api/eden/versions/publish", {
    cookie,
    method: "POST",
    body: { version: "todo_versioned_banner_v2" }
  });
  await apiRequest(url, "/api/process-view?program=todo_frontend_program&event=load", {
    cookie
  });
  await apiRequest(url, "/api/simulate-network-error", {
    cookie
  });
  await apiRequest(url, "/api/eden/page-theme", {
    cookie,
    method: "PUT",
    body: { themeId: "straw", material: "wood", typography: "mono" }
  });
  await apiRequest(url, "/api/eden/versions/publish", {
    cookie,
    method: "POST",
    body: { version: "todo_versioned_banner_v2" }
  });

  const academy = await apiRequest(url, "/api/eden/academy", { cookie }).then(response => response.json());
  assert.equal(
    academy.surfaces.some(surface =>
      surface.id === "eden.surface.world"
      && surface.actions.some(action => action.id === "world_commons" && action.state === "open")
    ),
    true
  );

  return cookie;
}

test("eden canvas reveals the neighborhood on zoom and goto world transports correctly", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('#eden-stage');
    await page.waitForSelector('[data-eden-surface="eden.surface.todo"]');
    await page.waitForFunction(() => document.getElementById('eden-prompt')?.textContent.includes('mouse wheel'));
    await page.waitForFunction(() => document.getElementById('eden-chapter-title')?.textContent.includes('Arrival'));

    const visibleBefore = await page.locator('[data-eden-surface]:not([hidden])').count();
    assert(visibleBefore >= 1);

    for (let i = 0; i < 6; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }

    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.process"]')?.hidden);
    await page.waitForFunction(() => document.getElementById('eden-chapter-title')?.textContent.includes('Orientation'));
    await page.waitForFunction(() => document.body.textContent.includes('Edit Shared Surface'));
    const visibleAfter = await page.locator('[data-eden-surface]:not([hidden])').count();
    assert(visibleAfter > visibleBefore);

    for (let i = 0; i < 4; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }

    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.goto.world"]')?.hidden);
    await page.locator('[data-eden-surface="eden.goto.world"]').click();
    await page.waitForURL(`${url}/world`);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden personal box supports in-world sign-in and local widget authoring", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('[data-eden-surface="eden.surface.personal"]');
    await page.fill('[data-eden-personal-username]', 'aaron');
    await page.fill('[data-eden-personal-password]', 'aaron');
    await page.locator('[data-eden-login-form]').evaluate(form => form.requestSubmit());

    await page.waitForFunction(() => document.body.textContent.includes('Room claimed. Your box is live.'));
    await page.selectOption('[data-eden-personal-form] select[name="kind"]', 'note');
    await page.fill('[data-eden-personal-form] input[name="text"]', 'Plant the lamp');
    await page.locator('[data-eden-personal-form]').evaluate(form => form.requestSubmit());

    await page.waitForFunction(() => document.body.textContent.includes('Plant the lamp'));
    await page.locator('.eden-personal-item button[data-eden-personal-edit]').evaluate(button => button.click());
    await page.fill('[data-eden-personal-form] input[name="text"]', 'Plant the lantern');
    await page.locator('[data-eden-personal-form]').evaluate(form => form.requestSubmit());

    await page.waitForFunction(() => document.body.textContent.includes('Plant the lantern'));
    await page.locator('.eden-personal-item button[data-eden-personal-delete]').evaluate(button => button.click());
    await page.waitForFunction(() => !document.body.textContent.includes('Plant the lantern'));

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden canvas projects Todo relief sections from real widget ids on the live board", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('[data-eden-surface="eden.surface.todo"]');
    await page.waitForFunction(() => document.querySelector('[data-eden-relief="todo_form"]'));
    await page.waitForFunction(() => document.querySelector('[data-eden-relief="todo_version_playground"]')?.getAttribute('data-signal-count') !== '0');
    await page.locator('[data-eden-relief="todo_private_notes"]').evaluate(node => node.click());
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-eden-relief="todo_private_notes"]');
      return node && node.getAttribute('data-relief') === '3';
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden canvas can inspect and mutate live Todo widgets directly inside the embedded board", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('[data-eden-surface="eden.surface.todo"]');
    await page.locator('[data-eden-embedded-inspect]').click();
    await page.waitForFunction(() => document.querySelector('[data-eden-embedded-mode]')?.textContent.includes('Inspect mode'));

    const frame = page.frameLocator('[data-eden-surface="eden.surface.todo"] iframe');
    await frame.locator('[data-widget="todo_username_input"]').fill('aaron');
    await frame.locator('[data-widget="todo_password_input"]').fill('aaron');
    await frame.locator('[data-widget="todo_open_button"]').click();
    await frame.locator('[data-widget="todo_session_status"]').waitFor();
    await frame.locator('[data-widget="todo_title"]').click({ button: 'right' });
    await frame.locator('.surface-inspector-menu').waitFor();
    await frame.locator('.surface-inspector-menu [data-surface-inspector-select]').click();
    await frame.locator('[data-surface-inspector-edit-form]').waitFor();
    await frame.locator('[data-surface-inspector-edit-form] textarea[name="text"]').fill('Witness Todo From Eden');

    const saveRequest = page.waitForResponse(response =>
      response.request().method() === 'PATCH'
      && new URL(response.url()).pathname === '/api/widgets/todo_title'
      && response.status() === 200
    );
    await frame.locator('[data-surface-inspector-save]').click();
    await saveRequest;

    await frame.locator('.surface-inspector-panel').waitFor();
    await page.waitForFunction(() => {
      const frame = document.querySelector('[data-eden-surface="eden.surface.todo"] iframe');
      const doc = frame?.contentDocument;
      const title = doc?.querySelector?.('[data-widget="todo_title"]');
      const inspector = doc?.querySelector?.('.surface-inspector-panel');
      return Boolean(
        title
        && title.textContent
        && title.textContent.includes('Witness Todo From Eden')
        && inspector
        && inspector.textContent
        && inspector.textContent.includes('Saved todo_title.')
      );
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden canvas F1 expert shortcut opens whoami on the embedded board command surface", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('[data-eden-surface="eden.surface.todo"]');
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }));
    });

    await page.waitForFunction(() => document.querySelector('[data-eden-embedded-mode]')?.textContent.includes('Inspect mode'));
    await page.waitForFunction(() => {
      const frame = document.querySelector('[data-eden-surface="eden.surface.todo"] iframe');
      const doc = frame?.contentDocument;
      const input = doc?.querySelector?.('[data-surface-command-input]');
      const result = doc?.querySelector?.('[data-surface-command-result="whoami"]');
      return Boolean(
        input
        && input.value === 'whoami'
        && result
        && result.textContent
        && result.textContent.includes('sourcerer')
        && result.textContent.includes('TRUE')
      );
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden canvas whoami shortcut can edit the current identity inline on the embedded board", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('[data-eden-surface="eden.surface.todo"]');
    await page.locator('[data-eden-embedded-inspect]').click();
    await page.waitForFunction(() => document.querySelector('[data-eden-embedded-mode]')?.textContent.includes('Inspect mode'));

    const frame = page.frameLocator('[data-eden-surface="eden.surface.todo"] iframe');
    await frame.locator('[data-widget="todo_username_input"]').fill('aaron');
    await frame.locator('[data-widget="todo_password_input"]').fill('aaron');
    await frame.locator('[data-widget="todo_open_button"]').click();
    await frame.locator('[data-widget="todo_session_status"]').waitFor();
    await frame.locator('[data-widget="todo_session_status"]').waitFor({
      state: "visible"
    });
    await page.waitForFunction(() => {
      const frame = document.querySelector('[data-eden-surface="eden.surface.todo"] iframe');
      const doc = frame?.contentDocument;
      const status = doc?.querySelector?.('[data-widget="todo_session_status"]');
      return Boolean(status && status.textContent && status.textContent.includes('Signed in as Aaron'));
    });

    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }));
    });

    await page.waitForFunction(() => {
      const frame = document.querySelector('[data-eden-surface="eden.surface.todo"] iframe');
      const doc = frame?.contentDocument;
      const form = doc?.querySelector?.('[data-surface-command-identity-form]');
      return Boolean(form);
    });

    await frame.locator('[data-surface-command-identity-form] input[name="label"]').fill('Aaron Eden');
    const inlineUpdate = page.waitForResponse(response =>
      response.request().method() === 'PATCH'
      && new URL(response.url()).pathname === '/api/identities/identity.aaron'
      && response.status() === 200
    );
    await frame.locator('[data-surface-command-identity-form]').evaluate(form => form.requestSubmit());
    await inlineUpdate;

    await page.waitForFunction(() => {
      const frame = document.querySelector('[data-eden-surface="eden.surface.todo"] iframe');
      const doc = frame?.contentDocument;
      const result = doc?.querySelector?.('[data-surface-command-result="whoami"]');
      return Boolean(
        result
        && result.textContent
        && result.textContent.includes('Aaron Eden')
        && result.textContent.includes('Saved identity.aaron.')
      );
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden edit page can restyle the live Todo surface for the current session", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('[data-eden-surface="eden.surface.edit"]');
    await page.fill('[data-eden-edit-login-form] input[name="username"]', 'aaron');
    await page.fill('[data-eden-edit-login-form] input[name="password"]', 'aaron');
    await page.locator('[data-eden-edit-login-form]').evaluate(form => form.requestSubmit());

    await page.waitForFunction(() => document.body.textContent.includes('Edit page unlocked for this session.'));
    await page.selectOption('[data-eden-edit-form] select[name="themeId"]', 'moss');
    await page.selectOption('[data-eden-edit-form] select[name="material"]', 'stone');
    await page.selectOption('[data-eden-edit-form] select[name="typography"]', 'serif');
    await page.locator('[data-eden-edit-form]').evaluate(form => form.requestSubmit());

    await page.waitForFunction(() => document.body.textContent.includes('Todo page treatment updated.'));
    await page.goto(`${url}/`);
    await page.waitForLoadState('domcontentloaded');
    assert.equal(await page.locator('body').getAttribute('data-page-theme'), 'moss');
    assert.equal(await page.locator('body').getAttribute('data-page-material'), 'stone');
    assert.equal(await page.locator('body').getAttribute('data-page-typography'), 'serif');

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden world surface can install a capability from the place the need is discovered", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('#eden-stage');
    for (let i = 0; i < 6; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.world"]')?.hidden);
    await page.fill('[data-eden-capability-login-form] input[name="username"]', 'aaron');
    await page.fill('[data-eden-capability-login-form] input[name="password"]', 'aaron');
    await page.locator('[data-eden-capability-login-form]').evaluate(form => form.requestSubmit());

    await page.waitForFunction(() => document.body.textContent.includes('Capability shelf unlocked for this session.'));
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-eden-capability="notes.sidebar"] [data-eden-capability-install]');
      return Boolean(button && !button.disabled && button.textContent?.includes('Install'));
    });
    const installRequest = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/eden/capability-installs'
      && response.status() === 200
    );
    await page.locator('[data-eden-capability="notes.sidebar"] [data-eden-capability-install]').evaluate(button => button.click());
    await installRequest;

    await page.waitForFunction(() => {
      const scope = document.querySelector('[data-eden-surface="eden.surface.world"]');
      return Boolean(
        scope
        && scope.textContent
        && scope.textContent.includes('Installed Notes Sidebar on frontend context.')
        && scope.textContent.includes('Notes Sidebar')
      );
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden versions can open draft, publish current, and restore last good from inside the neighborhood", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('#eden-stage');
    for (let i = 0; i < 10; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.versions"]')?.hidden);
    await page.fill('[data-eden-version-login-form] input[name="username"]', 'aaron');
    await page.fill('[data-eden-version-login-form] input[name="password"]', 'aaron');
    await page.locator('[data-eden-version-login-form]').evaluate(form => form.requestSubmit());

    await page.waitForFunction(() => document.body.textContent.includes('Versions unlocked for this session.'));
    await page.click('[data-eden-version-open-draft]');
    await page.waitForFunction(() => document.body.textContent.includes('Draft version opened in the live board.'));
    await page.goto(`${url}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => document.body.textContent.includes('Versioned widget: v2'));

    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('#eden-stage');
    for (let i = 0; i < 10; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.versions"]')?.hidden);
    await page.click('[data-eden-version-publish]');
    await page.waitForFunction(() => document.body.textContent.includes('Current live version is now published.'));
    await page.waitForFunction(() => document.body.textContent.includes('todo_versioned_banner_v2'));

    await page.click('[data-eden-version-restore]');
    await page.waitForFunction(() => document.body.textContent.includes('Restored the last good version.'));
    await page.goto(`${url}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => document.body.textContent.includes('Versioned widget: v1'));

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden versions surface exposes explicit proposal actions for read-only actors and can refresh after approval", async () => {
  const { world, server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    const loginAaron = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    const aaronCookie = (loginAaron.headers.get("set-cookie") || "").split(";")[0];
    assert.equal(loginAaron.status, 200);

    const activateDraft = await fetch(`${url}/api/eden/versions/activate`, {
      method: "POST",
      headers: {
        cookie: aaronCookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({ version: "todo_versioned_banner_v2" })
    });
    assert.equal(activateDraft.status, 200);

    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('#eden-stage');
    for (let i = 0; i < 10; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.versions"]')?.hidden);
    await page.fill('[data-eden-version-login-form] input[name="username"]', 'callan');
    await page.fill('[data-eden-version-login-form] input[name="password"]', 'callan');
    await page.locator('[data-eden-version-login-form]').evaluate(form => form.requestSubmit());

    await page.waitForFunction(() => {
      const session = document.querySelector('[data-eden-version-session]');
      const button = document.querySelector('[data-eden-version-publish]');
      return Boolean(
        session?.textContent?.includes('create real proposals for the shared board')
        && button?.textContent?.includes('Propose Publish Current')
      );
    });

    await page.click('[data-eden-version-publish]');
    await page.waitForFunction(() => document.body.textContent.includes('Proposed publishing the current live version as proposal.'));

    const proposal = world.project(moduleProjectors.proposals).find(row =>
      row.targetProcess === 'edenVersions.publish'
      && row.targetId === 'todo_versioned_banner'
      && row.status === 'open'
    );
    assert.ok(proposal?.id);

    const approved = await fetch(`${url}/api/proposals/${encodeURIComponent(proposal.id)}/approve`, {
      method: 'POST',
      headers: { cookie: aaronCookie }
    });
    assert.equal(approved.status, 200);

    await page.click('[data-eden-version-refresh]');
    await page.waitForFunction(() => document.body.textContent.includes('Reloaded version state.'));
    const versions = await fetch(`${url}/api/eden/versions`, {
      headers: { cookie: aaronCookie }
    }).then(response => response.json());
    assert.equal(versions.versionState.publishedVersion, 'todo_versioned_banner_v2');

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden capability install surface exposes explicit proposal actions for read-only actors and can refresh after approval", async () => {
  const { world, server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    const loginAaron = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "aaron", password: "aaron" })
    });
    const aaronCookie = (loginAaron.headers.get("set-cookie") || "").split(";")[0];
    assert.equal(loginAaron.status, 200);

    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('#eden-stage');
    for (let i = 0; i < 6; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.world"]')?.hidden);
    await page.fill('[data-eden-capability-login-form] input[name="username"]', 'callan');
    await page.fill('[data-eden-capability-login-form] input[name="password"]', 'callan');
    await page.locator('[data-eden-capability-login-form]').evaluate(form => form.requestSubmit());

    await page.waitForFunction(() => {
      const session = document.querySelector('[data-eden-capability-session]');
      const button = document.querySelector('[data-eden-capability="notes.sidebar"] [data-eden-capability-install]');
      return Boolean(
        session?.textContent?.includes('create real install proposals for frontend context')
        && button?.textContent?.includes('Propose install')
      );
    });

    await page.locator('[data-eden-capability="notes.sidebar"] [data-eden-capability-install]').evaluate(button => button.click());
    await page.waitForFunction(() => document.body.textContent.includes('Proposed installing Notes Sidebar on frontend context as proposal.'));

    const proposal = world.project(moduleProjectors.proposals).find(row =>
      row.targetProcess === 'capability.install'
      && row.targetId === 'frontend'
      && row.status === 'open'
    );
    assert.ok(proposal?.id);

    const approved = await fetch(`${url}/api/proposals/${encodeURIComponent(proposal.id)}/approve`, {
      method: 'POST',
      headers: { cookie: aaronCookie }
    });
    assert.equal(approved.status, 200);

    await page.click('[data-eden-capability-refresh]');
    await page.waitForFunction(() => document.body.textContent.includes('Reloaded capability state.'));
    await page.waitForFunction(() => document.body.textContent.includes('Installed'));
    const installs = await fetch(`${url}/api/eden/capability-installs`, {
      headers: { cookie: aaronCookie }
    }).then(response => response.json());
    assert.equal(installs.capabilityState.installedCapabilities.some(capability => capability.id === 'notes.sidebar'), true);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden academy progression unlocks shared stewardship after the practical first arc is exercised", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('[data-eden-surface="eden.surface.personal"]');
    await page.fill('[data-eden-personal-username]', 'aaron');
    await page.fill('[data-eden-personal-password]', 'aaron');
    await page.locator('[data-eden-login-form]').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.body.textContent.includes('Room claimed. Your box is live.'));
    await page.selectOption('[data-eden-personal-form] select[name="kind"]', 'note');
    await page.fill('[data-eden-personal-form] input[name="text"]', 'Earn the first gate');
    await page.locator('[data-eden-personal-form]').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.body.textContent.includes('Widget added.'));

    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.edit"] [data-eden-edit-editor]')?.hidden);
    await page.selectOption('[data-eden-edit-form] select[name="themeId"]', 'moss');
    await page.selectOption('[data-eden-edit-form] select[name="material"]', 'stone');
    await page.selectOption('[data-eden-edit-form] select[name="typography"]', 'serif');
    await page.locator('[data-eden-edit-form]').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.body.textContent.includes('Todo page treatment updated.'));

    for (let i = 0; i < 10; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.versions"]')?.hidden);
    await page.click('[data-eden-version-open-draft]');
    await page.waitForFunction(() => document.body.textContent.includes('Draft version opened in the live board.'));
    await page.click('[data-eden-version-restore]');
    await page.waitForFunction(() => document.body.textContent.includes('Restored the last good version.'));

    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.world"]')?.hidden);
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-eden-capability="notes.sidebar"] [data-eden-capability-install]');
      return Boolean(button && !button.disabled);
    });
    await page.locator('[data-eden-capability="notes.sidebar"] [data-eden-capability-install]').evaluate(button => button.click());
    await page.waitForFunction(() => document.body.textContent.includes('Installed Notes Sidebar on frontend context.'));

    await page.click('#eden-reset-view');
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('[data-eden-surface="eden.surface.personal"] .eden-chip')];
      const action = buttons.find(node => node.textContent && node.textContent.includes('Edit Shared Surface'));
      return Boolean(action && action.classList.contains('is-open') && !action.disabled);
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden repeated practice opens broader Tree consequences", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('[data-eden-surface="eden.surface.personal"]');
    await page.fill('[data-eden-personal-username]', 'aaron');
    await page.fill('[data-eden-personal-password]', 'aaron');
    await page.locator('[data-eden-login-form]').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.body.textContent.includes('Room claimed. Your box is live.'));
    await page.selectOption('[data-eden-personal-form] select[name="kind"]', 'note');
    await page.fill('[data-eden-personal-form] input[name="text"]', 'Practice the shared loop');
    await page.locator('[data-eden-personal-form]').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.body.textContent.includes('Widget added.'));

    await page.selectOption('[data-eden-edit-form] select[name="themeId"]', 'moss');
    await page.selectOption('[data-eden-edit-form] select[name="material"]', 'stone');
    await page.selectOption('[data-eden-edit-form] select[name="typography"]', 'serif');
    await page.locator('[data-eden-edit-form]').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.body.textContent.includes('Todo page treatment updated.'));

    for (let i = 0; i < 10; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.versions"]')?.hidden);
    await page.click('[data-eden-version-open-draft]');
    await page.waitForFunction(() => document.body.textContent.includes('Draft version opened in the live board.'));
    await page.click('[data-eden-version-restore]');
    await page.waitForFunction(() => document.body.textContent.includes('Restored the last good version.'));

    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.world"]')?.hidden);
    await page.locator('[data-eden-capability="notes.sidebar"] [data-eden-capability-install]').evaluate(button => button.click());
    await page.waitForFunction(() => document.body.textContent.includes('Installed Notes Sidebar on frontend context.'));

    await page.click('#eden-reset-view');
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('[data-eden-surface="eden.surface.tree"] .eden-chip')];
      const shared = buttons.find(node => node.textContent && node.textContent.includes('Shared Table'));
      const stall = buttons.find(node => node.textContent && node.textContent.includes('Run A Stall'));
      return Boolean(
        shared && shared.classList.contains('is-open')
        && stall && stall.classList.contains('is-locked')
      );
    });

    for (let i = 0; i < 10; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.versions"]')?.hidden);
    await page.click('[data-eden-version-open-draft]');
    await page.waitForFunction(() => document.body.textContent.includes('Draft version opened in the live board.'));
    await page.click('[data-eden-version-publish]');
    await page.waitForFunction(() => document.body.textContent.includes('Current live version is now published.'));

    for (let i = 0; i < 4; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, -480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.process"]')?.hidden);
    await page.click('[data-eden-process-inspect]');
    await page.waitForFunction(() => document.body.textContent.includes('Process graph read from the live runtime.'));
    await page.click('[data-eden-process-drill]');
    await page.waitForFunction(() => document.body.textContent.includes('Failure drill witnessed. The runtime answered honestly.'));
    runtime.consoleErrors = runtime.consoleErrors.filter(entry => !entry.message.includes('status of 503'));

    await page.click('#eden-reset-view');
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('[data-eden-surface="eden.surface.tree"] .eden-chip')];
      const stall = buttons.find(node => node.textContent && node.textContent.includes('Run A Stall'));
      const saas = buttons.find(node => node.textContent && node.textContent.includes('Ship A Tiny SaaS'));
      return Boolean(
        stall && stall.classList.contains('is-open')
        && saas && saas.classList.contains('is-locked')
      );
    });

    await page.selectOption('[data-eden-edit-form] select[name="themeId"]', 'straw');
    await page.selectOption('[data-eden-edit-form] select[name="material"]', 'wood');
    await page.selectOption('[data-eden-edit-form] select[name="typography"]', 'mono');
    await page.locator('[data-eden-edit-form]').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.body.textContent.includes('Todo page treatment updated.'));

    for (let i = 0; i < 10; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.versions"]')?.hidden);
    await page.click('[data-eden-version-open-draft]');
    await page.waitForFunction(() => document.body.textContent.includes('Draft version opened in the live board.'));
    await page.click('[data-eden-version-publish]');
    await page.waitForFunction(() => document.body.textContent.includes('Current live version is now published.'));

    await page.click('#eden-reset-view');
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('[data-eden-surface="eden.surface.tree"] .eden-chip')];
      const saas = buttons.find(node => node.textContent && node.textContent.includes('Ship A Tiny SaaS'));
      return Boolean(saas && saas.classList.contains('is-open'));
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden commons panel can run a real organization loop after the responsibility path", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    const cookie = await seedGovernanceReadyState(url);
    await addSessionCookieToPage(page, url, cookie);

    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('[data-eden-surface="eden.surface.personal"]');

    await page.click('#eden-reset-view');
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('[data-eden-surface="eden.surface.world"] .eden-chip')];
      const action = buttons.find(node => node.textContent && node.textContent.includes('Practice Governance'));
      return Boolean(action && action.classList.contains('is-open'));
    });

    for (let i = 0; i < 8; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.commons"]')?.hidden);
    await page.click('[data-eden-organization-create-context]');
    await page.waitForFunction(() => document.body.textContent.includes('Group started under the commons.'));
    await page.click('[data-eden-organization-grant-stewardship]');
    await page.waitForFunction(() => document.body.textContent.includes('Delegated commons stewardship to callan.'));
    await page.click('[data-eden-organization-create-proposal]');
    await page.waitForFunction(() => document.body.textContent.includes('Governance proposal opened in the commons.'));
    await page.click('[data-eden-organization-approve-proposal]');
    await page.waitForFunction(() => document.body.textContent.includes('Open organization witnessed through approval.'));
    await page.waitForFunction(() => document.body.textContent.includes('governance practiced'));

    await page.click('#eden-reset-view');
    await page.waitForFunction(() => {
      const treeButtons = [...document.querySelectorAll('[data-eden-surface="eden.surface.tree"] .eden-chip')];
      const commons = treeButtons.find(node => node.textContent && node.textContent.includes('Run An Open Organization'));
      return Boolean(commons && commons.classList.contains('is-open'));
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden tree theory annex can be unlocked and earn the trained mark in-world", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('[data-eden-surface="eden.surface.tree"]');
    await page.locator('[data-eden-tree-login-form] [name="username"]').fill('aaron');
    await page.locator('[data-eden-tree-login-form] [name="password"]').fill('aaron');
    await page.locator('[data-eden-tree-login-form]').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.body.textContent.includes('Theory annex open. Optional study now counts.'));

    await page.selectOption('[data-eden-personal-form] select[name="kind"]', 'note');
    await page.fill('[data-eden-personal-form] input[name="text"]', 'Open the annex');
    await page.locator('[data-eden-personal-form]').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.body.textContent.includes('Widget added.'));

    await page.selectOption('[data-eden-edit-form] select[name="themeId"]', 'moss');
    await page.selectOption('[data-eden-edit-form] select[name="material"]', 'stone');
    await page.selectOption('[data-eden-edit-form] select[name="typography"]', 'serif');
    await page.locator('[data-eden-edit-form]').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.body.textContent.includes('Todo page treatment updated.'));

    for (let i = 0; i < 4; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.versions"]')?.hidden);
    await page.click('[data-eden-version-open-draft]');
    await page.waitForFunction(() => document.body.textContent.includes('Draft version opened in the live board.'));
    await page.click('[data-eden-version-restore]');
    await page.waitForFunction(() => document.body.textContent.includes('Restored the last good version.'));

    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.world"]')?.hidden);
    await page.locator('[data-eden-capability="notes.sidebar"] [data-eden-capability-install]').evaluate(button => button.click());
    await page.waitForFunction(() => document.body.textContent.includes('Installed Notes Sidebar on frontend context.'));

    await page.click('#eden-reset-view');
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('[data-eden-surface="eden.surface.tree"] .eden-chip')];
      const action = buttons.find(node => node.textContent && node.textContent.includes('Theory Annex'));
      return Boolean(action && action.classList.contains('is-open'));
    });

    const lessonTitles = {
      why_contexts: 'Why Contexts Exist',
      witnesses_truth: 'Witnesses And Truth',
      authority_without_illusion: 'Authority Without Illusion',
      shells_and_expressions: 'Shells And Expressions'
    };
    for (const lessonId of ['why_contexts', 'witnesses_truth', 'authority_without_illusion', 'shells_and_expressions']) {
      await page.locator(`[data-eden-theory-lesson="${lessonId}"] [data-eden-theory-study]`).evaluate(button => button.click());
      await page.waitForFunction(({ id, title }) => {
        const button = document.querySelector(`[data-eden-theory-lesson="${id}"] [data-eden-theory-study]`);
        return document.body.textContent.includes('Studied ' + title + '.') && button && button.textContent === 'Studied' && button.disabled;
      }, { id: lessonId, title: lessonTitles[lessonId] });
    }
    await page.click('[data-eden-theory-assess]');
    await page.waitForFunction(() => document.body.textContent.includes('The trained mark is now witnessed on your path.'));
    await page.waitForFunction(() => document.body.textContent.includes('trained mark earned'));
    await page.fill('[data-eden-theory-teachback-note]', 'Contexts stay local until they are carried with intent.');
    await page.locator('[data-eden-theory-teachback]').evaluate(button => button.click());
    await page.waitForFunction(() => document.body.textContent.includes('Teach-back witnessed. Teaching now counts too.'));
    await page.waitForFunction(() => document.body.textContent.includes('first teach-back witnessed'));

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("eden process surface opens the operator gate from real process practice and can run the failure drill", async () => {
  const { server, url, close: closeServer } = await startUiDemoServer();
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${url}/eden-canvas`);
    await page.waitForSelector('[data-eden-surface="eden.surface.edit"]');
    await page.fill('[data-eden-personal-username]', 'aaron');
    await page.fill('[data-eden-personal-password]', 'aaron');
    await page.locator('[data-eden-login-form]').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.body.textContent.includes('Room claimed. Your box is live.'));

    for (let i = 0; i < 10; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, 480);
    }

    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.versions"]')?.hidden);
    await page.click('[data-eden-version-open-draft]');
    await page.waitForFunction(() => document.body.textContent.includes('Draft version opened in the live board.'));
    await page.click('[data-eden-version-restore]');
    await page.waitForFunction(() => document.body.textContent.includes('Restored the last good version.'));
    await page.click('[data-eden-version-open-draft]');
    await page.waitForFunction(() => document.body.textContent.includes('Draft version opened in the live board.'));
    await page.click('[data-eden-version-publish]');
    await page.waitForFunction(() => document.body.textContent.includes('Current live version is now published.'));

    for (let i = 0; i < 4; i += 1) {
      await page.locator('#eden-stage').hover();
      await page.mouse.wheel(0, -480);
    }
    await page.waitForFunction(() => !document.querySelector('[data-eden-surface="eden.surface.process"]')?.hidden);
    await page.click('[data-eden-process-inspect]');
    await page.waitForFunction(() => document.body.textContent.includes('Process graph read from the live runtime.'));
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('[data-eden-surface="eden.surface.process"] .eden-chip')];
      const action = buttons.find(node => node.textContent && node.textContent.includes('Alter Runtime'));
      return Boolean(action && action.classList.contains('is-open'));
    });

    await page.click('[data-eden-process-drill]');
    await page.waitForFunction(() => document.body.textContent.includes('Failure drill witnessed. The runtime answered honestly.'));
    await page.waitForFunction(() => {
      const rail = document.querySelector('[data-eden-process-quests]');
      return Boolean(rail && rail.textContent.includes('Run A Failure Drill') && rail.textContent.includes('Failure drill witnessed'));
    });
    runtime.consoleErrors = runtime.consoleErrors.filter(entry => !entry.message.includes('status of 503'));

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
