function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function normalizePathname(pathname) {
  const raw = String(pathname || "/").trim() || "/";
  if (raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

export function readSurfaceMapFromWorld(world) {
  const surfaces = new Map();
  for (const witness of world.allWitnesses()) {
    if (witness.process !== "desire.defineSurface" || !witness.body?.id) continue;
    surfaces.set(witness.body.id, witness.body);
  }
  return surfaces;
}

function readProps(surface) {
  return surface?.props && typeof surface.props === "object" ? surface.props : {};
}

function childSurfaceIds(surface) {
  return Array.isArray(surface?.children)
    ? surface.children
        .map(child => typeof child === "string" ? child.trim() : "")
        .filter(Boolean)
    : [];
}

function collectSurfaceTreeIds(surfaces, rootSurfaceId) {
  const visited = new Set();
  const queue = [rootSurfaceId];
  while (queue.length) {
    const surfaceId = queue.shift();
    if (!surfaceId || visited.has(surfaceId)) continue;
    visited.add(surfaceId);
    const surface = surfaces.get(surfaceId);
    if (!surface) continue;
    for (const childId of childSurfaceIds(surface)) queue.push(childId);
  }
  return [...visited];
}

function matchSurfaceByDefaultScreen({
  surfaces,
  rootSurfaceId,
  defaultScreen = null
}) {
  if (!defaultScreen) return null;
  const target = String(defaultScreen || "").trim();
  if (!target) return null;
  for (const surfaceId of collectSurfaceTreeIds(surfaces, rootSurfaceId)) {
    const surface = surfaces.get(surfaceId);
    const props = readProps(surface);
    if (props.routeKey === target) return surface;
    if (surfaceId === target) return surface;
  }
  return null;
}

function matchSurfaceByPath({
  surfaces,
  rootSurfaceId,
  requestPathname
}) {
  const normalizedPath = normalizePathname(requestPathname);
  for (const surfaceId of collectSurfaceTreeIds(surfaces, rootSurfaceId)) {
    const surface = surfaces.get(surfaceId);
    const routePath = readProps(surface).routePath;
    if (typeof routePath !== "string") continue;
    if (normalizePathname(routePath) === normalizedPath) return surface;
  }
  return null;
}

function describeSurface(surface) {
  if (!surface) return null;
  const props = readProps(surface);
  return {
    id: surface.id ?? null,
    surfaceKind: surface.surfaceKind ?? null,
    routeKey: props.routeKey ?? null,
    routePath: props.routePath ?? null
  };
}

function renderMetadataList(entries) {
  return entries.map(([label, value]) => {
    return [
      "<div class=\"surface-host-reset__row\">",
      `<dt>${escapeHtml(label)}</dt>`,
      `<dd>${escapeHtml(value ?? "n/a")}</dd>`,
      "</div>"
    ].join("");
  }).join("");
}

function renderBlockedHostHtml({
  requestPathname,
  rootSurface,
  activeSurface
}) {
  const rootInfo = describeSurface(rootSurface);
  const activeInfo = describeSurface(activeSurface);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>page.surface reset host</title>
    <style>
      :root {
        color-scheme: light;
        --surface-host-bg: #f5f1e8;
        --surface-host-panel: #fffaf2;
        --surface-host-ink: #1d1a16;
        --surface-host-accent: #8b3d12;
        --surface-host-border: #d8c7ad;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, var(--surface-host-bg), #efe5d4);
        color: var(--surface-host-ink);
        font-family: Georgia, "Times New Roman", serif;
      }

      main {
        width: min(760px, calc(100vw - 32px));
        margin: 48px auto;
        padding: 28px;
        background: var(--surface-host-panel);
        border: 1px solid var(--surface-host-border);
        border-radius: 18px;
        box-shadow: 0 18px 48px rgba(33, 19, 9, 0.08);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 2rem;
      }

      p {
        line-height: 1.5;
      }

      .surface-host-reset__notice {
        padding: 14px 16px;
        margin: 20px 0 24px;
        border-left: 4px solid var(--surface-host-accent);
        background: rgba(139, 61, 18, 0.08);
      }

      dl {
        display: grid;
        gap: 10px;
        margin: 24px 0 0;
      }

      .surface-host-reset__row {
        display: grid;
        grid-template-columns: 180px 1fr;
        gap: 12px;
        padding: 10px 12px;
        border: 1px solid var(--surface-host-border);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.72);
      }

      dt {
        font-weight: 700;
      }

      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }

      code {
        font-family: "Cascadia Code", Consolas, monospace;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>page.surface reset host</h1>
      <p>
        The previous <code>page.surface</code> renderer was removed because it
        embedded app and capability authority into a generic host.
      </p>
      <div class="surface-host-reset__notice">
        Canonical projection must restart through the constrained replay
        pathway before live surface serving can be claimed again.
      </div>
      <p>
        This route still resolves so the platform can report blocked truth
        honestly while the canonical surface pathway is rebuilt from a clean
        floor.
      </p>
      <dl>
        ${renderMetadataList([
          ["status", "blocked_reset_host"],
          ["requestPathname", requestPathname],
          ["rootSurface.id", rootInfo?.id],
          ["rootSurface.surfaceKind", rootInfo?.surfaceKind],
          ["activeSurface.id", activeInfo?.id],
          ["activeSurface.surfaceKind", activeInfo?.surfaceKind],
          ["activeSurface.routeKey", activeInfo?.routeKey],
          ["activeSurface.routePath", activeInfo?.routePath]
        ])}
      </dl>
    </main>
  </body>
</html>`;
}

export function renderSurfaceShellFromMap({
  surfaces,
  rootSurfaceId,
  requestPathname = "/",
  route = null
} = {}) {
  if (!(surfaces instanceof Map) || !rootSurfaceId) return null;
  const rootSurface = surfaces.get(rootSurfaceId);
  if (!rootSurface) return null;
  const activeSurface = matchSurfaceByPath({
    surfaces,
    rootSurfaceId,
    requestPathname
  }) ?? matchSurfaceByDefaultScreen({
    surfaces,
    rootSurfaceId,
    defaultScreen: route?.defaultScreen ?? null
  }) ?? rootSurface;
  return renderBlockedHostHtml({
    requestPathname: normalizePathname(requestPathname),
    rootSurface,
    activeSurface
  });
}

export function renderSurfaceShellPage(world, {
  rootSurfaceId,
  requestPathname = "/",
  route = null
} = {}) {
  return renderSurfaceShellFromMap({
    surfaces: readSurfaceMapFromWorld(world),
    rootSurfaceId,
    requestPathname,
    route
  });
}
