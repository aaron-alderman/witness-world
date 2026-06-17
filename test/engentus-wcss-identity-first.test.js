import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  buildEngentusPresentationInventory,
  buildEngentusStyleArtifacts,
  composeEngentusStylesheets,
  loadEngentusAppliedWcss,
  loadEngentusBrowserDeclarationGroups,
  loadEngentusBrowserLoweringMap,
  loadEngentusCanonicalWcss,
  parseEngentusCanonicalWcss,
  renderOracleStylesheet,
  verifyEngentusStyleOwnership
} from "../examples/engentus/app/engentus-style-application.js";

const BUILD_SCRIPT = path.join(process.cwd(), "scripts", "build-engentus-wcss.mjs");
const BUILD_SCRIPT_URL = pathToFileURL(BUILD_SCRIPT);

test("engentus canonical V1 WCSS source declares the expected slice coverage and normalized families", async () => {
  const authored = await loadEngentusAppliedWcss();
  assert.equal(authored.theme, "engentus");
  assert.deepEqual(
    authored.slices.map(slice => slice.name),
    [
      "shell-base",
      "auth",
      "home",
      "goodman",
      "mill-charge",
      "mill-force",
      "platform-config",
      "chart-pages"
    ]
  );
  assert.deepEqual(authored.views, ["desktop", "narrow"]);
  assert.ok(authored.styles.includes("platform.page_shell"));
  assert.ok(authored.styles.includes("platform.data_table"));
  assert.ok(authored.styles.includes("chart.page_tooltip"));
  assert.ok(!authored.styles.includes("controls and editor"));
  assert.ok(authored.lowering?.byBackend?.browser);
  assert.deepEqual(
    authored.slices.find(slice => slice.name === "goodman")?.oracleGroups,
    ["goodman chart scaffold", "goodman toolbar", "goodman view", "goodman windows"]
  );
  assert.deepEqual(
    authored.slices.find(slice => slice.name === "chart-pages")?.identities,
    [
      "GoodmanDiagram",
      "GoodmanMCBands",
      "MillChargeCrossSection",
      "MillForceAngle",
      "MillForceCross",
      "MillForceRose"
    ]
  );
});

test("engentus canonical V1 parser exposes tokens, families, views, and application slices", async () => {
  const canonical = await loadEngentusCanonicalWcss();
  assert.equal(canonical.theme, "engentus");
  assert.ok(canonical.tokens.some(token => token.name === "color.chrome.bg"));
  assert.ok(canonical.styles.some(style => style.name === "goodman.bolt_set_card"));
  assert.ok(canonical.styles.some(style => style.name === "platform.notice"));
  assert.ok(canonical.views.some(view => view.name === "desktop"));
  assert.ok(canonical.views.some(view => view.name === "narrow"));
  assert.equal(canonical.slices.find(slice => slice.name === "platform-config")?.asset, "shell");
  assert.ok(canonical.lowering.byBackend.browser);
  assert.deepEqual(
    canonical.lowering.byBackend.browser.assets.map(asset => asset.name),
    ["shell", "chart"]
  );
});

