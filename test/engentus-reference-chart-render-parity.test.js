import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import {
  createRuntimeCollector,
  expectNoRuntimeErrors,
  launchBrowser,
  startUiServer
} from "./support/harness.js";

function staticMime(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".ico": return "image/x-icon";
    default: return "application/octet-stream";
  }
}

async function startStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = path.resolve(root, `.${pathname}`);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("Content-Type", staticMime(filePath));
    fs.createReadStream(filePath).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise(resolve => server.close(resolve));
    }
  };
}

async function waitForVisible(page, selector) {
  await page.waitForFunction(target => {
    const node = document.querySelector(target);
    return Boolean(node) && getComputedStyle(node).display !== "none";
  }, selector);
}

async function openTargetRoute(page, baseUrl, routeKind) {
  const routeMap = {
    goodman: `${baseUrl}/engentus/goodman`,
    "mill-charge": `${baseUrl}/engentus/mill-charge`,
    "mill-force": `${baseUrl}/engentus/mill-force`
  };
  const selectorMap = {
    goodman: "#view-goodman",
    "mill-charge": "#view-mill",
    "mill-force": "#view-mill-force"
  };
  await page.goto(routeMap[routeKind], { waitUntil: "domcontentloaded" });
  await waitForVisible(page, selectorMap[routeKind]);
}

async function openReferenceRoute(page, baseUrl, routeKind) {
  const routeMap = {
    goodman: `${baseUrl}/#goodman`,
    "mill-charge": `${baseUrl}/#mill`,
    "mill-force": `${baseUrl}/#mill-force`
  };
  const selectorMap = {
    goodman: "#view-goodman",
    "mill-charge": "#view-mill",
    "mill-force": "#view-mill-force"
  };
  await page.goto(routeMap[routeKind], { waitUntil: "domcontentloaded" });
  await waitForVisible(page, selectorMap[routeKind]);
}

function normalizeSvgMarkup(markup) {
  return String(markup ?? "")
    .replace(/\s+/g, " ")
    .replace(/> </g, "><")
    .trim();
}

async function captureSvgMarkup(page, selector) {
  return normalizeSvgMarkup(await page.evaluate(target => {
    const node = document.querySelector(target);
    return node ? node.innerHTML : null;
  }, selector));
}

async function captureSvgGeometry(page, selector) {
  return page.evaluate(target => {
    const root = document.querySelector(target);
    if (!root) return null;
    const pickAttrs = (node, attrs) => Object.fromEntries(
      attrs
        .map(name => [name, node.getAttribute(name)])
        .filter(([, value]) => value != null)
    );
    return {
      size: [root.clientWidth, root.clientHeight],
      paths: [...root.querySelectorAll("path")].map(node => pickAttrs(node, [
        "d", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "transform", "data-seg"
      ])),
      lines: [...root.querySelectorAll("line")].map(node => pickAttrs(node, [
        "x1", "y1", "x2", "y2", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity"
      ])),
      rects: [...root.querySelectorAll("rect")].map(node => pickAttrs(node, [
        "x", "y", "width", "height", "fill", "fill-opacity", "stroke", "stroke-width"
      ])),
      circles: [...root.querySelectorAll("circle")].map(node => pickAttrs(node, [
        "cx", "cy", "r", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity"
      ])),
      texts: [...root.querySelectorAll("text")].map(node => pickAttrs(node, [
        "x", "y", "transform", "fill", "font-size", "text-anchor", "dominant-baseline"
      ]))
    };
  }, selector);
}

async function captureCanvasDataUrl(page, selector) {
  return page.evaluate(target => {
    const canvas = document.querySelector(target);
    return canvas ? canvas.toDataURL("image/png") : null;
  }, selector);
}

async function captureCanvasSignature(page, selector, grid = 18) {
  return page.evaluate(({ target, cellsPerSide }) => {
    const canvas = document.querySelector(target);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const pixels = ctx.getImageData(0, 0, width, height).data;
    const cells = [];
    for (let gy = 0; gy < cellsPerSide; gy += 1) {
      const y0 = Math.floor(gy * height / cellsPerSide);
      const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * height / cellsPerSide));
      for (let gx = 0; gx < cellsPerSide; gx += 1) {
        const x0 = Math.floor(gx * width / cellsPerSide);
        const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * width / cellsPerSide));
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const offset = (y * width + x) * 4;
            r += pixels[offset];
            g += pixels[offset + 1];
            b += pixels[offset + 2];
            a += pixels[offset + 3];
            count += 1;
          }
        }
        cells.push([
          Math.round(r / count),
          Math.round(g / count),
          Math.round(b / count),
          Math.round(a / count)
        ]);
      }
    }
    return {
      size: [width, height],
      grid: cellsPerSide,
      cells
    };
  }, { target: selector, cellsPerSide: grid });
}

