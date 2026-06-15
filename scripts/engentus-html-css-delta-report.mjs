import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { startUiServer } from "../test/support/harness.js";

const referenceMarkers = {
  login: [
    'id="view-login"',
    'class="auth-left"',
    'class="auth-right"',
    'class="auth-form-title"',
    'class="ms-btn"',
    'class="auth-bullets"'
  ],
  home: [
    'id="view-home"',
    'id="news-panel"',
    'id="module-area"',
    'id="module-grid"',
    'class="mill-pill"'
  ],
  shared: [
    'id="tb"',
    'id="user-prof"'
  ]
};

function includesMarker(html, marker) {
  return String(html || "").includes(marker);
}

function activeSurfaceId(html) {
  const match = String(html || "").match(/activeSurface=([^\s>-]+)/i);
  return match?.[1] ?? null;
}

function titleText(html) {
  const match = String(html || "").match(/<title>([^<]+)<\/title>/i);
  return match?.[1] ?? null;
}

function hasAuthoredStylesheet(html) {
  return /engentus-shell\.css/i.test(String(html || ""));
}

export async function createEngentusHtmlCssDeltaReport() {
  const dslPath = path.join(process.cwd(), "examples", "engentus", "app.wtoml");
  const referencePath = path.join(process.cwd(), "example-ports", "engentus", "index.html");
  const referenceHtml = await fs.readFile(referencePath, "utf8");
  const server = await startUiServer({
    dslPath,
    serverRunnerId: "engentus_server"
  });

  try {
    const [loginHtml, homeHtml, goodmanHtml, signoutHtml] = await Promise.all([
      fetch(`${server.url}/engentus/login`).then(result => result.text()),
      fetch(`${server.url}/engentus/home`).then(result => result.text()),
      fetch(`${server.url}/engentus/goodman`).then(result => result.text()),
      fetch(`${server.url}/engentus/signout`).then(result => result.text())
    ]);

    const report = {
      reference: {
        path: referencePath,
        markers: referenceMarkers
      },
      current: {
        serverUrl: server.url,
        login: {
          title: titleText(loginHtml),
          activeSurfaceId: activeSurfaceId(loginHtml),
          hasAuthoredStylesheet: hasAuthoredStylesheet(loginHtml)
        },
        home: {
          title: titleText(homeHtml),
          activeSurfaceId: activeSurfaceId(homeHtml),
          hasAuthoredStylesheet: hasAuthoredStylesheet(homeHtml)
        },
        goodman: {
          title: titleText(goodmanHtml),
          activeSurfaceId: activeSurfaceId(goodmanHtml),
          hasAuthoredStylesheet: hasAuthoredStylesheet(goodmanHtml)
        },
        signout: {
          title: titleText(signoutHtml),
          activeSurfaceId: activeSurfaceId(signoutHtml),
          hasAuthoredStylesheet: hasAuthoredStylesheet(signoutHtml)
        }
      },
      delta: {
        loginMissingMarkers: referenceMarkers.login.filter(marker => !includesMarker(loginHtml, marker)),
        homeMissingMarkers: referenceMarkers.home.filter(marker => !includesMarker(homeHtml, marker)),
        sharedMissingFromHome: referenceMarkers.shared.filter(marker => !includesMarker(homeHtml, marker)),
        sharedMissingFromGoodman: referenceMarkers.shared.filter(marker => !includesMarker(goodmanHtml, marker)),
        stylesheetNotConsumed: !hasAuthoredStylesheet(loginHtml) || !hasAuthoredStylesheet(homeHtml),
        currentServesStaticProjection:
          /status=composed_static_surface/i.test(loginHtml)
          && /status=composed_static_surface/i.test(homeHtml)
          && /status=composed_static_surface/i.test(goodmanHtml)
      }
    };

    return report;
  } finally {
    await server.close();
  }
}

async function main() {
  const report = await createEngentusHtmlCssDeltaReport();
  console.log(JSON.stringify(report, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath && import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
