import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { startUiServer } from "./harness.js";
import {
  createLiveCoreWorkspace,
  delay,
  fetchText,
  REPO_ROOT,
  replaceFileText,
  readWitnessCoreStatus,
  reservePort,
  startWitnessCoreProcess,
  waitForJournalPattern,
  waitForText,
  waitForWitnessCoreHealthState,
  waitForWitnessCoreStatus
} from "./witness-core-harness.js";

async function settleWithin(action, timeoutMs = 4000) {
  if (typeof action !== "function") return;
  await Promise.race([
    Promise.resolve().then(action),
    delay(timeoutMs)
  ]);
}

async function waitForValue(readValue, {
  timeoutMs = 10000,
  description = "value"
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await readValue();
    if (last) return last;
    await delay(100);
  }
  assert.ok(last, `expected ${description}`);
  return last;
}

async function safeTeardown({ server = null, core = null, workspace = null } = {}) {
  await settleWithin(() => server?.close?.(), 4000);
  await settleWithin(() => core?.stop?.(), 4000);
  await settleWithin(() => workspace?.cleanup?.(), 2000);
}

async function promoteStableGeneration({ appUrl }) {
  const response = await fetch(`${appUrl}/api/runtime/app-snapshot/promote-current`, {
    method: "POST"
  });
  assert.equal(response.status, 200);
}

async function rollbackStableGeneration({ appUrl }) {
  const response = await fetch(`${appUrl}/api/runtime/app-snapshot/rollback-stable`, {
    method: "POST"
  });
  assert.equal(response.status, 200);
}

async function requestStableServing({ coreUrl }) {
  const response = await fetch(`${coreUrl}/serving/stable`, {
    method: "POST"
  });
  assert.equal(response.status, 200);
}

async function requestLiveServing({ appUrl }) {
  const response = await fetch(`${appUrl}/api/runtime/app-snapshot/serve-live`, {
    method: "POST"
  });
  assert.equal(response.status, 200);
}

async function readProcessHealth(appUrl) {
  const response = await fetch(`${appUrl}/api/runtime/process-health`, {
    cache: "no-store"
  });
  assert.equal(response.status, 200);
  return await response.json();
}

async function readSoakState(coreUrl) {
  const response = await fetch(`${coreUrl}/soak`, {
    cache: "no-store"
  });
  assert.equal(response.status, 200);
  return await response.json();
}

async function readJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

