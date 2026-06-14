import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  NATIVE_RUNTIME_DECLARATION_KINDS,
  createCoreRuntimeDeclarationRegistry
} from "../../src/desire/apply.js";

test("bootstrap authored page shell uses shared runtime declarations and renderer support for semantic shell kinds", async () => {
  const registry = createCoreRuntimeDeclarationRegistry();
  const shellSource = await readFile(new URL("./bootstrap-page-shell.js", import.meta.url), "utf8");
  const pageHelpersSource = await readFile(new URL("./bootstrap-page-helpers.js", import.meta.url), "utf8");
  const shellWtoml = await readFile(new URL("./bootstrap-page-shell.wtoml", import.meta.url), "utf8");
  const widgetPageSource = await readFile(new URL("../../src/runtime-widget-page.js", import.meta.url), "utf8");

  assert.equal(NATIVE_RUNTIME_DECLARATION_KINDS.has("fragment"), true);
  assert.equal(NATIVE_RUNTIME_DECLARATION_KINDS.has("header"), true);
  assert.equal(NATIVE_RUNTIME_DECLARATION_KINDS.has("paragraph"), true);
  assert.equal(NATIVE_RUNTIME_DECLARATION_KINDS.has("small"), true);
  assert.equal(registry.has("fragment"), true);
  assert.equal(registry.has("header"), true);
  assert.equal(registry.has("paragraph"), true);
  assert.equal(registry.has("small"), true);
  assert.equal(shellSource.includes("export function renderBootstrapAuthoredPageShell"), true);
  assert.equal(shellSource.includes('./bootstrap-page-helpers.js'), true);
  assert.equal(shellSource.includes('renderBootstrapAuthoredWidget({'), true);
  assert.equal(shellSource.includes('replaceBootstrapWholeSection'), true);
  assert.equal(pageHelpersSource.includes('from "../../src/runtime-widget-page.js"'), true);
  assert.equal(shellWtoml.includes("[[fragment]]"), true);
  assert.equal(shellWtoml.includes("[[header]]"), true);
  assert.equal(shellWtoml.includes("[[paragraph]]"), true);
  assert.equal(shellWtoml.includes("[[small]]"), true);
  assert.equal(widgetPageSource.includes('case "Fragment":'), true);
  assert.equal(widgetPageSource.includes('case "Header":'), true);
  assert.equal(widgetPageSource.includes('case "Paragraph":'), true);
  assert.equal(widgetPageSource.includes('case "Small":'), true);
});