function assertCanvasSignatureNear(actual, expected, { meanThreshold = 4, maxThreshold = 48 } = {}) {
  assert.deepEqual(actual?.size, expected?.size);
  assert.equal(actual?.grid, expected?.grid);
  assert.equal(actual?.cells.length, expected?.cells.length);
  let totalDiff = 0;
  let totalCount = 0;
  let maxDiff = 0;
  for (let index = 0; index < actual.cells.length; index += 1) {
    const a = actual.cells[index];
    const b = expected.cells[index];
    for (let channel = 0; channel < 4; channel += 1) {
      const diff = Math.abs(a[channel] - b[channel]);
      totalDiff += diff;
      totalCount += 1;
      if (diff > maxDiff) maxDiff = diff;
    }
  }
  const meanDiff = totalCount ? totalDiff / totalCount : 0;
  assert.ok(
    meanDiff <= meanThreshold,
    `expected canvas mean diff <= ${meanThreshold}, got ${meanDiff.toFixed(2)}`
  );
  assert.ok(
    maxDiff <= maxThreshold,
    `expected canvas max diff <= ${maxThreshold}, got ${maxDiff}`
  );
}

async function normalizeMillForceChartSize(page, width = 996, height = 815) {
  await page.evaluate(({ chartWidth, chartHeight }) => {
    const wrap = document.getElementById("mill-force-chart-wrap");
    if (!wrap) throw new Error("mill-force-chart-wrap not found");
    wrap.style.width = `${chartWidth}px`;
    wrap.style.minWidth = `${chartWidth}px`;
    wrap.style.maxWidth = `${chartWidth}px`;
    wrap.style.height = `${chartHeight}px`;
    wrap.style.minHeight = `${chartHeight}px`;
    wrap.style.maxHeight = `${chartHeight}px`;
  }, { chartWidth: width, chartHeight: height });
  await page.waitForTimeout(180);
}

async function measureMillChargeCanvasSize(page) {
  return page.evaluate(() => {
    const wrap = document.getElementById("mill-canvas-wrap");
    const canvas = document.getElementById("mill-canvas");
    if (!wrap || !canvas) throw new Error("mill charge canvas host not found");
    return {
      width: Math.round(wrap.clientWidth || canvas.clientWidth || 0),
      height: Math.round(wrap.clientHeight || canvas.clientHeight || 0)
    };
  });
}

async function normalizeMillChargeCanvasSize(page, width, height) {
  await page.evaluate(({ chartWidth, chartHeight }) => {
    const wrap = document.getElementById("mill-canvas-wrap");
    const canvas = document.getElementById("mill-canvas");
    if (!wrap || !canvas) throw new Error("mill charge canvas host not found");
    for (const node of [wrap, canvas]) {
      node.style.width = `${chartWidth}px`;
      node.style.minWidth = `${chartWidth}px`;
      node.style.maxWidth = `${chartWidth}px`;
      node.style.height = `${chartHeight}px`;
      node.style.minHeight = `${chartHeight}px`;
      node.style.maxHeight = `${chartHeight}px`;
    }
  }, { chartWidth: width, chartHeight: height });
  await page.waitForTimeout(120);
}