async function readJournalEvents(journalPath) {
  const text = await fs.readFile(journalPath, "utf8");
  return String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

async function postSoak(coreUrl, path, payload = {}) {
  const response = await fetch(`${coreUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(response.status, 200);
  return await response.json();
}

function fixtureNodeExecutable() {
  if (typeof process.env.WITNESS_FIXTURE_NODE === "string" && process.env.WITNESS_FIXTURE_NODE.trim()) {
    return process.env.WITNESS_FIXTURE_NODE.trim();
  }
  if (process.platform === "win32" && typeof process.env.NVM_SYMLINK === "string" && process.env.NVM_SYMLINK.trim()) {
    return path.join(process.env.NVM_SYMLINK.trim(), "node.exe");
  }
  return process.execPath;
}

function flattenProcessHealthSample(health, { phase = null } = {}) {
  return {
    ...(phase ? { phase } : {}),
    sampledAt: typeof health?.sampledAt === "string" && health.sampledAt ? health.sampledAt : new Date().toISOString(),
    ready: health?.ready === true,
    status: typeof health?.status === "string" && health.status ? health.status : "unknown",
    reasonCodes: Array.isArray(health?.reasonCodes) ? health.reasonCodes : [],
    rss: Math.max(0, Math.trunc(Number(health?.memory?.rss ?? 0))),
    heapUsed: Math.max(0, Math.trunc(Number(health?.memory?.heapUsed ?? 0))),
    eventLoopP95Ms: Math.max(0, Math.trunc(Number(health?.eventLoop?.p95Ms ?? 0))),
    activeRequests: Math.max(0, Math.trunc(Number(health?.runtimeCounts?.activeRequests ?? 0))),
    sseClients: Math.max(0, Math.trunc(Number(health?.runtimeCounts?.sseClients ?? 0))),
    previewSessions: Math.max(0, Math.trunc(Number(health?.runtimeCounts?.previewSessions ?? 0))),
    snapshotWatchers: Math.max(0, Math.trunc(Number(health?.runtimeCounts?.snapshotWatchers ?? 0))),
    fsWatcherResources: Math.max(0, Math.trunc(Number(health?.resourceFamilies?.FSWatcher ?? 0))),
    timeoutResources: Math.max(0, Math.trunc(Number(health?.resourceFamilies?.Timeout ?? 0)))
  };
}

async function recordSoakSample({ coreUrl, appUrl, sessionId, phase }) {
  const health = await readProcessHealth(appUrl);
  return await postSoak(coreUrl, "/soak/sample", {
    sessionId,
    ...flattenProcessHealthSample(health, { phase })
  });
}

async function waitForProcessHealth(appUrl, predicate, {
  timeoutMs = 15000,
  description = "process health condition"
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await readProcessHealth(appUrl);
      if (await predicate(last)) return last;
    } catch {}
    await delay(100);
  }
  assert.fail(`${description} not met\n${JSON.stringify(last, null, 2)}`);
}

async function openSseClients(url, count) {
  const clients = [];
  for (let index = 0; index < count; index += 1) {
    const response = await fetch(url, {
      headers: { accept: "text/event-stream" }
    });
    const reader = response.body?.getReader?.() ?? null;
    if (reader) {
      await reader.read();
    }
    clients.push({ response, reader });
  }
  return clients;
}

async function closeSseClients(clients = []) {
  await Promise.allSettled(clients.map(async client => {
    try {
      await client?.reader?.cancel?.();
    } catch {}
    try {
      await client?.response?.body?.cancel?.();
    } catch {}
  }));
}

async function openJsonEventStream(url, label = "event") {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: { accept: "text/event-stream" },
    signal: controller.signal
  });
  assert.equal(response.status, 200);
  const reader = response.body?.getReader?.();
  assert.ok(reader, `${label} stream reader unavailable`);
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeFrame = predicate => {
    buffer = buffer.replaceAll("\r\n", "\n");
    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary < 0) return null;
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const lines = frame.split("\n");
      let event = "message";
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim() || "message";
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      const data = dataLines.join("\n");
      if (!data) continue;
      const payload = JSON.parse(data);
      if (!predicate({ event, payload })) continue;
      return { event, payload };
    }
  };

  return {
    async nextEvent({
      timeoutMs = 15000,
      predicate = () => true
    } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const frame = consumeFrame(predicate);
        if (frame) return frame;
        const remaining = Math.max(1, deadline - Date.now());
        const chunk = await Promise.race([
          reader.read(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), remaining))
        ]);
        if (chunk.done) throw new Error(`${label} stream closed`);
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      throw new Error(`timed out waiting for ${label}`);
    },
    async close() {
      controller.abort();
      try {
        await reader.cancel();
      } catch {}
    }
  };
}

async function runContinuityScenario() {
  const workspace = await createLiveCoreWorkspace({ proofDelayMs: 700 });
  const port = await reservePort();
  let core = await startWitnessCoreProcess({
    cwd: workspace.tempRoot,
    configPath: workspace.configPath,
    port
  });
  let server = null;
  try {
    server = await startUiServer({
      dslPath: workspace.manifestPath,
      serverRunnerId: "fixture_server",
      runtimeProfile: "authoring",
      devMode: true,
      env: {
        ...process.env,
        WITNESS_CORE_URL: core.url
      }
    });

    const routeUrl = `${server.url}${workspace.servedRoutePath}`;
    const baselineHtml = await fetchText(routeUrl);
    assert.match(baselineHtml, /Live Core Baseline/);

    await replaceFileText(
      workspace.watchedSourcePath,
      'text = "Live Core Baseline"',
      'text = "Live Core Stable"'
    );

    await waitForJournalPattern(workspace.journalPath, /"kind":"generation\.candidate"/, {
      description: "candidate generation event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"proof\.started"/, {
      description: "proof started event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"proof\.passed"/, {
      description: "proof passed event"
    });

    const firstGreen = await waitForWitnessCoreStatus(core.url, status =>
      status.generations?.some(generation => generation.state === "green_local"),
    {
      description: "first green_local generation"
    });
    const firstGreenId = firstGreen.aliases?.current_green_local ?? null;
    assert.equal(typeof firstGreenId, "string");

    await waitForText(routeUrl, html => html.includes("Live Core Stable"), {
      description: "live runtime serving the first valid edit"
    });

    await promoteStableGeneration({
      appUrl: server.url
    });

    const promoted = await waitForWitnessCoreStatus(core.url, status =>
      status.aliases?.current_stable === firstGreenId
      && status.aliases?.last_good === firstGreenId
      && status.serving?.requestedMode === "live"
      && status.serving?.effectiveMode === "live",
    {
      description: "promoted stable aliases"
    });
    assert.equal(promoted.aliases?.current_green_local, firstGreenId);

    await replaceFileText(
      workspace.watchedSourcePath,
      'text = "Live Core Stable"',
      'text = "Live Core Green"'
    );

    const secondGreen = await waitForWitnessCoreStatus(core.url, status => {
      const latest = status.generations?.[status.generations.length - 1] ?? null;
      return latest?.state === "green_local" && latest?.id !== firstGreenId;
    }, {
      description: "second green_local generation"
    });
    const secondGreenId = secondGreen.aliases?.current_green_local ?? null;
    assert.equal(typeof secondGreenId, "string");
    assert.notEqual(secondGreenId, firstGreenId);
    assert.equal(secondGreen.aliases?.current_stable, firstGreenId);

    await waitForText(routeUrl, html => html.includes("Live Core Green"), {
      description: "live runtime serving the second valid edit"
    });

    await requestStableServing({ coreUrl: core.url });
    await waitForWitnessCoreStatus(core.url, status =>
      status.serving?.requestedMode === "stable" && status.serving?.effectiveMode === "stable",
    {
      description: "explicit stable serving pin"
    });
    await waitForText(routeUrl, html =>
      html.includes("Live Core Stable") && !html.includes("Live Core Green"),
    {
      description: "runtime serving the pinned stable content"
    });

    await replaceFileText(
      workspace.watchedSourcePath,
      'text = "Live Core Green"',
      'text = "Live Core Pinned Green"'
    );

    const thirdGreen = await waitForWitnessCoreStatus(core.url, status => {
      const latest = status.generations?.[status.generations.length - 1] ?? null;
      return latest?.state === "green_local"
        && latest?.id !== firstGreenId
        && latest?.id !== secondGreenId;
    }, {
      description: "third green_local generation while stable is pinned"
    });
    const thirdGreenId = thirdGreen.generations.at(-1)?.id ?? null;
    assert.equal(typeof thirdGreenId, "string");
    await waitForText(routeUrl, html =>
      html.includes("Live Core Stable") && !html.includes("Live Core Pinned Green"),
    {
      description: "runtime remains on stable while a later green exists"
    });

    await requestLiveServing({ appUrl: server.url });
    await waitForWitnessCoreStatus(core.url, status =>
      status.serving?.requestedMode === "live" && status.serving?.effectiveMode === "live",
    {
      description: "explicit live serving resume"
    });
    await waitForText(routeUrl, html => html.includes("Live Core Pinned Green"), {
      description: "runtime serving the resumed live value"
    });

    await replaceFileText(
      workspace.watchedSourcePath,
      'text = "Live Core Pinned Green"',
      'text = "FAIL_PROOF_TOKEN keep compile valid"'
    );

    const failed = await waitForWitnessCoreStatus(core.url, status => {
      const latest = status.generations?.[status.generations.length - 1] ?? null;
      return latest?.state === "proof_failed";
    }, {
      description: "proof failed generation"
    });
    assert.equal(failed.aliases?.current_stable, firstGreenId);
    assert.equal(failed.aliases?.last_good, firstGreenId);
    assert.equal(failed.serving?.requestedMode, "live");
    assert.equal(failed.serving?.effectiveMode, "stable");
    await waitForJournalPattern(workspace.journalPath, /"kind":"proof\.failed"/, {
      description: "proof failed event"
    });

    const stableHtml = await waitForText(routeUrl, html =>
      html.includes("Live Core Stable") && !html.includes("FAIL_PROOF_TOKEN keep compile valid"),
    {
      description: "runtime serving the promoted stable content after proof failure"
    });
    assert.equal(stableHtml.includes("Live Core Green"), false);

    await rollbackStableGeneration({
      appUrl: server.url
    });

    const rolledBack = await waitForWitnessCoreStatus(core.url, status => {
      const restored = (status.generations ?? []).find(generation => generation.id === firstGreenId) ?? null;
      return restored?.state === "stable"
        && status.aliases?.current_stable === firstGreenId
        && status.aliases?.last_good === firstGreenId
        && status.serving?.requestedMode === "stable"
        && status.serving?.effectiveMode === "stable";
    }, {
      description: "rollback aliases and stable generation"
    });
    assert.equal(rolledBack.aliases?.current_green_local, thirdGreenId);

    const rollbackHtml = await fetchText(routeUrl);
    assert.match(rollbackHtml, /Live Core Stable/);
    assert.equal(rollbackHtml.includes("FAIL_PROOF_TOKEN keep compile valid"), false);

    await core.stop();
    core = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port
    });

    const restored = await waitForWitnessCoreStatus(core.url, status => {
      const ids = new Set((status.generations ?? []).map(generation => generation.id));
      return ids.has(firstGreenId) && ids.has(secondGreenId);
    }, {
      description: "generation history after witness-core restart"
    });
    assert.equal(restored.aliases?.current_stable, firstGreenId);
    assert.equal(restored.aliases?.last_good, firstGreenId);
    assert.equal(restored.serving?.requestedMode, "stable");
    assert.equal(restored.serving?.effectiveMode, "stable");
  } finally {
    await safeTeardown({ server, core, workspace });
  }
}

async function runPreviewScenario() {
  const workspace = await createLiveCoreWorkspace({ proofDelayMs: 300 });
  const port = await reservePort();
  let core = await startWitnessCoreProcess({
    cwd: workspace.tempRoot,
    configPath: workspace.configPath,
    port
  });
  let server = null;
  try {
    server = await startUiServer({
      dslPath: workspace.manifestPath,
      serverRunnerId: "fixture_server",
      runtimeProfile: "authoring",
      devMode: false,
      env: {
        ...process.env,
        WITNESS_CORE_URL: core.url
      }
    });

    const createResponse = await fetch(`${server.url}/api/runtime/app-preview-sessions`, {
      method: "POST"
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    const previewSessionId = created?.previewSession?.id ?? null;
    assert.equal(typeof previewSessionId, "string");

    const originalSource = await fs.readFile(workspace.watchedSourcePath, "utf8");
    const validPreviewSource = originalSource.replace(
      'text = "Live Core Baseline"',
      'text = "Live Core Preview"'
    );

    const patchResponse = await fetch(`${server.url}/api/runtime/app-preview-sessions/${encodeURIComponent(previewSessionId)}/sources`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{
          path: "app/content.wtoml",
          content: validPreviewSource
        }]
      })
    });
    assert.equal(patchResponse.status, 200);
    await waitForJournalPattern(workspace.journalPath, /"kind":"capability\.fs\.patch"/, {
      description: "preview source patch capability event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"capability\.fs\.read"/, {
      description: "preview source read capability event"
    });

    const previewGreen = await waitForWitnessCoreStatus(core.url, status => {
      const latest = status.generations?.[status.generations.length - 1] ?? null;
      return latest?.id?.startsWith(`preview-${previewSessionId}-`) && latest?.state === "green_local";
    }, {
      description: "preview session green_local generation"
    });
    const latestPreviewGreen = previewGreen.generations.at(-1);
    assert.deepEqual(latestPreviewGreen?.sourcePaths, ["app/content.wtoml"]);

    const baseHtml = await fetchText(`${server.url}${workspace.servedRoutePath}`);
    const previewHtml = await fetchText(`${server.url}${workspace.servedRoutePath}?previewSessionId=${encodeURIComponent(previewSessionId)}`);
    assert.match(baseHtml, /Live Core Baseline/);
    assert.equal(baseHtml.includes("Live Core Preview"), false);
    assert.match(previewHtml, /Live Core Preview/);

    await server.close();
    server = await startUiServer({
      dslPath: workspace.manifestPath,
      serverRunnerId: "fixture_server",
      runtimeProfile: "authoring",
      devMode: false,
      env: {
        ...process.env,
        WITNESS_CORE_URL: core.url
      }
    });
    const previewAfterNodeRestart = await fetchText(`${server.url}${workspace.servedRoutePath}?previewSessionId=${encodeURIComponent(previewSessionId)}`);
    assert.match(previewAfterNodeRestart, /Live Core Preview/);

    await server.close();
    await core.stop();
    core = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port
    });
    server = await startUiServer({
      dslPath: workspace.manifestPath,
      serverRunnerId: "fixture_server",
      runtimeProfile: "authoring",
      devMode: false,
      env: {
        ...process.env,
        WITNESS_CORE_URL: core.url
      }
    });
    const previewAfterRustAndNodeRestart = await fetchText(`${server.url}${workspace.servedRoutePath}?previewSessionId=${encodeURIComponent(previewSessionId)}`);
    assert.match(previewAfterRustAndNodeRestart, /Live Core Preview/);

    const invalidPatch = await fetch(`${server.url}/api/runtime/app-preview-sessions/${encodeURIComponent(previewSessionId)}/sources`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{
          path: "app.wtoml",
          content: "[app\nroute = \"/live-core\"\n"
        }]
      })
    });
    assert.equal(invalidPatch.status, 400);

    const previewFailed = await waitForWitnessCoreStatus(core.url, status => {
      const latest = status.generations?.[status.generations.length - 1] ?? null;
      return latest?.id?.startsWith(`preview-${previewSessionId}-`) && latest?.state === "compile_failed";
    }, {
      description: "preview session compile_failed generation"
    });
    const latestPreviewFailed = previewFailed.generations.at(-1);
    assert.equal(latestPreviewFailed?.state, "compile_failed");

    const previewAfterFailureHtml = await fetchText(`${server.url}${workspace.servedRoutePath}?previewSessionId=${encodeURIComponent(previewSessionId)}`);
    assert.match(previewAfterFailureHtml, /Live Core Preview/);
    assert.equal(previewAfterFailureHtml.includes("BrokenPreview"), false);
  } finally {
    await safeTeardown({ server, core, workspace });
  }
}

async function runPublishedAuthoringScenario() {
  const corePort = await reservePort();
  const appPort = await reservePort();
  const appUrl = `http://127.0.0.1:${appPort}`;
  const shellPath = value => String(value).replaceAll("\\", "/");
  const workspace = await createLiveCoreWorkspace({
    proofDelayMs: 300,
    supervise: ({ manifestPath }) => ({
      command: [
        shellPath(process.execPath),
        shellPath(path.join(REPO_ROOT, "src", "cli.js")),
        "utility-serve",
        shellPath(manifestPath),
        "--server",
        "fixture_server",
        "--port",
        String(appPort),
        "--runtime-profile",
        "authoring"
      ].join(" "),
      workingDir: shellPath(REPO_ROOT),
      restartOnExit: true,
      controlUrl: `${appUrl}/api/runtime/worker-control`,
      healthIntervalMs: 100,
      healthTimeoutMs: 45000
    }),
    buildWorker: ({ manifestPath }) => ({
      command: [
        shellPath(process.execPath),
        shellPath(path.join(REPO_ROOT, "src", "witness-core-build-worker.js")),
        "--manifest",
        "{manifest_path}",
        "--workspace-root",
        "{workspace_root}",
        "--runtime-profile",
        "{runtime_profile}"
      ].join(" "),
      workingDir: shellPath(REPO_ROOT)
    }),
    transaction: {
      buildTimeoutMs: 30000,
      stageRoot: ".witness-core/staging"
    }
  });
  let core = null;
  let revisionEvents = null;
  try {
    core = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port: corePort
    });
    await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.running === true && health.process?.ready === true,
    {
      timeoutMs: 45000,
      description: "published transaction supervised process ready"
    });

    const initialHealth = await readProcessHealth(appUrl);
    assert.equal(initialHealth.watchersEnabled, false);

    const routeUrl = `${appUrl}${workspace.servedRoutePath}`;
    const computeModulePath = path.join(workspace.appRoot, "app", "modules", "health-classify", "assembly", "index.ts");
    const baselineHtml = await fetchText(routeUrl);
    assert.match(baselineHtml, /Live Core Baseline/);
    revisionEvents = await openJsonEventStream(`${appUrl}/api/runtime/app-revisions/events`, "published app revision event");

    const originalSource = await fs.readFile(workspace.watchedSourcePath, "utf8");
    const updatedSource = originalSource.replace(
      'text = "Live Core Baseline"',
      'text = "Live Core Published"'
    );
    const success = await readJson(`${appUrl}/api/runtime/app-sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{
          path: "app/content.wtoml",
          content: updatedSource
        }]
      })
    });
    assert.equal(success.response.status, 200);
    assert.equal(success.body?.ok, true);
    assert.equal(success.body?.activated, true);

    const revisionEvent = await revisionEvents.nextEvent({
      timeoutMs: 30000,
      predicate: ({ payload }) =>
        payload?.trigger === "core"
        && Array.isArray(payload?.changedSources)
        && payload.changedSources.includes("app/content.wtoml")
    });
    assert.equal(revisionEvent.payload?.trigger, "core");

    await waitForJournalPattern(workspace.journalPath, /"kind":"transaction\.published\.requested"/, {
      description: "published transaction requested event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"transaction\.build\.started"/, {
      description: "published transaction build started event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"transaction\.build\.passed"/, {
      description: "published transaction build passed event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"transaction\.commit\.applied"/, {
      description: "published transaction commit applied event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"transaction\.activation\.passed"/, {
      description: "published transaction activation passed event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"transaction\.compute_module\.compile\.passed"/, {
      description: "published compute module compile passed event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"transaction\.compute_module\.artifact\.emitted"/, {
      description: "published compute module artifact emitted event"
    });

    assert.match(await fs.readFile(workspace.watchedSourcePath, "utf8"), /Live Core Published/);
    await waitForText(routeUrl, html => html.includes("Live Core Published"), {
      description: "published authoring route update"
    });
    const successfulGeneration = await waitForWitnessCoreStatus(core.url, status => {
      return status.generations?.some(generation =>
        generation?.state === "green_local"
        && Array.isArray(generation?.computeModules)
        && generation.computeModules.some(module => module.id === "engentus.health.classify" && module.success === true)
      );
    }, {
      description: "published generation with compute module metadata"
    });
    const successfulGenerationRecord = successfulGeneration.generations.find(generation =>
      generation?.state === "green_local"
      && Array.isArray(generation?.computeModules)
      && generation.computeModules.some(module => module.id === "engentus.health.classify" && module.success === true)
    ) ?? null;
    const successfulGenerationId = successfulGenerationRecord?.id ?? null;
    const successfulComputeModule = successfulGenerationRecord?.computeModules?.[0] ?? null;
    assert.equal(typeof successfulGenerationId, "string");
    assert.equal(successfulGenerationRecord?.computeModuleCount, 1);
    assert.equal(successfulComputeModule?.id, "engentus.health.classify");
    assert.equal(successfulComputeModule?.hostOperation, "engentus.health.classify");
    assert.equal(successfulComputeModule?.language, "assemblyscript");
    assert.equal(successfulComputeModule?.abi, "world.hostOperation.v1");
    assert.equal(successfulComputeModule?.export, "invoke");
    assert.equal(successfulComputeModule?.success, true);
    assert.match(String(successfulComputeModule?.artifactPath ?? ""), /\.witness-core\/compute-modules\/.+\.wasm$/);
    assert.match(String(successfulComputeModule?.artifactHash ?? ""), /^sha256:/);
    assert.match(String(successfulComputeModule?.storePath ?? ""), /\.witness-core\/artifacts\/compute-modules\/[a-f0-9]+\.wasm$/);

    await delay(1400);
    const settledStatus = await readWitnessCoreStatus(core.url);
    assert.equal(settledStatus.generations?.length, 1);
    assert.equal(settledStatus.generations?.[0]?.id, successfulGenerationId);
    const journalEvents = await readJournalEvents(workspace.journalPath);
    const successfulLifecycleKinds = journalEvents
      .filter(event => event?.generationId === successfulGenerationId)
      .map(event => event?.kind)
      .filter(kind => kind === "generation.candidate" || kind === "proof.started" || kind === "generation.green_local");
    assert.deepEqual(successfulLifecycleKinds, [
      "generation.candidate",
      "proof.started",
      "generation.green_local"
    ]);

    const staleHash = (await readJson(`${core.url}/capabilities/fs/stat?path=${encodeURIComponent("app/content.wtoml")}`)).body?.hash;
    assert.equal(typeof staleHash, "string");

    const outOfBandSource = updatedSource.replace(
      'text = "Live Core Published"',
      'text = "Live Core Out Of Band"'
    );
    await fs.writeFile(workspace.watchedSourcePath, outOfBandSource, "utf8");

    const staleWrite = await readJson(`${appUrl}/api/runtime/app-sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{
          path: "app/content.wtoml",
          content: updatedSource.replace('text = "Live Core Published"', 'text = "Live Core Stale Overwrite"'),
          expectedHash: staleHash
        }]
      })
    });
    assert.equal(staleWrite.response.status, 409);
    assert.equal(staleWrite.body?.code, "WITNESS_CORE_SOURCE_CONFLICT");
    assert.equal(staleWrite.body?.path, "app/content.wtoml");
    assert.equal(staleWrite.body?.expectedHash, staleHash);
    assert.match(String(staleWrite.body?.actualHash ?? ""), /^sha256:/);
    assert.match(await fs.readFile(workspace.watchedSourcePath, "utf8"), /Live Core Out Of Band/);
    await waitForJournalPattern(workspace.journalPath, /"kind":"authoring\.write\.conflict"/, {
      description: "published source conflict journal event"
    });

    const originalComputeModuleSource = await fs.readFile(computeModulePath, "utf8");
    let computeModuleFailWrite = await readJson(`${appUrl}/api/runtime/app-sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{
          path: "app/modules/health-classify/assembly/index.ts",
          content: "export function invoke(): i32 { return ; }\n"
        }]
      })
    });
    if (computeModuleFailWrite.response.status === 503) {
      await waitForWitnessCoreHealthState(core.url, health =>
        health.process?.running === true && health.process?.ready === true,
      {
        timeoutMs: 45000,
        description: "published transaction process ready before compute module failure retry"
      });
      await waitForProcessHealth(appUrl, health =>
        health.ready === true && health.status === "healthy",
      {
        description: "fixture process health before compute module failure retry"
      });
      computeModuleFailWrite = await readJson(`${appUrl}/api/runtime/app-sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          edits: [{
            path: "app/modules/health-classify/assembly/index.ts",
            content: "export function invoke(): i32 { return ; }\n"
          }]
        })
      });
    }
    assert.equal(computeModuleFailWrite.response.status, 400);
    assert.equal(computeModuleFailWrite.body?.code, "COMPILE_FAILED");
    assert.equal(await fs.readFile(computeModulePath, "utf8"), originalComputeModuleSource);
    await waitForJournalPattern(workspace.journalPath, /"kind":"transaction\.compute_module\.compile\.failed"/, {
      description: "published compute module compile failed event"
    });
    const computeModuleFailedGeneration = await waitForWitnessCoreStatus(core.url, status => {
      return status.generations?.some(generation =>
        generation?.state === "compile_failed"
        && Array.isArray(generation?.computeModules)
        && generation.computeModules.some(module => module.id === "engentus.health.classify" && module.success === false)
      );
    }, {
      description: "published generation with compute module compile failure"
    });
    const failedGenerationRecord = computeModuleFailedGeneration.generations.find(generation =>
      generation?.state === "compile_failed"
      && Array.isArray(generation?.computeModules)
      && generation.computeModules.some(module => module.id === "engentus.health.classify" && module.success === false)
    ) ?? null;
    const failedComputeModule = failedGenerationRecord?.computeModules?.[0] ?? null;
    assert.equal(failedComputeModule?.success, false);
    assert.match(String(failedComputeModule?.error ?? ""), /compile|export|artifact/i);
    await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.running === true && health.process?.ready === true,
    {
      timeoutMs: 45000,
      description: "published transaction process ready after compute module failure"
    });
    await waitForProcessHealth(appUrl, health =>
      health.ready === true && health.status === "healthy",
    {
      description: "fixture process health after compute module failure"
    });

    let proofFailWrite = await readJson(`${appUrl}/api/runtime/app-sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{
          path: "app/content.wtoml",
          content: outOfBandSource.replace('text = "Live Core Out Of Band"', 'text = "FAIL_PROOF_TOKEN keep compile valid"')
        }]
      })
    });
    if (proofFailWrite.response.status === 503) {
      await waitForWitnessCoreHealthState(core.url, health =>
        health.process?.running === true && health.process?.ready === true,
      {
        timeoutMs: 45000,
        description: "published transaction process ready before proof failure retry"
      });
      await waitForProcessHealth(appUrl, health =>
        health.ready === true && health.status === "healthy",
      {
        description: "fixture process health before proof failure retry"
      });
      proofFailWrite = await readJson(`${appUrl}/api/runtime/app-sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          edits: [{
            path: "app/content.wtoml",
            content: outOfBandSource.replace('text = "Live Core Out Of Band"', 'text = "FAIL_PROOF_TOKEN keep compile valid"')
          }]
        })
      });
    }
    assert.equal(proofFailWrite.response.status, 400);
    assert.equal(proofFailWrite.body?.code, "PROOF_FAILED");
    assert.match(await fs.readFile(workspace.watchedSourcePath, "utf8"), /Live Core Out Of Band/);

    await requestStableServing({ coreUrl: core.url });
    const stablePinnedSource = outOfBandSource.replace(
      'text = "Live Core Out Of Band"',
      'text = "Live Core Pinned Stable"'
    );
    const stablePinnedWrite = await readJson(`${appUrl}/api/runtime/app-sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{
          path: "app/content.wtoml",
          content: stablePinnedSource
        }]
      })
    });
    assert.equal(stablePinnedWrite.response.status, 200);
    assert.equal(stablePinnedWrite.body?.activated, false);
    assert.match(await fs.readFile(workspace.watchedSourcePath, "utf8"), /Live Core Pinned Stable/);
    const stillOldLive = await fetchText(routeUrl);
    assert.match(stillOldLive, /Live Core Baseline|Live Core Published|Live Core Out Of Band/);
    assert.equal(stillOldLive.includes("Live Core Pinned Stable"), false);

    const serveLive = await readJson(`${core.url}/serving/live`, {
      method: "POST"
    });
    assert.equal(serveLive.response.status, 200);
    await waitForText(routeUrl, html => html.includes("Live Core Pinned Stable"), {
      description: "runtime serving reload after explicit live request"
    });

    await core.stop();

    const coreDownWrite = await readJson(`${appUrl}/api/runtime/app-sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{
          path: "app/content.wtoml",
          content: updatedSource.replace('text = "Live Core Published"', 'text = "Live Core Should Not Persist"')
        }]
      })
    });
    assert.equal(coreDownWrite.response.status, 503);
    assert.equal(coreDownWrite.body?.code, "WITNESS_CORE_UNAVAILABLE");
    assert.match(await fs.readFile(workspace.watchedSourcePath, "utf8"), /Live Core Pinned Stable/);
  } finally {
    await revisionEvents?.close?.();
    await safeTeardown({ core, workspace });
  }
}

