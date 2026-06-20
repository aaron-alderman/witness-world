export function createOperatorExampleState() {
  return {
    viewportId: "default",
    focusedSurfaceId: "session_reader",
    overlays: [],
    splits: {
      top: 3,
      bottom: 4,
      leftWeight: 28,
      rightWeight: 72
    },
    scrollBySurfaceId: {
      session_reader: { x: 0, y: 0 }
    },
    treeRows: [
      { label: "Session", detail: "Selection, aliases, notes, programs" },
      { label: "World", detail: "Contexts, things, processes, traits" },
      { label: "Platform", detail: "Docs, inventory, ownership, provenance" }
    ],
    sessionLines: [
      "Session :: Selection, aliases, notes, preview session, and mini-programs.",
      "This text reader is intentionally long so horizontal scrolling is a first-class concern.",
      "Properties view tokens should become links in later tranches.",
      "Ownership and provenance can lower into the same navigable tree surface family.",
      "JSON source belongs in a custom structured reader instead of a generic text box."
    ],
    commandText: ": inspect this",
    helpLines: [
      "F1 opens the authored help surface.",
      "Right click opens the centered context menu surface.",
      "Drag pane handles to resize the authored split layout.",
      "Arrow keys scroll the active text-reader surface."
    ],
    contextMenuItems: ["Edit", "Change Color", "Rename", "Clone"],
    statusChips: ["viewport:default", "theme:ansi16", "surface:session_reader"]
  };
}
