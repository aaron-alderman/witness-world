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
  assert.equal(authored.slices.find(slice => slice.name === "shell-base")?.lowering?.browser?.mode, "native-browser");
  assert.equal(authored.slices.find(slice => slice.name === "auth")?.lowering?.browser?.mode, "native-browser");
  assert.equal(authored.slices.find(slice => slice.name === "home")?.lowering?.browser?.mode, "native-browser");
  assert.equal(authored.slices.find(slice => slice.name === "goodman")?.lowering?.browser?.mode, "native-browser");
  assert.equal(authored.slices.find(slice => slice.name === "mill-charge")?.lowering?.browser?.mode, "native-browser");
  assert.equal(authored.slices.find(slice => slice.name === "mill-force")?.lowering?.browser?.mode, "native-browser");
  assert.equal(authored.slices.find(slice => slice.name === "platform-config")?.lowering?.browser?.mode, "native-browser");
  assert.equal(authored.slices.find(slice => slice.name === "chart-pages")?.lowering?.browser?.mode, "native-browser");
  assert.deepEqual(
    authored.slices.find(slice => slice.name === "auth")?.seams,
    [
      {
        kind: "variant",
        name: "auth.book_state",
        prop: "className",
        token: null,
        identities: [],
        traits: ["auth-book"],
        values: ["folding", "incoming"],
        min: null,
        max: null,
        notes: []
      },
      {
        kind: "variant",
        name: "auth.microsoft_state",
        prop: "className",
        token: null,
        identities: [],
        traits: ["ms-btn"],
        values: ["pending"],
        min: null,
        max: null,
        notes: []
      }
    ]
  );
  assert.deepEqual(
    authored.slices.find(slice => slice.name === "goodman")?.oracleGroups,
    ["goodman chart scaffold", "goodman toolbar", "goodman view", "goodman windows"]
  );
  assert.deepEqual(
    authored.slices.find(slice => slice.name === "goodman")?.seams.map(seam => seam.name),
    [
      "goodman.bolt_edit_open",
      "goodman.bolt_params_open",
      "goodman.mode_active",
      "goodman.run_progress_state"
    ]
  );
  const chartPages = authored.slices.find(slice => slice.name === "chart-pages");
  assert.deepEqual(chartPages?.seams, []);
  assert.ok(chartPages?.identities.includes("ChartPageBody"));
  assert.ok(chartPages?.identities.includes("GoodmanChartTooltip"));
  assert.ok(chartPages?.identities.includes("MillForceCrossTooltip"));
  assert.ok(chartPages?.identities.includes("MillForceRoseOverlayCanvas"));
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
    () => parseEngentusCanonicalWcss(`theme engentus\ntokens\n  color.foo = #fff\nstyles\n  style foo\nviews\n  view desktop\napplication\n  slice shell-base\n    asset shell\n    source shell.rvm\n    family foo\n    seam scalar runtime.size\n      prop style\nlowering\n  backend browser\n    asset shell\n      slice shell-base\n        group foundation\n        family foo -> foundation\n      group foundation\n        rule body\n          color = red\n`),
    /Scalar seam runtime\.size must declare both min and max bounds/i
  );
  assert.throws(
    () => parseEngentusCanonicalWcss(`theme engentus\ntokens\n  color.foo = #fff\nstyles\n  style foo\nviews\n  view desktop\napplication\n  slice shell-base\n    asset shell\n    source shell.rvm\n    family foo\n    seam unknown runtime.mode\n      prop className\nlowering\n  backend browser\n    asset shell\n      slice shell-base\n        group foundation\n        family foo -> foundation\n      group foundation\n        rule body\n          color = red\n`),
    /unsupported kind unknown/i
  );
  assert.throws(
    () => parseEngentusCanonicalWcss(`theme engentus\ntokens\n  color.foo = #fff\nstyles\n  style foo\nviews\n  view desktop\napplication\n  slice shell-base\n    asset shell\n    source shell.rvm\n    family foo\n    seam toggle runtime.mode\n      prop className\n      trait foo\nlowering\n  backend browser\n    asset shell\n      slice shell-base\n        group foundation\n        family foo -> foundation\n      group foundation\n        rule body\n          color = red\n`),
    /Toggle seam runtime\.mode must declare a token/i
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
  assert.equal(browserLowering.slices.find(slice => slice.name === "auth")?.mode, "native-browser");
  assert.equal(browserLowering.slices.find(slice => slice.name === "home")?.mode, "native-browser");
  assert.equal(browserLowering.slices.find(slice => slice.name === "goodman")?.mode, "native-browser");
  assert.equal(browserLowering.slices.find(slice => slice.name === "mill-charge")?.mode, "native-browser");
  assert.equal(browserLowering.slices.find(slice => slice.name === "mill-force")?.mode, "native-browser");
  assert.equal(browserLowering.slices.find(slice => slice.name === "platform-config")?.mode, "native-browser");
  assert.equal(
    browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.auth?.refs.hasRawSelectors,
    false
  );
  assert.equal(
    browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.auth?.refs.rawSelectorCount,
    0
  );
  assert.equal(
    browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.goodman?.refs.rawSelectorCount,
    0
  );
  assert.equal(
    browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.["mill-charge"]?.refs.rawSelectorCount,
    0
  );
  assert.equal(
    browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.["mill-force"]?.refs.rawSelectorCount,
    0
  );
  assert.equal(
    browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.["platform-config"]?.refs.rawSelectorCount,
    0
  );
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.["mill-charge"]);
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.["mill-force"]);
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.["platform-config"]);
  assert.ok(browserLowering.assets.find(asset => asset.name === "shell")?.nativeBlocksBySlice?.goodman);
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
  const platformConfig = inventory.slices.find(slice => slice.name === "platform-config");
  const home = inventory.slices.find(slice => slice.name === "home");
  const millCharge = inventory.slices.find(slice => slice.name === "mill-charge");
  const millForce = inventory.slices.find(slice => slice.name === "mill-force");
  const chartPages = inventory.slices.find(slice => slice.name === "chart-pages");

  assert.ok(auth?.identities.includes("EngentusLogin"));
  assert.ok(auth?.identities.includes("EngentusSignout"));
  assert.ok(auth?.identities.includes("EngentusAccessDenied"));
  assert.ok(auth?.traits.includes("auth-brand"));
  assert.ok(auth?.traits.includes("auth-input"));
  assert.ok(auth?.traits.includes("auth-pw-wrap"));
  assert.ok(auth?.traits.includes("engentus-login"));
  assert.ok(auth?.overrideProps.includes("className"));
  assert.ok(auth?.surfaces.find(surface => surface.identity === "EngentusLogin")?.presentationAnchor);

  assert.ok(shellBase?.identities.includes("EngentusProfileMenu"));
  assert.ok(shellBase?.identities.includes("ShellBaseDocumentBody"));
  assert.ok(shellBase?.traits.includes("mode-btn"));
  assert.ok(shellBase?.traits.includes("fw"));
  assert.ok(shellBase?.overrideProps.includes("className"));
  assert.equal(shellBase?.overrideProps.includes("style"), false);
  assert.ok(shellBase?.surfaces.find(surface => surface.identity === "EngentusProfileMenu")?.presentationAnchor);
  assert.ok(shellBase?.surfaces.find(surface => surface.identity === "ShellBaseGlobalReset")?.presentationAnchor);

  assert.ok(goodman?.identities.includes("GoodmanBody"));
  assert.ok(goodman?.overrideProps.includes("className"));
  assert.equal(goodman?.overrideProps.includes("style"), false);
  assert.ok(goodman?.traits.includes("mode-btn"));
  assert.ok(goodman?.traits.includes("bs-edit-form"));
  assert.ok(goodman?.surfaces.find(surface => surface.identity === "GoodmanRunProgressFill")?.presentationAnchor);
  assert.ok(goodman?.surfaces.find(surface => surface.identity === "GoodmanBoltSetPrimarySwatch")?.presentationAnchor);
  assert.ok(goodman?.surfaces.find(surface => surface.identity === "GoodmanLegendInfiniteSwatch")?.presentationAnchor);
  assert.ok(home?.identities.includes("NewsPanel"));
  assert.ok(home?.traits.includes("news-item"));
  assert.ok(home?.surfaces.find(surface => surface.identity === "ModuleGrid")?.presentationAnchor);
  assert.ok(millCharge?.identities.includes("MillChargeRegimeBadge"));
  assert.ok(millCharge?.traits.includes("mill-regime-badge"));
  assert.ok(millCharge?.overrideProps.includes("className"));
  assert.equal(millCharge?.overrideProps.includes("style"), false);
  assert.ok(millCharge?.surfaces.find(surface => surface.identity === "MillChargeMetricsPanel")?.presentationAnchor);
  assert.ok(millForce?.identities.includes("MillForceTabs"));
  assert.ok(millForce?.traits.includes("mill-force-pill"));
  assert.ok(millForce?.traits.includes("mill-force-cht-tab"));
  assert.ok(millForce?.overrideProps.includes("className"));
  assert.equal(millForce?.overrideProps.includes("style"), false);
  assert.ok(millForce?.surfaces.find(surface => surface.identity === "MillForceChartWrap")?.presentationAnchor);
  assert.ok(platformConfig?.identities.includes("PlatformConfigNotice"));
  assert.ok(platformConfig?.traits.includes("platform-config-side-link"));
  assert.ok(platformConfig?.traits.includes("platform-config-row-action"));
  assert.ok(platformConfig?.surfaces.find(surface => surface.identity === "EngentusPlatformConfigApp")?.presentationAnchor);
  assert.ok(platformConfig?.surfaces.find(surface => surface.name === "PlatformConfigSecretTableRowAction")?.reachableViaTemplate);
  assert.ok(platformConfig?.surfaces.find(surface => surface.name === "PlatformConfigAccessIdentityRowAction")?.reachableViaTemplate);
  assert.ok(chartPages?.identities.includes("ChartPageBody"));
  assert.ok(chartPages?.identities.includes("GoodmanChartOverlayCanvas"));
  assert.ok(chartPages?.identities.includes("MillForceAngleTooltip"));
  assert.deepEqual(chartPages?.overrideProps, []);
  assert.equal(
    chartPages?.surfaces.find(surface => surface.identity === "ChartPageBody")?.presentationAnchor,
    "selector:body.chart-page"
  );
  assert.equal(
    chartPages?.surfaces.find(surface => surface.identity === "GoodmanChartTooltip")?.presentationAnchor,
    "chart-tip"
  );
  assert.equal(
    chartPages?.surfaces.find(surface => surface.identity === "MillForceCrossTooltip")?.presentationAnchor,
    "mill-force-cross-tip"
  );
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
  assert.equal(
    artifacts.parity.slices.find(slice => slice.name === "auth")?.loweringMode,
    "declaration-groups"
  );
  assert.equal(
    artifacts.parity.slices.find(slice => slice.name === "home")?.loweringMode,
    "declaration-groups"
  );
  assert.deepEqual(
    artifacts.parity.slices.find(slice => slice.name === "goodman")?.legacyGroups,
    ["goodman chart scaffold", "goodman toolbar", "goodman view", "goodman windows"]
  );
});