async function runSupervisedScenario() {
  const corePort = await reservePort();
  const appPort = await reservePort();
  const appUrl = `http://127.0.0.1:${appPort}`;
  const shellPath = value => String(value).replaceAll("\\", "/");
  const workspace = await createLiveCoreWorkspace({
    proofDelayMs: 700,
    supervise: ({ manifestPath }) => ({
      command: [
        shellPath(process.execPath),
        shellPath(path.join(REPO_ROOT, "src", "cli.js")),
        "utility-serve",
        shellPath(manifestPath),
        "--server",
        "fixture_server",
        "--port",
        String(appPort),
        "--runtime-profile",
        "authoring"
      ].join(" "),
      workingDir: shellPath(REPO_ROOT),
      restartOnExit: true,
      controlUrl: `${appUrl}/api/runtime/worker-control`,
      healthIntervalMs: 100,
      healthTimeoutMs: 45000
    })
  });
  let core = null;
  try {
    core = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port: corePort
    });

    const firstRunning = await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.running === true && Number.isInteger(health.process?.pid),
    {
      description: "supervised process running"
    });
    const firstPid = firstRunning.process.pid;

    await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.pid === firstPid && health.process?.ready === true,
    {
      timeoutMs: 60000,
      description: "supervised process ready"
    });

    const routeUrl = `${appUrl}${workspace.servedRoutePath}`;
    const baselineHtml = await fetchText(routeUrl);
    assert.match(baselineHtml, /Live Core Baseline/);

    const restartResponse = await fetch(`${core.url}/processes/restart`, { method: "POST" });
    assert.equal(restartResponse.status, 200);
    await waitForJournalPattern(workspace.journalPath, /"kind":"process\.restart\.requested"/, {
      description: "supervised process restart requested event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"process\.exited"/, {
      description: "supervised process exited event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"process\.restarting"/, {
      description: "supervised process restarting event"
    });
    const restarted = await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.running === true
        && health.process?.ready === true
        && Number.isInteger(health.process?.pid)
        && health.process.pid !== firstPid,
    {
      timeoutMs: 30000,
      description: "supervised process restarted with a new ready pid"
    });
    assert.notEqual(restarted.process.pid, firstPid);
    const restartedHtml = await fetchText(routeUrl);
    assert.match(restartedHtml, /Live Core Baseline/);

    await replaceFileText(
      workspace.watchedSourcePath,
      'text = "Live Core Baseline"',
      'text = "Live Core Stable"'
    );

    await waitForJournalPattern(workspace.journalPath, /"kind":"generation\.candidate"/, {
      description: "supervised candidate generation event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"proof\.started"/, {
      description: "supervised proof started event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"proof\.passed"/, {
      description: "supervised proof passed event"
    });

    const firstGreen = await waitForWitnessCoreStatus(core.url, status =>
      status.generations?.some(generation => generation.state === "green_local"),
    {
      description: "supervised first green_local generation"
    });
    const firstGreenId = firstGreen.aliases?.current_green_local ?? null;
    assert.equal(typeof firstGreenId, "string");
    await waitForText(routeUrl, html => html.includes("Live Core Stable"), {
      description: "supervised app serving valid live value"
    });

    await promoteStableGeneration({
      appUrl
    });

    await waitForWitnessCoreStatus(core.url, status =>
      status.aliases?.current_stable === firstGreenId
        && status.aliases?.last_good === firstGreenId,
    {
      description: "supervised promoted aliases"
    });

    await replaceFileText(
      workspace.watchedSourcePath,
      'text = "Live Core Stable"',
      'text = "FAIL_PROOF_TOKEN keep compile valid"'
    );

    const failed = await waitForWitnessCoreStatus(core.url, status => {
      const latest = status.generations?.[status.generations.length - 1] ?? null;
      return latest?.state === "proof_failed";
    }, {
      description: "supervised proof failed generation"
    });
    assert.equal(failed.aliases?.current_stable, firstGreenId);
    assert.equal(failed.aliases?.last_good, firstGreenId);
    assert.equal(failed.serving?.effectiveMode, "stable");

    await waitForText(routeUrl, html =>
      html.includes("Live Core Stable") && !html.includes("FAIL_PROOF_TOKEN keep compile valid"),
    {
      description: "supervised app serving promoted stable content after failure"
    });

    await core.stop();
    core = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port: corePort
    });

    const restored = await waitForWitnessCoreStatus(core.url, status => {
      const ids = new Set((status.generations ?? []).map(generation => generation.id));
      return ids.has(firstGreenId)
        && status.aliases?.current_stable === firstGreenId
        && status.aliases?.last_good === firstGreenId;
    }, {
      description: "supervised generation history and aliases after core restart"
    });
    assert.equal(restored.aliases?.current_stable, firstGreenId);

    await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.running === true && health.process?.ready === true,
    {
      timeoutMs: 30000,
      description: "supervised app started ready after core restart"
    });
    const restartHtml = await fetchText(routeUrl);
    assert.match(restartHtml, /Live Core Stable/);
    assert.equal(restartHtml.includes("FAIL_PROOF_TOKEN keep compile valid"), false);
  } finally {
    await safeTeardown({ core, workspace });
  }
}

