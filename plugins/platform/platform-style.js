import {
  createWcssStylesheet,
  group,
  media,
  renderWcssStylesheet,
  rule
} from "../../src/uplift/wcss-grammar.js";

export function createPlatformConsoleStylesheet() {
  return createWcssStylesheet({
    name: "platform-console",
    blocks: [
      group("tokens", [
        rule(":root", {
          "--platform-ink": "#172026",
          "--platform-muted": "#5b6670",
          "--platform-line": "#d8dee4",
          "--platform-wash": "#f6f8fa",
          "--platform-accent": "#1f6feb",
          "--platform-ok": "#1a7f37",
          "--platform-warn": "#9a6700"
        })
      ]),
      group("shell", [
        rule("body.platform-console", {
          margin: "0",
          font: "14px/1.45 system-ui, -apple-system, Segoe UI, sans-serif",
          color: "var(--platform-ink)",
          background: "white"
        }),
        rule("body.platform-console header", {
          padding: "20px 24px 14px",
          "border-bottom": "1px solid var(--platform-line)",
          background: "#fff",
          position: "sticky",
          top: "0",
          "z-index": "2"
        }),
        rule("body.platform-console main", {
          padding: "20px 24px 40px",
          display: "grid",
          gap: "22px"
        })
      ]),
      group("type", [
        rule("body.platform-console h1", { margin: "0 0 4px", "font-size": "24px" }),
        rule("body.platform-console h2", { margin: "0 0 12px", "font-size": "18px" }),
        rule("body.platform-console h3", { margin: "0 0 8px", "font-size": "14px", "text-transform": "capitalize" }),
        rule(".muted", { color: "var(--platform-muted)" }),
        rule(".metric", { "font-size": "24px", "font-weight": "700" })
      ]),
      group("layout", [
        rule(".summary", {
          display: "grid",
          "grid-template-columns": "repeat(auto-fit, minmax(130px, 1fr))",
          gap: "10px"
        }),
        rule(".board", {
          display: "grid",
          "grid-template-columns": "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "10px"
        }),
        rule(".grid2", {
          display: "grid",
          "grid-template-columns": "minmax(0, 1fr) minmax(320px, .55fr)",
          gap: "18px",
          "align-items": "start"
        }),
        rule(".platform-branch-summary", {
          display: "grid",
          gap: "10px",
          "grid-template-columns": "repeat(auto-fit, minmax(180px, 1fr))",
          margin: "12px 0 0"
        })
      ]),
      group("panels", [
        rule(".card", {
          border: "1px solid var(--platform-line)",
          "border-radius": "8px",
          padding: "12px",
          background: "#fff"
        }),
        rule(".platform-column", {
          border: "1px solid var(--platform-line)",
          "border-radius": "8px",
          background: "var(--platform-wash)",
          padding: "10px",
          "min-height": "120px"
        }),
        rule(".platform-chip", {
          background: "#fff",
          border: "1px solid var(--platform-line)",
          "border-radius": "6px",
          padding: "7px 8px",
          margin: "6px 0"
        }),
        rule(".platform-chip span", {
          color: "var(--platform-muted)",
          "font-size": "12px",
          float: "right"
        })
      ]),
      group("tables", [
        rule("table", {
          "border-collapse": "collapse",
          width: "100%",
          background: "#fff",
          border: "1px solid var(--platform-line)",
          "border-radius": "8px",
          overflow: "hidden"
        }),
        rule("th, td", {
          "text-align": "left",
          "border-bottom": "1px solid var(--platform-line)",
          padding: "8px 10px",
          "vertical-align": "top"
        }),
        rule("th", {
          background: "var(--platform-wash)",
          "font-size": "12px",
          "text-transform": "uppercase",
          color: "var(--platform-muted)"
        }),
        rule("tr:last-child td", { "border-bottom": "0" })
      ]),
      group("forms", [
        rule("form", { display: "grid", gap: "10px" }),
        rule("label", { display: "grid", gap: "4px", "font-weight": "600" }),
        rule("input, select, textarea, button", { font: "inherit" }),
        rule("input, select, textarea", {
          border: "1px solid var(--platform-line)",
          "border-radius": "6px",
          padding: "8px"
        }),
        rule("textarea", {
          "min-height": "110px",
          "font-family": "ui-monospace, SFMono-Regular, Consolas, monospace"
        }),
        rule("button", {
          border: "1px solid var(--platform-accent)",
          background: "var(--platform-accent)",
          color: "white",
          "border-radius": "6px",
          padding: "8px 10px",
          cursor: "pointer"
        }),
        rule("#proposal-status, #review-status", {
          color: "var(--platform-muted)",
          "min-height": "20px"
        })
      ]),
      media("(max-width: 880px)", [
        rule(".grid2", { "grid-template-columns": "1fr" }),
        rule("body.platform-console header, body.platform-console main", {
          "padding-left": "14px",
          "padding-right": "14px"
        })
      ])
    ]
  });
}

export function renderPlatformConsoleCss() {
  return renderWcssStylesheet(createPlatformConsoleStylesheet(), {
    banner: "Generated from plugins/platform/platform-console.wcss"
  });
}
