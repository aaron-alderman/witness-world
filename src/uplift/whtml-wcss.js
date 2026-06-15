const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

function stableId(prefix, path) {
  return `${prefix}:${path.length ? path.join(".") : "root"}`;
}

function cloneProvenance(provenance = {}) {
  return Object.fromEntries(Object.entries(provenance ?? {}).filter(([, value]) => value != null));
}

function parseDeclarations(styleText = "") {
  return String(styleText)
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const colon = part.indexOf(":");
      if (colon < 0) return null;
      const property = part.slice(0, colon).trim();
      const value = part.slice(colon + 1).trim();
      if (!property || !value) return null;
      return { property, value };
    })
    .filter(Boolean);
}

function parseAttrs(raw = "") {
  const attrs = {};
  const attrSource = raw
    .replace(/^<[A-Za-z][^\s/>]*/, "")
    .replace(/\/?>$/, "")
    .trim();
  const attrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g;
  for (const match of attrSource.matchAll(attrPattern)) {
    const [, name, doubleQuoted, singleQuoted, bare] = match;
    attrs[name] = doubleQuoted ?? singleQuoted ?? bare ?? "";
  }
  return attrs;
}

function tagNameFromToken(token) {
  const match = token.match(/^<\/?\s*([A-Za-z][A-Za-z0-9:-]*)/);
  return match ? match[1].toLowerCase() : "";
}

function walkWhtml(node, visit) {
  if (!node) return;
  visit(node);
  for (const child of node.children ?? []) walkWhtml(child, visit);
}

function findWhtmlNode(root, nodeId) {
  let found = null;
  walkWhtml(root, node => {
    if (!found && node.id === nodeId) found = node;
  });
  return found;
}

export function createWhtmlNode({
  id,
  tag,
  attrs = {},
  text = null,
  children = [],
  provenance = {}
} = {}) {
  if (!id || !tag) throw new Error("WHTML node requires id and tag");
  return {
    kind: "WhtmlNode",
    id,
    tag,
    attrs: { ...attrs },
    text,
    children: [...children],
    provenance: cloneProvenance(provenance)
  };
}

export function createWcssRule({
  id,
  selector,
  declarations = [],
  variants = [],
  provenance = {}
} = {}) {
  if (!id || !selector) throw new Error("WCSS rule requires id and selector");
  return {
    kind: "WcssRule",
    id,
    selector,
    declarations: declarations.map(declaration => ({ ...declaration })),
    variants: variants.map(variant => ({ ...variant })),
    provenance: cloneProvenance(provenance)
  };
}

export function createWcssInlineDeclarationSet({
  id,
  nodeId,
  declarations = [],
  provenance = {}
} = {}) {
  if (!id || !nodeId) throw new Error("WCSS inline declaration set requires id and nodeId");
  return {
    kind: "WcssInlineDeclarationSet",
    id,
    nodeId,
    declarations: declarations.map(declaration => ({ ...declaration })),
    provenance: cloneProvenance(provenance)
  };
}

export function createSymmetryGroup({
  id,
  memberNodeIds = [],
  sharedDeclarations = [],
  rationale = "",
  provenance = {}
} = {}) {
  if (!id) throw new Error("symmetry group requires id");
  return {
    kind: "SymmetryGroup",
    id,
    memberNodeIds: [...memberNodeIds],
    sharedDeclarations: sharedDeclarations.map(declaration => ({ ...declaration })),
    rationale,
    provenance: cloneProvenance(provenance)
  };
}

export function createSymmetryBreak({
  id,
  groupId,
  nodeId,
  declarations = [],
  reason = "",
  provenance = {}
} = {}) {
  if (!id || !groupId || !nodeId) throw new Error("symmetry break requires id, groupId, and nodeId");
  return {
    kind: "SymmetryBreak",
    id,
    groupId,
    nodeId,
    declarations: declarations.map(declaration => ({ ...declaration })),
    reason,
    provenance: cloneProvenance(provenance)
  };
}

