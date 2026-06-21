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

function parseBlocks(source = "") {
  const lines = stripComments(source);
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const openLine = lines[index];
    const openMatch = /^([a-z_][a-z0-9_]*)\s+([A-Za-z0-9_.-]+)\s+\{$/u.exec(openLine);
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
    blocks.push({ kind, id, lines: blockLines });
  }
  return blocks;
}

function readScalar(lines, key) {
  for (const line of lines) {
    const tokens = tokenizeLine(line);
    if (tokens[0] !== key) continue;
    if (tokens.length === 2) return tokens[1];
    if (tokens.length > 2) return tokens.slice(1).join(" ");
  }
  return null;
}

function readRepeated(lines, key) {
  const values = [];
  for (const line of lines) {
    const tokens = tokenizeLine(line);
    if (tokens[0] !== key) continue;
    values.push(tokens.slice(1));
  }
  return values;
}

function parseThemeBlock(block) {
  return {
    id: block.id,
    mode: readScalar(block.lines, "mode") ?? "ansi16",
    palette: readScalar(block.lines, "palette") ?? "terminal-dark"
  };
}

function parseOverlayBlock(block) {
  const scroll = readRepeated(block.lines, "scroll").flat();
  return {
    id: block.id,
    kind: readScalar(block.lines, "kind") ?? "doc_view",
    title: readScalar(block.lines, "title") ?? block.id,
    scrollAxes: scroll,
    closeIdsOnOpen: readRepeated(block.lines, "close_on_open").flat(),
    maxPrimaryChars: null,
    resizable: readScalar(block.lines, "resizable") === "true",
    width: Number(readScalar(block.lines, "width") ?? 0) || null,
    height: Number(readScalar(block.lines, "height") ?? 0) || null
  };
}

function parseContentBlock(block) {
  return {
    id: block.id,
    title: readScalar(block.lines, "title") ?? block.id,
    kind: readScalar(block.lines, "kind") ?? "detail",
    surfaceKind: readScalar(block.lines, "surface_kind") ?? null,
    maxPrimaryChars: Number(readScalar(block.lines, "max_primary_chars") ?? 0) || null,
    width: Number(readScalar(block.lines, "width") ?? 0) || null,
    height: Number(readScalar(block.lines, "height") ?? 0) || null,
    resizable: readScalar(block.lines, "resizable") === "true",
    scrollAxes: readRepeated(block.lines, "scroll").flat()
  };
}

function parsePanelBlock(block) {
  return {
    id: block.id,
    title: readScalar(block.lines, "title") ?? block.id,
    role: readScalar(block.lines, "role") ?? "aux",
    contentId: readScalar(block.lines, "content") ?? null
  };
}

function parseChromeBlock(block) {
  return {
    id: block.id,
    title: readScalar(block.lines, "title") ?? block.id,
    kind: readScalar(block.lines, "kind") ?? "status_bar"
  };
}

function parseSplitBlock(block) {
  return {
    id: block.id,
    axis: readScalar(block.lines, "axis") ?? "horizontal",
    first: readScalar(block.lines, "first") ?? null,
    second: readScalar(block.lines, "second") ?? null,
    firstWeight: Number(readScalar(block.lines, "first_weight") ?? 0) || null,
    secondWeight: Number(readScalar(block.lines, "second_weight") ?? 0) || null,
    handle: readScalar(block.lines, "handle") ?? null
  };
}

function parseWindowBlock(block) {
  const bindings = readRepeated(block.lines, "binding").map(parts => ({
    trigger: parts[0] ?? "",
    verb: parts[1] ?? "",
    target: parts[2] ?? null
  }));
  return {
    id: block.id,
    themeId: readScalar(block.lines, "theme") ?? null,
    root: readScalar(block.lines, "root") ?? null,
    leftPanelId: readScalar(block.lines, "left_panel") ?? null,
    rightPanelId: readScalar(block.lines, "right_panel") ?? null,
    topChromeId: readScalar(block.lines, "top_chrome") ?? null,
    bottomChromeId: readScalar(block.lines, "bottom_chrome") ?? null,
    width: Number(readScalar(block.lines, "width") ?? 80) || 80,
    height: Number(readScalar(block.lines, "height") ?? 30) || 30,
    top: Number(readScalar(block.lines, "top") ?? 0) || null,
    bottom: Number(readScalar(block.lines, "bottom") ?? 0) || null,
    overlays: readRepeated(block.lines, "overlay").flat(),
    bindings
  };
}

