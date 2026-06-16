function cloneDeclarations(declarations = {}) {
  if (Array.isArray(declarations)) {
    return declarations.map(([property, value]) => [property, value]);
  }
  return Object.entries(declarations);
}

function indentText(level, unit = "  ") {
  return unit.repeat(level);
}

function renderDeclarations(declarations = [], { level = 0, indent = "  " } = {}) {
  const lines = cloneDeclarations(declarations)
    .filter(([property, value]) => property && value != null)
    .map(([property, value]) => `${indentText(level, indent)}${property}: ${value};`);
  return lines.join("\n");
}

function combineSelector(parentSelector, childSelector) {
  if (!parentSelector) return childSelector;
  if (!childSelector) return parentSelector;
  if (childSelector.includes("&")) {
    return childSelector.replaceAll("&", parentSelector);
  }
  return `${parentSelector} ${childSelector}`;
}

function renderKeyframeFrame(frame, options) {
  const { indent = "  ", level = 0 } = options;
  const declarations = renderDeclarations(frame.declarations, {
    indent,
    level: level + 1
  });
  return [
    `${indentText(level, indent)}${frame.step} {`,
    declarations,
    `${indentText(level, indent)}}`
  ].join("\n");
}

function renderBlock(block, {
  indent = "  ",
  level = 0,
  parentSelector = null
} = {}) {
  if (!block) return "";
  if (block.kind === "group") {
    const renderedChildren = block.blocks
      .map(child => renderBlock(child, { indent, level, parentSelector }))
      .filter(Boolean)
      .join("\n\n");
    if (!renderedChildren) return "";
    return block.name
      ? `/* ${block.name} */\n${renderedChildren}`
      : renderedChildren;
  }

  if (block.kind === "rule") {
    const selector = combineSelector(parentSelector, block.selector);
    const ownDeclarations = renderDeclarations(block.declarations, {
      indent,
      level: level + 1
    });
    const nestedBlocks = (block.blocks ?? [])
      .map(child => renderBlock(child, {
        indent,
        level,
        parentSelector: selector
      }))
      .filter(Boolean);
    const chunks = [];
    if (ownDeclarations) {
      chunks.push([
        `${indentText(level, indent)}${selector} {`,
        ownDeclarations,
        `${indentText(level, indent)}}`
      ].join("\n"));
    }
    if (nestedBlocks.length) chunks.push(nestedBlocks.join("\n\n"));
    return chunks.join("\n\n");
  }

  if (block.kind === "media") {
    const renderedChildren = block.blocks
      .map(child => renderBlock(child, {
        indent,
        level: level + 1,
        parentSelector
      }))
      .filter(Boolean)
      .join("\n\n");
    if (!renderedChildren) return "";
    return [
      `${indentText(level, indent)}@media ${block.query} {`,
      renderedChildren,
      `${indentText(level, indent)}}`
    ].join("\n");
  }

  if (block.kind === "keyframes") {
    const frames = (block.frames ?? [])
      .map(frame => renderKeyframeFrame(frame, {
        indent,
        level: level + 1
      }))
      .join("\n");
    if (!frames) return "";
    return [
      `${indentText(level, indent)}@keyframes ${block.name} {`,
      frames,
      `${indentText(level, indent)}}`
    ].join("\n");
  }

  throw new Error(`Unsupported WCSS grammar block kind: ${block.kind}`);
}

export function createWcssStylesheet({ name = "", blocks = [] } = {}) {
  return {
    kind: "stylesheet",
    name,
    blocks: [...blocks]
  };
}

export function group(name, blocks = []) {
  return {
    kind: "group",
    name,
    blocks: [...blocks]
  };
}

export function rule(selector, declarations = {}, blocks = []) {
  return {
    kind: "rule",
    selector,
    declarations: cloneDeclarations(declarations),
    blocks: [...blocks]
  };
}

export function media(query, blocks = []) {
  return {
    kind: "media",
    query,
    blocks: [...blocks]
  };
}

export function keyframes(name, frames = []) {
  return {
    kind: "keyframes",
    name,
    frames: frames.map(frame => ({
      step: frame.step,
      declarations: cloneDeclarations(frame.declarations)
    }))
  };
}

export function renderWcssStylesheet(stylesheet, {
  indent = "  ",
  banner = null
} = {}) {
  if (!stylesheet || stylesheet.kind !== "stylesheet") {
    throw new Error("renderWcssStylesheet expects a stylesheet");
  }
  const body = stylesheet.blocks
    .map(block => renderBlock(block, { indent }))
    .filter(Boolean)
    .join("\n\n");
  const bannerLines = [banner, stylesheet.name].filter(Boolean);
  const prefix = bannerLines.length
    ? `${bannerLines.map(line => `/* ${line} */`).join("\n")}\n\n`
    : "";
  return `${prefix}${body}\n`;
}
