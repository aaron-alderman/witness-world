import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  addSymmetryBreak,
  addSymmetryGroup,
  correlateComputedStylesWithWhtml,
  createSymmetryBreak,
  createSymmetryGroup,
  deriveSymmetryBreaksFromComputedStyles,
  deriveSymmetryGroupsFromComputedStyles,
  importWcssComputedCapture,
  emitSurfaceFromWhtmlWcss,
  emitWidgetFromWhtmlWcss,
  importEngentusReferenceUplift,
  markPresentationalWrapper,
  markSemanticBoundary,
  serializeWhtmlNode
} from "../src/uplift/whtml-wcss.js";
import {
  AUTHORING_MODE_MCP_ONLY,
  buildRuntimeAuthoringCapabilityMatrix,
  createRuntimeAuthoringPolicy
} from "../src/runtime-authoring-policy.js";

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function findNode(root, predicate) {
  let found = null;
  walk(root, node => {
    if (!found && predicate(node)) found = node;
  });
  return found;
}

async function engentusSnapshot() {
  const html = await readFile(path.join(process.cwd(), "example-ports", "engentus", "index.html"), "utf8");
  return importEngentusReferenceUplift({
    html,
    sourceFile: "example-ports/engentus/index.html"
  });
}

test("canonical docs define WHTML/WCSS as internal uplift, not a second public lane", async () => {
  const [uplift, desireSpa, policy, playbook, behaviorInventory] = await Promise.all([
    readFile(path.join(process.cwd(), "docs", "WHTML-WCSS-UPLIFT.md"), "utf8"),
    readFile(path.join(process.cwd(), "docs", "DESIRE-SPA.md"), "utf8"),
    readFile(path.join(process.cwd(), "docs", "LLM-AUTHORING-POLICY.md"), "utf8"),
    readFile(path.join(process.cwd(), "docs", "AUTHORING-REPLAY-PLAYBOOK.md"), "utf8"),
    readFile(path.join(process.cwd(), "docs", "ENGENTUS-ORACLE-BEHAVIOR-INVENTORY.md"), "utf8")
  ]);

  assert.match(uplift, /internal import and uplift workspace/i);
  assert.match(uplift, /not a runtime/i);
  assert.match(uplift, /not a public MCP authoring noun/i);
  assert.match(uplift, /not a second proof lane/i);
  assert.match(uplift, /Inline styles belong to `WCSS`/);
  assert.match(desireSpa, /Internal uplift workspace/i);
  assert.match(desireSpa, /real app serving path/i);
  assert.match(desireSpa, /mechanical HTML\/CSS parity/i);
  assert.match(desireSpa, /MCP-only reconstruction/i);
  assert.match(policy, /Internal uplift is not authoring permission/i);
  assert.match(policy, /none exist/i);
  assert.match(playbook, /WHTML\/WCSS evidence can inform candidate authored input/i);
  assert.match(uplift, /reference JavaScript is also oracle evidence/i);
  assert.match(desireSpa, /Reference JavaScript may be read only as oracle evidence/i);
  assert.match(behaviorInventory, /must not be copied back as an app runtime/i);
  assert.match(behaviorInventory, /WAS-style timeline/i);
  assert.match(behaviorInventory, /Cross-Cutting Runtime Primitives Exposed By The Oracle/i);
});

test("Engentus reference import captures WHTML structure, WCSS stylesheet rules, and inline style evidence", async () => {
  const snapshot = await engentusSnapshot();
  const login = snapshot.whtml.slices.loginForm;
  const moduleArea = snapshot.whtml.slices.moduleArea;

  assert.equal(snapshot.kind, "EngentusReferenceUplift");
  assert.ok(login);
  assert.ok(moduleArea);
  assert.equal(login.root.provenance.slice, "loginForm");
  assert.equal(login.root.children[0].attrs.class, "auth-form-wrap");
  assert.ok(findNode(login.root, node => node.tag === "button" && node.attrs.class === "ms-btn"));
  assert.ok(findNode(login.root, node => node.tag === "input" && node.attrs.id === "login-email"));
  assert.ok(snapshot.wcss.rules.some(rule => rule.selector === ".auth-form-wrap"));
  assert.ok(snapshot.wcss.rules.some(rule => rule.selector === "#module-area"));
  assert.deepEqual(snapshot.wcss.computedStyleSets, []);

  const imageInline = snapshot.wcss.inlineDeclarationSets.find(set => {
    const node = findNode(login.root, candidate => candidate.id === set.nodeId);
    return node?.tag === "img" && node.attrs.src === "img/mill-iq.png";
  });
  assert.ok(imageInline);
  assert.deepEqual(imageInline.declarations, [
    { property: "height", value: "30px" },
    { property: "width", value: "auto" }
  ]);
});

