import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer } from "./support/harness.js";

test("world browser supports graph/primitive/source mode transitions and interactive selection", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/world`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-widget="world_graph_page"]').waitFor();
    await page.locator('[data-widget="world_session_status"]').waitFor();
    assert.match((await page.locator('[data-widget="world_session_status"]').textContent()) || "", /Not signed in/);

    await page.fill('[data-widget="world_username_input"]', "aaron");
    await page.fill('[data-widget="world_password_input"]', "aaron");
    await page.locator('[data-widget="world_open_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="world_session_status"]');
      return Boolean(status && status.textContent && status.textContent.includes("Signed in as Aaron"));
    });

    const modeCount = await page.locator('[data-world-mode]').count();
    assert.equal(modeCount >= 3, true);

    await page.locator('[data-world-mode="graph"]').click();
    const graphCanvas = page.locator(".world-graph-canvas");
    await graphCanvas.waitFor();
    assert.equal(await graphCanvas.isVisible(), true);

    await page.locator('[data-world-mode="primitive"]').click();
    const primitiveView = page.locator(".world-primitive-browser");
    await primitiveView.waitFor();
    assert.equal(await primitiveView.isVisible(), true);

    await page.locator('[data-world-mode="source"]').click();
    const sourceWork = page.locator(".world-document-view");
    await sourceWork.waitFor();
    assert.equal(await sourceWork.isVisible(), true);

    const sourceFileButtons = page.locator('[data-world-source-file]');
    const sourceButtonCount = await sourceFileButtons.count();
    if (sourceButtonCount > 0) {
      const sourceFileButton = sourceFileButtons.first();
      const sourceLabel = (await sourceFileButton.textContent())?.trim() || "";
      await sourceFileButton.click();
      const sourceTitle = page.locator(".world-source-title");
      await sourceTitle.waitFor();
      const sourceText = (await sourceTitle.textContent()) || "";
      if (sourceLabel) {
        assert.equal(sourceText.includes(sourceLabel), true);
      }
      const sourceCode = (await page.locator(".world-source-code").textContent()) || "";
      assert.equal(sourceCode.length > 0, true);
    } else {
      const sourceEmpty = page.locator(".world-source-empty");
      await sourceEmpty.waitFor();
      assert.equal(await sourceEmpty.isVisible(), true);
    }

    await page.getByRole("button", { name: "Witness Browser", exact: true }).click();
    const witnessView = page.locator(".world-witness-browser");
    await witnessView.waitFor();
    assert.equal(await witnessView.isVisible(), true);

    await page.locator('[data-world-mode="graph"]').click();
    const nodeLocator = page.locator('[data-world-node-id]');
    const nodeCount = await nodeLocator.count();
    assert.equal(nodeCount > 0, true);

    const secondNodeId = await nodeLocator.nth(Math.min(1, nodeCount - 1)).getAttribute("data-world-node-id");
    const targetNodeId = secondNodeId;
    assert.ok(targetNodeId);

    await nodeLocator.nth(Math.min(1, nodeCount - 1)).click();
    await page.waitForFunction(
      expected => {
        const inspector = document.querySelector(".world-graph-inspector");
        return Boolean(inspector && inspector.textContent && inspector.textContent.includes(expected));
      },
      targetNodeId
    );

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("world browser search and command surface can reach capabilities, hidden surfaces, and process view", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/world`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-widget="world_graph_page"]').waitFor();

    await page.fill('[data-widget="world_username_input"]', "aaron");
    await page.fill('[data-widget="world_password_input"]', "aaron");
    await page.locator('[data-widget="world_open_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="world_session_status"]');
      return Boolean(status && status.textContent && status.textContent.includes("Signed in as Aaron"));
    });

    await page.locator('[data-world-command-toggle]').click();
    await page.locator('[data-world-command-input]').fill("dom.render");
    await page.locator('.world-command-item', { hasText: "dom.render" }).click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector(".world-graph-inspector");
      return Boolean(inspector && inspector.textContent && inspector.textContent.includes("dom.render"));
    });

    await page.locator('[data-world-command-toggle]').click();
    await page.locator('[data-world-command-input]').fill("source browser");
    await page.locator('.world-command-item', { hasText: "Show Source Browser" }).click();
    await page.locator(".world-document-view").waitFor();

    await page.locator('[data-world-command-toggle]').click();
    await page.locator('[data-world-command-input]').fill("show witnesses");
    await page.locator('.world-command-item', { hasText: "Show Witnesses For Selected Object" }).click();
    await page.locator(".world-witness-browser").waitFor();

    await page.locator('[data-world-command-toggle]').click();
    await page.locator('[data-world-command-input]').fill("harness recovery");
    await page.locator('.world-command-item', { hasText: "Open Bootstrap" }).click();
    await page.waitForURL(url => url.pathname === "/_bootstrap");
    await page.locator('text=Semi-Internal Bootstrap Seam').waitFor();

    await page.goto(`${server.url}/world`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-widget="world_graph_page"]').waitFor();

    await page.fill('[data-widget="world_username_input"]', "aaron");
    await page.fill('[data-widget="world_password_input"]', "aaron");
    await page.locator('[data-widget="world_open_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="world_session_status"]');
      return Boolean(status && status.textContent && status.textContent.includes("Signed in as Aaron"));
    });

    await page.locator('[data-world-command-toggle]').click();
    await page.locator('[data-world-command-input]').fill("internal process view");
    await page.locator('.world-command-item', { hasText: "Open Process View" }).click();
    await page.waitForURL(url => url.pathname === "/process");
    await page.locator('[data-process-view]').waitFor();

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("world browser command surface can expose disabled tutorial guidance surfaces and recover them", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/world`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-widget="world_graph_page"]').waitFor();

    await page.fill('[data-widget="world_username_input"]', "aaron");
    await page.fill('[data-widget="world_password_input"]', "aaron");
    await page.locator('[data-widget="world_open_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="world_session_status"]');
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
          disabledPages: ['app'],
          replayStepId: null
        })
      });
      return { ok: response.ok, body: await response.json().catch(() => ({})) };
    });
    assert.equal(seeded.ok, true, seeded.body?.error || 'expected tutorial progress seed to succeed');

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-widget="world_graph_page"]').waitFor();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="world_session_status"]');
      return Boolean(status && status.textContent && status.textContent.includes("Signed in as Aaron"));
    });

    await page.locator('[data-world-command-toggle]').click();
    await page.locator('[data-world-command-input]').fill("guidance recovery");
    await page.locator('.world-command-item', { hasText: "Open App Guidance Recovery" }).waitFor();

    await page.locator('[data-world-command-input]').fill("enable tutorial on app");
    await page.locator('.world-command-item', { hasText: "Enable Tutorial On App" }).click();

    await page.waitForFunction(async () => {
      const response = await fetch('/api/tutorial-progress/todo-from-scratch', { credentials: 'same-origin' });
      const body = await response.json().catch(() => ({ progress: null }));
      return response.ok && Array.isArray(body.progress?.disabledPages) && body.progress.disabledPages.length === 0;
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("world browser surfaces a real tutorial panel for world-scope guidance", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/world`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-widget="world_graph_page"]').waitFor();

    await page.fill('[data-widget="world_username_input"]', "aaron");
    await page.fill('[data-widget="world_password_input"]', "aaron");
    await page.locator('[data-widget="world_open_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="world_session_status"]');
      return Boolean(status && status.textContent && status.textContent.includes("Signed in as Aaron"));
    });

    const seeded = await page.evaluate(async () => {
      const response = await fetch('/api/tutorial-progress/todo-from-scratch', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tutorialId: 'todo-from-scratch',
          chapterId: 'inspect-world',
          stepId: 'world:inspect',
          chapterStatus: 'in_progress',
          draftInputs: {},
          completedAt: null,
          hidden: false,
          disabledPages: [],
          replayStepId: null
        })
      });
      return { ok: response.ok, body: await response.json().catch(() => ({})) };
    });
    assert.equal(seeded.ok, true, seeded.body?.error || 'expected tutorial progress seed to succeed');

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-widget="world_graph_page"]').waitFor();
    await page.waitForFunction(() => window.__witnessTutorial?.surfaceStatus === "active");
    await page.waitForFunction(() => document.querySelector('[data-world-tutorial-panel]')?.textContent.includes("Inspect the world surface"));

    await page.locator('[data-world-tutorial-disable]').click();
    await page.waitForFunction(() => window.__witnessTutorial?.surfaceStatus === "disabled");
    await page.waitForFunction(() => document.querySelector('[data-world-tutorial-panel]')?.textContent.includes("Enable On This Page"));

    await page.locator('[data-world-tutorial-resume]').click();
    await page.waitForFunction(() => window.__witnessTutorial?.surfaceStatus === "active");

    await page.locator('[data-world-tutorial-next]').click();
    await page.waitForFunction(() => Boolean(window.__witnessTutorial?.completedAt));

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("world browser can hand off a selected frontend program into the process view", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/world`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-widget="world_graph_page"]').waitFor();

    await page.fill('[data-widget="world_username_input"]', "aaron");
    await page.fill('[data-widget="world_password_input"]', "aaron");
    await page.locator('[data-widget="world_open_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="world_session_status"]');
      return Boolean(status && status.textContent && status.textContent.includes("Signed in as Aaron"));
    });

    await page.locator('[data-world-node-id="todo_frontend_program"]').click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector(".world-graph-inspector");
      return Boolean(inspector && inspector.textContent && inspector.textContent.includes("Process explorer"));
    });

    await page.locator('[data-world-open-process-program="todo_frontend_program"]').first().click();
    await page.waitForURL(url => url.pathname === "/process" && url.searchParams.get("program") === "todo_frontend_program");
    await page.locator('[data-process-view]').waitFor();
    assert.match((await page.textContent('body')) || "", /todo_frontend_program/);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("world browser can inspect and upgrade a versioned widget from the operating surface", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/world`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-widget="world_graph_page"]').waitFor();

    await page.fill('[data-widget="world_username_input"]', "aaron");
    await page.fill('[data-widget="world_password_input"]', "aaron");
    await page.locator('[data-widget="world_open_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="world_session_status"]');
      return Boolean(status && status.textContent && status.textContent.includes("Signed in as Aaron"));
    });

    await page.locator('[data-world-node-id="todo_versioned_banner"]').click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector(".world-graph-inspector");
      return Boolean(inspector && inspector.textContent && inspector.textContent.includes("Widget versions") && inspector.textContent.includes("todo_versioned_banner_v1"));
    });

    await page.locator('[data-world-widget-activate="todo_versioned_banner"][data-world-widget-version="todo_versioned_banner_v2"]').click();
    await page.waitForFunction(() => {
      const inspector = document.querySelector(".world-graph-inspector");
      return Boolean(
        inspector
        && inspector.textContent
        && inspector.textContent.includes("Activated todo_versioned_banner_v2")
        && inspector.textContent.includes("todo_versioned_banner_v2")
      );
    });

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
