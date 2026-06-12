import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { createWorld } from "../../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../../src/host.js";
import { applyWitnessDocs, applyWitnessToml, loadWitnessTomlFile } from "../../src/dsl.js";

const silentLogger = {
  error() {},
  warn() {},
  info() {},
  debug() {}
};

let sharedBrowserPromise = null;
let sharedBrowserActiveContexts = 0;
let sharedBrowserCloseTimer = null;

async function tempRuntimeRoot(prefix = "witness-world-ui-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function startUiDemoServer({
  dslPath = path.join(process.cwd(), "examples", "demo-todo-server.wtoml"),
  extraWitnessToml = "",
  logger = silentLogger,
  runtimeProfile = "full"
} = {}) {
  const world = createWorld();
  const runtimeRoot = await tempRuntimeRoot();

  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile });

  const docs = await loadWitnessTomlFile(dslPath);
  applyWitnessDocs(world, docs);
  if (extraWitnessToml.trim()) applyWitnessToml(world, extraWitnessToml);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot,
    runtimeProfile,
    logger
  });

  if (!server.ok) {
    throw new Error(`failed to start demo server for UI tests: ${server.reason}`);
  }

  return {
    world,
    server,
    url: server.url,
    close: async () => {
      await server.close();
    }
  };
}

export async function startBlankUiServer({ logger = silentLogger } = {}) {
  const world = createWorld();
  const runtimeRoot = await tempRuntimeRoot("witness-world-bootstrap-ui-");

  declareBackendHost(world, { actor: "system", id: "backendHost" });
  declareFrontendHost(world, { actor: "system", id: "frontendHost" });

  const server = await startServer(world, {
    actor: "system",
    runtimeRoot,
    logger
  });

  if (!server.ok) {
    throw new Error(`failed to start blank bootstrap server for UI tests: ${server.reason}`);
  }

  return {
    world,
    server,
    url: server.url,
    close: async () => {
      await server.close();
    }
  };
}

async function getSharedBrowser({ headless }) {
  if (sharedBrowserCloseTimer) {
    clearTimeout(sharedBrowserCloseTimer);
    sharedBrowserCloseTimer = null;
  }
  if (!sharedBrowserPromise) {
    sharedBrowserPromise = chromium.launch({ headless });
  }
  return sharedBrowserPromise;
}

export async function launchBrowser({
  headless = true,
  viewport = { width: 1280, height: 900 }
} = {}) {
  const browser = await getSharedBrowser({ headless });
  sharedBrowserActiveContexts += 1;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const runtime = createRuntimeCollector(page);
  const api = createApiCapture(page);

  return {
    browser,
    context,
    page,
    runtime,
    api,
    close: async () => {
      await context.close();
      sharedBrowserActiveContexts = Math.max(0, sharedBrowserActiveContexts - 1);
      if (sharedBrowserActiveContexts === 0 && sharedBrowserPromise) {
        sharedBrowserCloseTimer = setTimeout(() => {
          const pendingBrowser = sharedBrowserPromise;
          sharedBrowserPromise = null;
          sharedBrowserCloseTimer = null;
          void pendingBrowser?.then(activeBrowser => activeBrowser.close().catch(() => {})).catch(() => {});
        }, 100);
      }
    }
  };
}

export function createRuntimeCollector(page) {
  const runtime = {
    pageErrors: [],
    consoleErrors: []
  };

  page.on("pageerror", error => {
    runtime.pageErrors.push({ type: "page", message: String(error?.message || error) });
  });

  page.on("console", message => {
    if (message.type() !== "error") return;
    runtime.consoleErrors.push({
      type: "console",
      message: message.text()
    });
  });

  return runtime;
}

export function expectNoRuntimeErrors(runtime) {
  const messages = [
    ...runtime.pageErrors.map(x => x.message),
    ...runtime.consoleErrors.map(x => x.message)
  ];
  assert.equal(messages.length, 0, `runtime errors detected:\n${messages.join("\n")}`);
}

export async function waitForAppReady(page, { selector = '[data-role="app-status"]', text = "Ready", timeout = 5000 } = {}) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(
    ({ readySelector, readyText }) => {
      const status = document.querySelector(readySelector);
      return Boolean(status && status.textContent && status.textContent.includes(readyText));
    },
    { readySelector: selector, readyText: text },
    { timeout }
  );
}

export function createApiCapture(page) {
  const calls = [];

  const recordRequest = request => {
    const parsed = new URL(request.url());
    if (!parsed.pathname.startsWith("/api/")) return;
    calls.push({
      type: "request",
      method: request.method(),
      path: parsed.pathname,
      postData: request.postData()
    });
  };

  const recordResponse = async response => {
    const parsed = new URL(response.url());
    if (!parsed.pathname.startsWith("/api/")) return;
    calls.push({
      type: "response",
      status: response.status(),
      method: response.request().method(),
      path: parsed.pathname
    });
  };

  page.on("request", recordRequest);
  page.on("response", recordResponse);

  return {
    calls,
    getCalls(path) {
      return calls.filter(call => call.path === path);
    },
    getLastResponse(path) {
      return [...calls].reverse().find(call => call.type === "response" && call.path === path);
    }
  };
}
