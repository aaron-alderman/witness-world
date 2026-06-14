import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { renderDesktopLauncherShell } from "./desktop-launcher-view.js";

test("desktop launcher shell renders the desktop shell with escaped status and injected client script", () => {
  const html = renderDesktopLauncherShell({
    message: `<busy>`,
    clientScript: "const desktop = window.witnessDesktop;"
  });

  assert.equal(html.includes("Choose A Local World"), true);
  assert.equal(html.includes("&lt;busy&gt;"), true);
  assert.equal(html.includes("window.witnessDesktop"), true);
  assert.equal(html.includes('id="recent-worlds"'), true);
  assert.equal(html.includes('id="open-existing-world"'), true);
  assert.equal(html.includes('id="create-new-world"'), true);
  assert.equal(html.includes('data-widget="desktop_launcher_page"'), true);
});

test("desktop launcher shell view is sourced from authored WTOML instead of an inline html document", async () => {
  const viewSource = await readFile(new URL("./desktop-launcher-view.js", import.meta.url), "utf8");
  const shellSource = await readFile(new URL("./desktop-launcher-shell.wtoml", import.meta.url), "utf8");

  assert.equal(viewSource.includes('desktop-launcher-shell.wtoml'), true);
  assert.equal(viewSource.includes("<!doctype html>"), false);
  assert.equal(shellSource.includes('id = "desktop_launcher_page"'), true);
  assert.equal(shellSource.includes('class = "surface-status"'), true);
  assert.equal(shellSource.includes('class = "status"'), false);
  assert.equal(shellSource.includes('domId = "launcher-status"'), true);
  assert.equal(shellSource.includes('domId = "open-existing-world"'), true);
  assert.equal(shellSource.includes('domId = "create-new-world"'), true);
});
