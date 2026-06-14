import test from "node:test";
import assert from "node:assert/strict";
import {
  extractBootstrapBodyInner,
  renderBootstrapAuthoredSlot,
  renderBootstrapAuthoredWidget,
  renderBootstrapJsonForScript,
  replaceBootstrapSectionSlot,
  replaceBootstrapWholeSection
} from "./bootstrap-page-helpers.js";

test("bootstrap page helpers own safe JSON escaping for embedded bootstrap state", () => {
  const serialized = renderBootstrapJsonForScript({
    note: "keep <tags> & separators > safe"
  });

  assert.match(serialized, /\\u003ctags\\u003e/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u003e safe/);
});

test("bootstrap page helpers extract authored body markup and replace slot content mechanically", () => {
  const body = extractBootstrapBodyInner("<html><body><section id=\"slot\">original</section></body></html>");
  const replacedSection = replaceBootstrapSectionSlot(body, "slot", "<div>patched</div>");
  const replacedWhole = replaceBootstrapWholeSection(body, "slot", "<article id=\"replacement\"></article>");

  assert.equal(body, "<section id=\"slot\">original</section>");
  assert.equal(replacedSection, "<section id=\"slot\"><div>patched</div></section>");
  assert.equal(replacedWhole, "<article id=\"replacement\"></article>");
});

test("bootstrap page helpers render authored widgets through the shared bootstrap WTOML path", () => {
  const html = renderBootstrapAuthoredWidget({
    wtomlFile: "bootstrap-page-main.wtoml",
    rootWidget: "bootstrap_page_main_root"
  });

  assert.match(html, /<main[^>]*>/);
  assert.match(html, /bootstrap-top-cards-slot/);
  assert.doesNotMatch(html, /<body/i);
});

test("bootstrap page helpers can render authored slot wrappers with seeded state and replacement content", () => {
  const html = renderBootstrapAuthoredSlot({
    wtomlFile: "bootstrap-top-cards.wtoml",
    rootWidget: "bootstrap_top_cards_root",
    frontendProgram: "bootstrap_top_cards_program",
    frontendProgramScriptId: "witness-bootstrap-top-cards-program",
    initialStateScriptId: "witness-bootstrap-top-cards-initial-state",
    initialStateInto: "bootstrapIdentityView",
    initialState: {
      mode: "edit",
      fields: {
        id: "identity.alice"
      }
    },
    replacementSlotDomId: "bootstrap-guidance-card-slot",
    replacementHtml: "<aside id=\"guidance\">Guidance</aside>"
  });

  assert.match(html, /witness-bootstrap-top-cards-initial-state/);
  assert.match(html, /identity\.alice/);
  assert.match(html, /<aside id="guidance">Guidance<\/aside>/);
});