test("engentus can switch isolated slices onto the authored WCSS lane while shrinking native selector debt", async () => {
  const [authoredPlan, inventory] = await Promise.all([
    loadEngentusAppliedWcss(),
    buildEngentusPresentationInventory()
  ]);

  const switchManifest = {
    theme: "engentus",
    slices: {
      "shell-base": "wcss",
      "auth": "wcss",
      "home": "legacy",
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

  const stylesheets = await composeEngentusStylesheets({
    authoredPlan,
    switchManifest
  });
  const shellCss = renderOracleStylesheet(stylesheets.shell);
  const chartCss = renderOracleStylesheet(stylesheets.chart);
  assert.equal(shellCss.includes(".auth-submit.pending"), false);
  assert.equal(shellCss.includes(".auth-signout-icon"), false);
  assert.equal(shellCss.includes(".ms-btn.folding svg"), false);
  assert.equal(shellCss.includes(".ms-btn.pending svg"), true);
  assert.equal(shellCss.includes("#mill-canvas-wrap canvas"), true);
  assert.equal(shellCss.includes(".mill-regime-badge.cataracting"), true);
  assert.equal(shellCss.includes(".mill-force-pill.active"), true);
  assert.equal(shellCss.includes(".mill-force-cht-tab.active"), true);
  assert.equal(shellCss.includes(".platform-config-row-action"), true);
  assert.equal(chartCss.includes("body.chart-page"), true);
  assert.equal(chartCss.includes("#mill-force-force-tip"), true);
  assert.equal(chartCss.includes("#mill-force-cross-tip"), true);
  assert.equal(chartCss.includes("#mill-force-tip"), false);
  assert.equal(
    ownership.slices.find(slice => slice.name === "shell-base")?.loweringMode,
    "native-browser"
  );
  assert.equal(
    ownership.slices.find(slice => slice.name === "auth")?.loweringMode,
    "native-browser"
  );
  assert.equal(
    ownership.slices.find(slice => slice.name === "mill-charge")?.loweringMode,
    "native-browser"
  );
  assert.equal(
    ownership.slices.find(slice => slice.name === "mill-force")?.loweringMode,
    "native-browser"
  );
  assert.equal(
    ownership.slices.find(slice => slice.name === "platform-config")?.loweringMode,
    "native-browser"
  );
  assert.equal(
    ownership.slices.find(slice => slice.name === "chart-pages")?.loweringMode,
    "native-browser"
  );
  assert.deepEqual(
    ownership.slices.find(slice => slice.name === "shell-base")?.anchorCoverage?.missing,
    []
  );
  assert.equal(
    ownership.slices.find(slice => slice.name === "shell-base")?.nativeDebt?.rawSelectorCount,
    0
  );
  assert.deepEqual(
    ownership.slices.find(slice => slice.name === "shell-base")?.descendantCoverage?.missingTraits,
    []
  );
  assert.deepEqual(
    ownership.slices.find(slice => slice.name === "platform-config")?.anchorCoverage?.missing,
    []
  );
  assert.equal(
    ownership.slices.find(slice => slice.name === "auth")?.nativeDebt?.rawSelectorCount,
    0
  );
  assert.equal(
    ownership.slices.find(slice => slice.name === "mill-charge")?.nativeDebt?.rawSelectorCount,
    0
  );
  assert.equal(
    ownership.slices.find(slice => slice.name === "mill-force")?.nativeDebt?.rawSelectorCount,
    0
  );
  assert.deepEqual(
    ownership.slices.find(slice => slice.name === "mill-charge")?.anchorCoverage?.missing,
    []
  );
  assert.deepEqual(
    ownership.slices.find(slice => slice.name === "mill-force")?.anchorCoverage?.missing,
    []
  );
  assert.deepEqual(
    ownership.slices.find(slice => slice.name === "chart-pages")?.anchorCoverage?.missing,
    []
  );
  assert.deepEqual(
    ownership.slices.find(slice => slice.name === "mill-charge")?.descendantCoverage?.missingTraits,
    []
  );
  assert.deepEqual(
    ownership.slices.find(slice => slice.name === "mill-force")?.descendantCoverage?.missingTraits,
    []
  );
  assert.equal(
    ownership.slices.find(slice => slice.name === "platform-config")?.nativeDebt?.rawSelectorCount,
    0
  );
  assert.equal(
    ownership.slices.find(slice => slice.name === "chart-pages")?.nativeDebt?.rawSelectorCount,
    0
  );
  assert.deepEqual(
    ownership.slices.find(slice => slice.name === "platform-config")?.descendantCoverage?.missingTraits,
    []
  );
  assert.deepEqual(
    ownership.slices.find(slice => slice.name === "chart-pages")?.descendantCoverage?.missingTraits,
    []
  );
  assert.ok(
    ownership.slices.find(slice => slice.name === "platform-config")?.descendantCoverage?.templateTraits.includes("platform-config-row-action")
  );
});

test("engentus can switch chart-pages onto the authored native proof lane without changing the checked-in default shell contract", async () => {
  const [authoredPlan, inventory, shellCss] = await Promise.all([
    loadEngentusAppliedWcss(),
    buildEngentusPresentationInventory(),
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-shell.css"), "utf8")
  ]);

  const switchManifest = {
    theme: "engentus",
    slices: {
      "chart-pages": "wcss"
    }
  };

  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan,
    switchManifest
  });
  assert.equal(ownership.ok, true);

  const stylesheets = await composeEngentusStylesheets({
    authoredPlan,
    switchManifest
  });
  assert.equal(renderOracleStylesheet(stylesheets.shell), shellCss);

  const chartCss = renderOracleStylesheet(stylesheets.chart);
  assert.equal(chartCss.includes(":root"), true);
  assert.equal(chartCss.includes("body.chart-page"), true);
  assert.equal(chartCss.includes("#chart-tip"), true);
  assert.equal(chartCss.includes("#mill-force-force-tip"), true);
  assert.equal(chartCss.includes("#mill-force-cross-tip"), true);
  assert.equal(chartCss.includes("#mill-force-rose-tip"), true);
  assert.equal(chartCss.includes("#mill-force-tip"), false);
  assert.equal(chartCss.includes("#mill-force-mc-canvas"), false);

  const chartSlice = ownership.slices.find(slice => slice.name === "chart-pages");
  assert.equal(chartSlice?.loweringMode, "native-browser");
  assert.equal(chartSlice?.nativeDebt?.rawSelectorCount, 0);
  assert.deepEqual(chartSlice?.anchorCoverage?.missing, []);
  assert.deepEqual(chartSlice?.descendantCoverage?.missingTraits, []);
  assert.deepEqual(chartSlice?.seams, []);
});

