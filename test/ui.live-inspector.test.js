import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer, waitForAppReady } from "./support/harness.js";

async function signIn(page) {
  await page.fill('[data-widget="todo_username_input"]', "aaron");
  await page.fill('[data-widget="todo_password_input"]', "aaron");
  await page.locator('[data-widget="todo_open_button"]').click();
  await page.waitForFunction(() => {
    const sessionStatus = document.querySelector('[data-widget="todo_session_status"]');
    return Boolean(sessionStatus && sessionStatus.textContent && sessionStatus.textContent.includes("Signed in as Aaron"));
  });
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

test("live page inspector can save a narrow widget edit back into the world", async () => {
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

    await page.locator('[data-surface-inspector-toggle]').click();
    await page.locator('[data-widget="todo_title"]').click({ button: "right" });
    await page.locator('.surface-inspector-panel').waitFor();
    await page.locator('[data-surface-inspector-edit-form] textarea[name="text"]').fill("Witness Todo Edited");
    await page.locator('[data-surface-inspector-save]').click();

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

    await expectNoRuntimeErrors(runtime);
  } finally {
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
