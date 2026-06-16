import assert from "node:assert/strict";
import test from "node:test";
import {
  createWcssStylesheet,
  group,
  keyframes,
  media,
  renderWcssStylesheet,
  rule
} from "../src/uplift/wcss-grammar.js";

test("nested WCSS grammar renders nested selectors, media rules, and keyframes deterministically", () => {
  const stylesheet = createWcssStylesheet({
    name: "Example theme",
    blocks: [
      group("tokens", [
        rule(":root", {
          "--accent": "#123456"
        })
      ]),
      group("button", [
        rule(".btn", {
          color: "white",
          background: "var(--accent)"
        }, [
          rule("&:hover", {
            opacity: ".9"
          }),
          rule(".btn__icon", {
            width: "12px"
          })
        ])
      ]),
      keyframes("fadeIn", [
        { step: "from", declarations: { opacity: "0" } },
        { step: "to", declarations: { opacity: "1" } }
      ]),
      media("(max-width: 640px)", [
        rule(".btn", {
          width: "100%"
        })
      ])
    ]
  });

  const rendered = renderWcssStylesheet(stylesheet, {
    banner: "Generated for test"
  });

  assert.match(rendered, /\/\* Generated for test \*\//);
  assert.match(rendered, /\/\* Example theme \*\//);
  assert.match(rendered, /\/\* button \*\//);
  assert.match(rendered, /\.btn \{\n  color: white;\n  background: var\(--accent\);\n\}/);
  assert.match(rendered, /\.btn:hover \{\n  opacity: \.9;\n\}/);
  assert.match(rendered, /\.btn \.btn__icon \{\n  width: 12px;\n\}/);
  assert.match(rendered, /@keyframes fadeIn \{/);
  assert.match(rendered, /@media \(max-width: 640px\) \{/);
});
