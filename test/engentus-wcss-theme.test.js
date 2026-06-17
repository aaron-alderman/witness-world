import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ENGENTUS_CHART_THEME_STYLESHEET,
  ENGENTUS_SHELL_THEME_STYLESHEET
} from "../examples/engentus/app/engentus-theme.wcss.js";
import { renderWcssStylesheet } from "../src/uplift/wcss-grammar.js";

function render(stylesheet) {
  return renderWcssStylesheet(stylesheet, {
    banner: "Generated from examples/engentus/app/engentus-theme.wcss.js"
  });
}

test("engentus nested WCSS theme grammar emits the checked-in shell and chart CSS", async () => {
  const [shellCss, chartCss] = await Promise.all([
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-shell.css"), "utf8"),
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-chart-pages.css"), "utf8")
  ]);

  assert.equal(shellCss, render(ENGENTUS_SHELL_THEME_STYLESHEET));
  assert.equal(chartCss, render(ENGENTUS_CHART_THEME_STYLESHEET));
});

test("engentus nested WCSS grammar keeps theme ownership grouped by family", () => {
  const shellGroupNames = ENGENTUS_SHELL_THEME_STYLESHEET.blocks
    .filter(block => block.kind === "group")
    .map(block => block.name);
  const chartGroupNames = ENGENTUS_CHART_THEME_STYLESHEET.blocks
    .filter(block => block.kind === "group")
    .map(block => block.name);

  assert.deepEqual(shellGroupNames, [
    "foundation",
    "toolbar",
    "auth",
    "home",
    "shared views",
    "chart scaffold",
    "floating windows",
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

  const rootTokens = ENGENTUS_SHELL_THEME_STYLESHEET.blocks[0].blocks[1];
  assert.equal(rootTokens.selector, ":root");
  assert.deepEqual(
    rootTokens.declarations.map(([property]) => property).slice(0, 5),
    ["--dk", "--mid", "--brd", "--brdl", "--t1"]
  );
});
