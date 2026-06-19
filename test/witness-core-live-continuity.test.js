import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { startUiServer } from "./support/harness.js";
import {
  createLiveCoreWorkspace,
  fetchText,
  replaceFileText,
  reservePort,
  startWitnessCoreProcess,
  waitForJournalPattern,
  waitForText,
  waitForWitnessCoreStatus
} from "./support/witness-core-harness.js";

async function promoteStableGeneration({ coreUrl, appUrl, generationId }) {
  const [coreResponse, appResponse] = await Promise.all([
    fetch(`${coreUrl}/generations/${encodeURIComponent(generationId)}/promote`, {
      method: "POST"
    }),
    fetch(`${appUrl}/api/runtime/app-snapshot/promote-current`, {
      method: "POST"
    })
  ]);
  assert.equal(coreResponse.status, 200);
  assert.equal(appResponse.status, 200);
}

async function rollbackStableGeneration({ coreUrl, appUrl, generationId }) {
  const [coreResponse, appResponse] = await Promise.all([
    fetch(`${coreUrl}/generations/${encodeURIComponent(generationId)}/rollback`, {
      method: "POST"
    }),
    fetch(`${appUrl}/api/runtime/app-snapshot/rollback-stable`, {
      method: "POST"
    })
  ]);
  assert.equal(coreResponse.status, 200);
  assert.equal(appResponse.status, 200);
}

test("witness-core fixture continuity smoke proves pass, promote, failover, rollback, and restart persistence without Sourcery", { timeout: 240000 }, async () => {
  const workspace = await createLiveCoreWorkspace({ proofDelayMs: 700 });
  const port = await reservePort();
  const core = await startWitnessCoreProcess({
    cwd: workspace.tempRoot,
    configPath: workspace.configPath,
    port
  });
  let server = null;
  try {
    console.log("[live-core] start server");
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
    console.log("[live-core] fetch baseline");
    const baselineHtml = await fetchText(routeUrl);
    assert.match(baselineHtml, /Live Core Baseline/);

    console.log("[live-core] edit stable");
    await replaceFileText(
      workspace.watchedSourcePath,
      'text = "Live Core Baseline"',
      'text = "Live Core Stable"'
    );

    console.log("[live-core] wait proof passed");
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
    console.log("[live-core] first green", firstGreen.aliases?.current_green_local);
    const firstGreenId = firstGreen.aliases?.current_green_local ?? null;
    assert.equal(typeof firstGreenId, "string");

    await waitForText(routeUrl, html => html.includes("Live Core Stable"), {
      description: "live runtime serving the first valid edit"
    });

    console.log("[live-core] promote");
    await promoteStableGeneration({
      coreUrl: core.url,
      appUrl: server.url,
      generationId: firstGreenId
    });

    const promoted = await waitForWitnessCoreStatus(core.url, status =>
      status.aliases?.current_stable === firstGreenId
      && status.aliases?.last_good === firstGreenId,
    {
      description: "promoted stable aliases"
    });
    assert.equal(promoted.aliases?.current_green_local, firstGreenId);

    console.log("[live-core] edit green");
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
    console.log("[live-core] second green", secondGreen.aliases?.current_green_local);
    const secondGreenId = secondGreen.aliases?.current_green_local ?? null;
    assert.equal(typeof secondGreenId, "string");
    assert.notEqual(secondGreenId, firstGreenId);
    assert.equal(secondGreen.aliases?.current_stable, firstGreenId);

    await waitForText(routeUrl, html => html.includes("Live Core Green"), {
      description: "live runtime serving the second valid edit"
    });

    console.log("[live-core] edit failing");
    await replaceFileText(
      workspace.watchedSourcePath,
      'text = "Live Core Green"',
      'text = "FAIL_PROOF_TOKEN keep compile valid"'
    );

    const failed = await waitForWitnessCoreStatus(core.url, status => {
      const latest = status.generations?.[status.generations.length - 1] ?? null;
      return latest?.state === "proof_failed";
    }, {
      description: "proof failed generation"
    });
    console.log("[live-core] failed generation");
    assert.equal(failed.aliases?.current_stable, firstGreenId);
    assert.equal(failed.aliases?.last_good, firstGreenId);
    await waitForJournalPattern(workspace.journalPath, /"kind":"proof\.failed"/, {
      description: "proof failed event"
    });

    const stableHtml = await waitForText(routeUrl, html =>
      html.includes("Live Core Stable") && !html.includes("FAIL_PROOF_TOKEN keep compile valid"),
    {
      description: "runtime serving the promoted stable content after proof failure"
    });
    assert.equal(stableHtml.includes("Live Core Green"), false);

    console.log("[live-core] rollback");
    await rollbackStableGeneration({
      coreUrl: core.url,
      appUrl: server.url,
      generationId: firstGreenId
    });

    const rolledBack = await waitForWitnessCoreStatus(core.url, status => {
      const restored = (status.generations ?? []).find(generation => generation.id === firstGreenId) ?? null;
      return restored?.state === "stable"
        && status.aliases?.current_stable === firstGreenId
        && status.aliases?.last_good === firstGreenId;
    }, {
      description: "rollback aliases and stable generation"
    });
    assert.equal(rolledBack.aliases?.current_green_local, secondGreenId);

    const rollbackHtml = await fetchText(routeUrl);
    assert.match(rollbackHtml, /Live Core Stable/);
    assert.equal(rollbackHtml.includes("FAIL_PROOF_TOKEN keep compile valid"), false);

    console.log("[live-core] restart core");
    await core.stop();
    const restarted = await startWitnessCoreProcess({
      cwd: workspace.tempRoot,
      configPath: workspace.configPath,
      port
    });
    core.child = restarted.child;
    core.logs.splice(0, core.logs.length, ...restarted.logs);
    core.url = restarted.url;
    core.stop = restarted.stop;

    const restored = await waitForWitnessCoreStatus(core.url, status => {
      const ids = new Set((status.generations ?? []).map(generation => generation.id));
      return ids.has(firstGreenId) && ids.has(secondGreenId);
    }, {
      description: "generation history after witness-core restart"
    });
    console.log("[live-core] restored");
    assert.equal(restored.aliases?.current_stable, firstGreenId);
    assert.equal(restored.aliases?.last_good, firstGreenId);
  } catch (error) {
    console.log("[live-core] caught", error?.stack || error);
    throw error;
  } finally {
    console.log("[live-core] cleanup");
    await server?.close?.();
    await core?.stop?.();
    await workspace.cleanup();
  }
});

test("preview session edits publish witness-core generations and remain scoped behind previewSessionId on the fixture app", { timeout: 180000 }, async () => {
  const workspace = await createLiveCoreWorkspace({ proofDelayMs: 300 });
  const port = await reservePort();
  const core = await startWitnessCoreProcess({
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

    const invalidPatch = await fetch(`${server.url}/api/runtime/app-preview-sessions/${encodeURIComponent(previewSessionId)}/sources`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{
          path: "app/content.wtoml",
          content: '[[widget]]\nactor = "tester"\nid = "live_core_message"\nkind = "Text"\nprops = { text = '
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
    await server?.close?.();
    await core?.stop?.();
    await workspace.cleanup();
  }
});