export function createAuthoredUnitCandidate({
  id,
  name,
  sourceNodeIds = [],
  semanticBoundaryNodeIds = [],
  presentationalWrapperNodeIds = [],
  targetHints = [],
  provenance = {}
} = {}) {
  if (!id || !name) throw new Error("authored unit candidate requires id and name");
  return {
    kind: "AuthoredUnitCandidate",
    id,
    name,
    sourceNodeIds: [...sourceNodeIds],
    semanticBoundaryNodeIds: [...semanticBoundaryNodeIds],
    presentationalWrapperNodeIds: [...presentationalWrapperNodeIds],
    targetHints: [...targetHints],
    provenance: cloneProvenance(provenance)
  };
}

export function createEmissionPlan({
  id,
  target,
  sourceUnitId,
  sourceNodeIds = [],
  collapseDecisionIds = [],
  provenance = {}
} = {}) {
  if (!id || !["widget", "surface"].includes(target)) {
    throw new Error("emission plan requires id and target widget|surface");
  }
  return {
    kind: "EmissionPlan",
    id,
    target,
    sourceUnitId: sourceUnitId ?? null,
    sourceNodeIds: [...sourceNodeIds],
    collapseDecisionIds: [...collapseDecisionIds],
    provenance: cloneProvenance(provenance)
  };
}

export function parseHtmlFragmentToWhtml(fragment, {
  idPrefix = "whtml",
  provenance = {}
} = {}) {
  const root = createWhtmlNode({
    id: stableId(idPrefix, []),
    tag: "fragment",
    provenance
  });
  const stack = [{ node: root, path: [] }];
  const tokenPattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|[^<]+/g;

  for (const token of String(fragment ?? "").match(tokenPattern) ?? []) {
    if (token.startsWith("<!--")) continue;
    const parent = stack[stack.length - 1];
    if (token.startsWith("</")) {
      const closeTag = tagNameFromToken(token);
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].node.tag === closeTag) {
          stack.length = index;
          break;
        }
      }
      continue;
    }
    if (token.startsWith("<")) {
      const tag = tagNameFromToken(token);
      if (!tag) continue;
      const path = [...parent.path, parent.node.children.length];
      const selfClosing = /\/>\s*$/.test(token) || VOID_TAGS.has(tag);
      const node = createWhtmlNode({
        id: stableId(idPrefix, path),
        tag,
        attrs: parseAttrs(token),
        provenance: {
          ...provenance,
          sourceToken: token.slice(0, 120)
        }
      });
      parent.node.children.push(node);
      if (!selfClosing) stack.push({ node, path });
      continue;
    }
    if (token.trim()) {
      const path = [...parent.path, parent.node.children.length];
      parent.node.children.push(createWhtmlNode({
        id: stableId(idPrefix, path),
        tag: "#text",
        text: token.replace(/\s+/g, " ").trim(),
        provenance
      }));
    }
  }

  return root;
}