async function freezeMillChargeFrame(page) {
  await page.evaluate(() => {
    const node = document.querySelector(".mill-slider");
    if (!node) throw new Error("mill slider not found");
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function selectButtonByText(page, selector, text) {
  await page.evaluate(({ targetSelector, expected }) => {
    const target = [...document.querySelectorAll(targetSelector)].find(node => node.textContent?.trim() === expected);
    if (!target) throw new Error(`button not found: ${expected}`);
    target.click();
  }, { targetSelector: selector, expected: text });
}

test("reference and DESIRE render the same chart outputs for deterministic chart states", async () => {
  const desireServer = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus/app.wtoml"),
    serverRunnerId: "engentus_server"
  });
  const referenceServer = await startStaticServer(path.join(process.cwd(), "example-ports", "engentus"));
  const browser = await launchBrowser();
  const referencePage = await browser.context.newPage();
  const frozenTargetPage = await browser.context.newPage();
  const frozenReferencePage = await browser.context.newPage();
  const referenceRuntime = createRuntimeCollector(referencePage);
  const frozenTargetRuntime = createRuntimeCollector(frozenTargetPage);
  const frozenReferenceRuntime = createRuntimeCollector(frozenReferencePage);
  try {
    // Goodman static SVG should match exactly once the reference presenter settles.
    await openReferenceRoute(referencePage, referenceServer.url, "goodman");
    await openTargetRoute(browser.page, desireServer.url, "goodman");
    await referencePage.waitForFunction(() => Boolean(document.querySelector("#g-bands")));
    await browser.page.waitForFunction(() => Boolean(document.querySelector("#g-bands")));
    assert.equal(await captureSvgMarkup(browser.page, "#chart-svg"), await captureSvgMarkup(referencePage, "#chart-svg"));

    // Mill force charts are responsive D3 surfaces. Compare plotted geometry after
    // pinning both shells to the same chart viewport size. Text/copy parity is
    // covered by the broader browser parity suites.
    await openReferenceRoute(referencePage, referenceServer.url, "mill-force");
    await openTargetRoute(browser.page, desireServer.url, "mill-force");
    await referencePage.waitForFunction(() => document.querySelectorAll("#mill-force-svg-cross *").length > 0);
    await browser.page.waitForFunction(() => document.querySelectorAll("#mill-force-svg-cross *").length > 0);
    await normalizeMillForceChartSize(referencePage);
    await normalizeMillForceChartSize(browser.page);
    assert.deepEqual(await captureSvgGeometry(browser.page, "#mill-force-svg-cross"), await captureSvgGeometry(referencePage, "#mill-force-svg-cross"));

    for (const page of [referencePage, browser.page]) {
      await selectButtonByText(page, "#mill-force-chart-tabs .mill-force-cht-tab", "Force vs Angle");
    }
    await referencePage.waitForFunction(() => document.querySelectorAll("#mill-force-svg-force *").length > 0);
    await browser.page.waitForFunction(() => document.querySelectorAll("#mill-force-svg-force *").length > 0);
    assert.deepEqual(await captureSvgGeometry(browser.page, "#mill-force-svg-force"), await captureSvgGeometry(referencePage, "#mill-force-svg-force"));

    for (const page of [referencePage, browser.page]) {
      await selectButtonByText(page, "#mill-force-chart-tabs .mill-force-cht-tab", "Force Rose");
    }
    await referencePage.waitForFunction(() => document.querySelectorAll("#mill-force-svg-rose *").length > 0);
    await browser.page.waitForFunction(() => document.querySelectorAll("#mill-force-svg-rose *").length > 0);
    assert.deepEqual(await captureSvgGeometry(browser.page, "#mill-force-svg-rose"), await captureSvgGeometry(referencePage, "#mill-force-svg-rose"));

    await openReferenceRoute(frozenReferencePage, referenceServer.url, "mill-charge");
    await openTargetRoute(frozenTargetPage, desireServer.url, "mill-charge");
    await frozenReferencePage.waitForFunction(() => document.querySelector(".mill-slider") && document.querySelector("#mill-preset-html .mill-preset-btn"));
    await frozenTargetPage.waitForFunction(() => document.querySelector(".mill-slider") && document.querySelector("#mill-preset-html .mill-preset-btn"));
    const millChargeSize = await measureMillChargeCanvasSize(frozenReferencePage);
    await normalizeMillChargeCanvasSize(frozenReferencePage, millChargeSize.width, millChargeSize.height);
    await normalizeMillChargeCanvasSize(frozenTargetPage, millChargeSize.width, millChargeSize.height);
    for (const page of [frozenReferencePage, frozenTargetPage]) {
      await page.evaluate(() => {
        window.requestAnimationFrame = () => 0;
        window.cancelAnimationFrame = () => {};
      });
    }

    await freezeMillChargeFrame(frozenReferencePage);
    await freezeMillChargeFrame(frozenTargetPage);
    assertCanvasSignatureNear(
      await captureCanvasSignature(frozenTargetPage, "#mill-canvas"),
      await captureCanvasSignature(frozenReferencePage, "#mill-canvas")
    );

    for (const page of [frozenReferencePage, frozenTargetPage]) {
      await selectButtonByText(page, "#mill-preset-html .mill-preset-btn", "Dense slurry");
    }
    assertCanvasSignatureNear(
      await captureCanvasSignature(frozenTargetPage, "#mill-canvas"),
      await captureCanvasSignature(frozenReferencePage, "#mill-canvas")
    );

    expectNoRuntimeErrors(browser.runtime);
    expectNoRuntimeErrors(referenceRuntime);
    expectNoRuntimeErrors(frozenTargetRuntime);
    expectNoRuntimeErrors(frozenReferenceRuntime);
  } finally {
    await frozenReferencePage.close();
    await frozenTargetPage.close();
    await referencePage.close();
    await browser.close();
    await referenceServer.close();
    await desireServer.close();
  }
});
