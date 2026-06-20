export function createOperatorExampleState() {
  const leftRows = [
    {
      index: 1,
      type: "container",
      actionable: true,
      label: "Session",
      summary: "Selection, aliases, notes, programs"
    },
    {
      index: 2,
      type: "container",
      actionable: true,
      label: "World",
      summary: "Contexts, things, processes, traits"
    },
    {
      index: 3,
      type: "container",
      actionable: true,
      label: "Platform",
      summary: "Docs, inventory, ownership, provenance"
    }
  ];
  return {
    viewportId: "default",
    focusedPane: "left",
    focusedSurfaceId: "session_reader",
    overlays: [],
    topCursor: 0,
    leftCursor: 0,
    rightCursor: 0,
    viewportLayout: {
      top: 3,
      bottom: 4,
      leftWeight: 28,
      rightWeight: 72
    },
    viewportLayoutDraft: null,
    scrollBySurfaceId: {
      session_reader: { x: 0, y: 0 }
    },
    leftPane: {
      mode: "tree",
      shape: "tree",
      title: "Operator Navigation",
      header: "root",
      helpText: "Browse the current navigation tree and activate rows to open containers or inspect targets.",
      columns: [],
      rows: leftRows,
      cursor: 0,
      rowCount: leftRows.length,
      paging: null,
      activeRow: leftRows[0]
    },
    snapshot: {
      viewport: {
        id: "default",
        theme: "ansi16",
        layout: {
          top: 3,
          bottom: 4,
          leftWeight: 28,
          rightWeight: 72
        }
      },
      ui: {
        focusedPane: "left"
      },
      topPane: {
        navigation: {
          chips: [
            { label: "root" },
            { label: "preview ready" },
            { label: "Inspect" }
          ],
          selectedIndex: 0
        }
      },
      rightPane: {
        title: "Session",
        activeScreenId: "inspect",
        bodyLines: [
          "Session :: Selection, aliases, notes, preview session, and mini-programs.",
          "This text reader is intentionally long so horizontal scrolling is a first-class concern.",
          "Properties view tokens should become links in later tranches.",
          "Ownership and provenance can lower into the same navigable tree surface family.",
          "JSON source belongs in a custom structured reader instead of a generic text box."
        ],
        screen: {
          title: "Inspect",
          detailLines: []
        }
      }
    }
  };
}