test("engentus canonical V1 parser rejects incomplete style grammar sections with clear errors", () => {
  assert.throws(
    () => parseEngentusCanonicalWcss(`theme engentus\nstyles\n  style foo\nviews\n  view desktop\napplication\n  slice shell-base\n    asset shell\n    source shell.rvm\n    family foo\nlowering\n  backend browser\n    asset shell\n      slice shell-base\n        group foundation\n        family foo -> foundation\n`),
    /Missing required top-level section: tokens/
  );
  assert.throws(
    () => parseEngentusCanonicalWcss(`theme engentus\ntokens\n  color.foo = #fff\nstyles\n  style foo\nviews\n  view desktop\napplication\n  slice shell-base\n    asset shell\n    source shell.rvm\n    family bar\nlowering\n  backend browser\n    asset shell\n      slice shell-base\n        group foundation\n        family bar -> foundation\n`),
    /unknown style family bar/i
  );
  assert.throws(
    () => parseEngentusCanonicalWcss(`theme engentus\ntokens\n  color.foo = #fff\nstyles\n  style foo\nviews\n  view desktop\napplication\n  slice shell-base\n    asset shell\n    source shell.rvm\n    family foo\nlowering\n  backend browser\n    asset shell\n`),
    /missing coverage for slice shell-base/i
  );
  assert.throws(
    () => parseEngentusCanonicalWcss(`theme engentus\ntokens\n  color.foo = #fff\nstyles\n  style foo\n  style bar\nviews\n  view desktop\napplication\n  slice shell-base\n    asset shell\n    source shell.rvm\n    family foo\n  slice auth\n    asset shell\n    source shell-auth.rvm\n    family bar\nlowering\n  backend browser\n    asset shell\n      slice shell-base\n        group foundation\n        family foo -> foundation\n      slice auth\n        group foundation\n        family bar -> foundation\n`),
    /claims backend group foundation from both shell-base and auth/i
  );
  assert.throws(
    () => parseEngentusCanonicalWcss(`theme engentus\ntokens\n  color.foo = #fff\nstyles\n  style foo\nviews\n  view desktop\napplication\n  slice shell-base\n    asset shell\n    source shell.rvm\n    family foo\nlowering\n  backend browser\n    asset shell\n      slice shell-base\n        group foundation\n        family foo -> foundation\n`),
    /without a declaration group/i
  );
  assert.throws(
    () => parseEngentusCanonicalWcss(`theme engentus\ntokens\n  color.foo = #fff\nstyles\n  style foo\nviews\n  view desktop\napplication\n  slice shell-base\n    asset shell\n    source shell.rvm\n    family foo\nlowering\n  backend browser\n    asset shell\n      slice shell-base\n        group foundation\n        family foo -> foundation\n      group foundation\n        rule body\n          color = red\n      group foundation\n        rule body\n          color = blue\n`),
    /declares browser group foundation more than once/i
  );
  assert.throws(
    () => parseEngentusCanonicalWcss(`theme engentus\ntokens\n  color.foo = #fff\nstyles\n  style foo\nviews\n  view desktop\napplication\n  slice shell-base\n    asset shell\n    source shell.rvm\n    family foo\nlowering\n  backend browser\n    asset shell\n      slice shell-base\n        group foundation\n        family foo -> foundation\n      group foundation\n        media\n          rule body\n            color = red\n`),
    /media block is missing a query/i
  );
});

test("engentus browser lowering map is parsed separately from application slices", async () => {
  const [canonical, browserLowering, declarationGroups] = await Promise.all([
    loadEngentusCanonicalWcss(),
    loadEngentusBrowserLoweringMap(),
    loadEngentusBrowserDeclarationGroups()
  ]);

  const applicationNode = canonical.ast.children.find(node => node.text === "application");
  const applicationDirectives = applicationNode.children.flatMap(node => node.children.map(child => child.text));
  assert.equal(applicationDirectives.some(text => text.startsWith("oracle ")), false);

  assert.equal(browserLowering.name, "browser");
  assert.deepEqual(
    browserLowering.slices.find(slice => slice.name === "shell-base")?.groups,
    ["chart scaffold", "controls and editor", "floating windows", "foundation", "shared views", "toolbar"]
  );
  assert.deepEqual(
    browserLowering.slices.find(slice => slice.name === "goodman")?.familyGroups.find(entry => entry.family === "surface.window"),
    { family: "surface.window", group: "goodman windows" }
  );
  assert.deepEqual(
    declarationGroups.chart.map(group => group.name),
    ["chart tokens", "chart foundation", "chart surfaces"]
  );
});

