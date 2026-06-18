import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startBlankUiServer, startUiDemoServer, waitForAppReady } from "./support/harness.js";

async function currentTutorialStep(page) {
  return page.evaluate(() => window.__witnessTutorialApp?.currentStepId || window.__witnessTutorial?.currentStepId || null);
}

async function tutorialCompletedAt(page) {
  return page.evaluate(() => window.__witnessTutorialApp?.completedAt || window.__witnessTutorial?.completedAt || null);
}

async function waitForStep(page, expected) {
  await page.waitForFunction(stepId => (window.__witnessTutorialApp?.currentStepId || window.__witnessTutorial?.currentStepId || null) === stepId, expected);
}

async function waitForStepChange(page, previous) {
  await page.waitForFunction(stepId => {
    const current = window.__witnessTutorialApp?.currentStepId || window.__witnessTutorial?.currentStepId || null;
    const completedAt = window.__witnessTutorialApp?.completedAt || window.__witnessTutorial?.completedAt || null;
    return current !== stepId || Boolean(completedAt);
  }, previous, { timeout: 30000 });
}

async function openCompanionPanel(page) {
  await page.locator("#sourcery-companion-fab").click();
  await page.waitForFunction(() => document.getElementById("sourcery-companion-panel")?.hidden === false);
}

async function clickCompanionGuidanceAction(page) {
  await openCompanionPanel(page);
  await page.locator("#sourcery-companion-guidance-action").click({ force: true });
}

async function clickScopedSelector(page, selector) {
  await page.evaluate(sel => document.querySelector(sel)?.click(), selector);
}

async function completeStep(page, serverUrl) {
  const stepId = await currentTutorialStep(page);
  assert.ok(stepId, "expected an active tutorial step");
  switch (true) {
    case stepId === "identity:create":
      await page.locator("#tutorial-next").click();
      break;
    case stepId === "session:signin":
      await page.locator("#tutorial-next").click();
      break;
    case stepId === "runner:create":
      await page.locator("#tutorial-next").click();
      break;
    case stepId.startsWith("widgets:"):
      await page.locator("#tutorial-next").click();
      break;
    case stepId === "program:create":
      await page.locator("#tutorial-next").click();
      break;
    case stepId.startsWith("program-step:"):
      await page.locator("#tutorial-next").click();
      break;
    case stepId.startsWith("route:"):
      await page.locator("#tutorial-next").click();
      break;
    case stepId.startsWith("serve:"):
      await page.locator("#tutorial-next").click();
      break;
    case stepId === "open-app":
      await page.locator("#open-app-link").click();
      await page.waitForURL(`${serverUrl}/`);
      await waitForAppReady(page);
      break;
    case stepId === "app:intro":
      await page.locator("#tutorial-next").click();
      break;
    case stepId === "app:create-todo":
      await page.locator("#tutorial-next").click();
      break;
    case stepId === "app:toggle-todo":
      await page.locator('[data-tutorial-target="todo-toggle"]').click();
      break;
    case stepId === "app:delete-todo":
      await page.locator('[data-tutorial-target="todo-delete"]').click();
      break;
    case stepId === "app:create-note":
      await page.locator("#tutorial-next").click();
      break;
    case stepId === "world:inspect":
      if (!page.url().endsWith("/world")) {
        await clickCompanionGuidanceAction(page);
        await page.waitForURL(`${serverUrl}/world`);
      }
      await page.waitForLoadState("domcontentloaded");
      await page.locator('[data-world-command-toggle]').waitFor();
      await page.locator('[data-world-tutorial-next]').click();
      break;
    default:
      throw new Error(`unknown tutorial step: ${stepId}`);
  }
  await waitForStepChange(page, stepId);
}

