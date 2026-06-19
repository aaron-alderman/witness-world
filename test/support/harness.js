import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { loadAppProject } from "../../src/app-project.js";
import { createWorld } from "../../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../../src/host.js";
import { applyWitnessDocsWithRuntimePlugins, applyWitnessToml } from "../../src/dsl.js";
import { applyDesire } from "../../src/desire/index.js";
import { applyLegacyFrontendUplift } from "../../src/frontend-legacy-uplift.js";
import { startBlankRuntime } from "../../src/runtime-local-launcher.js";

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

export async function startUiServer({
  dslPath,
  serverRunnerId = "demo_server",
  extraWitnessToml = "",
  logger = silentLogger,
  runtimeProfile = "full",
  devMode = true,
  upliftLegacyFrontend = false
} = {}) {
  const world = createWorld();
  const runtimeRoot = await tempRuntimeRoot();

  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile });

  const appProject = await loadAppProject(dslPath, { runtimeProfile });
  await applyWitnessDocsWithRuntimePlugins(world, appProject.witnessDocs, { runtimeProfile });
  const runtimeDeclarationRegistry = appProject.runtimePluginRegistries?.runtimeDeclarationRegistry ?? null;
  for (const desire of appProject.authoredDesireDocs) applyDesire(world, desire, { runtimeDeclarationRegistry });
  if (extraWitnessToml.trim()) applyWitnessToml(world, extraWitnessToml);
  if (upliftLegacyFrontend === true) {
    applyLegacyFrontendUplift(world, { actor: "adam", backendHost: "backendHost" });
  }

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId,
    runtimeRoot,
    appProject,
    runtimeProfile,
    logger,
    devMode
  });

  if (!server.ok) {
    throw new Error(`failed to start UI server for ${serverRunnerId}: ${server.reason}`);
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

export async function startUiDemoServer({
  dslPath = path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"),
  extraWitnessToml = "",
  logger = silentLogger,
  runtimeProfile = "full"
} = {}) {
  return startUiServer({
    dslPath,
    serverRunnerId: "demo_server",
    extraWitnessToml,
    logger,
    runtimeProfile,
    upliftLegacyFrontend: true
  });
}

export async function startBlankUiServer({ logger = silentLogger } = {}) {
  const launched = await startBlankRuntime({
    actor: "system",
    startupMode: "bootstrap",
    port: 0
  });
  const { world, server, operatorContract } = launched;

  if (!server.ok) {
    throw new Error(`failed to start blank bootstrap server for UI tests: ${server.reason}`);
  }

  return {
    world,
    server,
    url: server.url,
    operatorContract,
    close: async () => {
      await server.close();
    }
  };
}

export async function startBlankUiServerWithWorldHome({ worldHome, logger = silentLogger } = {}) {
  const resolvedWorldHome = worldHome || await fs.mkdtemp(path.join(os.tmpdir(), "witness-world-bootstrap-home-"));
  const launched = await startBlankRuntime({
    actor: "system",
    startupMode: "bootstrap",
    worldHome: resolvedWorldHome,
    port: 0
  });
  const { world, server, operatorContract } = launched;

  if (!server.ok) {
    throw new Error(`failed to start world-home bootstrap server for UI tests: ${server.reason}`);
  }

  return {
    world,
    server,
    url: server.url,
    worldHome: resolvedWorldHome,
    operatorContract,
    close: async () => {
      await server.close();
      await fs.rm(resolvedWorldHome, { recursive: true, force: true });
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

