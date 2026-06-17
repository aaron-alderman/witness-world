import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { startUiServer } from "./support/harness.js";

function readSurfaceRuntimeManifest(html) {
  const match = String(html ?? "").match(/<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/i);
  assert.ok(match, "expected surface runtime manifest in page html");
  return JSON.parse(match[1]);
}

function runtimeIds(manifest) {
  return new Set(manifest?.diagnostics?.includedRuntimeIds ?? manifest?.processWitnesses?.map(witness => witness.body?.id).filter(Boolean) ?? []);
}

test("Engentus page.surface manifests stay route-local across login, home, and Goodman routes", { timeout: 30000 }, async () => {
  const appPath = path.join(process.cwd(), "examples", "engentus/app.wtoml");
  const server = await startUiServer({
    dslPath: appPath,
    serverRunnerId: "engentus_server",
    devMode: false
  });
  try {
    const [loginHtml, homeHtml, goodmanHtml] = await Promise.all([
      fetch(`${server.url}/engentus/login`).then(response => response.text()),
      fetch(`${server.url}/engentus/home`).then(response => response.text()),
      fetch(`${server.url}/engentus/goodman`).then(response => response.text())
    ]);
    const loginManifest = readSurfaceRuntimeManifest(loginHtml);
    const homeManifest = readSurfaceRuntimeManifest(homeHtml);
    const goodmanManifest = readSurfaceRuntimeManifest(goodmanHtml);
    const loginIds = runtimeIds(loginManifest);
    const homeIds = runtimeIds(homeManifest);
    const goodmanIds = runtimeIds(goodmanManifest);

    assert.equal(loginIds.has("EngentusShellActiveRoute"), true);
    assert.equal(loginIds.has("EngentusSignInRequested"), true);
    assert.equal(loginIds.has("GoodmanActiveMode"), false);
    assert.equal(loginIds.has("MillChargeSpeedFrac"), false);
    assert.equal(loginIds.has("MillForceActiveChartTab"), false);

    assert.equal(homeIds.has("EngentusProfileMenuVisible"), true);
    assert.equal(homeIds.has("EngentusSignOutRequested"), true);
    assert.equal(homeIds.has("GoodmanActiveMode"), false);
    assert.equal(homeIds.has("MillChargeSpeedFrac"), false);
    assert.equal(homeIds.has("MillForceActiveChartTab"), false);

    assert.equal(goodmanIds.has("GoodmanActiveMode"), true);
    assert.equal(goodmanIds.has("GoodmanRunStatusState"), true);
    assert.equal(goodmanIds.has("MillChargeSpeedFrac"), false);
    assert.equal(goodmanIds.has("MillForceActiveChartTab"), false);

    assert.equal(loginManifest.diagnostics.requestPathname, "/engentus/login");
    assert.equal(homeManifest.diagnostics.requestPathname, "/engentus/home");
    assert.equal(goodmanManifest.diagnostics.requestPathname, "/engentus/goodman");
    assert.equal(loginManifest.diagnostics.serializedBytes < goodmanManifest.diagnostics.serializedBytes, true);
    assert.equal(homeManifest.diagnostics.serializedBytes < goodmanManifest.diagnostics.serializedBytes, true);
  } finally {
    await server.close();
  }
});