test("engentus can switch home onto the authored native proof lane without changing the checked-in default contract", async () => {
  const [authoredPlan, inventory] = await Promise.all([
    loadEngentusAppliedWcss(),
    buildEngentusPresentationInventory()
  ]);

  const switchManifest = {
    theme: "engentus",
    slices: {
      home: "wcss"
    }
  };

  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan,
    switchManifest
  });
  assert.equal(ownership.ok, true);

  const stylesheets = await composeEngentusStylesheets({
    authoredPlan,
    switchManifest
  });
  const shellCss = renderOracleStylesheet(stylesheets.shell);
  assert.equal(shellCss.includes("#news-panel"), true);
  assert.equal(shellCss.includes(".news-item.ni-alert"), true);
  assert.equal(shellCss.includes(".mod-card.active:hover"), true);
  assert.equal(shellCss.includes(".mod-status.ms-open"), true);
  assert.equal(shellCss.includes(".news-list::-webkit-scrollbar-thumb"), true);

  const homeSlice = ownership.slices.find(slice => slice.name === "home");
  assert.equal(homeSlice?.loweringMode, "native-browser");
  assert.equal(homeSlice?.nativeDebt?.rawSelectorCount, 0);
  assert.deepEqual(homeSlice?.anchorCoverage?.missing, []);
  assert.deepEqual(homeSlice?.descendantCoverage?.missingTraits, []);
});

