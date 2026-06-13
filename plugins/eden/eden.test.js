import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { projectEdenPersonalBoxItems } from "./eden-personal-box.js";
import { projectEdenPageTheme } from "./eden-page-theme.js";
import { projectEdenAcademyState } from "./eden-academy.js";
import { edenNeighborhoodProjection } from "./eden-projection.js";
import { renderEdenPage } from "./eden-page.js";
import { providers } from "./runtime.js";

test("eden plugin exposes eden bundle handlers", async () => {
  const source = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  assert.equal(source.includes('bundleId = "bundle-eden"'), true);
  assert.equal(source.includes('"edenAcademy.read"'), true);
  assert.equal(source.includes("export function createHandlers"), true);
});

test("eden plugin owns implementation modules beyond manifest metadata", () => {
  assert.equal(typeof projectEdenPersonalBoxItems, "function");
  assert.equal(typeof projectEdenPageTheme, "function");
  assert.equal(typeof projectEdenAcademyState, "function");
  assert.equal(typeof edenNeighborhoodProjection, "function");
  assert.equal(typeof renderEdenPage, "function");
});

test("eden handlers import Eden behavior from the plugin package", async () => {
  const source = await readFile(new URL("./handlers.js", import.meta.url), "utf8");
  assert.equal(source.includes("../../src/eden-"), false);
  assert.equal(source.includes('from "./eden-projection.js"'), true);
  assert.equal(source.includes('from "./eden-page.js"'), true);
  assert.equal(source.includes('from "./eden-personal-box.js"'), true);
  assert.equal(source.includes('from "./eden-versions.js"'), true);
});

test("core Eden compatibility shims are gone", async () => {
  for (const shimPath of [
    "../../src/eden-page.js",
    "../../src/eden-personal-box.js",
    "../../src/eden-page-theme.js",
    "../../src/eden-academy.js",
    "../../src/eden-organization.js",
    "../../src/eden-theory.js",
    "../../src/eden-capability-install.js",
    "../../src/eden-capability-install-request.js",
    "../../src/eden-versions.js"
  ]) {
    await assert.rejects(readFile(new URL(shimPath, import.meta.url), "utf8"));
  }
});

test("canvas no longer owns Eden projection helpers", async () => {
  const source = await readFile(new URL("../canvas/canvas-projection.js", import.meta.url), "utf8");
  assert.equal(source.includes("export function edenNeighborhoodProjection"), false);
  assert.equal(source.includes("projectEdenPersonalBoxItems"), false);
  assert.equal(source.includes("EDEN_RELIEF_SIGNAL_HANDLERS"), false);
});

test("canvas-lib serves Eden compatibility modules from plugin.eden", async () => {
  const source = await readFile(new URL("../../src/runtime-server.js", import.meta.url), "utf8");
  const staticProvider = providers.find(provider => provider.kind === "staticAssetProvider" && provider.id === "eden.static");
  assert.equal(source.includes("edenDir"), false);
  assert.equal(staticProvider.mount, "/canvas-lib/");
  assert.equal(Object.keys(staticProvider.files).includes("eden-personal-box.js"), true);
  assert.equal(Object.keys(staticProvider.files).includes("eden-page-theme.js"), true);
  assert.equal(String(staticProvider.files["eden-personal-box.js"]).replaceAll("\\", "/").includes("/plugins/eden/eden-personal-box.js"), true);
  assert.equal(String(staticProvider.files["eden-page-theme.js"]).replaceAll("\\", "/").includes("/plugins/eden/eden-page-theme.js"), true);
});