export function parseWcssRules(cssText = "", {
  idPrefix = "wcss:rule",
  provenance = {}
} = {}) {
  const stripped = String(cssText ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let index = 0;
  for (const match of stripped.matchAll(rulePattern)) {
    const selector = match[1].trim().replace(/\s+/g, " ");
    const declarations = parseDeclarations(match[2]);
    if (!selector || declarations.length === 0) continue;
    rules.push(createWcssRule({
      id: `${idPrefix}:${index}`,
      selector,
      declarations,
      provenance: {
        ...provenance,
        offset: match.index
      }
    }));
    index += 1;
  }
  return rules;
}

export function collectInlineDeclarationSets(root, {
  idPrefix = "wcss:inline",
  provenance = {}
} = {}) {
  const sets = [];
  walkWhtml(root, node => {
    const style = node.attrs?.style;
    if (!style) return;
    const declarations = parseDeclarations(style);
    if (declarations.length === 0) return;
    sets.push(createWcssInlineDeclarationSet({
      id: `${idPrefix}:${sets.length}`,
      nodeId: node.id,
      declarations,
      provenance: {
        ...provenance,
        sourceNodeId: node.id
      }
    }));
  });
  return sets;
}

export function serializeWhtmlNode(node) {
  if (!node) return "";
  if (node.tag === "fragment") return (node.children ?? []).map(serializeWhtmlNode).join("");
  if (node.tag === "#text") return escapeHtml(node.text ?? "");
  const attrs = Object.entries(node.attrs ?? {})
    .map(([name, value]) => value === "" ? name : `${name}="${escapeAttr(value)}"`)
    .join(" ");
  const open = attrs ? `<${node.tag} ${attrs}>` : `<${node.tag}>`;
  if (VOID_TAGS.has(node.tag)) return open;
  return `${open}${(node.children ?? []).map(serializeWhtmlNode).join("")}</${node.tag}>`;
}

function extractStyleBlock(html) {
  const match = String(html ?? "").match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return match ? match[1] : "";
}

function findBalancedElement(html, needle) {
  const source = String(html ?? "");
  const start = source.indexOf(needle);
  if (start < 0) return null;
  const startToken = source.slice(start).match(/^<([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>/);
  if (!startToken) return null;
  const tag = startToken[1].toLowerCase();
  const tokenPattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  tokenPattern.lastIndex = start;
  let depth = 0;
  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const isClose = /^<\//.test(token);
    const isSelfClosing = /\/>$/.test(token) || VOID_TAGS.has(tag);
    if (!isClose) depth += isSelfClosing ? 0 : 1;
    if (isClose) depth -= 1;
    if (depth === 0) return source.slice(start, match.index + token.length);
  }
  return null;
}

export function importEngentusReferenceUplift({
  html,
  sourceFile = "example-ports/engentus/index.html"
} = {}) {
  const cssText = extractStyleBlock(html);
  const sliceDefinitions = [
    ["loginForm", "<div class=\"auth-form-wrap\">"],
    ["signoutForm", "<div class=\"auth-form-wrap\" style=\"text-align:center\">"],
    ["toolbar", "<div id=\"tb\">"],
    ["moduleArea", "<div id=\"module-area\">"]
  ];
  const slices = {};
  const inlineDeclarationSets = [];
  for (const [name, needle] of sliceDefinitions) {
    const fragment = findBalancedElement(html, needle);
    if (!fragment) continue;
    const root = parseHtmlFragmentToWhtml(fragment, {
      idPrefix: `engentus:${name}`,
      provenance: { sourceFile, slice: name }
    });
    const inlineSets = collectInlineDeclarationSets(root, {
      idPrefix: `engentus:${name}:inline`,
      provenance: { sourceFile, slice: name }
    });
    slices[name] = {
      kind: "WhtmlSlice",
      id: `engentus:${name}`,
      name,
      fragment,
      root,
      inlineDeclarationSets: inlineSets,
      provenance: { sourceFile, slice: name }
    };
    inlineDeclarationSets.push(...inlineSets);
  }

  return {
    kind: "EngentusReferenceUplift",
    sourceFile,
    whtml: {
      slices
    },
    wcss: {
      rules: parseWcssRules(cssText, {
        idPrefix: "engentus:css:rule",
        provenance: { sourceFile, slice: "style" }
      }),
      inlineDeclarationSets
    },
    symmetryGraph: {
      groups: [],
      breaks: [],
      presentationalWrapperNodeIds: [],
      semanticBoundaryNodeIds: [],
      authoredUnitCandidates: [],
      emissionPlans: []
    }
  };
}

export function addSymmetryGroup(snapshot, group) {
  return {
    ...snapshot,
    symmetryGraph: {
      ...snapshot.symmetryGraph,
      groups: [...(snapshot.symmetryGraph?.groups ?? []), group]
    }
  };
}

export function addSymmetryBreak(snapshot, symmetryBreak) {
  return {
    ...snapshot,
    symmetryGraph: {
      ...snapshot.symmetryGraph,
      breaks: [...(snapshot.symmetryGraph?.breaks ?? []), symmetryBreak]
    }
  };
}

export function markPresentationalWrapper(snapshot, nodeId) {
  return {
    ...snapshot,
    symmetryGraph: {
      ...snapshot.symmetryGraph,
      presentationalWrapperNodeIds: [...new Set([...(snapshot.symmetryGraph?.presentationalWrapperNodeIds ?? []), nodeId])]
    }
  };
}

export function markSemanticBoundary(snapshot, nodeId) {
  return {
    ...snapshot,
    symmetryGraph: {
      ...snapshot.symmetryGraph,
      semanticBoundaryNodeIds: [...new Set([...(snapshot.symmetryGraph?.semanticBoundaryNodeIds ?? []), nodeId])]
    }
  };
}

function nodeToWidget(node, { idPrefix = "widget" } = {}) {
  if (node.tag === "#text") {
    return {
      id: `${idPrefix}:${node.id}`,
      kind: "text",
      props: { text: node.text ?? "" },
      sourceNodeId: node.id,
      children: []
    };
  }
  return {
    id: `${idPrefix}:${node.id}`,
    kind: node.tag === "fragment" ? "fragment" : "html-element",
    props: node.tag === "fragment" ? {} : { tag: node.tag, attrs: authoredAttrs(node.attrs) },
    sourceNodeId: node.id,
    children: (node.children ?? []).map(child => nodeToWidget(child, { idPrefix }))
  };
}

function nodeToSurface(node, { idPrefix = "surface" } = {}) {
  if (node.tag === "#text") {
    return {
      id: `${idPrefix}:${node.id}`,
      surfaceKind: "text",
      props: { text: node.text ?? "" },
      sourceNodeId: node.id,
      children: []
    };
  }
  return {
    id: `${idPrefix}:${node.id}`,
    surfaceKind: node.tag === "fragment" ? "fragment" : "html-element",
    props: node.tag === "fragment" ? {} : { tag: node.tag, attrs: authoredAttrs(node.attrs) },
    sourceNodeId: node.id,
    children: (node.children ?? []).map(child => nodeToSurface(child, { idPrefix }))
  };
}

export function emitWidgetFromWhtmlWcss(snapshot, {
  slice = "loginForm",
  sourceNodeId = null,
  idPrefix = "uplift:widget"
} = {}) {
  const root = snapshot?.whtml?.slices?.[slice]?.root;
  if (!root) throw new Error(`unknown WHTML slice: ${slice}`);
  const sourceNode = sourceNodeId ? findWhtmlNode(root, sourceNodeId) : root;
  if (!sourceNode) throw new Error(`unknown WHTML node: ${sourceNodeId}`);
  return {
    kind: "WidgetEmission",
    target: "widget",
    sourceSlice: slice,
    root: nodeToWidget(sourceNode, { idPrefix })
  };
}

export function emitSurfaceFromWhtmlWcss(snapshot, {
  slice = "loginForm",
  sourceNodeId = null,
  idPrefix = "uplift:surface"
} = {}) {
  const root = snapshot?.whtml?.slices?.[slice]?.root;
  if (!root) throw new Error(`unknown WHTML slice: ${slice}`);
  const sourceNode = sourceNodeId ? findWhtmlNode(root, sourceNodeId) : root;
  if (!sourceNode) throw new Error(`unknown WHTML node: ${sourceNodeId}`);
  return {
    kind: "SurfaceEmission",
    target: "surface",
    sourceSlice: slice,
    root: nodeToSurface(sourceNode, { idPrefix })
  };
}

function authoredAttrs(attrs = {}) {
  return Object.fromEntries(Object.entries(attrs ?? {}).filter(([name]) => {
    const lowered = String(name).toLowerCase();
    return lowered !== "style" && !lowered.startsWith("on");
  }));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
