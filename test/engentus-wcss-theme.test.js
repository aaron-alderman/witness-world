import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import fs from "node:fs/promises";
import {
  ENGENTUS_GENERATED_STYLESHEET_PATHS,
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
  assert.equal(source.includes('plugin = "plugin.engentus-wcss-runtime"'), false);
  assert.equal(source.includes('handler = "wcss.stylesheet.read"'), true);
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