test("engentus can switch goodman onto the authored native proof lane without changing the checked-in default contract", async () => {
  const [authoredPlan, inventory] = await Promise.all([
    loadEngentusAppliedWcss(),
    buildEngentusPresentationInventory()
  ]);

  const switchManifest = {
    theme: "engentus",
    slices: {
      goodman: "wcss"
    }
  };

  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan,
    switchManifest
  });
  assert.equal(ownership.ok, true);

  const stylesheets = await composeEngentusStylesheets({
    authoredPlan,
    switchManifest
  });
  const shellCss = renderOracleStylesheet(stylesheets.shell);
  assert.equal(shellCss.includes("#goodman-bolt-primary-swatch"), true);
  assert.equal(shellCss.includes("#goodman-legend-infinite-swatch"), true);
  assert.equal(shellCss.includes("#prog-fill.done"), true);
  assert.equal(shellCss.includes(".goodman-window-empty-message"), true);

  const goodmanSlice = ownership.slices.find(slice => slice.name === "goodman");
  assert.equal(goodmanSlice?.loweringMode, "native-browser");
  assert.equal(goodmanSlice?.nativeDebt?.rawSelectorCount, 0);
  assert.deepEqual(goodmanSlice?.anchorCoverage?.missing, []);
  assert.deepEqual(goodmanSlice?.descendantCoverage?.missingTraits, []);
});