async function runSupervisedHealthScenario() {
  const corePort = await reservePort();
  const appPort = await reservePort();
  const appUrl = `http://127.0.0.1:${appPort}`;
  const shellPath = value => String(value).replaceAll("\\", "/");
  const workspace = await createLiveCoreWorkspace({
    proofDelayMs: 300,
    runtimeConfig: {
      "runtime.health.sampleMs": 100,
      "runtime.health.previewSessionsMax": 1,
      "runtime.health.degradedToUnhealthyAfterSamples": 20
    },
    supervise: ({ manifestPath }) => ({
      command: [
        shellPath(process.execPath),
        shellPath(path.join(REPO_ROOT, "src", "cli.js")),
        "utility-serve",
        shellPath(manifestPath),
        "--server",
        "fixture_server",
        "--port",
        String(appPort),
        "--runtime-profile",
        "authoring"
      ].join(" "),
      workingDir: shellPath(REPO_ROOT),
      restartOnExit: true,
      restartOnUnhealthy: true,
      controlUrl: `${appUrl}/api/runtime/worker-control`,
      healthIntervalMs: 100,
      healthTimeoutMs: 45000,
      degradedGracePolls: 4,
      unhealthyGracePolls: 2
    })
  });
  let core = null;
  try {
    core = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port: corePort
    });

    const firstRunning = await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.running === true && Number.isInteger(health.process?.pid),
    {
      description: "supervised health process running"
    });
    const firstPid = firstRunning.process.pid;

    await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.pid === firstPid && health.process?.ready === true,
    {
      timeoutMs: 60000,
      description: "supervised health process ready"
    });

    await waitForProcessHealth(appUrl, health =>
      health.ready === true && health.status === "healthy",
    {
      description: "fixture process health endpoint healthy"
    });

    const routeUrl = `${appUrl}${workspace.servedRoutePath}`;
    const baselineHtml = await fetchText(routeUrl);
    assert.match(baselineHtml, /Live Core Baseline/);

    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`${appUrl}/api/runtime/app-preview-sessions`, {
        method: "POST"
      });
      assert.equal(response.status, 201);
    }
    await waitForJournalPattern(workspace.journalPath, /"kind":"process\.unhealthy"/, {
      description: "policy unhealthy event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"process\.restart\.policy_triggered"/, {
      description: "policy restart event"
    });

    const restarted = await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.running === true
        && health.process?.ready === true
        && Number.isInteger(health.process?.pid)
        && health.process.pid !== firstPid
        && health.process.lastRestartReason?.includes("policy unhealthy"),
    {
      timeoutMs: 30000,
      description: "policy-triggered supervised restart"
    });
    assert.notEqual(restarted.process.pid, firstPid);
    assert.equal(restarted.process.status, "healthy");

    const stabilized = await waitForWitnessCoreStatus(core.url, status =>
      status.serving?.requestedMode === "stable" && status.serving?.effectiveMode === "stable",
    {
      description: "stable serving pinned after policy restart"
    });
    assert.equal(stabilized.serving?.requestedMode, "stable");

    const restartedHtml = await fetchText(routeUrl);
    assert.match(restartedHtml, /Live Core Baseline/);
  } finally {
    await safeTeardown({ core, workspace });
  }
}