test("engentus presentation inventory extracts structured identities, traits, and override seams offline", async () => {
  const authoredPlan = await loadEngentusAppliedWcss();
  const inventory = await buildEngentusPresentationInventory(authoredPlan);
  const auth = inventory.slices.find(slice => slice.name === "auth");
  const goodman = inventory.slices.find(slice => slice.name === "goodman");
  const shellBase = inventory.slices.find(slice => slice.name === "shell-base");

  assert.ok(auth?.identities.includes("EngentusLogin"));
  assert.ok(auth?.identities.includes("EngentusSignout"));
  assert.ok(auth?.traits.includes("engentus-login"));
  assert.ok(auth?.overrideProps.includes("className"));

  assert.ok(shellBase?.identities.includes("EngentusRoot"));
  assert.ok(shellBase?.traits.includes("engentus-spa"));

  assert.ok(goodman?.identities.includes("GoodmanBody"));
  assert.ok(goodman?.overrideProps.includes("style"));
  assert.ok(goodman?.overrideProps.includes("className"));
});

test("engentus style artifacts keep current asset outputs stable while defaulting slices to legacy", async () => {
  const artifacts = await buildEngentusStyleArtifacts();
  const [shellCss, chartCss] = await Promise.all([
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-shell.css"), "utf8"),
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-chart-pages.css"), "utf8")
  ]);

  assert.equal(artifacts.files["engentus-shell.css"], shellCss);
  assert.equal(artifacts.files["engentus-chart-pages.css"], chartCss);
  assert.equal(artifacts.ownership.ok, true);
  assert.deepEqual(
    artifacts.parity.slices.find(slice => slice.name === "goodman")?.legacyGroups,
    ["goodman chart scaffold", "goodman toolbar", "goodman view", "goodman windows"]
  );
});

test("engentus can switch isolated slices onto the authored WCSS lane without changing emitted CSS", async () => {
  const [authoredPlan, inventory, expectedShellCss, expectedChartCss] = await Promise.all([
    loadEngentusAppliedWcss(),
    buildEngentusPresentationInventory(),
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-shell.css"), "utf8"),
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-chart-pages.css"), "utf8")
  ]);

  const switchManifest = {
    theme: "engentus",
    slices: {
      "shell-base": "wcss",
      "auth": "wcss",
      "home": "wcss",
      "goodman": "legacy",
      "mill-charge": "wcss",
      "mill-force": "wcss",
      "platform-config": "wcss",
      "chart-pages": "wcss"
    }
  };

  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan,
    switchManifest
  });
  assert.equal(ownership.ok, true);

  const stylesheets = composeEngentusStylesheets({
    authoredPlan,
    switchManifest
  });
  assert.equal(renderOracleStylesheet(stylesheets.shell), expectedShellCss);
  assert.equal(renderOracleStylesheet(stylesheets.chart), expectedChartCss);
});

test("engentus build script writes proof artifacts under tmp without changing live asset paths", async () => {
  await import(`${BUILD_SCRIPT_URL.href}?t=${Date.now()}`);

  const [inventory, parity, ownership] = await Promise.all([
    readFile(path.join(process.cwd(), "tmp", "engentus-wcss", "engentus-style-inventory.json"), "utf8"),
    readFile(path.join(process.cwd(), "tmp", "engentus-wcss", "engentus-style-parity.json"), "utf8"),
    readFile(path.join(process.cwd(), "tmp", "engentus-wcss", "engentus-style-ownership.json"), "utf8")
  ]);

  assert.match(inventory, /"theme": "engentus"/);
  assert.match(parity, /"name": "goodman"/);
  assert.match(ownership, /"chart-pages"/);
});

test("engentus ownership checks reject unknown structured identities when a slice is switched to WCSS", async () => {
  const [authoredPlan, inventory] = await Promise.all([
    loadEngentusAppliedWcss(),
    buildEngentusPresentationInventory()
  ]);
  const brokenPlan = {
    ...authoredPlan,
    slices: authoredPlan.slices.map(slice => slice.name === "auth"
      ? { ...slice, identities: [...slice.identities, "MissingSurfaceIdentity"] }
      : slice)
  };

  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan: brokenPlan,
    switchManifest: {
      theme: "engentus",
      slices: { auth: "wcss" }
    }
  });

  assert.equal(ownership.ok, false);
  assert.match(ownership.errors.join("\n"), /MissingSurfaceIdentity/);
});
