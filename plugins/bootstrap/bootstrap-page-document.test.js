import test from "node:test";
import assert from "node:assert/strict";
import { renderBootstrapPageDocument } from "./bootstrap-page-document.js";

test("bootstrap page document renders the outer html/body/script wrapper around injected parts", () => {
  const html = renderBootstrapPageDocument({
    headHtml: "<head><title>Doc</title></head>",
    bodyHtml: "<header>Body</header>",
    scriptBody: "const value = 1;"
  });

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html>/);
  assert.match(html, /<head><title>Doc<\/title><\/head>/);
  assert.match(html, /<body>/);
  assert.match(html, /<header>Body<\/header>/);
  assert.match(html, /<script>/);
  assert.match(html, /const value = 1;/);
  assert.match(html, /<\/html>$/);
});