async function runSoakScenario() {
  const corePort = await reservePort();
  const appPort = await reservePort();
  const appUrl = `http://127.0.0.1:${appPort}`;
  const shellPath = value => String(value).replaceAll("\\", "/");
  const workspace = await createLiveCoreWorkspace({
    proofDelayMs: 250,
    runtimeConfig: {
      "runtime.health.sampleMs": 100
    },
    supervise: ({ manifestPath }) => ({
      command: [
        shellPath(process.execPath),
        shellPath(path.join(REPO_ROOT, "src", "cli.js")),
        "utility-serve",
        shellPath(manifestPath),
        "--server",
        "fixture_server",
        "--port",
        String(appPort),
        "--runtime-profile",
        "authoring"
      ].join(" "),
      workingDir: shellPath(REPO_ROOT),
      restartOnExit: true,
      controlUrl: `${appUrl}/api/runtime/worker-control`,
      healthIntervalMs: 100,
      healthTimeoutMs: 45000
    })
  });
  let core = null;
  let sseClients = [];
  try {
    core = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port: corePort
    });

    const firstRunning = await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.running === true && Number.isInteger(health.process?.pid),
    {
      description: "soak supervised process running"
    });
    const firstPid = firstRunning.process.pid;

    await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.pid === firstPid && health.process?.ready === true,
    {
      timeoutMs: 60000,
      description: "soak supervised process ready"
    });

    const routeUrl = `${appUrl}${workspace.servedRoutePath}`;
    const baselineHtml = await fetchText(routeUrl);
    assert.match(baselineHtml, /Live Core Baseline/);

    const soakSession = await postSoak(core.url, "/soak/start", {
      id: `soak-${Date.now()}`,
      scenario: "fixture-soak"
    });
    const sessionId = soakSession?.id ?? null;
    assert.equal(typeof sessionId, "string");

    await postSoak(core.url, "/soak/mark", {
      sessionId,
      phase: "warmup",
      message: "baseline ready"
    });
    await recordSoakSample({ coreUrl: core.url, appUrl, sessionId, phase: "warmup" });

    sseClients = await openSseClients(`${appUrl}/api/runtime/app-revisions/events`, 2);
    await recordSoakSample({ coreUrl: core.url, appUrl, sessionId, phase: "sse-open" });

    await postSoak(core.url, "/soak/mark", {
      sessionId,
      phase: "preview-churn",
      message: "creating preview session"
    });
    const createResponse = await fetch(`${appUrl}/api/runtime/app-preview-sessions`, {
      method: "POST"
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    const previewSessionId = created?.previewSession?.id ?? null;
    assert.equal(typeof previewSessionId, "string");
    const originalSource = await fs.readFile(workspace.watchedSourcePath, "utf8");
    const previewSource = originalSource.replace(
      'text = "Live Core Baseline"',
      'text = "Live Core Preview Soak"'
    );
    const patchResponse = await fetch(`${appUrl}/api/runtime/app-preview-sessions/${encodeURIComponent(previewSessionId)}/sources`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{
          path: "app/content.wtoml",
          content: previewSource
        }]
      })
    });
    assert.equal(patchResponse.status, 200);
    await waitForWitnessCoreStatus(core.url, status => {
      const latest = status.generations?.at(-1) ?? null;
      return latest?.id?.startsWith(`preview-${previewSessionId}-`) && latest?.state === "green_local";
    }, {
      description: "soak preview green generation"
    });
    const previewHtml = await fetchText(`${routeUrl}?previewSessionId=${encodeURIComponent(previewSessionId)}`);
    assert.match(previewHtml, /Live Core Preview Soak/);
    await recordSoakSample({ coreUrl: core.url, appUrl, sessionId, phase: "preview-churn" });

    await closeSseClients(sseClients);
    sseClients = [];

    await postSoak(core.url, "/soak/mark", {
      sessionId,
      phase: "live-green",
      message: "published edit and promote"
    });
    await replaceFileText(
      workspace.watchedSourcePath,
      'text = "Live Core Baseline"',
      'text = "Live Core Soak Stable"'
    );
    const firstGreen = await waitForWitnessCoreStatus(core.url, status =>
      status.generations?.some(generation => generation.state === "green_local" && !generation.id.startsWith("preview-")),
    {
      description: "soak first green generation"
    });
    const firstGreenId = firstGreen.aliases?.current_green_local ?? null;
    assert.equal(typeof firstGreenId, "string");
    await waitForText(routeUrl, html => html.includes("Live Core Soak Stable"), {
      description: "soak live route serving stable candidate"
    });
    await promoteStableGeneration({ appUrl });
    await waitForWitnessCoreStatus(core.url, status =>
      status.aliases?.current_stable === firstGreenId && status.aliases?.last_good === firstGreenId,
    {
      description: "soak promoted stable aliases"
    });
    await recordSoakSample({ coreUrl: core.url, appUrl, sessionId, phase: "live-green" });

    const restartResponse = await fetch(`${core.url}/processes/restart`, { method: "POST" });
    assert.equal(restartResponse.status, 200);
    await waitForJournalPattern(workspace.journalPath, /"kind":"process\.restarting"/, {
      description: "soak process restarting event"
    });
    await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.running === true
        && health.process?.ready === true
        && Number.isInteger(health.process?.pid)
        && health.process.pid !== firstPid,
    {
      timeoutMs: 30000,
      description: "soak process restarted with new ready pid"
    });
    await waitForText(routeUrl, html => html.includes("Live Core Soak Stable"), {
      description: "soak route serving after restart"
    });
    await recordSoakSample({ coreUrl: core.url, appUrl, sessionId, phase: "post-restart" });

    await postSoak(core.url, "/soak/mark", {
      sessionId,
      phase: "proof-failure",
      message: "triggering stable failover"
    });
    await replaceFileText(
      workspace.watchedSourcePath,
      'text = "Live Core Soak Stable"',
      'text = "FAIL_PROOF_TOKEN keep compile valid"'
    );
    await waitForWitnessCoreStatus(core.url, status => {
      const latest = status.generations?.[status.generations.length - 1] ?? null;
      return latest?.state === "proof_failed";
    }, {
      description: "soak proof failed generation"
    });
    await waitForText(routeUrl, html =>
      html.includes("Live Core Soak Stable") && !html.includes("FAIL_PROOF_TOKEN keep compile valid"),
    {
      description: "soak stable failover route"
    });
    await recordSoakSample({ coreUrl: core.url, appUrl, sessionId, phase: "proof-failure" });

    await postSoak(core.url, "/soak/mark", {
      sessionId,
      phase: "recovery",
      message: "restoring live value"
    });
    await replaceFileText(
      workspace.watchedSourcePath,
      'text = "FAIL_PROOF_TOKEN keep compile valid"',
      'text = "Live Core Soak Recovered"'
    );
    await waitForWitnessCoreStatus(core.url, status => {
      const latest = status.generations?.[status.generations.length - 1] ?? null;
      return latest?.state === "green_local";
    }, {
      description: "soak recovered green generation"
    });
    await waitForText(routeUrl, html => html.includes("Live Core Soak Recovered"), {
      description: "soak recovered live route"
    });
    await recordSoakSample({ coreUrl: core.url, appUrl, sessionId, phase: "recovery" });

    const completed = await postSoak(core.url, "/soak/complete", {
      sessionId,
      message: "fixture soak complete"
    });
    assert.equal(completed?.status, "completed");
    await waitForJournalPattern(workspace.journalPath, /"kind":"process\.soak\.started"/, {
      description: "soak started event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"process\.soak\.sample"/, {
      description: "soak sample event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"process\.soak\.completed"/, {
      description: "soak completed event"
    });

    const soakBeforeRestart = await waitForValue(async () => {
      const state = await readSoakState(core.url);
      return state?.lastSession?.id === sessionId ? state : null;
    }, {
      description: "soak summary before restart"
    });
    assert.equal(soakBeforeRestart.currentSession, null);
    assert.equal(soakBeforeRestart.lastSession?.status, "completed");
    assert.equal(soakBeforeRestart.lastSession?.restartObserved, true);
    assert.equal(soakBeforeRestart.lastSession?.stableFailoverObserved, true);
    assert.equal((soakBeforeRestart.lastSession?.sampleCount ?? 0) >= 5, true);
    assert.equal((soakBeforeRestart.lastSession?.highWater?.previewSessions ?? 0) >= 1, true);

    await core.stop();
    core = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port: corePort
    });

    await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.running === true && health.process?.ready === true,
    {
      timeoutMs: 30000,
      description: "soak process ready after core restart"
    });
    const soakAfterRestart = await waitForValue(async () => {
      const state = await readSoakState(core.url);
      return state?.lastSession?.id === sessionId ? state : null;
    }, {
      description: "soak summary after restart"
    });
    assert.equal(soakAfterRestart.lastSession?.status, "completed");
    assert.equal(soakAfterRestart.lastSession?.restartObserved, true);
    assert.equal(soakAfterRestart.lastSession?.stableFailoverObserved, true);
    assert.equal((soakAfterRestart.lastSession?.sampleCount ?? 0) >= 5, true);
    await waitForText(routeUrl, html => html.includes("Live Core Soak Recovered"), {
      description: "soak route serving after core restart"
    });
  } finally {
    await closeSseClients(sseClients);
    await safeTeardown({ core, workspace });
  }
}