export function parseOperatorWorkbenchRvm(source = "") {
  const blocks = parseBlocks(source);
  const themes = [];
  const overlays = [];
  const contents = [];
  const panels = [];
  const chromes = [];
  const splits = [];
  const windows = [];

  for (const block of blocks) {
    if (block.kind === "operator_theme") themes.push(parseThemeBlock(block));
    if (block.kind === "operator_overlay") overlays.push(parseOverlayBlock(block));
    if (block.kind === "operator_content") contents.push(parseContentBlock(block));
    if (block.kind === "operator_panel") panels.push(parsePanelBlock(block));
    if (block.kind === "operator_chrome") chromes.push(parseChromeBlock(block));
    if (block.kind === "operator_split") splits.push(parseSplitBlock(block));
    if (block.kind === "operator_window") windows.push(parseWindowBlock(block));
  }

  const contentById = new Map(contents.map(content => [content.id, content]));
  const panelById = new Map(panels.map(panel => [panel.id, panel]));
  const chromeById = new Map(chromes.map(chrome => [chrome.id, chrome]));
  const splitById = new Map(splits.map(split => [split.id, split]));

  const panelSurfaces = panels.map(panel => {
    const content = contentById.get(panel.contentId) ?? null;
    const inferredKind = content?.surfaceKind ?? (content?.kind === "tree" ? "tree" : "text_reader");
    const compatibilityId = panel.role === "left"
      ? "nav_tree"
      : (panel.role === "right" ? "session_reader" : panel.id);
    return {
      id: compatibilityId,
      kind: inferredKind,
      title: panel.title,
      scrollAxes: Array.isArray(content?.scrollAxes) ? [...content.scrollAxes] : [],
      closeIdsOnOpen: [],
      maxPrimaryChars: content?.maxPrimaryChars ?? null,
      resizable: content?.resizable ?? false,
      width: content?.width ?? null,
      height: content?.height ?? null
    };
  });

  const chromeSurfaces = chromes.map(chrome => ({
    id: chrome.id,
    kind: chrome.kind,
    title: chrome.title,
    scrollAxes: [],
    closeIdsOnOpen: [],
    maxPrimaryChars: null,
    resizable: false,
    width: null,
    height: null
  }));

  const surfaces = [...panelSurfaces, ...chromeSurfaces, ...overlays];

  const viewports = windows.map(windowSpec => {
    const split = splitById.get(windowSpec.root) ?? null;
    const leftPanel = panelById.get(windowSpec.leftPanelId) ?? null;
    const rightPanel = panelById.get(windowSpec.rightPanelId) ?? null;
    const leftSurfaceId = leftPanel?.role === "left" ? "nav_tree" : (windowSpec.leftPanelId ?? split?.first ?? null);
    const rightSurfaceId = rightPanel?.role === "right" ? "session_reader" : (windowSpec.rightPanelId ?? split?.second ?? null);
    return {
      id: windowSpec.id === "operator_default" ? "default" : windowSpec.id,
      themeId: windowSpec.themeId,
      size: { width: windowSpec.width, height: windowSpec.height },
      top: windowSpec.topChromeId ? { size: windowSpec.top ?? 3, surfaceId: windowSpec.topChromeId } : null,
      bottom: windowSpec.bottomChromeId ? { size: windowSpec.bottom ?? 4, surfaceId: windowSpec.bottomChromeId } : null,
      center: split ? {
        kind: "split",
        orientation: split.axis,
        leftWeight: split.firstWeight ?? 50,
        rightWeight: split.secondWeight ?? 50,
        leftSurfaceId,
        rightSurfaceId
      } : null,
      overlays: [...windowSpec.overlays],
      bindings: [...windowSpec.bindings]
    };
  });

  return {
    themes,
    surfaces,
    viewports,
    themeById: new Map(themes.map(theme => [theme.id, theme])),
    surfaceById: new Map(surfaces.map(surface => [surface.id, surface])),
    viewportById: new Map(viewports.map(viewport => [viewport.id, viewport]))
  };
}