test("WCSS correlates observed computed styles back to WHTML nodes", async () => {
  const snapshot = await engentusSnapshot();
  const loginRoot = snapshot.whtml.slices.loginForm.root;
  const computed = correlateComputedStylesWithWhtml(loginRoot, [
    {
      selector: ".auth-form-wrap",
      tag: "div",
      className: "auth-form-wrap",
      text: "Welcome back Sign in to your Engentus account",
      computed: {
        display: "block",
        width: "372px",
        fontSize: "12.5px"
      },
      box: { x: 806, y: 206, width: 372, height: 487 }
    },
    {
      selector: "#login-email",
      tag: "input",
      id: "login-email",
      className: "auth-input",
      computed: {
        display: "block",
        width: "372px",
        fontSize: "13.5px"
      },
      box: { x: 806, y: 514, width: 372, height: 39 }
    }
  ], {
    properties: ["display", "width", "fontSize"],
    provenance: { source: "oracle-computed-style" }
  });

  assert.equal(computed.length, 2);
  assert.equal(computed[0].kind, "WcssComputedStyleSet");
  assert.equal(computed[0].selector, ".auth-form-wrap");
  assert.equal(computed[0].box.width, 372);
  assert.ok(findNode(loginRoot, node => node.id === computed[0].nodeId && node.attrs.class === "auth-form-wrap"));
  assert.ok(findNode(loginRoot, node => node.id === computed[1].nodeId && node.attrs.id === "login-email"));
  assert.deepEqual(computed[1].declarations, [
    { property: "display", value: "block" },
    { property: "width", value: "372px" },
    { property: "fontSize", value: "13.5px" }
  ]);
});

test("WCSS consumes generated browser capture artifacts as computed style evidence", async () => {
  const snapshot = await engentusSnapshot();
  const loginRoot = snapshot.whtml.slices.loginForm.root;
  const capture = {
    kind: "EngentusWcssComputedCapture",
    target: "reference",
    screen: "login",
    url: "http://localhost:56693/",
    properties: ["display", "width", "height", "transitionDuration"],
    records: [
      {
        selector: "#ms-btn",
        tag: "button",
        id: "ms-btn",
        className: "ms-btn",
        text: "Sign in with Microsoft",
        box: { x: 806, y: 349, width: 372, height: 40 },
        computed: {
          display: "flex",
          width: "372px",
          height: "40px",
          transitionDuration: "0.15s"
        }
      }
    ]
  };

  const sets = importWcssComputedCapture(loginRoot, capture, {
    idPrefix: "test:computed",
    provenance: { source: "generated-capture-fixture" }
  });

  assert.equal(sets.length, 1);
  assert.equal(sets[0].id, "test:computed:0");
  assert.equal(sets[0].selector, "#ms-btn");
  assert.ok(findNode(loginRoot, node => node.id === sets[0].nodeId && node.attrs.id === "ms-btn"));
  assert.deepEqual(sets[0].declarations, [
    { property: "display", value: "flex" },
    { property: "width", value: "372px" },
    { property: "height", value: "40px" },
    { property: "transitionDuration", value: "0.15s" }
  ]);
  assert.deepEqual(sets[0].provenance, {
    target: "reference",
    screen: "login",
    url: "http://localhost:56693/",
    source: "generated-capture-fixture",
    sourceSelector: "#ms-btn",
    observedIndex: 0
  });
});

test("WCSS derives symmetry groups and localized breaks from computed evidence", () => {
  const computed = [
    {
      kind: "WcssComputedStyleSet",
      id: "c:0",
      nodeId: "feature:0",
      declarations: [
        { property: "display", value: "flex" },
        { property: "gap", value: "11px" }
      ]
    },
    {
      kind: "WcssComputedStyleSet",
      id: "c:1",
      nodeId: "feature:1",
      declarations: [
        { property: "display", value: "flex" },
        { property: "gap", value: "11px" }
      ]
    },
    {
      kind: "WcssComputedStyleSet",
      id: "c:2",
      nodeId: "feature:2",
      declarations: [
        { property: "display", value: "flex" },
        { property: "gap", value: "14px" }
      ]
    }
  ];

  const groups = deriveSymmetryGroupsFromComputedStyles(computed);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].memberNodeIds, ["feature:0", "feature:1"]);
  assert.deepEqual(groups[0].sharedDeclarations, [
    { property: "display", value: "flex" },
    { property: "gap", value: "11px" }
  ]);

  const broaderGroup = createSymmetryGroup({
    id: "feature-row-law",
    memberNodeIds: ["feature:0", "feature:1", "feature:2"],
    sharedDeclarations: [
      { property: "display", value: "flex" },
      { property: "gap", value: "11px" }
    ]
  });
  const breaks = deriveSymmetryBreaksFromComputedStyles(broaderGroup, computed);
  assert.deepEqual(breaks, [
    {
      kind: "SymmetryBreak",
      id: "wcss:break:0",
      groupId: "feature-row-law",
      nodeId: "feature:2",
      declarations: [{ property: "gap", value: "14px" }],
      reason: "computed presentation evidence deviates from the symmetry group",
      provenance: { sourceSetId: "c:2" }
    }
  ]);
});

