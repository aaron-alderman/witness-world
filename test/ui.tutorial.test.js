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
    case stepId === "app:done":
      await page.locator("#tutorial-next").click();
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
