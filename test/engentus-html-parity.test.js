import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createWorld } from "../src/kernel.js";
import { loadWitnessAppFile, applyWitnessDocs } from "../src/dsl.js";
import { applyDesire } from "../src/desire/index.js";
import { normalizePathname, renderSurfaceShellPage } from "../src/runtime-surface-shell.js";
import { buildMountedChartRuntime, resolveChartSpec } from "../plugins/chart-runtime/runtime.js";
import { renderChartHtml } from "../plugins/chart-runtime/chart-page.js";

async function loadEngentusWorld() {
  const world = createWorld();
  const loaded = await loadWitnessAppFile(path.join(process.cwd(), "examples", "engentus/app.wtoml"));
  applyWitnessDocs(world, loaded.witnessDocs);
  for (const desire of loaded.authoredDesireDocs) applyDesire(world, desire);
  return world;
}

function renderProjected(world, pathname, screen = null) {
  return renderSurfaceShellPage(world, {
    rootSurfaceId: "EngentusRoot",
    requestPathname: normalizePathname(pathname),
    route: {
      params: {
        defaultScreen: "login",
        ...(screen ? { screen } : {})
      }
    },
    buildMountedChartRuntime
  });
}

function blockBetweenIds(html, startId, endId = null) {
  const start = html.indexOf(`<div id="${startId}">`);
  if (start < 0) throw new Error(`missing block ${startId}`);
  const end = endId ? html.indexOf(`<div id="${endId}">`, start + 1) : -1;
  return end >= 0 ? html.slice(start, end) : html.slice(start);
}

