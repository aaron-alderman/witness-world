const OPERATOR_WORKBENCH_SNAPSHOT_FIXTURE = {
  "mode": "detached",
  "path": "root",
  "focus": {
    "kind": null,
    "id": null,
    "active": false
  },
  "preview": {
    "available": true,
    "writable": true,
    "sessionId": null,
    "baseAppRevision": null,
    "previewRevision": 0,
    "status": "inactive",
    "invalidReason": null,
    "lastMutation": null
  },
  "session": {
    "selectionId": null,
    "worldRecordCount": 21,
    "platformRecordCount": 11559,
    "appRoot": null,
    "worldHome": null
  },
  "ui": {
    "focusedPane": "left",
    "inspectorTab": "inspect",
    "rightScreenMode": "custom-screen",
    "openOverlayIds": [],
    "overlayStateById": {},
    "activeOverlayId": null,
    "helpOpen": false,
    "contextMenuOpen": false,
    "contextMenuContext": null,
    "rightSectionIndex": 0,
    "rightSectionCursorsByScreenId": {},
    "collapsedSectionIdsByScreenId": {},
    "numberBuffer": "",
    "lastOutput": "",
    "lastStatus": "info",
    "displaySettings": {}
  },
  "contextMenu": {
    "frameTitle": "Context",
    "title": "Context",
    "subject": "Session",
    "placement": "center",
    "marginX": 2,
    "marginY": 1,
    "titleInsetX": 2,
    "width": 24,
    "height": 8,
    "bodyInsetX": 2,
    "bodyInsetY": 1,
    "contentWidth": 20,
    "contentHeight": 6,
    "lineCount": 4,
    "visibleLineCount": 4,
    "overflowLineCount": 0,
    "lines": [
      "1. Edit :: pane:left",
      "2. Change Color :: surface theme",
      "3. Rename :: Session",
      "4. Clone :: Session"
    ],
    "visibleLines": [
      "1. Edit :: pane:left",
      "2. Change Color :: …",
      "3. Rename :: Session",
      "4. Clone :: Session"
    ],
    "context": {
      "pane": "left",
      "rowIndex": 0,
      "rowType": "container",
      "rowLabel": "Session",
      "targetId": "session",
      "primaryCommand": "open 1"
    },
    "items": [
      {
        "id": "edit",
        "label": "Edit",
        "shortcut": "1",
        "detail": "pane:left",
        "enabled": true,
        "action": {
          "kind": "hook",
          "hook": "edit",
          "subject": "Session",
          "context": {
            "pane": "left",
            "rowIndex": 0,
            "rowType": "container",
            "rowLabel": "Session",
            "targetId": "session",
            "primaryCommand": "open 1"
          }
        }
      },
      {
        "id": "change-color",
        "label": "Change Color",
        "shortcut": "2",
        "detail": "surface theme",
        "enabled": true,
        "action": {
          "kind": "hook",
          "hook": "change-color",
          "subject": "Session",
          "context": {
            "pane": "left",
            "rowIndex": 0,
            "rowType": "container",
            "rowLabel": "Session",
            "targetId": "session",
            "primaryCommand": "open 1"
          }
        }
      },
      {
        "id": "rename",
        "label": "Rename",
        "shortcut": "3",
        "detail": "Session",
        "enabled": true,
        "action": {
          "kind": "hook",
          "hook": "rename",
          "subject": "Session",
          "context": {
            "pane": "left",
            "rowIndex": 0,
            "rowType": "container",
            "rowLabel": "Session",
            "targetId": "session",
            "primaryCommand": "open 1"
          }
        }
      },
      {
        "id": "clone",
        "label": "Clone",
        "shortcut": "4",
        "detail": "Session",
        "enabled": true,
        "action": {
          "kind": "hook",
          "hook": "clone",
          "subject": "Session",
          "context": {
            "pane": "left",
            "rowIndex": 0,
            "rowType": "container",
            "rowLabel": "Session",
            "targetId": "session",
            "primaryCommand": "open 1"
          }
        }
      }
    ]
  },
  "screens": {
    "activeScreenId": "inspect",
    "available": [
      {
        "id": "operator_trace",
        "title": "Operator Trace",
        "subtitle": "Browser-first operator example",
        "shape": "list-detail",
        "datasetId": null,
        "dataSource": null,
        "shortcut": "F5",
        "origin": "authored"
      },
      {
        "id": "references",
        "title": "References",
        "subtitle": "Linked records, breadcrumbs, and operator addresses.",
        "shape": "list-detail",
        "datasetId": "builtin.references",
        "dataSource": "references",
        "shortcut": "F2",
        "origin": "builtin"
      },
      {
        "id": "inspect",
        "title": "Inspect",
        "subtitle": "Record and container detail for the current selection.",
        "shape": "detail",
        "datasetId": "builtin.inspect",
        "dataSource": "inspect",
        "shortcut": null,
        "origin": "builtin"
      },
      {
        "id": "source",
        "title": "Source",
        "subtitle": "Source-backed authored locations and excerpts.",
        "shape": "list-detail",
        "datasetId": "builtin.source",
        "dataSource": "source",
        "shortcut": "F3",
        "origin": "builtin"
      },
      {
        "id": "provenance",
        "title": "Provenance",
        "subtitle": "Authored and runtime trace for the current target.",
        "shape": "list-detail",
        "datasetId": "builtin.provenance",
        "dataSource": "provenance",
        "shortcut": "F4",
        "origin": "builtin"
      }
    ],
    "shortcuts": [
      {
        "shortcut": "F2",
        "screenId": "references",
        "title": "References",
        "origin": "builtin"
      },
      {
        "shortcut": "F3",
        "screenId": "source",
        "title": "Source",
        "origin": "builtin"
      },
      {
        "shortcut": "F4",
        "screenId": "provenance",
        "title": "Provenance",
        "origin": "builtin"
      },
      {
        "shortcut": "F5",
        "screenId": "operator_trace",
        "title": "Operator Trace",
        "origin": "authored"
      }
    ]
  },
  "viewport": {
    "id": "operator_default",
    "title": "Default Browser Workbench",
    "theme": "ansi16",
    "themeSpec": {
      "id": "ansi16",
      "title": "ANSI 16",
      "mode": "ansi16",
      "palette": "terminal-dark",
      "origin": "authored"
    },
    "screenId": "operator_trace",
    "leftScreenId": "operator_left",
    "topSurfaceId": "top_status",
    "bottomSurfaceId": "command_bar",
    "topHandleId": "top_handle",
    "bottomHandleId": "bottom_handle",
    "splitHandleId": "split_handle",
    "width": 80,
    "height": 30,
    "top": 3,
    "bottom": 4,
    "splitOrientation": "horizontal",
    "leftWeight": 28,
    "rightWeight": 72,
    "layout": {
      "top": 3,
      "bottom": 4,
      "leftWeight": 28,
      "rightWeight": 72
    },
    "overlays": [
      "help_overlay",
      "context_menu"
    ],
    "bindings": [
      {
        "trigger": "F1",
        "verb": "overlay",
        "target": "help_overlay"
      },
      {
        "trigger": "MouseSecondary",
        "verb": "overlay",
        "target": "context_menu"
      },
      {
        "trigger": "Alt-R",
        "verb": "action",
        "target": "rename"
      },
      {
        "trigger": "F2",
        "verb": "action",
        "target": "rename"
      }
    ]
  },
  "topPane": {
    "frameTitle": "Status",
    "title": "Operator Workbench",
    "subtitle": "global",
    "titleLine": "Operator Workbench :: global",
    "navigationLine": "NAV [root] [preview ready] [Inspect]",
    "statusLine": "MODE preview-read",
    "metaChips": [
      {
        "id": "viewport",
        "type": "viewport",
        "label": "viewport:operator_default"
      },
      {
        "id": "theme",
        "type": "theme",
        "label": "theme:ansi16"
      },
      {
        "id": "pane",
        "type": "pane",
        "label": "pane:left"
      }
    ],
    "navigation": {
      "chips": [
        {
          "id": "root",
          "type": "root",
          "label": "root",
          "tone": "default",
          "active": true,
          "helpText": "Return to the current semantic root.",
          "action": {
            "kind": "command",
            "command": "home"
          }
        },
        {
          "id": "preview",
          "type": "preview",
          "label": "preview ready",
          "tone": "default",
          "active": false,
          "helpText": "Open preview status for this detached session.",
          "action": {
            "kind": "command",
            "command": "preview"
          }
        },
        {
          "id": "mode",
          "type": "mode",
          "label": "Inspect",
          "tone": "default",
          "active": true,
          "helpText": "Cycle the right-pane mode.",
          "action": {
            "kind": "cycle-mode",
            "screenMode": "custom-screen",
            "screenId": "inspect"
          }
        }
      ],
      "selectedIndex": 0
    }
  },
  "bottomPane": {
    "frameTitle": "Commands",
    "commandText": ": screen inspect",
    "hintText": "F1 help | Right click menu | Drag handles resize"
  },
  "helpOverlay": {
    "frameTitle": "Help",
    "context": "Operator Navigation | Authored",
    "summary": "Move the active row, then Enter to open Session.",
    "placement": "center",
    "marginX": 2,
    "marginY": 1,
    "titleInsetX": 2,
    "width": 56,
    "height": 10,
    "bodyInsetX": 2,
    "bodyInsetY": 1,
    "contentWidth": 52,
    "contentHeight": 8,
    "lineCount": 4,
    "visibleLineCount": 4,
    "overflowLineCount": 0,
    "lines": [
      "F1 opens the authored help surface.",
      "Right click opens the centered context menu surface.",
      "Drag pane handles to resize the authored split layout.",
      "Active right pane: Session."
    ],
    "visibleLines": [
      "F1 opens the authored help surface.",
      "Right click opens the centered context menu surface.",
      "Drag pane handles to resize the authored split layout.",
      "Active right pane: Session."
    ]
  },
  "overlays": [
    {
      "frameTitle": "Help",
      "title": "help_overlay",
      "placement": "center",
      "marginX": 2,
      "marginY": 1,
      "titleInsetX": 2,
      "width": 56,
      "height": 10,
      "bodyInsetX": 2,
      "bodyInsetY": 1,
      "contentWidth": 52,
      "contentHeight": 8,
      "lineCount": 4,
      "visibleLineCount": 4,
      "overflowLineCount": 0,
      "lines": [
        "F1 opens the authored help surface.",
        "Right click opens the centered context menu surface.",
        "Drag pane handles to resize the authored split layout.",
        "Active right pane: Session."
      ],
      "visibleLines": [
        "F1 opens the authored help surface.",
        "Right click opens the centered context menu surface.",
        "Drag pane handles to resize the authored split layout.",
        "Active right pane: Session."
      ],
      "id": "help_overlay",
      "kind": "doc_view",
      "policy": {
        "closeIdsOnOpen": [
          "context_menu"
        ]
      },
      "resizable": true,
      "scroll": [],
      "origin": "authored",
      "pluginId": "plugin.operator-workbench",
      "source": {
        "file": "examples/operator/browser/operator.workbench.rvm",
        "line": 22
      }
    },
    {
      "frameTitle": "Context",
      "title": "Context",
      "placement": "center",
      "marginX": 2,
      "marginY": 1,
      "titleInsetX": 2,
      "width": 24,
      "height": 8,
      "bodyInsetX": 2,
      "bodyInsetY": 1,
      "contentWidth": 20,
      "contentHeight": 6,
      "lineCount": 4,
      "visibleLineCount": 4,
      "overflowLineCount": 0,
      "lines": [
        "1. Edit :: pane:left",
        "2. Change Color :: surface theme",
        "3. Rename :: Session",
        "4. Clone :: Session"
      ],
      "visibleLines": [
        "1. Edit :: pane:left",
        "2. Change Color :: â€¦",
        "3. Rename :: Session",
        "4. Clone :: Session"
      ],
      "id": "context_menu",
      "kind": "menu",
      "policy": {
        "closeIdsOnOpen": [
          "help_overlay"
        ]
      },
      "resizable": false,
      "scroll": [],
      "origin": "authored",
      "pluginId": "plugin.operator-workbench",
      "source": {
        "file": "examples/operator/browser/operator.workbench.rvm",
        "line": 15
      }
    }
  ],
  "leftPane": {
    "mode": "tree",
    "screenId": "operator_left",
    "shape": "tree",
    "dataSource": "navigation",
    "title": "Operator Navigation",
    "header": "root",
    "path": "root",
    "helpText": "Browse the current navigation tree and activate rows to open containers or inspect targets.",
    "origin": "authored",
    "overlay": false,
    "columns": [],
    "rows": [
      {
        "index": 1,
        "type": "container",
        "actionable": true,
        "primaryAction": {
          "command": "open 1",
          "label": "open"
        },
        "selected": false,
        "summary": "Selection, aliases, notes, preview session, and mini-programs.",
        "label": "Session",
        "columns": null,
        "target": "session"
      },
      {
        "index": 2,
        "type": "container",
        "actionable": true,
        "primaryAction": {
          "command": "open 2",
          "label": "open"
        },
        "selected": false,
        "summary": "Live modeled world graph in detached mode.",
        "label": "World",
        "columns": null,
        "target": "world"
      },
      {
        "index": 3,
        "type": "container",
        "actionable": true,
        "primaryAction": {
          "command": "open 3",
          "label": "open"
        },
        "selected": false,
        "summary": "Platform self-model, docs, tests, and runtime inventory.",
        "label": "Platform",
        "columns": null,
        "target": "platform"
      }
    ],
    "cursor": 0,
    "activeRowIndex": 0,
    "activeRow": {
      "index": 1,
      "type": "container",
      "actionable": true,
      "primaryAction": {
        "command": "open 1",
        "label": "open"
      },
      "selected": false,
      "summary": "Selection, aliases, notes, preview session, and mini-programs.",
      "label": "Session",
      "columns": null,
      "target": "session"
    },
    "rowCount": 3,
    "paging": null
  },
  "rightPane": {
    "title": "Session",
    "screenMode": "custom-screen",
    "activeScreenId": "inspect",
    "screen": {
      "id": "inspect",
      "title": "Session",
      "subtitle": "Record and container detail for the current selection.",
      "shape": "detail",
      "dataSource": "inspect",
      "datasetId": "builtin.inspect",
      "provider": "inspect",
      "helpText": "Review the current target detail and switch tabs for references, source, or provenance.",
      "emptyMessage": "Select a record to inspect.",
      "columns": [],
      "rows": [],
      "activeRowIndex": 0,
      "activeSectionIndex": 0,
      "activeSectionId": "inspect.main",
      "activeSectionTitle": "Session",
      "activeSectionRowCount": 0,
      "activeSectionActionable": false,
      "activeSectionCollapsible": true,
      "activeSectionCollapsed": false,
      "sections": [
        {
          "id": "inspect.main",
          "title": "Session",
          "kind": "detail",
          "shape": "detail",
          "dataSource": "inspect",
          "datasetId": "builtin.inspect",
          "provider": "inspect",
          "emptyMessage": "Select a record to inspect.",
          "columns": [],
          "rows": [],
          "activeRowIndex": 0,
          "detailLines": [
            "Session",
            "id: session",
            "kind: container",
            "summary: Selection, aliases, notes, preview session, and mini-programs."
          ],
          "collapsible": true,
          "collapsed": false,
          "actionable": false,
          "origin": "builtin"
        }
      ],
      "detailLines": [
        "Session",
        "id: session",
        "kind: container",
        "summary: Selection, aliases, notes, preview session, and mini-programs."
      ],
      "origin": "builtin",
      "shortcut": null
    },
    "activeSection": {
      "id": "inspect.main",
      "title": "Session",
      "rowCount": 0,
      "actionable": false,
      "collapsible": true,
      "collapsed": false
    },
    "tab": "inspect",
    "bodyLines": [
      "Session",
      "id: session",
      "kind: container",
      "summary: Selection, aliases, notes, preview session, and mini-programs."
    ],
    "references": [],
    "referencesWorkbench": {
      "title": "Session References",
      "groups": [],
      "rows": [],
      "activeRowIndex": 0,
      "detailLines": [
        "Select a reference to inspect its address and action."
      ]
    },
    "sourceWorkbench": {
      "title": "Source",
      "rows": [],
      "activeRowIndex": 0,
      "detailLines": [
        "No source target selected."
      ],
      "target": null
    },
    "sourceEntries": [],
    "activeSourceIndex": 0,
    "provenanceWorkbench": {
      "title": "Provenance",
      "rows": [],
      "activeRowIndex": 0,
      "detailLines": [
        "No provenance target selected."
      ],
      "target": null
    },
    "provenanceEntries": [],
    "activeProvenanceIndex": 0,
    "provenanceDetailLines": [
      "Provenance unavailable for this target."
    ],
    "cursor": 0,
    "target": {
      "kind": "container",
      "id": "session",
      "label": "Session",
      "pinned": false,
      "mode": "container"
    },
    "previewInspection": null,
    "tabs": {
      "inspect": true,
      "references": true,
      "source": true,
      "provenance": true
    }
  }
};

export function createOperatorWorkbenchSnapshotFixture() {
  return structuredClone(OPERATOR_WORKBENCH_SNAPSHOT_FIXTURE);
}

export { OPERATOR_WORKBENCH_SNAPSHOT_FIXTURE };
