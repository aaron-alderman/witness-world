import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { startUiServer } from "../test/support/harness.js";

const DEFAULT_REFERENCE_URL = "http://localhost:56693/";

const paritySpecs = [
  {
    name: "login.emailInput",
    currentPath: "/engentus/login",
    referenceHash: "#login",
    selector: "#login-email",
    compareAttrs: ["type", "id", "class", "placeholder", "autocomplete"]
  },
  {
    name: "login.passwordInput",
    currentPath: "/engentus/login",
    referenceHash: "#login",
    selector: "#login-pw",
    compareAttrs: ["type", "id", "class", "placeholder", "autocomplete", "style"]
  },
  {
    name: "login.heroLogo",
    currentPath: "/engentus/login",
    referenceHash: "#login",
    selector: ".auth-hero img",
    compareAttrs: ["src", "alt", "style"]
  },
  {
    name: "login.formLogo",
    currentPath: "/engentus/login",
    referenceHash: "#login",
    selector: ".auth-form-logo img",
    compareAttrs: ["src", "alt", "style"]
  },
  {
    name: "login.formShell",
    currentPath: "/engentus/login",
    referenceHash: "#login",
    selector: ".auth-form-wrap",
    compareAttrs: ["class"],
    compareOuterHtml: true
  },
  {
    name: "login.microsoftAction",
    currentPath: "/engentus/login",
    referenceHash: "#login",
    selector: ".ms-btn",
    compareAttrs: ["class"],
    compareOuterHtml: true
  },
  {
    name: "login.divider",
    currentPath: "/engentus/login",
    referenceHash: "#login",
    selector: ".auth-divider",
    compareAttrs: ["class"],
    compareOuterHtml: true
  },
  {
    name: "login.forgotRow",
    currentPath: "/engentus/login",
    referenceHash: "#login",
    selector: ".auth-forgot",
    compareAttrs: ["class"],
    compareOuterHtml: true
  },
  {
    name: "login.submitAction",
    currentPath: "/engentus/login",
    referenceHash: "#login",
    selector: ".auth-submit",
    compareAttrs: ["class"],
    compareOuterHtml: true
  },
  {
    name: "login.legalFooter",
    currentPath: "/engentus/login",
    referenceHash: "#login",
    selector: ".auth-form-footer",
    compareAttrs: ["class"],
    compareOuterHtml: true
  },
  {
    name: "home.toolbar",
    currentPath: "/engentus/home",
    referenceHash: "#home",
    selector: "#tb",
    compareAttrs: ["id"],
    compareOuterHtml: true
  },
  {
    name: "home.toolbarBrand",
    currentPath: "/engentus/home",
    referenceHash: "#home",
    selector: "#tb-brand",
    compareAttrs: ["id"],
    compareOuterHtml: true
  },
  {
    name: "home.userProfile",
    currentPath: "/engentus/home",
    referenceHash: "#home",
    selector: "#user-prof",
    compareAttrs: ["id"],
    compareOuterHtml: true
  },
  {
    name: "home.profileMenu",
    currentPath: "/engentus/home",
    referenceHash: "#home",
    selector: "#up-menu",
    compareAttrs: ["id"],
    compareOuterHtml: true
  },
  {
    name: "home.moduleArea",
    currentPath: "/engentus/home",
    referenceHash: "#home",
    selector: "#module-area",
    compareAttrs: ["id"],
    compareOuterHtml: true
  },
  {
    name: "home.moduleCardCharge",
    currentPath: "/engentus/home",
    referenceHash: "#home",
    selector: "#module-grid .mod-card:nth-child(1)",
    compareAttrs: ["class"],
    compareOuterHtml: true
  },
  {
    name: "home.moduleCardGoodman",
    currentPath: "/engentus/home",
    referenceHash: "#home",
    selector: "#module-grid .mod-card:nth-child(2)",
    compareAttrs: ["class"],
    compareOuterHtml: true
  },
  {
    name: "home.moduleCardForce",
    currentPath: "/engentus/home",
    referenceHash: "#home",
    selector: "#module-grid .mod-card:nth-child(3)",
    compareAttrs: ["class"],
    compareOuterHtml: true
  },
  {
    name: "home.moduleCardLocked1",
    currentPath: "/engentus/home",
    referenceHash: "#home",
    selector: "#module-grid .mod-card:nth-child(4)",
    compareAttrs: ["class"],
    compareOuterHtml: true
  }
];

