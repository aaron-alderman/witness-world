import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startBlankUiServer, waitForAppReady } from "./support/harness.js";

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
  }, previous, { timeout: 15000 });
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
        await page.locator('#tutorial-resume-page').click();
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

test("guided tutorial persists, resumes, and completes on the live app", async () => {
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
    await page.waitForFunction(() => document.getElementById("tutorial-resume-page")?.textContent.includes("Enable On This Page"));

    await page.reload();
    await waitForAppReady(page);
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "disabled");

    await page.goto(`${server.url}/_bootstrap`);
    await page.waitForFunction(() => window.__witnessTutorial?.surfaceStatus === "offpage");

    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "disabled");
    await page.locator("#tutorial-resume-page").click();
    await page.waitForFunction(() => window.__witnessTutorialApp?.surfaceStatus === "active");

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("bootstrap tutorial shows disabled guidance surfaces and can recover them without losing progress", { timeout: 60000 }, async () => {
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
    await page.waitForFunction(() => document.getElementById("tutorial-disabled-pages")?.textContent.includes("App"));
    await page.waitForFunction(() => document.getElementById("tutorial-disabled-pages")?.textContent.includes("You are now using the real app"));
    await page.waitForFunction(() => document.getElementById("tutorial-suggestions")?.textContent.includes("Re-Enable Guidance On App"));

    await page.locator('button[data-disabled-enable="app"]').click();
    await page.waitForFunction(() => (window.__witnessTutorial?.disabledPages || []).length === 0);
    await page.waitForFunction(() => document.getElementById("tutorial-disabled-pages")?.textContent.includes("No guidance surfaces are currently disabled."));
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
