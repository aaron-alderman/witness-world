import {
  createWcssStylesheet,
  group,
  media,
  rule
} from "../../src/uplift/wcss-grammar.js";

function parseAssignment(trimmed, file, lineNumber, label) {
  const match = String(trimmed || "").match(/^([^=]+?)\s*=\s*(.+)$/);
  if (!match || !match[1]?.trim() || !match[2]?.trim()) {
    throw new Error(`${file}:${lineNumber} ${label} must be an assignment`);
  }
  return [match[1].trim(), match[2].trim()];
}

function parseStyleName(trimmed, file, lineNumber) {
  const match = String(trimmed || "").match(/^style\s+(\S+)$/);
  if (!match) {
    throw new Error(`${file}:${lineNumber} unsupported WCSS style declaration`);
  }
  return match[1];
}

function parseMediaQuery(trimmed, file, lineNumber) {
  const match = String(trimmed || "").match(/^media\s+(.+)$/);
  if (!match || !match[1]?.trim()) {
    throw new Error(`${file}:${lineNumber} unsupported WCSS media declaration`);
  }
  return match[1].trim();
}

function createStyleRecord(name, indent) {
  return {
    kind: "style",
    name,
    indent,
    selector: null,
    declarations: []
  };
}

function finalizeStyleRecord(style, file) {
  if (!style) return;
  if (!style.selector) {
    throw new Error(`${file} style ${style.name} is missing a selector`);
  }
}

export function parseWcssSource(source, { file = "inline.wcss" } = {}) {
  const lines = String(source ?? "").replace(/\r\n/g, "\n").split("\n");
  const tokens = [];
  const styleBlocks = [];
  let sawTheme = false;
  let themeName = "";
  let section = null;
  let currentMedia = null;
  let currentStyle = null;
  let currentGroupIndent = null;

  function closeStyle() {
    finalizeStyleRecord(currentStyle, file);
    currentStyle = null;
    currentGroupIndent = null;
  }

  function openStyle(name, indent, target) {
    closeStyle();
    const style = createStyleRecord(name, indent);
    target.push(style);
    currentStyle = style;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    const lineNumber = index + 1;
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (raw.includes("\t")) {
      throw new Error(`${file}:${lineNumber} WCSS indentation must use spaces`);
    }
    const indent = raw.match(/^ */)?.[0]?.length ?? 0;
    if (indent % 2 !== 0) {
      throw new Error(`${file}:${lineNumber} WCSS indentation must be multiples of two spaces`);
    }
    if (indent === 0) {
      closeStyle();
      currentMedia = null;
      if (/^theme\s+\S+/.test(trimmed)) {
        sawTheme = true;
        themeName = trimmed.replace(/^theme\s+/, "").trim();
        section = null;
        continue;
      }
      if ((trimmed === "tokens" || trimmed === "styles") && sawTheme) {
        section = trimmed;
        continue;
      }
      throw new Error(`${file}:${lineNumber} unsupported top-level WCSS statement`);
    }

    if (section === "tokens") {
      if (indent !== 2) {
        throw new Error(`${file}:${lineNumber} token assignments must be indented by two spaces`);
      }
      tokens.push(parseAssignment(trimmed, file, lineNumber, "token"));
      continue;
    }

    if (section !== "styles") {
      throw new Error(`${file}:${lineNumber} WCSS content is outside a supported section`);
    }

    if (indent === 2) {
      closeStyle();
      currentMedia = null;
      if (/^style\s+\S+/.test(trimmed)) {
        openStyle(parseStyleName(trimmed, file, lineNumber), 2, styleBlocks);
        continue;
      }
      if (/^media\s+.+$/.test(trimmed)) {
        currentMedia = {
          kind: "media",
          query: parseMediaQuery(trimmed, file, lineNumber),
          styles: []
        };
        styleBlocks.push(currentMedia);
        continue;
      }
      throw new Error(`${file}:${lineNumber} unsupported WCSS styles statement`);
    }

    if (indent === 4 && currentMedia && /^style\s+\S+/.test(trimmed)) {
      openStyle(parseStyleName(trimmed, file, lineNumber), 4, currentMedia.styles);
      continue;
    }

    if (!currentStyle) {
      throw new Error(`${file}:${lineNumber} WCSS style content must start with a style declaration`);
    }

    if (indent === currentStyle.indent + 2 && /^selector\s*=\s*.+$/.test(trimmed)) {
      currentStyle.selector = trimmed.replace(/^selector\s*=\s*/, "").trim();
      continue;
    }
    if (indent === currentStyle.indent + 2 && /^[a-z][a-z0-9.-]*$/i.test(trimmed)) {
      currentGroupIndent = indent;
      continue;
    }
    if (indent === currentStyle.indent + 4 && currentGroupIndent === currentStyle.indent + 2) {
      currentStyle.declarations.push(parseAssignment(trimmed, file, lineNumber, "style property"));
      continue;
    }
    throw new Error(`${file}:${lineNumber} unsupported WCSS style statement`);
  }

  closeStyle();
  if (!sawTheme) throw new Error(`${file} WCSS must declare a theme`);

  return {
    themeName,
    tokens,
    styleBlocks
  };
}

function styleBlockToRule(style, file) {
  finalizeStyleRecord(style, file);
  return rule(style.selector, style.declarations);
}

export function createStylesheetFromWcssSource(source, { file = "inline.wcss" } = {}) {
  const parsed = parseWcssSource(source, { file });
  const blocks = [];
  if (parsed.tokens.length) {
    blocks.push(group("tokens", [
      rule(":root", parsed.tokens)
    ]));
  }
  if (parsed.styleBlocks.length) {
    blocks.push(group("styles", parsed.styleBlocks.map(block =>
      block.kind === "media"
        ? media(block.query, block.styles.map(style => styleBlockToRule(style, file)))
        : styleBlockToRule(block, file)
    )));
  }
  return createWcssStylesheet({
    name: parsed.themeName,
    blocks
  });
}