async function runFrontdoorScenario() {
  const corePort = await reservePort();
  const publicPort = await reservePort();
  const publicUrl = `http://127.0.0.1:${publicPort}`;
  const shellPath = value => String(value).replaceAll("\\", "/");
  const workspace = await createLiveCoreWorkspace({
    proofDelayMs: 250,
    supervise: ({ manifestPath }) => ({
      command: [
        shellPath(process.execPath),
        shellPath(path.join(REPO_ROOT, "src", "cli.js")),
        "utility-serve",
        shellPath(manifestPath),
        "--server",
        "fixture_server",
        "--port",
        "{runtime_port}",
        "--runtime-profile",
        "authoring"
      ].join(" "),
      workingDir: shellPath(REPO_ROOT),
      restartOnExit: true,
      controlUrl: "http://127.0.0.1:{runtime_port}/api/runtime/worker-control",
      healthIntervalMs: 100,
      healthTimeoutMs: 45000
    }),
    frontdoor: {
      publicAddr: `127.0.0.1:${publicPort}`,
      drainTimeoutMs: 10000,
      startupCutoverTimeoutMs: 45000
    }
  });
  let core = null;
  let sseClients = [];
  try {
    core = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port: corePort
    });

    const initialHealth = await waitForWitnessCoreHealthState(core.url, health =>
      health.process?.frontdoorEnabled === true
        && typeof health.process?.publicAddr === "string"
        && health.process?.ready === true
        && typeof health.process?.activeInstanceId === "string"
        && Array.isArray(health.process?.instances)
        && health.process.instances.length === 1,
    {
      timeoutMs: 60000,
      description: "frontdoor active instance ready"
    });
    const firstInstanceId = initialHealth.process.activeInstanceId;

    const baselineHtml = await fetchText(`${publicUrl}${workspace.servedRoutePath}`);
    assert.match(baselineHtml, /Live Core Baseline/);

    const initialProcessHealth = await readProcessHealth(publicUrl);
    assert.equal(initialProcessHealth.instanceId, firstInstanceId);
    assert.equal(initialProcessHealth.role, "active");

    const createResponse = await fetch(`${publicUrl}/api/runtime/app-preview-sessions`, {
      method: "POST"
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    const previewSessionId = created?.previewSession?.id ?? null;
    assert.equal(typeof previewSessionId, "string");
    const originalSource = await fs.readFile(workspace.watchedSourcePath, "utf8");
    const previewSource = originalSource.replace(
      'text = "Live Core Baseline"',
      'text = "Live Core Frontdoor Preview"'
    );
    const patchResponse = await fetch(`${publicUrl}/api/runtime/app-preview-sessions/${encodeURIComponent(previewSessionId)}/sources`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{
          path: "app/content.wtoml",
          content: previewSource
        }]
      })
    });
    assert.equal(patchResponse.status, 200);
    await waitForText(`${publicUrl}${workspace.servedRoutePath}?previewSessionId=${encodeURIComponent(previewSessionId)}`, html => html.includes("Live Core Frontdoor Preview"), {
      description: "frontdoor preview before restart"
    });

    sseClients = await openSseClients(`${publicUrl}/api/runtime/app-revisions/events`, 1);

    const restartResponse = await fetch(`${core.url}/processes/restart`, { method: "POST" });
    assert.equal(restartResponse.status, 200);

    const cutover = await waitForWitnessCoreHealthState(core.url, health => {
      const process = health.process ?? {};
      const instances = Array.isArray(process.instances) ? process.instances : [];
      return typeof process.activeInstanceId === "string"
        && process.activeInstanceId !== firstInstanceId
        && instances.some(instance => instance.id === firstInstanceId && instance.state === "draining" && Number(instance.inflightConnections || 0) >= 1);
    }, {
      timeoutMs: 60000,
      description: "frontdoor cutover with draining old instance"
    });
    const secondInstanceId = cutover.process.activeInstanceId;
    assert.notEqual(secondInstanceId, firstInstanceId);

    const newProcessHealth = await waitForProcessHealth(publicUrl, health =>
      health.instanceId === secondInstanceId && health.role === "active",
    {
      description: "frontdoor routes new requests to replacement instance"
    });
    assert.equal(newProcessHealth.mutationsEnabled, true);
    assert.equal(newProcessHealth.watchersEnabled, false);

    const previewAfterCutover = await fetchText(`${publicUrl}${workspace.servedRoutePath}?previewSessionId=${encodeURIComponent(previewSessionId)}`);
    assert.match(previewAfterCutover, /Live Core Frontdoor Preview/);

    await closeSseClients(sseClients);
    sseClients = [];

    const drained = await waitForWitnessCoreHealthState(core.url, health => {
      const instances = Array.isArray(health.process?.instances) ? health.process.instances : [];
      return instances.length === 1 && instances[0]?.id === secondInstanceId && instances[0]?.state === "active";
    }, {
      timeoutMs: 30000,
      description: "draining instance exits after in-flight stream closes"
    });
    assert.equal(drained.process.instances[0].id, secondInstanceId);
    await waitForJournalPattern(workspace.journalPath, /"kind":"process\.instance\.cutover"/, {
      description: "frontdoor cutover journal event"
    });
    await waitForJournalPattern(workspace.journalPath, /"kind":"process\.instance\.drained"/, {
      description: "frontdoor drained journal event"
    });
  } finally {
    await closeSseClients(sseClients);
    await safeTeardown({ core, workspace });
  }
}

const scenario = process.argv[2] ?? "";

async function main() {
  if (scenario === "continuity") {
    await runContinuityScenario();
    return;
  }
  if (scenario === "preview") {
    await runPreviewScenario();
    return;
  }
  if (scenario === "supervised") {
    await runSupervisedScenario();
    return;
  }
  if (scenario === "supervised-health") {
    await runSupervisedHealthScenario();
    return;
  }
  if (scenario === "soak") {
    await runSoakScenario();
    return;
  }
  if (scenario === "frontdoor") {
    await runFrontdoorScenario();
    return;
  }
  if (scenario === "published-authoring") {
    await runPublishedAuthoringScenario();
    return;
  }
  throw new Error(`unknown live-core smoke scenario: ${scenario}`);
}

main().then(
  () => process.exit(0),
  error => {
    console.error(error?.stack || error);
    process.exit(1);
  }
);