function stripTags(value) {
  return canonicalText(
    String(value ?? "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|h1|h2|h3|span|strong|button|label|a)>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function decodeEntities(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function canonicalText(value) {
  return decodeEntities(String(value ?? ""))
    .replaceAll("â€”", "-")
    .replaceAll("â€“", "-")
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("â„¢", "")
    .replaceAll("™", "")
    .replaceAll("Â©", "Copyright")
    .replaceAll("©", "Copyright")
    .replaceAll("â€™", "'")
    .replaceAll("’", "'")
    .replaceAll("â€¢", "")
    .replaceAll("•", "")
    .replaceAll("âš™", "")
    .replaceAll("⚙", "")
    .replaceAll("ðŸ“ˆ", "")
    .replaceAll("ðŸ“Š", "")
    .replaceAll("ðŸ”¬", "")
    .replaceAll("ðŸ‘¤", "")
    .replaceAll("âš™", "")
    .replaceAll("ðŸ“‹", "")
    .replaceAll("ðŸ­", "")
    .replaceAll("â†©", "")
    .replaceAll("📈", "")
    .replaceAll("📊", "")
    .replaceAll("🔬", "")
    .replaceAll("👤", "")
    .replaceAll("⚙", "")
    .replaceAll("📋", "")
    .replaceAll("🏭", "")
    .replaceAll("↩", "")
    .replaceAll("✏", "")
    .replaceAll("Ï†", "phi")
    .replaceAll("Ï†'", "phi'")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html, pattern) {
  const match = html.match(pattern);
  if (!match) throw new Error(`pattern not found: ${pattern}`);
  return stripTags(match[1]);
}

function allMatches(html, pattern) {
  return [...html.matchAll(pattern)].map(match => stripTags(match[1])).filter(Boolean);
}

function snapshotLogin(html, source) {
  const block = source === "reference" ? blockBetweenIds(html, "view-login", "view-signout") : html;
  const projectedBulletsBlock = source === "projected"
    ? block.match(/<ul class="auth-bullets">([\s\S]*?)<\/ul>/)?.[1] ?? ""
    : null;
  return {
    title: source === "reference"
      ? firstMatch(block, /auth-form-title">([\s\S]*?)<\/h2>/)
      : firstMatch(block, /auth-form-title">([\s\S]*?)<\/h2>/),
    subtitle: source === "reference"
      ? firstMatch(block, /auth-form-sub">([\s\S]*?)<\/p>/)
      : firstMatch(block, /auth-form-sub">([\s\S]*?)<\/p>/),
    heroTitle: source === "reference"
      ? firstMatch(block, /auth-tagline">([\s\S]*?)<\/div>/)
      : firstMatch(block, /auth-tagline">([\s\S]*?)<\/div>/),
    heroBody: source === "reference"
      ? firstMatch(block, /auth-sub">([\s\S]*?)<\/p>/)
      : firstMatch(block, /auth-sub">([\s\S]*?)<\/p>/),
    bullets: source === "reference"
      ? allMatches(block, /auth-bullet">([\s\S]*?)<\/li>/g)
      : allMatches(projectedBulletsBlock, /<li(?: [^>]*)?>([\s\S]*?)<\/li>/g),
    secondaryAction: source === "reference"
      ? firstMatch(block, /(?:<button|<a) class="ms-btn"[\s\S]*?>([\s\S]*?)<\/(?:button|a)>/)
      : firstMatch(block, /(?:<button|<a) class="ms-btn"[\s\S]*?>([\s\S]*?)<\/(?:button|a)>/),
    primaryAction: source === "reference"
      ? firstMatch(block, /(?:<button|<a) class="auth-submit"[\s\S]*?>([\s\S]*?)<\/(?:button|a)>/)
      : firstMatch(block, /(?:<button|<a) class="auth-submit"[\s\S]*?>([\s\S]*?)<\/(?:button|a)>/),
    helpLabel: source === "reference"
      ? firstMatch(block, /auth-forgot"><a [^>]+>([\s\S]*?)<\/a>/)
      : firstMatch(block, /auth-forgot"><a [^>]+>([\s\S]*?)<\/a>/),
    footnote: source === "reference"
      ? firstMatch(block, /auth-form-footer">([\s\S]*?)<\/div>/)
      : firstMatch(block, /auth-form-footer">([\s\S]*?)<\/div>/),
    footer: source === "reference"
      ? firstMatch(block, /auth-footer">([\s\S]*?)<\/div>/)
      : firstMatch(block, /auth-footer">([\s\S]*?)<\/div>/)
  };
}

function snapshotSignout(html, source) {
  const block = source === "reference" ? blockBetweenIds(html, "view-signout", "tb") : html;
  return {
    title: source === "reference"
      ? firstMatch(block, /auth-so-title">([\s\S]*?)<\/h2>/)
      : firstMatch(block, /auth-so-title">([\s\S]*?)<\/h2>/),
    subtitle: source === "reference"
      ? firstMatch(block, /auth-so-sub">([\s\S]*?)<\/p>/)
      : firstMatch(block, /auth-so-sub">([\s\S]*?)<\/p>/),
    primaryAction: source === "reference"
      ? firstMatch(block, /(?:<button|<a) class="auth-submit"[\s\S]*?>([\s\S]*?)<\/(?:button|a)>/)
      : firstMatch(block, /(?:<button|<a) class="auth-submit"[\s\S]*?>([\s\S]*?)<\/(?:button|a)>/),
    footnote: source === "reference"
      ? firstMatch(block, /auth-form-footer"[^>]*>([\s\S]*?)<\/div>/)
      : firstMatch(block, /auth-form-footer"[^>]*>([\s\S]*?)<\/div>/),
    footer: source === "reference"
      ? firstMatch(block, /auth-footer">([\s\S]*?)<\/div>/)
      : firstMatch(block, /auth-footer">([\s\S]*?)<\/div>/)
  };
}

function snapshotToolbar(html, source, { includeGoodmanTools = false } = {}) {
  const block = source === "reference" ? blockBetweenIds(html, "tb", "view-home") : html;
  const snapshot = {
    profileName: firstMatch(block, /id="up-name">([\s\S]*?)<\/div>/),
    profileRole: firstMatch(block, /id="up-role">([\s\S]*?)<\/div>/),
    menuItems: source === "reference"
      ? allMatches(block, /<div class="up-mi"[\s\S]*?>([\s\S]*?)<\/div>/g)
      : allMatches(block, /<(?:div|a) class="up-mi[^"]*"[^>]*>([\s\S]*?)<\/(?:div|a)>/g)
  };
  if (includeGoodmanTools) {
    snapshot.modes = allMatches(block, /mode-btn[^"]*"[^>]*>([\s\S]*?)<\/button>/g);
    snapshot.actions = allMatches(block, /tbw"[^>]*>([\s\S]*?)<\/button>/g);
  }
  return snapshot;
}

function snapshotHome(html, source) {
  const block = source === "reference" ? blockBetweenIds(html, "view-home", "view-goodman") : html;
  const heading = source === "reference"
    ? firstMatch(block, /<h2>([\s\S]*?)<\/h2>/)
    : firstMatch(block, /<h2>([\s\S]*?)<\/h2>/);
  const subtitle = source === "reference"
    ? firstMatch(block, /mod-area-meta">\s*<p>([\s\S]*?)<\/p>/)
    : firstMatch(block, /mod-area-meta">\s*<p>([\s\S]*?)<\/p>/);
  const pill = source === "reference"
    ? firstMatch(block, /mill-pill">([\s\S]*?)<\/div>/)
    : firstMatch(block, /mill-pill">([\s\S]*?)<\/div>/);
  const news = source === "reference"
    ? [...block.matchAll(/news-item[\s\S]*?<div class="ni-cat">([\s\S]*?)<\/div>[\s\S]*?<div class="ni-title">([\s\S]*?)<\/div>[\s\S]*?<div class="ni-time">([\s\S]*?)<\/div>/g)]
    : [...block.matchAll(/news-item[\s\S]*?<div class="ni-cat">([\s\S]*?)<\/div>[\s\S]*?<div class="ni-title">([\s\S]*?)<\/div>[\s\S]*?<div class="ni-time">([\s\S]*?)<\/div>/g)];
  const modules = source === "reference"
    ? [...block.matchAll(/mod-card active[\s\S]*?<div class="mod-name">([\s\S]*?)<\/div>[\s\S]*?<div class="mod-desc">([\s\S]*?)<\/div>[\s\S]*?<div class="mod-status[^"]*">([\s\S]*?)<\/div>/g)]
    : [...block.matchAll(/mod-card active[\s\S]*?<div class="mod-name">([\s\S]*?)<\/div>[\s\S]*?<div class="mod-desc">([\s\S]*?)<\/div>[\s\S]*?<div class="mod-status[^"]*">([\s\S]*?)<\/div>/g)];
  const lockedModules = source === "reference"
    ? [...block.matchAll(/mod-card locked[\s\S]*?<div class="mod-name">([\s\S]*?)<\/div>[\s\S]*?<div class="mod-desc">([\s\S]*?)<\/div>[\s\S]*?<div class="mod-status[^"]*">([\s\S]*?)<\/div>/g)]
    : [...block.matchAll(/mod-card locked[\s\S]*?<div class="mod-name">([\s\S]*?)<\/div>[\s\S]*?<div class="mod-desc">([\s\S]*?)<\/div>[\s\S]*?<div class="mod-status[^"]*">([\s\S]*?)<\/div>/g)];
  const referenceLockedFromScript = source === "reference"
    ? [...html.matchAll(/\['([^']+)',\s*'([^']+)',\s*[A-Z]\]/g)].map(([, title, description]) => ({
        title: stripTags(title),
        description: stripTags(description),
        status: "Coming Soon"
      }))
    : [];
  return {
    heading,
    subtitle,
    pill,
    newsHeader: source === "reference"
      ? firstMatch(block, /news-hdr">\s*<span>([\s\S]*?)<\/span>/)
      : firstMatch(block, /news-hdr">\s*<span>([\s\S]*?)<\/span>/),
    newsLive: source === "reference"
      ? firstMatch(block, /news-live">[\s\S]*?news-live-dot"><\/div>([\s\S]*?)<\/div>/)
      : firstMatch(block, /news-live">[\s\S]*?news-live-dot"><\/div>([\s\S]*?)<\/div>/),
    news: news.map(([, category, title, time]) => ({
      category: stripTags(category),
      title: stripTags(title),
      time: stripTags(time)
    })),
    modules: modules.map(([, title, description, status]) => ({
      title: stripTags(title),
      description: stripTags(description),
      status: stripTags(status)
    })),
    lockedModules: source === "reference"
      ? referenceLockedFromScript
      : lockedModules.map(([, title, description, status]) => ({
          title: stripTags(title),
          description: stripTags(description),
          status: stripTags(status)
        }))
  };
}

function snapshotGoodman(html, source) {
  const block = source === "reference" ? blockBetweenIds(html, "view-goodman", "view-mill") : html;
  const normalizedSectionTitles = allMatches(block, /ssec-title">([\s\S]*?)<\/div>/g)
    .map(title => title.replace(/\+\s*New$/, "").trim());
  return {
    toolbar: snapshotToolbar(html, source, { includeGoodmanTools: true }),
    sections: normalizedSectionTitles,
    hiddenSections: [...block.matchAll(/id="(sec-(?:mc|run|edit))"[^>]*style="display:none"/g)].map(match => match[1]),
    scrubberIds: [
      "scr",
      "play-btn",
      "time-sl",
      "t-lbl",
      "fail-badge",
      "spd-wrap",
      "spd-sl",
      "spd-lbl",
      "trail-wrap",
      "trail-cb"
    ].filter(id => new RegExp(`id=["']${id}["']`).test(block)),
    requiredIds: [
      "sec-static",
      "static-params-html",
      "sec-mc",
      "new-sim-btn",
      "sim-list",
      "sec-run",
      "cfg-n",
      "cfg-tmax",
      "cfg-dt",
      "btn-run",
      "btn-pause",
      "btn-stop",
      "prog-fill",
      "prog-lbl",
      "sec-edit",
      "edit-panel-html",
      "new-bs-btn",
      "bs-list",
      "legend-html"
    ].filter(id => new RegExp(`id=["']${id}["']`).test(block))
  };
}

function snapshotMillCharge(html, source) {
  const block = source === "reference" ? blockBetweenIds(html, "view-mill", "view-mill-force") : html;
  return {
    metricsLabel: source === "reference"
      ? firstMatch(block, /mill-metrics-hdr">([\s\S]*?)<\/div>/)
      : firstMatch(block, /mill-metrics-hdr">([\s\S]*?)<\/div>/)
  };
}

function snapshotMillForce(html, source) {
  const block = source === "reference" ? blockBetweenIds(html, "view-mill-force") : html;
  return {
    tabs: allMatches(block, /mill-force-cht-tab[^"]*"[^>]*>([\s\S]*?)<\/button>/g),
    panelCount: source === "reference"
      ? [...block.matchAll(/id="mill-force-svg-(?:cross|force|rose)"/g)].length
      : [...block.matchAll(/id="mill-force-svg-(?:cross|force|rose)"/g)].length
  };
}

test("direct DESIRE projection matches the reference login and signout shell copy", async () => {
  const [world, referenceHtml] = await Promise.all([
    loadEngentusWorld(),
    readFile(path.join(process.cwd(), "example-ports", "engentus", "index.html"), "utf8")
  ]);

  assert.deepEqual(
    snapshotLogin(renderProjected(world, "/"), "projected"),
    snapshotLogin(referenceHtml, "reference")
  );
  assert.deepEqual(
    snapshotSignout(renderProjected(world, "/engentus/signout", "signout"), "projected"),
    snapshotSignout(referenceHtml, "reference")
  );
});

test("direct DESIRE projection matches the reference home shell structure and ordering", async () => {
  const [world, referenceHtml] = await Promise.all([
    loadEngentusWorld(),
    readFile(path.join(process.cwd(), "example-ports", "engentus", "index.html"), "utf8")
  ]);

  assert.deepEqual(
    snapshotToolbar(renderProjected(world, "/engentus/home", "home"), "projected"),
    snapshotToolbar(referenceHtml, "reference")
  );
  assert.deepEqual(
    snapshotHome(renderProjected(world, "/engentus/home", "home"), "projected"),
    snapshotHome(referenceHtml, "reference")
  );
});

test("direct DESIRE projection matches the reference viewer-shell semantics for Goodman, mill charge, and mill force", async () => {
  const [world, referenceHtml] = await Promise.all([
    loadEngentusWorld(),
    readFile(path.join(process.cwd(), "example-ports", "engentus", "index.html"), "utf8")
  ]);

  assert.deepEqual(
    snapshotGoodman(renderProjected(world, "/engentus/goodman", "goodman"), "projected"),
    snapshotGoodman(referenceHtml, "reference")
  );
  assert.deepEqual(
    snapshotMillCharge(renderProjected(world, "/engentus/mill-charge", "mill-charge"), "projected"),
    snapshotMillCharge(referenceHtml, "reference")
  );
  assert.deepEqual(
    snapshotMillForce(renderProjected(world, "/engentus/mill-force", "mill-force"), "projected"),
    snapshotMillForce(referenceHtml, "reference")
  );
  assert.match(renderProjected(world, "/engentus/goodman", "goodman"), /<svg id="chart-svg" class="chart-page__mount chart-page__mount--goodman" data-chart-spec=/);
  assert.doesNotMatch(renderProjected(world, "/engentus/goodman", "goodman"), /<iframe[^>]+src="\/chart\?chart=GoodmanDiagram"/);
  assert.match(renderProjected(world, "/engentus/mill-charge", "mill-charge"), /<canvas id="mill-canvas" class="chart-page__mount chart-page__mount--mill-charge" data-chart-spec=/);
  assert.doesNotMatch(renderProjected(world, "/engentus/mill-charge", "mill-charge"), /<iframe[^>]+src="\/chart\?chart=MillChargeCrossSection"/);
  assert.match(renderProjected(world, "/engentus/mill-force", "mill-force"), /id="mill-force-svg-cross"/);
  assert.match(renderProjected(world, "/engentus/mill-force", "mill-force"), /id="mill-force-mc-canvas"/);
  assert.doesNotMatch(renderProjected(world, "/engentus/mill-force", "mill-force"), /<iframe[^>]+src="\/chart\?chart=MillForceCross"/);
});

function extractStyleBlock(html) {
  const match = html.match(/<style>([\s\S]*?)<\/style>/i);
  if (!match) throw new Error("reference style block missing");
  return match[1];
}

function rootVariableMap(css) {
  const block = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!block) throw new Error("missing :root block");
  const rows = block[1]
    .split(";")
    .map(row => row.trim())
    .filter(Boolean)
    .map(row => row.split(":").map(part => part.trim()))
    .filter(parts => parts.length === 2);
  return Object.fromEntries(rows);
}

function selectorBlock(css, selector) {
  const normalizedCss = css
    .split("@media")[0]
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ");
  const normalizedSelector = selector
    .replace(/\s*([>+~])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const blocks = [];
  for (const match of normalizedCss.matchAll(/([^{}]+)\{([\s\S]*?)\}/g)) {
    const selectorText = match[1]
      .split(",")
      .map(part => part.replace(/\s*([>+~])\s*/g, "$1").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const groupedSelector = selectorText.join(", ");
    if (groupedSelector !== normalizedSelector && !selectorText.includes(normalizedSelector)) continue;
    blocks.push(match[2].replace(/\s+/g, " ").trim().replace(/;\s*$/, ""));
  }
  if (!blocks.length) throw new Error(`missing selector ${selector}`);
  return blocks.join("; ");
}

function normalizedSelectorBlock(css, selector) {
  const block = selectorBlock(css, selector).replace(/;$/, "");
  if (selector === "#view-goodman" || selector === "#view-mill" || selector === "#view-mill-force") {
    return block.replace("display: none", "display: flex");
  }
  return block;
}

function selectorDeclarations(css, selector) {
  return Object.fromEntries(
    selectorBlock(css, selector)
      .split(";")
      .map(row => row.trim())
      .filter(Boolean)
      .map(row => {
        const index = row.indexOf(":");
        return [row.slice(0, index).trim(), row.slice(index + 1).trim()];
      })
  );
}

function normalizedSelectorDeclarations(css, selector) {
  const declarations = selectorDeclarations(css, selector);
  if (selector === "#view-goodman" || selector === "#view-mill" || selector === "#view-mill-force") {
    return {
      ...declarations,
      display: "flex"
    };
  }
  return declarations;
}

function chartPageSnapshot(html) {
  const mountMatch = html.match(/<(svg|canvas) id="([^"]+)" class="chart-page__mount[^"]*" data-chart-spec=/);
  return {
    mountTag: mountMatch?.[1] ?? null,
    mountId: mountMatch?.[2] ?? null,
    overlayCanvasId: html.match(/<canvas id="([^"]+)" class="chart-page__overlay-canvas" data-chart-page-overlay="canvas"><\/canvas>/)?.[1] ?? null,
    tooltipId: html.match(/<div id="([^"]+)" class="chart-page__tooltip[^"]*" data-chart-page-overlay="tooltip"><\/div>/)?.[1] ?? null
  };
}

test("engentus app-owned shell stylesheet preserves reference theme tokens and major selectors", async () => {
  const [referenceHtml, projectedCss] = await Promise.all([
    readFile(path.join(process.cwd(), "example-ports", "engentus", "index.html"), "utf8"),
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-shell.css"), "utf8")
  ]);
  const referenceCss = extractStyleBlock(referenceHtml);

  assert.deepEqual(rootVariableMap(projectedCss), rootVariableMap(referenceCss));
  for (const selector of [
    "body",
    "#tb",
    "#tb-brand",
    ".auth-book",
    ".ms-btn",
    ".auth-divider-line",
    ".auth-input",
    ".auth-signout-icon",
    "#view-home",
    "#news-panel",
    ".news-item",
    "#module-grid",
    ".mod-card",
    ".mod-lock",
    "#scr",
    "#scr.hidden + #chart-wrap",
    "#play-btn",
    "#t-lbl",
    ".fail-badge",
    "#trail-wrap",
    "#view-goodman",
    "#view-mill",
    "#mill-body",
    "#mill-sb",
    "#mill-sb-scroll",
    "#mill-main",
    "#mill-canvas-wrap",
    "#mill-metrics",
    "#mill-metrics-hdr",
    "#mill-metrics-panel",
    "#mill-force-body",
    "#mill-force-sb",
    "#mill-force-sb-scroll",
    "#mill-force-chart-area",
    "#mill-force-chart-tabs",
    ".mill-force-cht-tab",
    "#mill-force-chart-wrap",
    ".mill-force-pill"
  ]) {
    assert.deepEqual(normalizedSelectorDeclarations(projectedCss, selector), normalizedSelectorDeclarations(referenceCss, selector));
  }
});

test("engentus chart pages preserve the reference inner chart ids and major selector blocks", async () => {
  const [referenceHtml, shellCss, chartCss] = await Promise.all([
    readFile(path.join(process.cwd(), "example-ports", "engentus", "index.html"), "utf8"),
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-shell.css"), "utf8"),
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "engentus-chart-pages.css"), "utf8")
  ]);
  const world = await loadEngentusWorld();
  const witnesses = world.allWitnesses();
  const shellGoodman = renderProjected(world, "/engentus/goodman", "goodman");
  const shellMillForce = renderProjected(world, "/engentus/mill-force", "mill-force");
  const referenceCss = extractStyleBlock(referenceHtml);
  const goodmanSpec = resolveChartSpec(witnesses, "GoodmanDiagram");
  const millChargeSpec = resolveChartSpec(witnesses, "MillChargeCrossSection");
  const millForceSpec = resolveChartSpec(witnesses, "MillForceCross");

  assert.deepEqual(chartPageSnapshot(renderChartHtml({
    title: "GoodmanDiagram",
    spec: goodmanSpec,
    pageProps: goodmanSpec.pageProps
  })), {
    mountTag: "svg",
    mountId: "chart-svg",
    overlayCanvasId: "mc-canvas",
    tooltipId: "chart-tip"
  });
  assert.deepEqual(chartPageSnapshot(renderChartHtml({
    title: "MillChargeCrossSection",
    spec: millChargeSpec,
    pageProps: millChargeSpec.pageProps
  })), {
    mountTag: "canvas",
    mountId: "mill-canvas",
    overlayCanvasId: null,
    tooltipId: null
  });
  assert.deepEqual(chartPageSnapshot(renderChartHtml({
    title: "MillForceCross",
    spec: millForceSpec,
    pageProps: millForceSpec.pageProps
  })), {
    mountTag: "svg",
    mountId: "mill-force-svg-cross",
    overlayCanvasId: "mill-force-mc-canvas",
    tooltipId: "mill-force-tip"
  });

  assert.deepEqual(selectorDeclarations(chartCss, "#chart-svg, #mc-canvas"), selectorDeclarations(referenceCss, "#chart-svg, #mc-canvas"));
  assert.deepEqual(selectorDeclarations(chartCss, "#mc-canvas"), selectorDeclarations(referenceCss, "#mc-canvas"));
  assert.deepEqual(selectorDeclarations(chartCss, "#chart-tip"), selectorDeclarations(referenceCss, "#chart-tip"));
  assert.deepEqual(selectorDeclarations(chartCss, "#mill-canvas"), selectorDeclarations(referenceCss, "#mill-canvas"));
  assert.deepEqual(selectorDeclarations(chartCss, "#mill-force-svg-cross, #mill-force-svg-force, #mill-force-svg-rose"), selectorDeclarations(referenceCss, "#mill-force-svg-cross, #mill-force-svg-force, #mill-force-svg-rose"));
  assert.deepEqual(selectorDeclarations(chartCss, "#mill-force-mc-canvas"), selectorDeclarations(referenceCss, "#mill-force-mc-canvas"));
  assert.deepEqual(selectorDeclarations(chartCss, "#mill-force-tip"), selectorDeclarations(referenceCss, "#mill-force-tip"));
  assert.match(shellCss, /#chart-wrap/);
  assert.match(shellGoodman, /id="chart-svg"/);
  assert.match(shellMillForce, /id="mill-force-svg-cross"/);
});