test("engentus can switch mill-charge onto the authored native proof lane without changing the checked-in default contract", async () => {
  const [authoredPlan, inventory] = await Promise.all([
    loadEngentusAppliedWcss(),
    buildEngentusPresentationInventory()
  ]);

  const switchManifest = {
    theme: "engentus",
    slices: {
      "mill-charge": "wcss"
    }
  };

  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan,
    switchManifest
  });
  assert.equal(ownership.ok, true);

  const stylesheets = await composeEngentusStylesheets({
    authoredPlan,
    switchManifest
  });
  const shellCss = renderOracleStylesheet(stylesheets.shell);
  assert.equal(shellCss.includes("#mill-canvas-wrap canvas"), true);
  assert.equal(shellCss.includes(".mill-regime-badge.rolling"), true);
  assert.equal(shellCss.includes(".mill-regime-badge.cataracting"), true);
  assert.equal(shellCss.includes("@media (max-width: 980px)"), true);

  const millChargeSlice = ownership.slices.find(slice => slice.name === "mill-charge");
  assert.equal(millChargeSlice?.loweringMode, "native-browser");
  assert.equal(millChargeSlice?.nativeDebt?.rawSelectorCount, 0);
  assert.deepEqual(millChargeSlice?.anchorCoverage?.missing, []);
  assert.deepEqual(millChargeSlice?.descendantCoverage?.missingTraits, []);
});