test("guided tutorial persists, resumes, and completes on the live app", { timeout: 180000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));
    await page.waitForFunction(() => Boolean(window.__witnessTutorial));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");

    await page.reload();
    await waitForStep(page, "session:signin");

    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator("#create-todo-starter").click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    await waitForStep(page, "open-app");

    await page.reload();
    await page.waitForFunction(() => Boolean(window.__witnessTutorialApp?.currentStepId || window.__witnessTutorial?.currentStepId));
    assert.ok(["open-app", "app:intro"].includes(await currentTutorialStep(page)));

    for (let attempts = 0; attempts < 8; attempts += 1) {
      if (await tutorialCompletedAt(page)) break;
      await completeStep(page, server.url);
    }

    const finalStep = await currentTutorialStep(page);
    const finalCompletedAt = await tutorialCompletedAt(page);
    assert.ok(finalCompletedAt, `tutorial did not complete; step=${finalStep}`);
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("guided tutorial can auto-finish the widget chapter through the real builders", { timeout: 60000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");
    await completeStep(page, server.url);
    await waitForStep(page, "widgets:todo_app_widget");

    await page.locator("#tutorial-finish-chapter").click();
    await waitForStep(page, "program:create");
    await page.waitForFunction(() => document.getElementById("state-widgets")?.textContent.includes("private_note_empty_template"));

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap tutorial can restart the current chapter from the first step", async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");
    await completeStep(page, server.url);
    await waitForStep(page, "widgets:todo_app_widget");

    await completeStep(page, server.url);
    await waitForStep(page, "widgets:todo_session");
    await completeStep(page, server.url);
    await waitForStep(page, "widgets:todo_session_title");

    await page.locator("#tutorial-restart-chapter").click();
    await waitForStep(page, "widgets:todo_app_widget");

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live app tutorial can restart the current chapter from the first app step", { timeout: 60000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator("#create-todo-starter").click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    await waitForStep(page, "open-app");

    await page.locator("#open-app-link").click();
    await page.waitForURL(`${server.url}/`);
    await waitForAppReady(page);
    await waitForStep(page, "app:intro");
    assert.deepEqual(
      await page.evaluate(() => ({
        bodyContext: document.body.dataset.surfaceContext || null,
        bodyRoute: document.body.dataset.surfaceRoute || null,
        bodyRootWidget: document.body.dataset.surfaceRootWidget || null,
        bodyProgram: document.body.dataset.surfaceProgram || null,
        tutorialContext: window.__witnessTutorialApp?.surfaceContext || null,
        tutorialRoute: window.__witnessTutorialApp?.surfaceRouteId || null,
        tutorialRootWidget: window.__witnessTutorialApp?.surfaceRootWidgetId || null,
        tutorialProgram: window.__witnessTutorialApp?.surfaceProgramId || null
      })),
      {
        bodyContext: "frontend",
        bodyRoute: "home_page_route",
        bodyRootWidget: "todo_app_widget",
        bodyProgram: "todo_frontend_program",
        tutorialContext: "frontend",
        tutorialRoute: "home_page_route",
        tutorialRootWidget: "todo_app_widget",
        tutorialProgram: "todo_frontend_program"
      }
    );

    await completeStep(page, server.url);
    await waitForStep(page, "app:create-todo");
    await completeStep(page, server.url);
    await page.waitForFunction(() => {
      const stepId = window.__witnessTutorialApp?.currentStepId || null;
      return typeof stepId === "string" && stepId.startsWith("app:") && !["app:intro", "app:create-todo"].includes(stepId);
    });

    await page.locator("#tutorial-restart-chapter").click();
    await waitForStep(page, "app:intro");

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap tutorial can restart from the current step without auto-advancing completed state on reload", async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");
    await completeStep(page, server.url);
    await waitForStep(page, "widgets:todo_app_widget");

    await completeStep(page, server.url);
    await waitForStep(page, "widgets:todo_session");
    await completeStep(page, server.url);
    await waitForStep(page, "widgets:todo_session_title");

    await page.locator("#tutorial-back").click();
    await waitForStep(page, "widgets:todo_session");
    await page.locator("#tutorial-restart-from-here").click();
    await page.waitForFunction(() => window.__witnessTutorial?.replayStepId === "widgets:todo_session");

    await page.reload();
    await waitForStep(page, "widgets:todo_session");
    await page.waitForFunction(() => window.__witnessTutorial?.replayStepId === "widgets:todo_session");
    await page.waitForTimeout(1500);
    assert.equal(await currentTutorialStep(page), "widgets:todo_session");

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live app tutorial can restart from the current step without auto-advancing completed state on reload", { timeout: 60000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator("#create-todo-starter").click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    await waitForStep(page, "open-app");

    await page.locator("#open-app-link").click();
    await page.waitForURL(`${server.url}/`);
    await waitForAppReady(page);
    await waitForStep(page, "app:intro");

    await completeStep(page, server.url);
    await waitForStep(page, "app:create-todo");
    await completeStep(page, server.url);
    await waitForStep(page, "app:toggle-todo");
    await completeStep(page, server.url);
    await waitForStep(page, "app:delete-todo");

    await page.locator("#tutorial-back").click();
    await waitForStep(page, "app:toggle-todo");
    await page.locator("#tutorial-restart-step").click();
    await page.waitForFunction(() => window.__witnessTutorialApp?.replayStepId === "app:toggle-todo");

    await page.reload();
    await waitForAppReady(page);
    await waitForStep(page, "app:toggle-todo");
    await page.waitForFunction(() => window.__witnessTutorialApp?.replayStepId === "app:toggle-todo");
    await page.waitForTimeout(1500);
    assert.equal(await currentTutorialStep(page), "app:toggle-todo");

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap tutorial treats live-app steps as off-page and offers a continue action", { timeout: 60000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator("#create-todo-starter").click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    await waitForStep(page, "open-app");

    await page.locator("#open-app-link").click();
    await page.waitForURL(`${server.url}/`);
    await waitForAppReady(page);
    await waitForStep(page, "app:intro");

    await page.goto(`${server.url}/_bootstrap`);
    await page.waitForFunction(() => window.__witnessTutorial?.surfaceStatus === "offpage");
    await page.waitForFunction(() => document.getElementById("tutorial-summary")?.textContent.includes("Current guidance continues on the App surface"));
    await page.waitForFunction(() => document.getElementById("tutorial-resume")?.textContent.includes("Continue On App"));

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live app tutorial can disable and re-enable guidance on just the app page", { timeout: 60000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator("#create-todo-starter").click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    await waitForStep(page, "open-app");

    await page.locator("#open-app-link").click();
    await page.waitForURL(`${server.url}/`);
    await waitForAppReady(page);
    await waitForStep(page, "app:intro");
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "active");

    await page.locator("#tutorial-disable-page").click();
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "disabled");
    await page.waitForFunction(() => document.getElementById("sourcery-companion-guidance-action")?.textContent.includes("Enable Sourcery Here"));

    await page.reload();
    await waitForAppReady(page);
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "disabled");

    await page.goto(`${server.url}/_bootstrap`);
    await page.waitForFunction(() => window.__witnessTutorial?.surfaceStatus === "offpage");

    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "disabled");
    await clickCompanionGuidanceAction(page);
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "active");

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live app tutorial shows current and disabled scope controls truthfully", { timeout: 60000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator("#create-todo-starter").click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    await waitForStep(page, "open-app");

    await page.locator("#open-app-link").click();
    await page.waitForURL(`${server.url}/`);
    await waitForAppReady(page);
    await waitForStep(page, "app:intro");
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "active");

    const seeded = await page.evaluate(async () => {
      const response = await fetch('/api/tutorial-progress/todo-from-scratch', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tutorialId: 'todo-from-scratch',
          chapterId: 'use-app',
          stepId: 'app:intro',
          chapterStatus: 'in_progress',
          draftInputs: {},
          completedAt: null,
          hidden: false,
          disabledScopeKeys: ['section:app:todo_form'],
          replayScopeKey: null
        })
      });
      return { ok: response.ok, body: await response.json().catch(() => ({})) };
    });
    assert.equal(seeded.ok, true, seeded.body?.error || "expected tutorial progress seed to succeed");

    await page.reload();
    await waitForAppReady(page);
    await waitForStep(page, "app:intro");
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "active");
    await page.waitForFunction(() => document.getElementById("sourcery-companion-root")?.hidden === false);
    await page.evaluate(() => {
      document.querySelectorAll('[data-tutorial-current],[data-tutorial-focus-scope]').forEach(node => {
        node.removeAttribute('data-tutorial-current');
        node.removeAttribute('data-tutorial-focus-scope');
      });
    });
    await page.locator("#tutorial-show-current-control").click();
    await page.waitForFunction(() => document.querySelector('[data-tutorial-target="app-title"]')?.getAttribute('data-tutorial-current') === 'true');

    await page.locator("#sourcery-companion-fab").click();
    await page.locator('button[data-companion-suggestion-action="show-disabled-scopes"]').click();
    await page.waitForFunction(() => window.__witnessTutorialApp?.disabledScopesOpen === true);
    await page.waitForFunction(() => document.getElementById("tutorial-disabled-scopes-panel")?.textContent.includes("Todo form"));
    await page.evaluate(() => {
      document.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
    });
    await clickScopedSelector(page, 'button[data-disabled-scope-focus="section:app:todo_form"]');
    await page.waitForFunction(() => document.querySelector('[data-tutorial-target="todo-form"]')?.closest('form,section,main')?.getAttribute('data-tutorial-focus-scope') === 'true');
    await page.waitForFunction(() => document.querySelector('[data-tutorial-target="todo-form"]')?.getAttribute('data-tutorial-current') !== 'true');

    await clickScopedSelector(page, 'button[data-disabled-scope-enable="section:app:todo_form"]');
    await page.waitForFunction(() => (window.__witnessTutorialApp?.disabledScopeKeys || []).length === 0);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap tutorial shows disabled same-surface controls truthfully", { timeout: 60000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");

    const seeded = await page.evaluate(async () => {
      const response = await fetch('/api/tutorial-progress/todo-from-scratch', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tutorialId: 'todo-from-scratch',
          chapterId: 'runtime',
          stepId: 'runner:create',
          chapterStatus: 'in_progress',
          draftInputs: {},
          completedAt: null,
          hidden: false,
          disabledScopeKeys: ['section:bootstrap:identity-form'],
          replayScopeKey: null
        })
      });
      return { ok: response.ok, body: await response.json().catch(() => ({})) };
    });
    assert.equal(seeded.ok, true, seeded.body?.error || "expected tutorial progress seed to succeed");

    await page.reload();
    await waitForStep(page, "runner:create");
    await page.waitForFunction(() => document.getElementById("tutorial-suggestions")?.textContent.includes("Show Disabled Sourcery Scopes"));
    await page.waitForFunction(() => document.querySelector('[data-tutorial-target="runner-form"]')?.getAttribute('data-tutorial-current') === 'true');

    await page.locator('button[data-suggestion-id="show-disabled-scopes"]').click();
    await page.waitForFunction(() => document.getElementById("tutorial-disabled-pages")?.getAttribute("data-tutorial-focus-scope") === "true");
    await page.waitForFunction(() => document.getElementById("tutorial-disabled-pages")?.textContent.includes("Identity form"));

    await page.locator('button[data-disabled-focus="identity-form"]').click();
    await page.waitForFunction(() => document.querySelector('[data-tutorial-target="identity-form"]')?.closest('form,details,.card')?.getAttribute('data-tutorial-focus-scope') === 'true');
    await page.waitForFunction(() => document.querySelector('[data-tutorial-target="identity-form"]')?.getAttribute('data-tutorial-current') !== 'true');
    await page.waitForFunction(() => document.querySelector('[data-tutorial-target="runner-form"]')?.getAttribute('data-tutorial-current') === 'true');

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live app tutorial can recover authored non-step scope anchors on the shipped app surface", { timeout: 60000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startUiDemoServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await page.fill('[data-widget="todo_username_input"]', "aaron");
    await page.fill('[data-widget="todo_password_input"]', "aaron");
    await page.locator('[data-widget="todo_open_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="todo_session_status"]');
      return Boolean(status && status.textContent && status.textContent.includes("Signed in as Aaron"));
    });

    const seeded = await page.evaluate(async () => {
      const response = await fetch('/api/tutorial-progress/todo-from-scratch', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tutorialId: 'todo-from-scratch',
          chapterId: 'use-app',
          stepId: 'app:intro',
          chapterStatus: 'in_progress',
          draftInputs: {},
          completedAt: null,
          hidden: false,
          disabledScopeKeys: ['widget:todo_widget_editor_button'],
          replayScopeKey: null
        })
      });
      return { ok: response.ok, body: await response.json().catch(() => ({})) };
    });
    assert.equal(seeded.ok, true, seeded.body?.error || "expected tutorial progress seed to succeed");

    await page.reload();
    await waitForAppReady(page);
    await waitForStep(page, "app:intro");
    await page.waitForFunction(() => document.getElementById("sourcery-companion-root")?.hidden === false);
    await page.locator("#sourcery-companion-fab").click();
    await page.locator('button[data-companion-suggestion-action="show-disabled-scopes"]').click();
    await page.waitForFunction(() => document.getElementById("tutorial-disabled-scopes-panel")?.textContent.includes("Add Widget"));
    await clickScopedSelector(page, 'button[data-disabled-scope-focus="widget:todo_widget_editor_button"]');
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-tutorial-target') === 'widget-editor-submit');
    await page.waitForFunction(() => document.querySelector('[data-tutorial-target="widget-editor-submit"]')?.closest('form,section,main')?.getAttribute('data-tutorial-focus-scope') === 'true');
    await page.waitForFunction(() => document.querySelector('[data-tutorial-target="widget-editor-submit"]')?.getAttribute('data-tutorial-current') !== 'true');

    await clickScopedSelector(page, 'button[data-disabled-scope-enable="widget:todo_widget_editor_button"]');
    await page.waitForFunction(() => (window.__witnessTutorialApp?.disabledScopeKeys || []).length === 0);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap tutorial shows disabled guidance surfaces and can recover them without losing progress", { timeout: 120000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator("#create-todo-starter").click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    await waitForStep(page, "open-app");

    await page.locator("#open-app-link").click();
    await page.waitForURL(`${server.url}/`);
    await waitForAppReady(page);
    await waitForStep(page, "app:intro");
    await page.locator("#tutorial-disable-page").click();
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "disabled");

    await page.goto(`${server.url}/_bootstrap`);
    await page.waitForFunction(() => window.__witnessTutorial?.surfaceStatus === "offpage");
    await page.waitForFunction(() => document.getElementById("tutorial-summary")?.textContent.includes("guidance is disabled there"));
    await page.waitForFunction(() => document.getElementById("tutorial-disabled-pages")?.textContent.includes("App title"));
    await page.waitForFunction(() => document.getElementById("tutorial-disabled-pages")?.textContent.includes("You are now using the real app"));
    await page.waitForFunction(() => document.getElementById("tutorial-suggestions")?.textContent.includes("Re-Enable Sourcery On App"));
    await page.waitForFunction(() => document.getElementById("tutorial-suggestions")?.textContent.includes("Show Disabled Sourcery Scopes"));
    await clickScopedSelector(page, 'button[data-suggestion-id="show-disabled-scopes"]');
    await page.waitForFunction(() => document.getElementById("tutorial-disabled-pages")?.getAttribute("data-tutorial-focus-scope") === "true");

    await clickScopedSelector(page, 'button[data-disabled-enable="app"]');
    await page.waitForFunction(() => (window.__witnessTutorial?.disabledPages || []).length === 0);
    await page.waitForFunction(() => !document.getElementById("tutorial-disabled-pages")?.querySelector('[data-guidance-scope-status="muted"]'));
    await page.waitForFunction(() => document.getElementById("tutorial-summary")?.textContent.includes("Current guidance continues on the App surface"));

    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "active");

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("frontend context disable is visible and recoverable across app, bootstrap, and world surfaces", { timeout: 60000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator("#create-todo-starter").click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    await waitForStep(page, "open-app");

    await page.locator("#open-app-link").click();
    await page.waitForURL(`${server.url}/`);
    await waitForAppReady(page);
    await waitForStep(page, "app:intro");
    await page.locator("#tutorial-disable-context").click();
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "disabled-context");
    await page.waitForFunction(() => JSON.stringify(window.__witnessTutorialApp?.disabledContextIds || []) === JSON.stringify(["frontend"]));

    await page.goto(`${server.url}/_bootstrap`);
    await page.waitForFunction(() => window.__witnessTutorial?.surfaceStatus === "offpage");
    await page.waitForFunction(() => document.getElementById("tutorial-summary")?.textContent.includes("disabled in that context"));
    await page.waitForFunction(() => document.getElementById("tutorial-disabled-pages")?.textContent.includes("Frontend context"));
    await page.locator('button[data-disabled-context="frontend"]').click();
    await page.waitForFunction(() => (window.__witnessTutorial?.disabledContextIds || []).length === 0);

    await page.goto(`${server.url}/world`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(() => document.body.dataset.surfaceContext === "frontend");
    await page.waitForFunction(() => window.__witnessTutorial?.surfaceStatus === "offpage");
    await page.waitForFunction(() => document.querySelector('[data-world-tutorial-panel]')?.textContent.includes("Current guidance continues on the App surface"));

    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "active");

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap tutorial reveals authored concepts as relevant steps become current", async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await page.waitForFunction(() => JSON.stringify(window.__witnessTutorial?.currentConceptIds || []) === JSON.stringify(["identity-principal"]));
    await page.waitForFunction(() => JSON.stringify(window.__witnessTutorial?.revealedConceptIds || []) === JSON.stringify(["identity-principal"]));

    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");
    await page.waitForFunction(() => {
      const current = window.__witnessTutorial?.currentConceptIds || [];
      const revealed = window.__witnessTutorial?.revealedConceptIds || [];
      return JSON.stringify(current) === JSON.stringify(["runtime-wiring"])
        && JSON.stringify(revealed) === JSON.stringify(["identity-principal", "session-auth", "runtime-wiring"]);
    });
    await page.waitForFunction(() => document.getElementById("tutorial-current-concepts")?.textContent.includes("Runtime Wiring"));

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("live app tutorial reveals app and perspective concepts only when the tutorial reaches them", { timeout: 60000 }, async () => {
  const silentLogger = { info() {}, error() {} };
  const { server, close: closeServer } = await startBlankUiServer({ logger: silentLogger });
  const { page, runtime, close: closeBrowser } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => document.body.textContent.includes("Build The Todo App From Scratch"));

    await page.locator("#tutorial-start").click();
    await waitForStep(page, "identity:create");
    await completeStep(page, server.url);
    await waitForStep(page, "session:signin");
    await completeStep(page, server.url);
    await waitForStep(page, "runner:create");

    await page.locator('details').last().evaluate(node => { node.open = true; });
    await page.locator("#create-todo-starter").click();
    await page.waitForFunction(() => document.getElementById("starter-status")?.textContent.includes("Todo starter created."));
    await waitForStep(page, "open-app");

    await page.locator("#open-app-link").click();
    await page.waitForURL(`${server.url}/`);
    await waitForAppReady(page);
    await waitForStep(page, "app:intro");
    await page.waitForFunction(() => {
      const current = window.__witnessTutorialApp?.currentConceptIds || [];
      const revealed = window.__witnessTutorialApp?.revealedConceptIds || [];
      return JSON.stringify(current) === JSON.stringify(["app-boundary"])
        && revealed.includes("app-boundary")
        && !revealed.includes("perspective-data");
    });
    await page.waitForFunction(() => document.getElementById("tutorial-overlay-concepts")?.textContent.includes("App Boundary"));

    for (let attempts = 0; attempts < 4; attempts += 1) {
      if ((await currentTutorialStep(page)) === "app:create-note") break;
      await completeStep(page, server.url);
    }
    await waitForStep(page, "app:create-note");
    await page.waitForFunction(() => {
      const current = window.__witnessTutorialApp?.currentConceptIds || [];
      const revealed = window.__witnessTutorialApp?.revealedConceptIds || [];
      return JSON.stringify(current) === JSON.stringify(["perspective-data"])
        && revealed.includes("app-boundary")
        && revealed.includes("witnessed-app-state")
        && revealed.includes("perspective-data");
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
