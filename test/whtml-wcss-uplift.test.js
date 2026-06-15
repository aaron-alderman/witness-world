import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  addSymmetryBreak,
  addSymmetryGroup,
  createSymmetryBreak,
  createSymmetryGroup,
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
  const [uplift, desireSpa, policy, playbook] = await Promise.all([
    readFile(path.join(process.cwd(), "docs", "WHTML-WCSS-UPLIFT.md"), "utf8"),
    readFile(path.join(process.cwd(), "docs", "DESIRE-SPA.md"), "utf8"),
    readFile(path.join(process.cwd(), "docs", "LLM-AUTHORING-POLICY.md"), "utf8"),
    readFile(path.join(process.cwd(), "docs", "AUTHORING-REPLAY-PLAYBOOK.md"), "utf8")
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
