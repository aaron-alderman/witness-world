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

function collectSurfaceTree(surfaces, rootSurfaceId) {
  const visited = new Set();
  const ordered = [];
  const queue = [rootSurfaceId];
  while (queue.length) {
    const surfaceId = queue.shift();
    if (!surfaceId || visited.has(surfaceId)) continue;
    visited.add(surfaceId);
    const surface = surfaces.get(surfaceId);
    if (!surface) continue;
    ordered.push(surface);
    for (const childId of childSurfaceIds(surface)) queue.push(childId);
  }
  return ordered;
}

function matchSurfaceByDefaultScreen({
  surfaces,
  rootSurfaceId,
  defaultScreen = null
}) {
  if (!defaultScreen) return null;
  const target = String(defaultScreen || "").trim();
  if (!target) return null;
  for (const surface of collectSurfaceTree(surfaces, rootSurfaceId)) {
    const props = readProps(surface);
    if (props.routeKey === target) return surface;
    if (surface.id === target) return surface;
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

function routeDefaultScreen(route) {
  const paramsDefault = route?.params?.defaultScreen;
  if (typeof paramsDefault === "string" && paramsDefault.trim()) return paramsDefault.trim();
  const routeDefault = route?.defaultScreen;
  if (typeof routeDefault === "string" && routeDefault.trim()) return routeDefault.trim();
  return null;
}

function staticTextValue(props, key) {
  const value = props?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readStaticPayload(surface) {
  const props = readProps(surface);
  return {
    title: staticTextValue(props, "title"),
    subtitle: staticTextValue(props, "subtitle"),
    body: staticTextValue(props, "body"),
    text: staticTextValue(props, "text")
  };
}

function hasStaticPayload(surface) {
  const payload = readStaticPayload(surface);
  return Boolean(payload.title || payload.subtitle || payload.body || payload.text);
}

function selectStaticProjectionSurface({
  surfaces,
  rootSurfaceId,
  route = null
}) {
  const rootSurface = surfaces.get(rootSurfaceId) ?? null;
  if (!rootSurface) return null;
  const defaultSurface = matchSurfaceByDefaultScreen({
    surfaces,
    rootSurfaceId,
    defaultScreen: routeDefaultScreen(route)
  });
  if (defaultSurface && hasStaticPayload(defaultSurface)) return defaultSurface;
  if (hasStaticPayload(rootSurface)) return rootSurface;
  for (const surface of collectSurfaceTree(surfaces, rootSurfaceId)) {
    if (surface.id === rootSurfaceId) continue;
    if (hasStaticPayload(surface)) return surface;
  }
  return null;
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

function renderStaticSurfaceHostHtml({
  requestPathname,
  rootSurface,
  activeSurface
}) {
  const rootInfo = describeSurface(rootSurface);
  const activeInfo = describeSurface(activeSurface);
  const payload = readStaticPayload(activeSurface);
  const textBody = payload.body ?? payload.text;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(payload.title ?? activeInfo?.id ?? "page.surface authored host")}</title>
    <style>
      :root {
        color-scheme: light;
        --surface-static-bg: #f5f1e8;
        --surface-static-panel: #fffaf2;
        --surface-static-ink: #1d1a16;
        --surface-static-border: #d8c7ad;
        --surface-static-accent: #2f5d50;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, var(--surface-static-bg), #efe5d4);
        color: var(--surface-static-ink);
        font-family: Georgia, "Times New Roman", serif;
      }

      main {
        width: min(760px, calc(100vw - 32px));
        margin: 48px auto;
        padding: 28px;
        background: var(--surface-static-panel);
        border: 1px solid var(--surface-static-border);
        border-radius: 18px;
        box-shadow: 0 18px 48px rgba(33, 19, 9, 0.08);
      }

      .surface-static__eyebrow {
        margin: 0 0 12px;
        font-size: 0.82rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--surface-static-accent);
      }

      h1 {
        margin: 0;
        font-size: 2rem;
      }

      .surface-static__subtitle {
        margin: 10px 0 0;
        font-size: 1rem;
        color: rgba(29, 26, 22, 0.76);
      }

      .surface-static__body {
        margin: 24px 0 0;
        line-height: 1.6;
      }

      dl {
        display: grid;
        gap: 10px;
        margin: 28px 0 0;
      }

      .surface-static__row {
        display: grid;
        grid-template-columns: 180px 1fr;
        gap: 12px;
        padding: 10px 12px;
        border: 1px solid var(--surface-static-border);
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
    </style>
  </head>
  <body>
    <main>
      <p class="surface-static__eyebrow">Canonical Authoring Pathway Probe</p>
      ${payload.title ? `<h1>${escapeHtml(payload.title)}</h1>` : `<h1>${escapeHtml(activeInfo?.id ?? "Authored surface")}</h1>`}
      ${payload.subtitle ? `<p class="surface-static__subtitle">${escapeHtml(payload.subtitle)}</p>` : ""}
      ${textBody ? `<div class="surface-static__body">${escapeHtml(textBody)}</div>` : ""}
      <dl>
        ${renderMetadataList([
          ["status", "static_surface_projection"],
          ["requestPathname", requestPathname],
          ["rootSurface.id", rootInfo?.id],
          ["rootSurface.surfaceKind", rootInfo?.surfaceKind],
          ["activeSurface.id", activeInfo?.id],
          ["activeSurface.surfaceKind", activeInfo?.surfaceKind]
        ]).replaceAll("surface-host-reset__row", "surface-static__row")}
      </dl>
    </main>
  </body>
</html>`;
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
        Canonical projection must restart through the canonical authoring
        pathway probe before live surface serving can be claimed again.
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
  const activeSurface = selectStaticProjectionSurface({
    surfaces,
    rootSurfaceId,
    route
  });
  if (activeSurface && hasStaticPayload(activeSurface)) {
    return renderStaticSurfaceHostHtml({
      requestPathname: normalizePathname(requestPathname),
      rootSurface,
      activeSurface
    });
  }
  return renderBlockedHostHtml({
    requestPathname: normalizePathname(requestPathname),
    rootSurface,
    activeSurface: matchSurfaceByDefaultScreen({
      surfaces,
      rootSurfaceId,
      defaultScreen: routeDefaultScreen(route)
    }) ?? rootSurface
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
