// The Hearth surface — authored in a small, platform-agnostic vocabulary.
//
// This is the net-new "clean surface seam": no DOM, no HTML, no inline styles.
// Just intent. A shell renders these primitives natively — the browser shell in
// server.js today, a React Native shell next. The same tree drives both.
//
// Bounded vocabulary (the whole language a shell must know):
//   screen   — the page root
//   group    — a layout grouping
//   text     — a label; `text` literal, or `bind` to resolve from data
//   list     — `bind` an array; `item` is the per-row template; `empty` copy
//   field    — an input; `fieldKind` text; `bind` to a data key
//   action   — fires an `intent`; optional `arg` (e.g. item.id) or `from` (a field)
//
// Bindings are dotted paths into the bound data: `chores`, `item.text`, `draft`.

export const HEARTH_SURFACE = {
  surface: "hearth.home",
  title: "Hearth",
  view: {
    kind: "screen",
    children: [
      { kind: "text", role: "title", text: "Hearth" },
      {
        kind: "list",
        bind: "chores",
        empty: "No chores. Nice.",
        item: {
          kind: "group",
          role: "row",
          children: [
            { kind: "text", bind: "item.text" },
            { kind: "action", intent: "complete", arg: "item.id", label: "Done" }
          ]
        }
      },
      {
        kind: "group",
        role: "composer",
        children: [
          { kind: "field", fieldKind: "text", bind: "draft", placeholder: "New chore…" },
          { kind: "action", intent: "add", from: "draft", label: "Add" }
        ]
      }
    ]
  }
};
