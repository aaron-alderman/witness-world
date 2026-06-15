import path from "node:path";
import { startUiServer, launchBrowser } from "../test/support/harness.js";

const referenceBaseUrl = process.argv[2] || "http://localhost:56693/";
const screen = process.argv[3] || "login";
const fullOutput = process.argv.includes("--full");

const SELECTORS_BY_SCREEN = {
  login: [
  ".auth-left",
  ".auth-right",
  ".auth-form-wrap",
  ".auth-form-logo img",
  ".auth-form-title",
  ".auth-form-sub",
  "#ms-btn",
  ".auth-divider",
  "#login-email",
  "#login-pw",
  ".auth-pw-toggle",
  ".auth-forgot",
  ".auth-submit",
  ".auth-form-footer"
  ],
  home: [
    "#tb",
    "#tb-brand",
    "#tb-brand img",
    "#tb-divider",
    "#user-prof",
    "#up-avatar",
    "#up-name",
    "#up-role",
    "#news-panel",
    ".news-hdr",
    ".news-live",
    ".news-item",
    ".ni-cat",
    ".ni-title",
    ".ni-time",
    "#module-area",
    ".mod-area-hdr",
    ".mod-area-hdr h2",
    ".mod-area-meta",
    "#module-grid",
    ".mod-card.active",
    ".mod-card.locked",
    ".mod-icon",
    ".mod-name",
    ".mod-desc",
    ".mod-status"
  ]
};

async function inspectSelectors(page, selectors) {
  return page.evaluate(activeSelectors => {
    function inspect(selector) {
      const matches = [...document.querySelectorAll(selector)];
      const element = matches
        .map(node => ({ node, rect: node.getBoundingClientRect() }))
        .sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height))[0]?.node;
      if (!element) return { missing: true };
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      className: element.getAttribute("class"),
      text: (element.textContent || "").replace(/\s+/g, " ").trim(),
      type: element.getAttribute("type"),
      placeholder: element.getAttribute("placeholder"),
      autocomplete: element.getAttribute("autocomplete"),
      inlineStyle: element.getAttribute("style"),
      childElementCount: element.childElementCount,
      box: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      display: style.display,
      marginBottom: style.marginBottom,
      padding: style.padding,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      backgroundColor: style.backgroundColor
    };
    }
    return Object.fromEntries(activeSelectors.map(selector => [selector, inspect(selector)]));
  }, selectors);
}

async function gotoEnough(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 5000 });
  } catch (error) {
    if (!String(error?.message || error).includes("Timeout")) throw error;
  }
}

function diffRecord(reference, current) {
  const diffs = [];
  for (const key of ["tag", "id", "className", "type", "placeholder", "autocomplete", "inlineStyle", "display", "marginBottom", "padding", "fontSize", "lineHeight", "backgroundColor"]) {
    if (reference?.[key] !== current?.[key]) {
      diffs.push({ field: key, reference: reference?.[key] ?? null, current: current?.[key] ?? null });
    }
  }
  if ((reference?.childElementCount ?? 0) === 0 && (current?.childElementCount ?? 0) === 0 && reference?.text !== current?.text) {
    diffs.push({ field: "text", reference: reference?.text ?? null, current: current?.text ?? null });
  }
  for (const key of ["x", "y", "width", "height"]) {
    const refValue = reference?.box?.[key];
    const curValue = current?.box?.[key];
    if (typeof refValue === "number" && typeof curValue === "number" && Math.abs(refValue - curValue) > 2) {
      diffs.push({ field: `box.${key}`, reference: refValue, current: curValue });
    }
  }
  return diffs;
}

const server = await startUiServer({
  dslPath: path.join(process.cwd(), "examples", "engentus", "app.wtoml"),
  serverRunnerId: "engentus_server",
  devMode: false
});
const browser = await launchBrowser({
  headless: true,
  viewport: { width: 1280, height: 900 }
});

try {
  const referencePage = await browser.context.newPage();
  const currentPage = await browser.context.newPage();
  const referenceUrl = screen === "home"
    ? `${referenceBaseUrl.replace(/\/$/, "")}/#home`
    : referenceBaseUrl;
  const currentPath = screen === "home" ? "/engentus/home" : "/engentus/login";
  await gotoEnough(referencePage, referenceUrl);
  await gotoEnough(currentPage, `${server.url}${currentPath}`);

  const rows = [];
  const selectors = SELECTORS_BY_SCREEN[screen] ?? SELECTORS_BY_SCREEN.login;
  const referenceBySelector = await inspectSelectors(referencePage, selectors);
  const currentBySelector = await inspectSelectors(currentPage, selectors);
  for (const selector of selectors) {
    const reference = referenceBySelector[selector];
    const current = currentBySelector[selector];
    rows.push({
      selector,
      reference,
      current,
      diffs: diffRecord(reference, current)
    });
  }

  const diffRows = rows.filter(row => row.diffs.length > 0);
  console.log(JSON.stringify({
    referenceUrl,
    currentUrl: `${server.url}${currentPath}`,
    screen,
    checked: selectors,
    summary: {
      checked: selectors.length,
      selectorsWithDiffs: diffRows.length
    },
    rows: fullOutput ? rows : diffRows
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
