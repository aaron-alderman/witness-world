function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function titleCase(id) {
  return String(id ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function readSurfaceMap(witnesses) {
  const surfaces = new Map();
  for (const witness of witnesses) {
    if (witness.process !== "desire.defineSurface" || !witness.body?.id) continue;
    surfaces.set(witness.body.id, witness.body);
  }
  return surfaces;
}

function renderChartCard(surfaceId) {
  const src = `/chart?chart=${encodeURIComponent(surfaceId)}`;
  return `
    <article class="engentus-card engentus-chart" data-surface-id="${escapeHtml(surfaceId)}">
      <header>
        <h3>${escapeHtml(titleCase(surfaceId))}</h3>
        <p>${escapeHtml(surfaceId)}</p>
      </header>
      <iframe src="${escapeHtml(src)}" title="${escapeHtml(surfaceId)}"></iframe>
    </article>
  `;
}

function renderChildCard(surfaceId, surfaces) {
  const surface = surfaces.get(surfaceId);
  if (surface?.surfaceKind === "chart") return renderChartCard(surfaceId);
  const childList = Array.isArray(surface?.children) ? surface.children : [];
  return `
    <article class="engentus-card" data-surface-id="${escapeHtml(surfaceId)}">
      <header>
        <h3>${escapeHtml(titleCase(surfaceId))}</h3>
        <p>${escapeHtml(surface?.surfaceKind ?? "surface")}</p>
      </header>
      ${childList.length
        ? `<ul>${childList.map(childId => `<li>${escapeHtml(titleCase(childId))}</li>`).join("")}</ul>`
        : "<p>No direct chart surface on this node.</p>"}
    </article>
  `;
}

function renderScreen(surface, surfaces) {
  const childIds = Array.isArray(surface.children) ? surface.children : [];
  return `
    <section class="engentus-screen" id="${escapeHtml(surface.id)}" data-surface-id="${escapeHtml(surface.id)}">
      <div class="engentus-screen-header">
        <div>
          <p class="eyebrow">${escapeHtml(surface.surfaceKind ?? "surface")}</p>
          <h2>${escapeHtml(titleCase(surface.id))}</h2>
        </div>
      </div>
      <div class="engentus-grid">
        ${childIds.map(childId => renderChildCard(childId, surfaces)).join("")}
      </div>
    </section>
  `;
}

function renderEngentusPage({ root, surfaces }) {
  const screenIds = Array.isArray(root.children) ? root.children : [];
  const nav = screenIds
    .map(surfaceId => `<a href="#${escapeHtml(surfaceId)}">${escapeHtml(titleCase(surfaceId))}</a>`)
    .join("");
  const screens = screenIds
    .map(surfaceId => surfaces.get(surfaceId))
    .filter(Boolean)
    .map(surface => renderScreen(surface, surfaces))
    .join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Engentus Frontend</title>
    <style>
      :root {
        --bg: #f4efe5;
        --panel: rgba(255, 252, 247, 0.9);
        --ink: #182320;
        --muted: #5d6a66;
        --line: rgba(24, 35, 32, 0.12);
        --accent: #0d6b57;
        --shadow: 0 18px 40px rgba(24, 35, 32, 0.1);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Helvetica Neue", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(13, 107, 87, 0.16), transparent 32%),
          linear-gradient(180deg, #fbf7ef 0%, var(--bg) 100%);
      }
      a { color: inherit; }
      .engentus-shell {
        width: min(1200px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 64px;
      }
      .engentus-hero {
        background: linear-gradient(135deg, rgba(13, 107, 87, 0.92), rgba(10, 52, 43, 0.95));
        color: white;
        border-radius: 28px;
        padding: 32px;
        box-shadow: var(--shadow);
      }
      .engentus-hero h1 {
        margin: 8px 0 12px;
        font-size: clamp(2rem, 4vw, 3.2rem);
      }
      .engentus-hero p {
        margin: 0;
        max-width: 62ch;
        color: rgba(255, 255, 255, 0.82);
      }
      .engentus-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      .engentus-nav a {
        padding: 10px 14px;
        border-radius: 999px;
        text-decoration: none;
        background: rgba(255, 255, 255, 0.14);
        border: 1px solid rgba(255, 255, 255, 0.22);
      }
      .engentus-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin: 18px 0 0;
      }
      .engentus-meta article,
      .engentus-screen {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: var(--shadow);
      }
      .engentus-meta article {
        padding: 16px 18px;
      }
      .engentus-meta h2,
      .engentus-screen h2,
      .engentus-card h3 {
        margin: 0;
      }
      .engentus-meta p,
      .engentus-card p,
      .engentus-screen .eyebrow {
        margin: 6px 0 0;
        color: var(--muted);
      }
      .engentus-screen {
        margin-top: 22px;
        padding: 24px;
      }
      .engentus-screen-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }
      .engentus-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
      }
      .engentus-card {
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 16px;
      }
      .engentus-card ul {
        margin: 14px 0 0;
        padding-left: 18px;
      }
      .engentus-card iframe {
        width: 100%;
        min-height: 320px;
        border: 1px solid rgba(24, 35, 32, 0.08);
        border-radius: 14px;
        background: white;
        margin-top: 14px;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.78rem;
      }
      @media (max-width: 720px) {
        .engentus-shell {
          width: min(100vw - 20px, 1200px);
          padding-top: 20px;
        }
        .engentus-hero,
        .engentus-screen {
          border-radius: 20px;
          padding: 20px;
        }
      }
    </style>
  </head>
  <body>
    <main class="engentus-shell">
      <section class="engentus-hero" data-surface-id="${escapeHtml(root.id)}">
        <p class="eyebrow">Frontend-only DESIRE app</p>
        <h1>Engentus</h1>
        <p>This route serves the authored DESIRE shell and charts only. The pipeline layer is intentionally absent from this runtime entrypoint.</p>
        <nav class="engentus-nav">${nav}</nav>
      </section>
      <section class="engentus-meta">
        <article>
          <p class="eyebrow">Root Surface</p>
          <h2>${escapeHtml(root.id)}</h2>
        </article>
        <article>
          <p class="eyebrow">Route</p>
          <h2>/engentus</h2>
        </article>
        <article>
          <p class="eyebrow">Chart Runtime</p>
          <h2>/chart?chart=...</h2>
        </article>
      </section>
      ${screens}
    </main>
  </body>
</html>`;
}

export const bundleId = "bundle-engentus-example";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze(["page.engentus"]),
  pageHandlers: Object.freeze(["page.engentus"]),
  dispatchHandlers: Object.freeze(["page.engentus"]),
  handlerMetadata: Object.freeze({
    "page.engentus": Object.freeze({ routeKind: "page", responseKind: "page", methods: Object.freeze(["GET"]) })
  })
});

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);

export function createHandlers(deps = {}) {
  const { world, send, sendJson } = deps;
  return {
    "page.engentus": async ({ res }) => {
      const witnesses = typeof world?.allWitnesses === "function" ? world.allWitnesses() : [];
      const surfacesById = readSurfaceMap(witnesses);
      const root = surfacesById.get("EngentusRoot");
      if (!root) {
        if (sendJson) sendJson(res, 404, { error: "EngentusRoot surface not found" });
        return;
      }
      const html = renderEngentusPage({ root, surfaces: surfacesById });
      if (send) send(res, 200, "text/html", html);
    }
  };
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
