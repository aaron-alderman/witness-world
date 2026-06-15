import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { loadWitnessAppFile, applyWitnessDocs } from "../src/dsl.js";
import { applyDesire } from "../src/desire/index.js";
import {
  normalizePathname,
  readSurfaceMapFromWorld,
  renderSurfaceShellFromMap,
  renderSurfaceShellPage
} from "../src/runtime-surface-shell.js";
import { buildMountedChartRuntime } from "../plugins/chart-runtime/runtime.js";

async function loadEngentusWorld() {
  const world = createWorld();
  const loaded = await loadWitnessAppFile(path.join(process.cwd(), "examples", "engentus/app.wtoml"));
  applyWitnessDocs(world, loaded.witnessDocs);
  for (const desire of loaded.authoredDesireDocs) applyDesire(world, desire);
  return world;
}

test("the direct shell projector renders login and home states from the world", async () => {
  const world = await loadEngentusWorld();

  const login = renderSurfaceShellPage(world, {
    rootSurfaceId: "EngentusRoot",
    requestPathname: normalizePathname("/"),
    route: { params: { defaultScreen: "login" } },
    buildMountedChartRuntime
  });
  assert.match(login, /Welcome back/);
  assert.match(login, /Sign in with Microsoft/);

  const home = renderSurfaceShellPage(world, {
    rootSurfaceId: "EngentusRoot",
    requestPathname: normalizePathname("/engentus/home"),
    route: { params: { defaultScreen: "login", screen: "home" } },
    buildMountedChartRuntime
  });
  assert.match(home, /Analysis Modules/);
  assert.match(home, /Mill Charge Motion/);
  assert.match(home, /Mill Force Analysis/);
  assert.match(home, /Tension Time Series/);
  assert.match(home, /Compliance Dashboard/);
  assert.equal([...home.matchAll(/class="mod-card locked"/g)].length, 15);
});

test("the pure map projector respects route selection and mount mode", async () => {
  const world = await loadEngentusWorld();
  const surfaces = readSurfaceMapFromWorld(world);

  const goodman = renderSurfaceShellFromMap({
    surfaces,
    world,
    rootSurfaceId: "EngentusRoot",
    requestPathname: normalizePathname("/engentus/goodman"),
    route: { params: { defaultScreen: "login", screen: "goodman" } },
    buildMountedChartRuntime
  });
  assert.match(goodman, /<svg id="chart-svg" class="chart-page__mount chart-page__mount--goodman" data-chart-spec=/);
  assert.match(goodman, /data-mount-mode="mounted-panel"/);
  assert.match(goodman, /\/app-static\/app\/runtime\/engentus-browser-runtime\.js/);
  assert.doesNotMatch(goodman, /<iframe[^>]+src="\/chart\?chart=GoodmanDiagram"/);
  assert.match(goodman, /Scenario View/);
  assert.match(goodman, /Fatigue Life Regions/);
  assert.match(goodman, /id="sec-static"/);
  assert.match(goodman, /id="new-sim-btn"/);
  assert.match(goodman, /id=['"]cfg-n['"]/);
  assert.match(goodman, /id=['"]edit-panel-html['"]/);
  assert.match(goodman, /id=['"]legend-html['"]/);
  assert.match(goodman, /id=['"]scr['"]/);
  assert.match(goodman, /id=['"]play-btn['"]/);
  assert.match(goodman, /id=['"]time-sl['"]/);
  assert.match(goodman, /id=['"]trail-wrap['"]/);

  const millForce = renderSurfaceShellFromMap({
    surfaces,
    world,
    rootSurfaceId: "EngentusRoot",
    requestPathname: normalizePathname("/engentus/mill-force"),
    route: { params: { defaultScreen: "login", screen: "mill-force" } },
    buildMountedChartRuntime
  });
  assert.match(millForce, /id="mill-force-svg-cross"/);
  assert.match(millForce, /\/app-static\/app\/runtime\/engentus-browser-runtime\.js/);
  assert.match(millForce, /id="mill-force-svg-force"[^>]*style="display:none"/);
  assert.match(millForce, /id="mill-force-svg-rose"[^>]*style="display:none"/);
  assert.match(millForce, /id="mill-force-mc-canvas"/);
  assert.match(millForce, /id="mill-force-tip"/);
  assert.doesNotMatch(millForce, /<iframe[^>]+src="\/chart\?chart=MillForceCross"/);
  assert.match(millForce, /Cross-section/);
  assert.match(millForce, /Force Rose/);
  assert.match(millForce, /id="mill-force-sb-scroll">[\s\r\n\t]*<\/div>/);
});

test("core surface shell renderer stays template-driven instead of encoding Engentus product layouts", async () => {
  const source = await readFile(path.join(process.cwd(), "src", "runtime-surface-shell.js"), "utf8");

  assert.equal(source.includes("function goodmanShellMarkup"), false);
  assert.equal(source.includes("function millChargeShellMarkup"), false);
  assert.equal(source.includes("function millForceShellMarkup"), false);
  assert.equal(source.includes('layoutVariant === "goodman"'), false);
  assert.equal(source.includes('layoutVariant === "mill-charge"'), false);
  assert.equal(source.includes('layoutVariant === "mill-force-tabs"'), false);
  assert.equal(source.includes('shellTemplate === "sidebar-grid"'), true);
  assert.equal(source.includes('shellTemplate === "viewer-sidebar-main"'), true);
  assert.equal(source.includes('shellTemplate === "viewer-sidebar-main-metrics"'), true);
  assert.equal(source.includes('shellTemplate === "viewer-sidebar-tabs"'), true);
  assert.equal(source.includes("firstTruthy(props.shellTemplate, props.routeKey"), false);
  assert.equal(source.includes("firstTruthy(activeProps.shellTemplate, activeProps.routeKey"), false);
  assert.equal(source.includes('"home-news-grid"'), false);
  assert.equal(source.includes('"view-login"'), false);
  assert.equal(source.includes('"view-home"'), false);
  assert.equal(source.includes('"view-signout"'), false);
  assert.equal(source.includes('"view-goodman"'), false);
  assert.equal(source.includes('"view-mill"'), false);
  assert.equal(source.includes('"view-mill-force"'), false);
  assert.equal(source.includes('"rose"'), false);
  assert.equal(source.includes("mill-pill"), false);
  assert.equal(source.includes("pageModuleHref"), false);
  assert.equal(source.includes("pageModuleExport"), false);
  assert.equal(source.includes("bootstrapSurfacePage"), false);
});
