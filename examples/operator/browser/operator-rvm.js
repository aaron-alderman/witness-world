function stripComments(source = "") {
  return String(source)
    .split(/\r?\n/u)
    .map(line => line.replace(/\s*#.*$/u, "").trim())
    .filter(Boolean);
}

function tokenizeLine(line = "") {
  const tokens = [];
  const pattern = /"([^"]*)"|[^\s]+/gu;
  let match = pattern.exec(line);
  while (match) {
    tokens.push(match[1] ?? match[0]);
    match = pattern.exec(line);
  }
  return tokens;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseOperatorWorkbenchRvm(source = "") {
  const lines = stripComments(source);
  const themes = [];
  const surfaces = [];
  const viewports = [];
  let index = 0;

  while (index < lines.length) {
    const openLine = lines[index];
    const openMatch = /^(theme|surface|viewport)\s+([A-Za-z0-9_.-]+)\s+\{$/u.exec(openLine);
    expect(openMatch, `invalid block header: ${openLine}`);
    const [, kind, id] = openMatch;
    index += 1;
    const blockLines = [];
    while (index < lines.length && lines[index] !== "}") {
      blockLines.push(lines[index]);
      index += 1;
    }
    expect(lines[index] === "}", `unterminated ${kind} ${id}`);
    index += 1;

    if (kind === "theme") themes.push(parseThemeBlock(id, blockLines));
    if (kind === "surface") surfaces.push(parseSurfaceBlock(id, blockLines));
    if (kind === "viewport") viewports.push(parseViewportBlock(id, blockLines));
  }

  return {
    themes,
    surfaces,
    viewports,
    themeById: new Map(themes.map(theme => [theme.id, theme])),
    surfaceById: new Map(surfaces.map(surface => [surface.id, surface])),
    viewportById: new Map(viewports.map(viewport => [viewport.id, viewport]))
  };
}

function parseThemeBlock(id, lines) {
  const theme = {
    id,
    mode: "ansi16",
    palette: "terminal-dark"
  };
  for (const line of lines) {
    const [key, ...rest] = tokenizeLine(line);
    if (key === "mode") theme.mode = rest[0] ?? theme.mode;
    if (key === "palette") theme.palette = rest[0] ?? theme.palette;
  }
  return theme;
}

function parseSurfaceBlock(id, lines) {
  const surface = {
    id,
    kind: "text_reader",
    title: id,
    scrollAxes: [],
    closeIdsOnOpen: [],
    maxPrimaryChars: null,
    resizable: false,
    width: null,
    height: null
  };
  for (const line of lines) {
    const [key, ...rest] = tokenizeLine(line);
    if (key === "kind") surface.kind = rest[0] ?? surface.kind;
    if (key === "title") surface.title = rest.join(" ") || surface.title;
    if (key === "scroll") surface.scrollAxes = rest;
    if (key === "close_on_open") surface.closeIdsOnOpen = rest.filter(Boolean);
    if (key === "max_primary_chars") surface.maxPrimaryChars = Number(rest[0] ?? 0) || null;
    if (key === "resizable") surface.resizable = rest[0] === "true";
    if (key === "width") surface.width = Number(rest[0] ?? 0) || null;
    if (key === "height") surface.height = Number(rest[0] ?? 0) || null;
  }
  return surface;
}

function parseViewportBlock(id, lines) {
  const viewport = {
    id,
    themeId: null,
    size: { width: 80, height: 30 },
    top: null,
    bottom: null,
    center: null,
    overlays: [],
    bindings: []
  };
  for (const line of lines) {
    const tokens = tokenizeLine(line);
    const [key, ...rest] = tokens;
    if (key === "theme") viewport.themeId = rest[0] ?? null;
    if (key === "size") {
      viewport.size = {
        width: Number(rest[0] ?? 80) || 80,
        height: Number(rest[1] ?? 30) || 30
      };
    }
    if (key === "top") viewport.top = { size: Number(rest[0] ?? 3) || 3, surfaceId: rest[1] ?? null };
    if (key === "bottom") viewport.bottom = { size: Number(rest[0] ?? 4) || 4, surfaceId: rest[1] ?? null };
    if (key === "center") {
      expect(rest[0] === "split", `invalid center definition: ${line}`);
      viewport.center = {
        kind: "split",
        orientation: rest[1] ?? "horizontal",
        leftWeight: Number(rest[2] ?? 50) || 50,
        rightWeight: Number(rest[3] ?? 50) || 50,
        leftSurfaceId: rest[4] ?? null,
        rightSurfaceId: rest[5] ?? null
      };
    }
    if (key === "overlay") viewport.overlays.push(rest[0] ?? null);
    if (key === "binding") {
      viewport.bindings.push({
        trigger: rest[0] ?? "",
        verb: rest[1] ?? "",
        target: rest[2] ?? null
      });
    }
  }
  return viewport;
}
