import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer } from "./support/harness.js";

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
