import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { compileRvmFileToDesirePlus } from "../../../src/desire/index.js";
import {
  createWcssStylesheet,
  renderWcssStylesheet
} from "../../../src/uplift/wcss-grammar.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CANONICAL_WCSS_FILE = path.join(MODULE_DIR, "engentus-desired-v2.wcss");
const DEFAULT_SWITCH_MANIFEST_FILE = path.join(MODULE_DIR, "engentus-style-switch.json");
const REQUIRED_TOP_LEVEL_SECTIONS = ["tokens", "styles", "views", "application", "lowering"];
const DEFAULT_BROWSER_BACKEND = "browser";
const KNOWN_STYLE_ASSETS = new Set(["shell", "chart"]);
const STYLESHEET_TITLES = Object.freeze({
  shell: "Engentus shell theme grammar",
  chart: "Engentus chart theme grammar"
});

export const ENGENTUS_STYLE_THEME = "engentus";

function splitClassTokens(value) {
  if (typeof value !== "string") return [];
  return value.split(/\s+/).map(token => token.trim()).filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function maybeUnquote(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function addClassTokens(target, value) {
  for (const token of splitClassTokens(value)) target.add(token);
}

function collectBindingClassTokens(binding, traits) {
  if (binding?.prop !== "className") return;
  const source = plainObject(binding.source);
  if (!source) return;
  addClassTokens(traits, source.default);
  const mapped = plainObject(source.map);
  if (!mapped) return;
  for (const value of Object.values(mapped)) addClassTokens(traits, value);
}

function collectOverrideProps(bindings = []) {
  const overrideProps = new Set();
  for (const binding of bindings) {
    if (binding?.prop === "className" || binding?.prop === "style") overrideProps.add(binding.prop);
  }
  return uniqueSorted([...overrideProps]);
}

function collectSurfaceTraits(surface) {
  const traits = new Set();
  addClassTokens(traits, surface.className);
  addClassTokens(traits, surface.props?.class);
  addClassTokens(traits, surface.props?.className);
  for (const binding of surface.bindings ?? []) collectBindingClassTokens(binding, traits);
  return uniqueSorted([...traits]);
}

function ambientIdentityForSurface(surface) {
  return typeof surface?.name === "string" && surface.name.trim() ? surface.name.trim() : null;
}

function structuredIdentityForSurface(surface) {
  return typeof surface?.identity === "string" && surface.identity.trim()
    ? surface.identity.trim()
    : ambientIdentityForSurface(surface);
}

function knownStyleAsset(assetName) {
  return KNOWN_STYLE_ASSETS.has(assetName);
}

function stylesheetTitle(assetName) {
  const title = STYLESHEET_TITLES[assetName] ?? null;
  if (!title) throw new Error(`Unknown Engentus stylesheet asset: ${assetName}`);
  return title;
}

function assetGroupNames(assetDefinition) {
  return (assetDefinition?.declarationGroups ?? []).map(group => group.name);
}

function assetGroupIndex(assetDefinition) {
  const index = new Map();
  for (const block of assetDefinition?.declarationGroups ?? []) {
    if (block?.kind === "group" && block.name) index.set(block.name, structuredClone(block));
  }
  return index;
}

function selectDeclarationBlocks(assetDefinition, groupNames) {
  const selected = new Set(groupNames);
  return (assetDefinition?.declarationGroups ?? [])
    .filter(block => selected.has(block.name))
    .map(block => structuredClone(block));
}

function stylesheetBanner() {
  return "Generated from examples/engentus/app/engentus-desired-v2.wcss";
}

function styleAssetName(asset) {
  return asset === "chart" ? "engentus-chart-pages.css" : "engentus-shell.css";
}

function parseIndentedWcssDocument(text) {
  const root = { text: "<root>", line: 0, indent: -1, children: [] };
  const stack = [root];
  const lines = String(text ?? "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const leading = rawLine.match(/^\s*/)?.[0] ?? "";
    if (leading.includes("\t")) {
      throw new Error(`WCSS indentation uses tabs on line ${index + 1}`);
    }
    const indent = leading.length;
    if (indent % 2 !== 0) {
      throw new Error(`WCSS indentation must use 2-space steps on line ${index + 1}`);
    }
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (indent > parent.indent + 2) {
      throw new Error(`WCSS indentation skipped a level on line ${index + 1}`);
    }
    const node = {
      text: trimmed,
      line: index + 1,
      indent,
      children: []
    };
    parent.children.push(node);
    stack.push(node);
  }

  return root;
}

function childValue(node, prefix) {
  return maybeUnquote(String(node.text).slice(prefix.length).trim());
}

function directChildrenByPrefix(node, prefixes) {
  return node.children.filter(child => prefixes.some(prefix => child.text.startsWith(prefix)));
}

function matchesDirective(text, directive) {
  return text === directive || text.startsWith(`${directive} `);
}

function onlySection(root, name) {
  return root.children.find(child => child.text === name) ?? null;
}

function styleSection(root) {
  return onlySection(root, "styles") ?? onlySection(root, "laws");
}

function sectionStatus(root) {
  return {
    tokens: onlySection(root, "tokens"),
    styles: styleSection(root),
    views: onlySection(root, "views"),
    application: onlySection(root, "application"),
    lowering: onlySection(root, "lowering")
  };
}

function parseTokenSection(node) {
  return node.children.map(child => {
    const equals = child.text.indexOf("=");
    if (equals === -1) {
      throw new Error(`Invalid token declaration on line ${child.line}: ${child.text}`);
    }
    return {
      name: child.text.slice(0, equals).trim(),
      value: child.text.slice(equals + 1).trim()
    };
  });
}

function parseStyleSection(node) {
  const styles = [];
  const seen = new Set();
  for (const child of directChildrenByPrefix(node, ["style ", "law "])) {
    const name = child.text.startsWith("style ")
      ? childValue(child, "style ")
      : childValue(child, "law ");
    if (!name) throw new Error(`Style declaration is missing a name on line ${child.line}`);
    if (seen.has(name)) throw new Error(`Duplicate style family ${name} on line ${child.line}`);
    seen.add(name);
    styles.push({
      name,
      line: child.line
    });
  }
  return styles;
}

function parseViewSection(node) {
  const views = [];
  const seen = new Set();
  for (const child of directChildrenByPrefix(node, ["view "])) {
    const name = childValue(child, "view ");
    if (!name) throw new Error(`View declaration is missing a name on line ${child.line}`);
    if (seen.has(name)) throw new Error(`Duplicate view ${name} on line ${child.line}`);
    seen.add(name);
    views.push({
      name,
      line: child.line
    });
  }
  return views;
}

function parseApplicationSection(node, styleNames) {
  const seen = new Set();
  const slices = [];
  for (const child of directChildrenByPrefix(node, ["slice "])) {
    const name = childValue(child, "slice ");
    if (!name) throw new Error(`Slice declaration is missing a name on line ${child.line}`);
    if (seen.has(name)) throw new Error(`Duplicate slice ${name} on line ${child.line}`);
    seen.add(name);

    const slice = {
      name,
      asset: null,
      sourceFiles: [],
      identities: [],
      traits: [],
      families: [],
      overrides: [],
      notes: []
    };

    for (const line of child.children) {
      if (line.text.startsWith("asset ")) {
        slice.asset = childValue(line, "asset ");
        continue;
      }
      if (line.text.startsWith("source ")) {
        slice.sourceFiles.push(childValue(line, "source "));
        continue;
      }
      if (line.text.startsWith("oracle ")) {
        throw new Error(`Application slice ${slice.name} still declares backend oracle coverage on line ${line.line}`);
      }
      if (line.text.startsWith("identity ")) {
        slice.identities.push(childValue(line, "identity "));
        continue;
      }
      if (line.text.startsWith("trait ")) {
        slice.traits.push(childValue(line, "trait "));
        continue;
      }
      if (line.text.startsWith("family ")) {
        slice.families.push(childValue(line, "family "));
        continue;
      }
      if (line.text.startsWith("override ")) {
        slice.overrides.push(childValue(line, "override "));
        continue;
      }
      if (line.text.startsWith("note ")) {
        slice.notes.push(childValue(line, "note "));
        continue;
      }
      throw new Error(`Unsupported application directive on line ${line.line}: ${line.text}`);
    }

    slice.asset = maybeUnquote(slice.asset);
    slice.sourceFiles = uniqueSorted(slice.sourceFiles);
    slice.identities = uniqueSorted(slice.identities);
    slice.traits = uniqueSorted(slice.traits);
    slice.families = uniqueSorted(slice.families);
    slice.overrides = uniqueSorted(slice.overrides);
    slice.notes = uniqueSorted(slice.notes);

    if (!slice.asset) throw new Error(`Slice ${slice.name} is missing an asset declaration`);
    if (!knownStyleAsset(slice.asset)) {
      throw new Error(`Slice ${slice.name} targets unknown asset ${slice.asset}`);
    }
    if (!slice.sourceFiles.length) {
      throw new Error(`Slice ${slice.name} is missing at least one source file`);
    }
    for (const family of slice.families) {
      if (!styleNames.has(family)) {
        throw new Error(`Slice ${slice.name} references unknown style family ${family}`);
      }
    }
    slices.push(slice);
  }
  return slices;
}

function parseFamilyToGroup(text, lineNumber) {
  const arrowIndex = text.indexOf("->");
  if (arrowIndex === -1) {
    throw new Error(`Invalid lowering family mapping on line ${lineNumber}: ${text}`);
  }
  const family = maybeUnquote(text.slice(0, arrowIndex).trim());
  const group = maybeUnquote(text.slice(arrowIndex + 2).trim());
  if (!family || !group) {
    throw new Error(`Invalid lowering family mapping on line ${lineNumber}: ${text}`);
  }
  return { family, group };
}

function parsePropertyAssignment(node, context) {
  const equals = node.text.indexOf("=");
  if (equals === -1) {
    throw new Error(`Invalid ${context} property assignment on line ${node.line}: ${node.text}`);
  }
  const property = node.text.slice(0, equals).trim();
  const value = node.text.slice(equals + 1).trim();
  if (!property || !value) {
    throw new Error(`Invalid ${context} property assignment on line ${node.line}: ${node.text}`);
  }
  return [property, value];
}

function parseRuleBlock(node) {
  const selector = childValue(node, "rule ");
  if (!selector) throw new Error(`Lowering rule is missing a selector on line ${node.line}`);
  const declarations = [];
  const blocks = [];
  for (const child of node.children) {
    if (matchesDirective(child.text, "rule")) {
      blocks.push(parseRuleBlock(child));
      continue;
    }
    declarations.push(parsePropertyAssignment(child, `rule ${selector}`));
  }
  return {
    kind: "rule",
    selector,
    declarations,
    blocks
  };
}

function parseMediaBlock(node) {
  const query = childValue(node, "media ");
  if (!query) throw new Error(`Lowering media block is missing a query on line ${node.line}`);
  const blocks = [];
  for (const child of node.children) {
    if (!matchesDirective(child.text, "rule")) {
      throw new Error(`Unsupported media child on line ${child.line}: ${child.text}`);
    }
    blocks.push(parseRuleBlock(child));
  }
  return {
    kind: "media",
    query,
    blocks
  };
}

function parseKeyframeStep(node, keyframeName) {
  let step = null;
  if (matchesDirective(node.text, "step")) {
    step = childValue(node, "step ");
  } else if (node.text === "from" || node.text === "to" || /^\d+(\.\d+)?%$/.test(node.text)) {
    step = node.text;
  }
  if (!step) {
    throw new Error(`Invalid keyframe step in ${keyframeName} on line ${node.line}: ${node.text}`);
  }
  return {
    step,
    declarations: node.children.map(child => parsePropertyAssignment(child, `keyframe ${keyframeName} ${step}`))
  };
}

function parseKeyframesBlock(node) {
  const name = childValue(node, "keyframes ");
  if (!name) throw new Error(`Lowering keyframes block is missing a name on line ${node.line}`);
  const frames = node.children.map(child => parseKeyframeStep(child, name));
  if (!frames.length) throw new Error(`Lowering keyframes ${name} is missing frames`);
  return {
    kind: "keyframes",
    name,
    frames
  };
}

function parseDeclarationGroup(node) {
  const name = childValue(node, "group ");
  if (!name) throw new Error(`Lowering declaration group is missing a name on line ${node.line}`);
  const blocks = [];
  for (const child of node.children) {
    if (matchesDirective(child.text, "rule")) {
      blocks.push(parseRuleBlock(child));
      continue;
    }
    if (matchesDirective(child.text, "media")) {
      blocks.push(parseMediaBlock(child));
      continue;
    }
    if (matchesDirective(child.text, "keyframes")) {
      blocks.push(parseKeyframesBlock(child));
      continue;
    }
    throw new Error(`Unsupported lowering declaration directive on line ${child.line}: ${child.text}`);
  }
  return {
    kind: "group",
    name,
    blocks
  };
}

function parseLoweringSection(node, authoredSlices, styleNames) {
  const authoredSliceByName = new Map(authoredSlices.map(slice => [slice.name, slice]));
  const lowering = {
    backends: []
  };
  const backendNames = new Set();

  for (const backendNode of directChildrenByPrefix(node, ["backend "])) {
    const backendName = childValue(backendNode, "backend ");
    if (!backendName) throw new Error(`Lowering backend is missing a name on line ${backendNode.line}`);
    if (backendNames.has(backendName)) throw new Error(`Duplicate lowering backend ${backendName} on line ${backendNode.line}`);
    backendNames.add(backendName);

    const backend = {
      name: backendName,
      assets: [],
      slices: []
    };
    const backendAssetNames = new Set();
    const sliceOwnersByAsset = new Map();
    const sliceNames = new Set();

    for (const assetNode of backendNode.children) {
      if (!assetNode.text.startsWith("asset ")) {
        throw new Error(`Unsupported lowering backend directive on line ${assetNode.line}: ${assetNode.text}`);
      }
      const assetName = childValue(assetNode, "asset ");
      if (!knownStyleAsset(assetName)) {
        throw new Error(`Lowering backend ${backendName} targets unknown asset ${assetName} on line ${assetNode.line}`);
      }
      if (backendAssetNames.has(assetName)) {
        throw new Error(`Duplicate lowering asset ${assetName} for backend ${backendName} on line ${assetNode.line}`);
      }
      backendAssetNames.add(assetName);
      const asset = {
        name: assetName,
        slices: [],
        declarationGroups: []
      };
      if (!sliceOwnersByAsset.has(assetName)) sliceOwnersByAsset.set(assetName, new Map());
      const ownedGroups = sliceOwnersByAsset.get(assetName);
      const declaredGroupNames = new Set();

      for (const child of assetNode.children) {
        if (child.text.startsWith("slice ")) {
          const sliceName = childValue(child, "slice ");
          const authoredSlice = authoredSliceByName.get(sliceName) ?? null;
          if (!authoredSlice) {
            throw new Error(`Lowering backend ${backendName} references unknown slice ${sliceName} on line ${child.line}`);
          }
          if (authoredSlice.asset !== assetName) {
            throw new Error(`Lowering backend ${backendName} maps slice ${sliceName} to asset ${assetName} but application declares ${authoredSlice.asset}`);
          }
          if (sliceNames.has(sliceName)) {
            throw new Error(`Lowering backend ${backendName} declares slice ${sliceName} more than once`);
          }
          sliceNames.add(sliceName);

          const slice = {
            name: sliceName,
            asset: assetName,
            groups: [],
            seams: [],
            familyGroups: [],
            notes: []
          };
          const familyNames = new Set();

          for (const line of child.children) {
            if (line.text.startsWith("group ")) {
              slice.groups.push(childValue(line, "group "));
              continue;
            }
            if (line.text.startsWith("seam ")) {
              slice.seams.push(childValue(line, "seam "));
              continue;
            }
            if (line.text.startsWith("family ")) {
              slice.familyGroups.push(parseFamilyToGroup(childValue(line, "family "), line.line));
              continue;
            }
            if (line.text.startsWith("note ")) {
              slice.notes.push(childValue(line, "note "));
              continue;
            }
            throw new Error(`Unsupported lowering directive on line ${line.line}: ${line.text}`);
          }

          slice.groups = uniqueSorted(slice.groups);
          slice.seams = uniqueSorted(slice.seams);
          slice.notes = uniqueSorted(slice.notes);
          slice.familyGroups = slice.familyGroups
            .map(entry => ({
              family: entry.family,
              group: entry.group
            }))
            .sort((left, right) => left.family.localeCompare(right.family) || left.group.localeCompare(right.group));

          if (!slice.groups.length) {
            throw new Error(`Lowering backend ${backendName} slice ${sliceName} is missing backend group coverage`);
          }

          for (const seam of slice.seams) {
            if (!slice.groups.includes(seam)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} declares seam ${seam} without owning that backend group`);
            }
          }

          for (const mapping of slice.familyGroups) {
            if (!styleNames.has(mapping.family)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} references unknown style family ${mapping.family}`);
            }
            if (!authoredSlice.families.includes(mapping.family)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} maps family ${mapping.family} that is not declared on the application slice`);
            }
            if (!slice.groups.includes(mapping.group)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} maps family ${mapping.family} to undeclared backend group ${mapping.group}`);
            }
            if (familyNames.has(mapping.family)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} maps family ${mapping.family} more than once`);
            }
            familyNames.add(mapping.family);
          }

          for (const family of authoredSlice.families) {
            if (!familyNames.has(family)) {
              throw new Error(`Lowering backend ${backendName} slice ${sliceName} is missing browser lowering coverage for family ${family}`);
            }
          }

          for (const group of slice.groups) {
            const priorOwner = ownedGroups.get(group);
            if (priorOwner && priorOwner !== sliceName) {
              throw new Error(`Lowering backend ${backendName} asset ${assetName} claims backend group ${group} from both ${priorOwner} and ${sliceName}`);
            }
            ownedGroups.set(group, sliceName);
          }

          asset.slices.push(slice);
          backend.slices.push(slice);
          continue;
        }

        if (child.text.startsWith("group ")) {
          const declarationGroup = parseDeclarationGroup(child);
          if (declaredGroupNames.has(declarationGroup.name)) {
            throw new Error(`Lowering backend ${backendName} asset ${assetName} declares browser group ${declarationGroup.name} more than once`);
          }
          declaredGroupNames.add(declarationGroup.name);
          asset.declarationGroups.push(declarationGroup);
          continue;
        }

        throw new Error(`Unsupported lowering asset directive on line ${child.line}: ${child.text}`);
      }

      for (const slice of asset.slices) {
        for (const group of slice.groups) {
          if (!declaredGroupNames.has(group)) {
            throw new Error(`Lowering backend ${backendName} asset ${assetName} selects browser group ${group} without a declaration group`);
          }
        }
      }

      for (const declaredGroup of declaredGroupNames) {
        if (!ownedGroups.has(declaredGroup)) {
          throw new Error(`Lowering backend ${backendName} asset ${assetName} declares browser group ${declaredGroup} without a slice owner`);
        }
      }

      backend.assets.push(asset);
    }

    for (const authoredSlice of authoredSlices) {
      if (!sliceNames.has(authoredSlice.name)) {
        throw new Error(`Lowering backend ${backendName} is missing coverage for slice ${authoredSlice.name}`);
      }
    }

    lowering.backends.push(backend);
  }

  const browserLowering = lowering.backends.find(backend => backend.name === DEFAULT_BROWSER_BACKEND) ?? null;
  if (!browserLowering) {
    throw new Error(`Missing required lowering backend ${DEFAULT_BROWSER_BACKEND}`);
  }

  for (const backend of lowering.backends) {
    backend.assetsByName = Object.fromEntries(backend.assets.map(asset => [asset.name, asset]));
  }
  lowering.byBackend = Object.fromEntries(lowering.backends.map(backend => [backend.name, backend]));
  return lowering;
}

function compatibilitySlicesFromCanonical(canonical, backendName = DEFAULT_BROWSER_BACKEND) {
  const backend = canonical.lowering.byBackend[backendName] ?? null;
  if (!backend) throw new Error(`Unknown lowering backend ${backendName}`);
  const loweringBySlice = new Map(backend.slices.map(slice => [slice.name, slice]));
  return canonical.slices.map(slice => {
    const lowering = loweringBySlice.get(slice.name) ?? null;
    if (!lowering) throw new Error(`Missing lowering coverage for slice ${slice.name} on backend ${backendName}`);
    return {
      ...structuredClone(slice),
      oracleGroups: [...lowering.groups],
      lowering: {
        [backendName]: structuredClone(lowering)
      }
    };
  });
}

export function renderOracleStylesheet(stylesheet) {
  return renderWcssStylesheet(stylesheet, {
    banner: stylesheetBanner()
  });
}

export function parseEngentusCanonicalWcss(text) {
  const root = parseIndentedWcssDocument(text);
  const themeNode = root.children.find(child => child.text.startsWith("theme ")) ?? null;
  const theme = themeNode ? childValue(themeNode, "theme ") : null;
  if (theme !== ENGENTUS_STYLE_THEME) {
    throw new Error(`Expected theme ${ENGENTUS_STYLE_THEME} but found ${theme || "<none>"}`);
  }

  const sections = sectionStatus(root);
  for (const sectionName of REQUIRED_TOP_LEVEL_SECTIONS) {
    if (!sections[sectionName]) throw new Error(`Missing required top-level section: ${sectionName}`);
  }

  const tokens = parseTokenSection(sections.tokens);
  const styles = parseStyleSection(sections.styles);
  const views = parseViewSection(sections.views);
  const slices = parseApplicationSection(sections.application, new Set(styles.map(style => style.name)));
  const lowering = parseLoweringSection(sections.lowering, slices, new Set(styles.map(style => style.name)));

  return {
    theme,
    tokens,
    styles,
    views,
    slices,
    lowering,
    ast: root
  };
}

export async function loadEngentusCanonicalWcss(file = DEFAULT_CANONICAL_WCSS_FILE) {
  return parseEngentusCanonicalWcss(await readFile(file, "utf8"));
}

export async function loadEngentusBrowserLoweringMap(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const canonical = await loadEngentusCanonicalWcss(file);
  return structuredClone(canonical.lowering.byBackend[DEFAULT_BROWSER_BACKEND]);
}

export async function loadEngentusBrowserDeclarationGroups(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const browserLowering = await loadEngentusBrowserLoweringMap(file);
  return Object.fromEntries(
    browserLowering.assets.map(asset => [asset.name, structuredClone(asset.declarationGroups)])
  );
}

export async function loadEngentusAppliedWcss(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const canonical = await loadEngentusCanonicalWcss(file);
  return {
    theme: canonical.theme,
    styles: canonical.styles.map(style => style.name),
    views: canonical.views.map(view => view.name),
    lowering: structuredClone(canonical.lowering),
    slices: compatibilitySlicesFromCanonical(canonical)
  };
}

export async function loadEngentusStyleSwitchManifest(file = DEFAULT_SWITCH_MANIFEST_FILE) {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  if (manifest?.theme !== ENGENTUS_STYLE_THEME) {
    throw new Error(`Expected switch manifest theme ${ENGENTUS_STYLE_THEME}`);
  }
  return manifest;
}

export async function buildEngentusPresentationInventory(authoredPlan = null) {
  const plan = authoredPlan ?? await loadEngentusAppliedWcss();
  const browserLowering = plan.lowering?.byBackend?.[DEFAULT_BROWSER_BACKEND] ?? null;
  if (!browserLowering) throw new Error(`Missing lowering backend ${DEFAULT_BROWSER_BACKEND}`);
  const slices = [];
  for (const definition of plan.slices) {
    const surfaces = [];
    const identities = new Set();
    const traits = new Set();
    const overrideProps = new Set();
    for (const relativeFile of definition.sourceFiles) {
      const absoluteFile = path.join(MODULE_DIR, relativeFile);
      const desirePlus = await compileRvmFileToDesirePlus(absoluteFile);
      for (const node of desirePlus.nodes) {
        if (node.semantic?.kind !== "surface") continue;
        const surface = node.semantic;
        const ambientIdentity = ambientIdentityForSurface(surface);
        const identity = structuredIdentityForSurface(surface);
        const surfaceTraits = collectSurfaceTraits(surface);
        const surfaceOverrideProps = collectOverrideProps(surface.bindings ?? []);
        if (identity) identities.add(identity);
        for (const trait of surfaceTraits) traits.add(trait);
        for (const prop of surfaceOverrideProps) overrideProps.add(prop);
        surfaces.push({
          name: surface.name ?? null,
          ambientIdentity,
          identity,
          surfaceKind: surface.surfaceKind ?? null,
          traits: surfaceTraits,
          overrideProps: surfaceOverrideProps,
          sourceFile: relativeFile
        });
      }
    }
    slices.push({
      name: definition.name,
      asset: definition.asset,
      sourceFiles: [...definition.sourceFiles],
      notes: [...definition.notes],
      identities: uniqueSorted([...identities]),
      traits: uniqueSorted([...traits]),
      overrideProps: uniqueSorted([...overrideProps]),
      surfaces: surfaces.sort((left, right) => String(left.identity || left.name).localeCompare(String(right.identity || right.name)))
    });
  }
  return {
    theme: ENGENTUS_STYLE_THEME,
    oracleAssets: Object.fromEntries(
      browserLowering.assets.map(asset => [asset.name, assetGroupNames(asset)])
    ),
    slices
  };
}

export async function buildEngentusParityReport(authoredPlan, stylesheets) {
  const [shellCss, chartCss] = await Promise.all([
    readFile(path.join(MODULE_DIR, styleAssetName("shell")), "utf8"),
    readFile(path.join(MODULE_DIR, styleAssetName("chart")), "utf8")
  ]);
  const emittedByAsset = {
    shell: renderOracleStylesheet(stylesheets.shell),
    chart: renderOracleStylesheet(stylesheets.chart)
  };
  const checkedInByAsset = {
    shell: shellCss,
    chart: chartCss
  };
  return {
    theme: ENGENTUS_STYLE_THEME,
    assets: Object.fromEntries(
      Object.entries(emittedByAsset).map(([asset, emittedCss]) => [asset, {
        exactParity: emittedCss === checkedInByAsset[asset]
      }])
    ),
    slices: (authoredPlan?.slices ?? []).map(slice => ({
      name: slice.name,
      asset: slice.asset,
      authoredGroups: [...slice.oracleGroups],
      legacyGroups: [...slice.oracleGroups],
      exactOracleParity: emittedByAsset[slice.asset] === checkedInByAsset[slice.asset],
      authoredOnly: [],
      legacyOnly: [],
      notes: [...slice.notes]
    }))
  };
}

function resolveSliceTrack(switchManifest, sliceName) {
  return switchManifest?.slices?.[sliceName] ?? "legacy";
}

function unknownSwitchSlices(authoredPlan, switchManifest) {
  const known = new Set((authoredPlan?.slices ?? []).map(slice => slice.name));
  return Object.keys(switchManifest?.slices ?? {}).filter(name => !known.has(name));
}

export function verifyEngentusStyleOwnership({
  inventory,
  authoredPlan,
  switchManifest
}) {
  const inventoryByName = new Map((inventory?.slices ?? []).map(slice => [slice.name, slice]));
  const errors = [];
  const selectedGroupsByAsset = new Map();
  const slices = [];

  for (const unknownSlice of unknownSwitchSlices(authoredPlan, switchManifest)) {
    errors.push(`Switch manifest references unknown slice ${unknownSlice}`);
  }

  for (const authoredSlice of authoredPlan?.slices ?? []) {
    const track = resolveSliceTrack(switchManifest, authoredSlice.name);
    if (!["legacy", "wcss"].includes(track)) {
      errors.push(`Slice ${authoredSlice.name} has unsupported track ${track}`);
      continue;
    }
    const inventorySlice = inventoryByName.get(authoredSlice.name) ?? null;
    const lowering = authoredSlice.lowering?.[DEFAULT_BROWSER_BACKEND] ?? null;
    const selectedGroups = [...(lowering?.groups ?? authoredSlice.oracleGroups ?? [])];

    if (!selectedGroups.length) {
      errors.push(`Slice ${authoredSlice.name} has no backend group coverage for ${DEFAULT_BROWSER_BACKEND}`);
    }

    if (track === "wcss" && inventorySlice) {
      for (const identity of authoredSlice.identities) {
        if (!inventorySlice.identities.includes(identity)) {
          errors.push(`Slice ${authoredSlice.name} references unknown structured identity ${identity}`);
        }
      }
      for (const trait of authoredSlice.traits) {
        if (!inventorySlice.traits.includes(trait)) {
          errors.push(`Slice ${authoredSlice.name} references unknown trait ${trait}`);
        }
      }
      for (const overrideProp of inventorySlice.overrideProps) {
        if (!authoredSlice.overrides.includes(overrideProp)) {
          errors.push(`Slice ${authoredSlice.name} has runtime override seam ${overrideProp} but the canonical WCSS slice does not declare it`);
        }
      }
    }

    if (!selectedGroupsByAsset.has(authoredSlice.asset)) selectedGroupsByAsset.set(authoredSlice.asset, new Map());
    const assetSelection = selectedGroupsByAsset.get(authoredSlice.asset);
    for (const group of selectedGroups) {
      const priorOwner = assetSelection.get(group);
      if (priorOwner && priorOwner !== authoredSlice.name) {
        errors.push(`Oracle group ${group} is claimed by both ${priorOwner} and ${authoredSlice.name}`);
      } else {
        assetSelection.set(group, authoredSlice.name);
      }
    }

    slices.push({
      name: authoredSlice.name,
      asset: authoredSlice.asset,
      track,
      selectedGroups,
      identities: [...authoredSlice.identities],
      traits: [...authoredSlice.traits],
      families: [...authoredSlice.families],
      lowering: lowering ? structuredClone(lowering) : null,
      overrides: [...authoredSlice.overrides],
      notes: [...authoredSlice.notes]
    });
  }

  return {
    theme: ENGENTUS_STYLE_THEME,
    ok: errors.length === 0,
    errors,
    slices
  };
}

function browserAssetDefinition(browserLowering, assetName) {
  const asset = browserLowering?.assetsByName?.[assetName] ?? browserLowering?.assets?.find(entry => entry.name === assetName) ?? null;
  if (!asset) throw new Error(`Missing browser lowering asset ${assetName}`);
  return asset;
}

function composeStylesheetForAsset(browserLowering, assetName, groups) {
  const asset = browserAssetDefinition(browserLowering, assetName);
  return createWcssStylesheet({
    name: stylesheetTitle(assetName),
    blocks: selectDeclarationBlocks(asset, groups)
  });
}

export function composeEngentusStylesheets({
  authoredPlan,
  switchManifest
}) {
  const browserLowering = authoredPlan?.lowering?.byBackend?.[DEFAULT_BROWSER_BACKEND] ?? null;
  if (!browserLowering) throw new Error(`Missing lowering backend ${DEFAULT_BROWSER_BACKEND}`);
  const groupsByAsset = new Map([
    ["shell", []],
    ["chart", []]
  ]);
  for (const slice of authoredPlan?.slices ?? []) {
    const track = resolveSliceTrack(switchManifest, slice.name);
    if (!["legacy", "wcss"].includes(track)) continue;
    const lowering = slice.lowering?.[DEFAULT_BROWSER_BACKEND] ?? null;
    groupsByAsset.get(slice.asset).push(...(lowering?.groups ?? slice.oracleGroups ?? []));
  }
  return {
    shell: composeStylesheetForAsset(browserLowering, "shell", groupsByAsset.get("shell")),
    chart: composeStylesheetForAsset(browserLowering, "chart", groupsByAsset.get("chart"))
  };
}

export async function buildEngentusStyleArtifacts() {
  const [authoredPlan, switchManifest] = await Promise.all([
    loadEngentusAppliedWcss(),
    loadEngentusStyleSwitchManifest()
  ]);
  const inventory = await buildEngentusPresentationInventory(authoredPlan);
  const ownership = verifyEngentusStyleOwnership({
    inventory,
    authoredPlan,
    switchManifest
  });
  if (!ownership.ok) {
    throw new Error(`Engentus WCSS ownership check failed:\n${ownership.errors.map(line => `- ${line}`).join("\n")}`);
  }
  const stylesheets = composeEngentusStylesheets({
    authoredPlan,
    switchManifest
  });
  const parity = await buildEngentusParityReport(authoredPlan, stylesheets);
  return {
    authoredPlan,
    switchManifest,
    inventory,
    parity,
    ownership,
    files: {
      [styleAssetName("shell")]: renderOracleStylesheet(stylesheets.shell),
      [styleAssetName("chart")]: renderOracleStylesheet(stylesheets.chart)
    }
  };
}

export async function authoredOracleGroupCoverage(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const browserLowering = await loadEngentusBrowserLoweringMap(file);
  return Object.fromEntries(
    browserLowering.assets.map(asset => [asset.name, uniqueSorted(assetGroupNames(asset))])
  );
}

export async function oracleGroupIndexByAsset(file = DEFAULT_CANONICAL_WCSS_FILE) {
  const browserLowering = await loadEngentusBrowserLoweringMap(file);
  return Object.fromEntries(
    browserLowering.assets.map(asset => [asset.name, assetGroupIndex(asset)])
  );
}