test("engentus can switch mill-force onto the authored native proof lane without changing the checked-in default contract", async () => {
  const [authoredPlan, inventory] = await Promise.all([
    loadEngentusAppliedWcss(),
    buildEngentusPresentationInventory()
  ]);

  const switchManifest = {
    theme: "engentus",
    slices: {
      "mill-force": "wcss"
    }
  };

  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan,
    switchManifest
  });
  assert.equal(ownership.ok, true);

  const stylesheets = await composeEngentusStylesheets({
    authoredPlan,
    switchManifest
  });
  const shellCss = renderOracleStylesheet(stylesheets.shell);
  assert.equal(shellCss.includes(".mill-force-pill.active"), true);
  assert.equal(shellCss.includes(".mill-force-cht-tab.active"), true);
  assert.equal(shellCss.includes(".mill-force-result-row"), true);
  assert.equal(shellCss.includes(".mill-force-slider"), true);

  const millForceSlice = ownership.slices.find(slice => slice.name === "mill-force");
  assert.equal(millForceSlice?.loweringMode, "native-browser");
  assert.equal(millForceSlice?.nativeDebt?.rawSelectorCount, 0);
  assert.deepEqual(millForceSlice?.anchorCoverage?.missing, []);
  assert.deepEqual(millForceSlice?.descendantCoverage?.missingTraits, []);
});

test("engentus build script writes proof artifacts under tmp without changing live asset paths", async () => {
  await import(`${BUILD_SCRIPT_URL.href}?t=${Date.now()}`);

  const [inventory, parity, ownership] = await Promise.all([
    readFile(path.join(process.cwd(), "tmp", "engentus-wcss", "engentus-style-inventory.json"), "utf8"),
    readFile(path.join(process.cwd(), "tmp", "engentus-wcss", "engentus-style-parity.json"), "utf8"),
    readFile(path.join(process.cwd(), "tmp", "engentus-wcss", "engentus-style-ownership.json"), "utf8")
  ]);

  assert.match(inventory, /"theme": "engentus"/);
  assert.match(inventory, /"reachableViaTemplate": true/);
  assert.match(parity, /"name": "goodman"/);
  assert.match(parity, /"rawSelectorCount": 0/);
  assert.match(ownership, /"chart-pages"/);
  assert.match(ownership, /"platform-config-row-action"/);
  assert.match(ownership, /"nativeDebt"/);
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

test("engentus ownership checks reject native auth variant refs that are not declared by node-scoped typed seams", async () => {
  const [authoredPlan, inventory] = await Promise.all([
    loadEngentusAppliedWcss(),
    buildEngentusPresentationInventory()
  ]);
  const brokenPlan = {
    ...authoredPlan,
    slices: authoredPlan.slices.map(slice => slice.name === "auth"
      ? { ...slice, seams: [] }
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
  assert.match(ownership.errors.join("\n"), /matching typed seam target/i);
  assert.match(ownership.errors.join("\n"), /undeclared variant value pending/i);
});

test("engentus ownership checks reject native platform-config seams that do not target the sidebar or notice surfaces", async () => {
  const [authoredPlan, inventory] = await Promise.all([
    loadEngentusAppliedWcss(),
    buildEngentusPresentationInventory()
  ]);
  const brokenPlan = {
    ...authoredPlan,
    slices: authoredPlan.slices.map(slice => slice.name === "platform-config"
      ? {
        ...slice,
        seams: slice.seams.filter(seam => seam.name !== "platform.sidebar_active")
      }
      : slice)
  };

  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan: brokenPlan,
    switchManifest: {
      theme: "engentus",
      slices: { "platform-config": "wcss" }
    }
  });

  assert.equal(ownership.ok, false);
  assert.match(ownership.errors.join("\n"), /PlatformConfigSidebarOperatorAction/);
  assert.match(ownership.errors.join("\n"), /undeclared variant value active/i);
});

test("engentus ownership checks reject native mill-force seams that do not target pill and tab active states", async () => {
  const [authoredPlan, inventory] = await Promise.all([
    loadEngentusAppliedWcss(),
    buildEngentusPresentationInventory()
  ]);
  const brokenPlan = {
    ...authoredPlan,
    slices: authoredPlan.slices.map(slice => slice.name === "mill-force"
      ? { ...slice, seams: [] }
      : slice)
  };

  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan: brokenPlan,
    switchManifest: {
      theme: "engentus",
      slices: { "mill-force": "wcss" }
    }
  });

  assert.equal(ownership.ok, false);
  assert.match(ownership.errors.join("\n"), /MillForceModeSingle/);
  assert.match(ownership.errors.join("\n"), /undeclared variant value active/i);
});
