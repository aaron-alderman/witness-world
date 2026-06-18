import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  composeEngentusStylesheets,
  loadEngentusAppliedWcss,
  loadEngentusBrowserDeclarationGroups,
  loadEngentusBrowserLoweringMap,
  renderOracleStylesheet
} from "../examples/engentus/app/engentus-style-application.js";

test("engentus canonical browser declaration grammar emits the checked-in shell and chart CSS", async () => {
  const [authoredPlan, shellCss, chartCss] = await Promise.all([
    loadEngentusAppliedWcss(),
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-shell.css"), "utf8"),
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-chart-pages.css"), "utf8")
  ]);

  const stylesheets = await composeEngentusStylesheets({
    authoredPlan,
    switchManifest: {
      theme: "engentus",
      slices: {}
    }
  });

  assert.equal(shellCss, renderOracleStylesheet(stylesheets.shell));
  assert.equal(chartCss, renderOracleStylesheet(stylesheets.chart));
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
    "auth",
    "home",
    "shared views",
    "goodman view",
    "chart scaffold",
    "goodman chart scaffold",
    "floating windows",
    "goodman windows",
    "controls and editor",
    "mill charge",
    "mill force",
    "platform config"
  ]);
  assert.deepEqual(chartGroupNames, [
    "chart tokens",
    "chart foundation",
    "chart surfaces"
  ]);
  assert.equal(
    browserLowering.slices.find(slice => slice.name === "auth")?.mode,
    "native-browser"
  );
  assert.equal(
    browserLowering.slices.find(slice => slice.name === "home")?.mode,
    "native-browser"
  );
  assert.equal(
    browserLowering.slices.find(slice => slice.name === "platform-config")?.mode,
    "native-browser"
  );
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.auth);
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.home);
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.["platform-config"]);

  const rootTokens = declarationGroups.shell[0].blocks[1];
  assert.equal(rootTokens.selector, ":root");
  assert.deepEqual(
    rootTokens.declarations.map(([property]) => property).slice(0, 5),
    ["--dk", "--mid", "--brd", "--brdl", "--t1"]
  );
});
