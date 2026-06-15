import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { startUiServer, launchBrowser } from "../test/support/harness.js";
import {
  importEngentusReferenceUplift,
  importWcssComputedCapture
} from "../src/uplift/whtml-wcss.js";

const referenceBaseUrl = process.argv[2] || "http://localhost:56693/";
const screen = process.argv[3] || "login";
const target = process.argv.includes("--current") ? "current" : "reference";
const outputPath = readFlagValue("--out");
const outputFormat = readFlagValue("--format") ?? "capture";

const STYLE_PROPERTIES = [
  "display",
  "position",
  "width",
  "height",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderTopWidth",
  "borderRadius",
  "opacity",
  "transform",
  "transitionProperty",
  "transitionDuration",
  "transitionTimingFunction",
  "animationName",
  "animationDuration",
  "animationTimingFunction"
];

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

function readFlagValue(name) {
  const withEquals = process.argv.find(arg => arg.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function writeJsonArtifact(filePath, artifact) {
  if (!filePath) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function toWcssArtifact(capture) {
  const html = await readFile(path.join(process.cwd(), "example-ports", "engentus", "index.html"), "utf8");
  const snapshot = importEngentusReferenceUplift({
    html,
    sourceFile: "example-ports/engentus/index.html"
  });
  const sliceName = screen === "home" ? "moduleArea" : "loginForm";
  const root = snapshot.whtml.slices[sliceName]?.root;
  if (!root) {
    throw new Error(`No imported WHTML slice available for ${screen}`);
  }
  const computedStyleSets = importWcssComputedCapture(root, capture, {
    idPrefix: `engentus:${screen}:computed`,
    provenance: {
      captureKind: capture.kind,
      source: "engentus-wcss-capture"
    }
  });
  return {
    kind: "EngentusWcssArtifact",
    target: capture.target,
    screen: capture.screen,
    url: capture.url,
    sourceCapture: capture.kind,
    sourceWhtmlSlice: sliceName,
    properties: capture.properties,
    computedStyleSets,
    unmatchedSelectors: capture.records
      .filter(record => record?.missing || !computedStyleSets.some(set => set.provenance.sourceSelector === record.selector))
      .map(record => record.selector)
  };
}

async function gotoEnough(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 5000 });
  } catch (error) {
    if (!String(error?.message || error).includes("Timeout")) throw error;
  }
}

async function captureComputed(page, selectors) {
  return page.evaluate(({ selectors: activeSelectors, properties }) => {
    const out = [];
    for (const selector of activeSelectors) {
      const matches = [...document.querySelectorAll(selector)];
      const element = matches
        .map(node => ({ node, rect: node.getBoundingClientRect() }))
        .sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height))[0]?.node;
      if (!element) {
        out.push({ selector, missing: true });
        continue;
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      out.push({
        selector,
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        className: element.getAttribute("class"),
        src: element.getAttribute("src"),
        text: (element.textContent || "").replace(/\s+/g, " ").trim(),
        inlineStyle: element.getAttribute("style"),
        box: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        computed: Object.fromEntries(properties.map(property => [property, style[property] || ""]))
      });
    }
    return out;
  }, { selectors, properties: STYLE_PROPERTIES });
}

let server = null;
const browser = await launchBrowser({
  headless: true,
  viewport: { width: 1280, height: 900 }
});

try {
  let url;
  if (target === "current") {
    server = await startUiServer({
      dslPath: path.join(process.cwd(), "examples", "engentus", "app.wtoml"),
      serverRunnerId: "engentus_server",
      devMode: false
    });
    url = `${server.url}${screen === "home" ? "/engentus/home" : "/engentus/login"}`;
  } else {
    url = screen === "home"
      ? `${referenceBaseUrl.replace(/\/$/, "")}/#home`
      : referenceBaseUrl;
  }

  const page = await browser.context.newPage();
  await gotoEnough(page, url);
  const selectors = SELECTORS_BY_SCREEN[screen] ?? SELECTORS_BY_SCREEN.login;
  const records = await captureComputed(page, selectors);
  const capture = {
    kind: "EngentusWcssComputedCapture",
    target,
    screen,
    url,
    properties: STYLE_PROPERTIES,
    records
  };
  const artifact = outputFormat === "wcss" ? await toWcssArtifact(capture) : capture;
  await writeJsonArtifact(outputPath, artifact);
  console.log(JSON.stringify(artifact, null, 2));
} finally {
  await browser.close();
  if (server) await server.close();
}