function parseArgs(argv) {
  const args = {
    referenceUrl: DEFAULT_REFERENCE_URL
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--reference-url") {
      args.referenceUrl = argv[index + 1] ?? args.referenceUrl;
      index += 1;
    }
  }
  return args;
}

async function captureDescriptor(page, selector) {
  return page.$eval(selector, element => ({
    outerHTML: element.outerHTML,
    text: (element.textContent || "").trim(),
    attrs: Object.fromEntries(Array.from(element.attributes).map(attribute => [attribute.name, attribute.value]))
  }));
}

function compareDescriptor(spec, referenceDescriptor, currentDescriptor) {
  const attrDiffs = [];
  for (const attr of spec.compareAttrs || []) {
    const referenceValue = referenceDescriptor?.attrs?.[attr] ?? null;
    const currentValue = currentDescriptor?.attrs?.[attr] ?? null;
    if (referenceValue !== currentValue) {
      attrDiffs.push({
        attr,
        reference: referenceValue,
        current: currentValue
      });
    }
  }
  const normalizedReferenceOuterHtml = normalizeHtml(referenceDescriptor?.outerHTML ?? null);
  const normalizedCurrentOuterHtml = normalizeHtml(currentDescriptor?.outerHTML ?? null);
  const outerHtmlMatches = spec.compareOuterHtml
    ? normalizedReferenceOuterHtml === normalizedCurrentOuterHtml
    : null;
  return {
    name: spec.name,
    selector: spec.selector,
    matches: attrDiffs.length === 0 && (outerHtmlMatches == null || outerHtmlMatches === true),
    attrDiffs,
    outerHtmlMatches,
    referenceOuterHTML: referenceDescriptor?.outerHTML ?? null,
    currentOuterHTML: currentDescriptor?.outerHTML ?? null
  };
}

function normalizeHtml(html) {
  if (typeof html !== "string") return null;
  return html
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

export async function createEngentusLiveReferenceParityReport({
  referenceUrl = DEFAULT_REFERENCE_URL
} = {}) {
  const dslPath = path.join(process.cwd(), "examples", "engentus", "app.wtoml");
  const server = await startUiServer({
    dslPath,
    serverRunnerId: "engentus_server"
  });
  const browser = await chromium.launch({ headless: true });
  const referencePage = await browser.newPage();
  const currentPage = await browser.newPage();

  try {
    const comparisons = [];
    for (const spec of paritySpecs) {
      const referenceTarget = new URL(spec.referenceHash, referenceUrl).toString();
      const currentTarget = new URL(spec.currentPath, server.url).toString();
      await referencePage.goto(referenceTarget, { waitUntil: "domcontentloaded" });
      await currentPage.goto(currentTarget, { waitUntil: "domcontentloaded" });
      await referencePage.waitForSelector(spec.selector, { timeout: 5000, state: "attached" });
      await currentPage.waitForSelector(spec.selector, { timeout: 5000, state: "attached" });
      const [referenceDescriptor, currentDescriptor] = await Promise.all([
        captureDescriptor(referencePage, spec.selector),
        captureDescriptor(currentPage, spec.selector)
      ]);
      comparisons.push(compareDescriptor(spec, referenceDescriptor, currentDescriptor));
    }

    return {
      referenceUrl,
      currentUrl: server.url,
      ok: comparisons.every(result => result.matches),
      comparisons
    };
  } finally {
    await Promise.allSettled([
      referencePage.close(),
      currentPage.close(),
      browser.close(),
      server.close()
    ]);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const report = await createEngentusLiveReferenceParityReport({
    referenceUrl: args.referenceUrl
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath && import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