test("WHTML keeps stable provenance and can serialize the imported login slice deterministically", async () => {
  const snapshot = await engentusSnapshot();
  const serialized = serializeWhtmlNode(snapshot.whtml.slices.loginForm.root);

  assert.match(serialized, /<div class="auth-form-wrap">/);
  assert.match(serialized, /<button class="ms-btn" id="ms-btn" onclick="authSignIn\(this\)">/);
  assert.match(serialized, /Sign in with Microsoft/);
  assert.match(serialized, /<input type="email" id="login-email" class="auth-input" placeholder="you@company.com" autocomplete="email">/);
});

test("symmetry groups, symmetry breaks, wrapper marks, and semantic boundaries are explicit graph data", async () => {
  const snapshot = await engentusSnapshot();
  const loginRootId = snapshot.whtml.slices.loginForm.root.children[0].id;
  const signoutRootId = snapshot.whtml.slices.signoutForm.root.children[0].id;
  const group = createSymmetryGroup({
    id: "auth-card-law",
    memberNodeIds: [loginRootId, signoutRootId],
    sharedDeclarations: [{ property: "max-width", value: "372px" }],
    rationale: "login and signout share the auth-card presentation law"
  });
  const symmetryBreak = createSymmetryBreak({
    id: "signout-centered-break",
    groupId: group.id,
    nodeId: signoutRootId,
    declarations: [{ property: "text-align", value: "center" }],
    reason: "signout localizes card content alignment"
  });

  const withGroup = addSymmetryGroup(snapshot, group);
  const withBreak = addSymmetryBreak(withGroup, symmetryBreak);
  const withWrapper = markPresentationalWrapper(withBreak, loginRootId);
  const withBoundary = markSemanticBoundary(withWrapper, signoutRootId);

  assert.deepEqual(withBoundary.symmetryGraph.groups, [group]);
  assert.deepEqual(withBoundary.symmetryGraph.breaks, [symmetryBreak]);
  assert.deepEqual(withBoundary.symmetryGraph.presentationalWrapperNodeIds, [loginRootId]);
  assert.deepEqual(withBoundary.symmetryGraph.semanticBoundaryNodeIds, [signoutRootId]);
});

test("same uplift snapshot emits deterministic widget and surface candidates without inline style or JS authority", async () => {
  const snapshot = await engentusSnapshot();
  const widget = emitWidgetFromWhtmlWcss(snapshot, { slice: "loginForm" });
  const surface = emitSurfaceFromWhtmlWcss(snapshot, { slice: "loginForm" });

  assert.equal(widget.target, "widget");
  assert.equal(surface.target, "surface");
  assert.equal(widget.root.children[0].props.attrs.class, "auth-form-wrap");
  assert.equal(surface.root.children[0].props.attrs.class, "auth-form-wrap");

  const widgetButton = findNode(widget.root, node => node.kind === "html-element" && node.props?.attrs?.id === "ms-btn");
  const surfaceButton = findNode(surface.root, node => node.surfaceKind === "html-element" && node.props?.attrs?.id === "ms-btn");
  assert.ok(widgetButton);
  assert.ok(surfaceButton);
  assert.equal("onclick" in widgetButton.props.attrs, false);
  assert.equal("onclick" in surfaceButton.props.attrs, false);

  const surfaceImage = findNode(surface.root, node => node.surfaceKind === "html-element" && node.props?.attrs?.src === "img/mill-iq.png");
  assert.ok(surfaceImage);
  assert.equal("style" in surfaceImage.props.attrs, false);
  assert.ok(snapshot.wcss.inlineDeclarationSets.some(set => set.nodeId === surfaceImage.sourceNodeId));
});

test("WHTML/WCSS remains absent from the constrained public MCP authoring surface", () => {
  const policy = createRuntimeAuthoringPolicy({ mode: AUTHORING_MODE_MCP_ONLY });
  const matrix = buildRuntimeAuthoringCapabilityMatrix(policy);

  assert.equal(policy.publicMcpActions.includes("whtml.create"), false);
  assert.equal(policy.publicMcpActions.includes("wcss.create"), false);
  assert.equal(policy.publicMcpActions.includes("widget.create"), false);
  assert.equal(matrix.publicAuthoringConcepts.whtml, undefined);
  assert.equal(matrix.publicAuthoringConcepts.wcss, undefined);
  assert.equal(matrix.runtimeConsumers["page.surface"].pathwaySemantics.urlToRouteState.status, "blocked");
});
