import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import fs from "node:fs/promises";
import {
  ENGENTUS_GENERATED_STYLESHEET_PATHS,
  buildEngentusTokenCatalog,
  loadEngentusCanonicalWcss,
  loadEngentusGeneratedCssBundle,
  loadEngentusBrowserDeclarationGroups,
  loadEngentusBrowserLoweringMap
} from "../examples/engentus/app/engentus-style-application.js";
import { startUiServer } from "./support/harness.js";

test("engentus generated stylesheet routes serve the canonical shell and chart CSS", async () => {
  const [bundle, server] = await Promise.all([
    loadEngentusGeneratedCssBundle(),
    startUiServer({
      dslPath: path.join(process.cwd(), "examples", "engentus", "app.wtoml"),
      serverRunnerId: "engentus_server",
      runtimeProfile: "authoring",
      devMode: false
    })
  ]);
  try {
    const [shellResponse, chartResponse] = await Promise.all([
      fetch(`${server.url}${ENGENTUS_GENERATED_STYLESHEET_PATHS.shell}`),
      fetch(`${server.url}${ENGENTUS_GENERATED_STYLESHEET_PATHS.chart}`)
    ]);
    assert.equal(shellResponse.status, 200);
    assert.equal(chartResponse.status, 200);
    assert.match(shellResponse.headers.get("content-type") || "", /^text\/css\b/i);
    assert.match(chartResponse.headers.get("content-type") || "", /^text\/css\b/i);
    assert.equal(await shellResponse.text(), bundle.files["engentus-shell.css"]);
    assert.equal(await chartResponse.text(), bundle.files["engentus-chart-pages.css"]);
  } finally {
    await server.close();
  }
});

test("engentus runtime installs the generic wcss runtime plugin and authored stylesheet routes", async () => {
  const source = await fs.readFile(path.join(process.cwd(), "examples", "engentus", "app.wtoml"), "utf8");
  assert.equal(source.includes('plugin = "plugin.wcss-runtime"'), true);
  assert.equal(source.includes('plugin = "plugin.wcss-authoring"'), true);
  assert.equal(source.includes('plugin = "plugin.engentus-wcss-runtime"'), false);
  assert.equal(source.includes('handler = "wcss.stylesheet.read"'), true);
  assert.equal(source.includes('handler = "wcss.document.read"'), true);
  assert.equal(source.includes('handler = "wcss.preview.session.create"'), true);
  assert.equal(source.includes('handler = "wcss.preview.tokens.patch"'), true);
  assert.equal(source.includes('handler = "wcss.preview.session.clear"'), true);
});

test("engentus authoring routes expose the canonical document and preview-scoped token patches", async () => {
  const [canonical, server] = await Promise.all([
    loadEngentusCanonicalWcss(),
    startUiServer({
      dslPath: path.join(process.cwd(), "examples", "engentus", "app.wtoml"),
      serverRunnerId: "engentus_server",
      runtimeProfile: "authoring",
      devMode: false
    })
  ]);
  try {
    const expectedCatalog = buildEngentusTokenCatalog(canonical);
    const readResponse = await fetch(`${server.url}/engentus/__generated/wcss/document`);
    assert.equal(readResponse.status, 200);
    const readBody = await readResponse.json();
    assert.equal(readBody.document?.theme, "engentus");
    assert.deepEqual(readBody.tokenCatalog, expectedCatalog);

    const createResponse = await fetch(`${server.url}/engentus/__generated/wcss/preview-session`, {
      method: "POST"
    });
    assert.equal(createResponse.status, 200);
    const created = await createResponse.json();
    assert.equal(typeof created.previewSessionId, "string");

    const patchResponse = await fetch(`${server.url}/engentus/__generated/wcss/preview-session`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        previewSessionId: created.previewSessionId,
        ops: [{ kind: "set", token: "color.chrome.bg", value: "#123456" }]
      })
    });
    assert.equal(patchResponse.status, 200);
    const patched = await patchResponse.json();
    assert.equal(patched.ok, true);

    const [baseShellCss, previewShellCss, previewPageHtml] = await Promise.all([
      fetch(`${server.url}${ENGENTUS_GENERATED_STYLESHEET_PATHS.shell}`).then(response => response.text()),
      fetch(`${server.url}${ENGENTUS_GENERATED_STYLESHEET_PATHS.shell}?wcssPreview=${encodeURIComponent(created.previewSessionId)}`).then(response => response.text()),
      fetch(`${server.url}/engentus/login?wcssPreview=${encodeURIComponent(created.previewSessionId)}`).then(response => response.text())
    ]);
    assert.match(baseShellCss, /--dk:\s*#2C3C63;/i);
    assert.match(previewShellCss, /--dk:\s*#123456;/i);
    assert.equal(previewShellCss.includes("--dk: #2C3C63;"), false);
    assert.match(previewPageHtml, new RegExp(`${ENGENTUS_GENERATED_STYLESHEET_PATHS.shell.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?wcssPreview=${created.previewSessionId}`));

    const clearResponse = await fetch(`${server.url}/engentus/__generated/wcss/preview-session`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ previewSessionId: created.previewSessionId })
    });
    assert.equal(clearResponse.status, 200);
    assert.equal((await clearResponse.json()).ok, true);
  } finally {
    await server.close();
  }
});

test("engentus canonical browser lowering keeps declaration groups partitioned by backend bucket", async () => {
  const [browserLowering, declarationGroups] = await Promise.all([
    loadEngentusBrowserLoweringMap(),
    loadEngentusBrowserDeclarationGroups()
  ]);

  const shellGroupNames = browserLowering.assets
    .find(asset => asset.name === "shell")
    .declarationGroups
    .map(group => group.name);
  const chartGroupNames = browserLowering.assets
    .find(asset => asset.name === "chart")
    .declarationGroups
    .map(group => group.name);

  assert.deepEqual(shellGroupNames, [
    "foundation",
    "toolbar",
    "goodman toolbar",
    "shared views",
    "goodman view",
    "chart scaffold",
    "goodman chart scaffold",
    "floating windows",
    "goodman windows",
    "controls and editor",
    "mill charge",
    "mill force"
  ]);
  assert.deepEqual(chartGroupNames, []);
  assert.equal(
    browserLowering.slices.find(slice => slice.name === "auth")?.mode,
    "native-browser"
  );
  assert.equal(
    browserLowering.slices.find(slice => slice.name === "home")?.mode,
    "native-browser"
  );
  assert.equal(
    browserLowering.slices.find(slice => slice.name === "goodman")?.mode,
    "native-browser"
  );
  assert.equal(
    browserLowering.slices.find(slice => slice.name === "mill-charge")?.mode,
    "native-browser"
  );
  assert.equal(
    browserLowering.slices.find(slice => slice.name === "mill-force")?.mode,
    "native-browser"
  );
  assert.equal(
    browserLowering.slices.find(slice => slice.name === "platform-config")?.mode,
    "native-browser"
  );
  assert.equal(
    browserLowering.slices.find(slice => slice.name === "chart-pages")?.mode,
    "native-browser"
  );
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.auth);
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.home);
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.goodman);
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.["mill-charge"]);
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.["mill-force"]);
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.["platform-config"]);
  assert.ok(browserLowering.assets.find(asset => asset.name === "chart")?.nativeBlocksBySlice?.["chart-pages"]);

  const rootTokens = declarationGroups.shell[0].blocks[1];
  assert.equal(rootTokens.selector, ":root");
  assert.deepEqual(
    rootTokens.declarations.map(([property]) => property).slice(0, 5),
    ["--dk", "--mid", "--brd", "--brdl", "--t1"]
  );
});
