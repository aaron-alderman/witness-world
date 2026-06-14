export const EDEN_PAGE_CSS = `
  :root {
    --eden-bg: #efe7d7;
    --eden-panel: #fbf7ef;
    --eden-line: #8f8267;
    --eden-ink: #2b241c;
    --eden-green: #8aa36c;
    --eden-pipe: #7c6756;
    --eden-wire: #b08b4f;
    --eden-path: #a5a187;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", Tahoma, sans-serif;
    background:
      radial-gradient(circle at top, rgba(255,255,255,0.45), transparent 35%),
      linear-gradient(180deg, #f5efdf 0%, var(--eden-bg) 100%);
    color: var(--eden-ink);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .eden-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(43, 36, 28, 0.14);
    background: rgba(251, 247, 239, 0.8);
    backdrop-filter: blur(10px);
  }
  .eden-toolbar strong { letter-spacing: 0.04em; text-transform: uppercase; font-size: 12px; }
  .eden-toolbar span { color: rgba(43, 36, 28, 0.72); font-size: 12px; }
  .eden-toolbar button, .eden-toolbar a {
    border: 1px solid rgba(43, 36, 28, 0.16);
    background: rgba(255,255,255,0.65);
    color: inherit;
    text-decoration: none;
    border-radius: 999px;
    padding: 6px 10px;
    cursor: pointer;
    font: inherit;
  }
  .eden-stage {
    position: relative;
    flex: 1;
    overflow: hidden;
    margin: 10px;
    border-radius: 18px;
    border: 1px solid rgba(43, 36, 28, 0.14);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0)),
      radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35), transparent 35%),
      #ede4d0;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.6), 0 10px 28px rgba(43, 36, 28, 0.08);
    cursor: grab;
  }
  .eden-stage.is-dragging { cursor: grabbing; }
  .eden-connections {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .eden-surfaces {
    position: absolute;
    inset: 0;
  }
  .eden-prompt {
    position: absolute;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(43, 36, 28, 0.9);
    color: #f9f4e8;
    font-size: 13px;
    letter-spacing: 0.01em;
    box-shadow: 0 8px 24px rgba(43, 36, 28, 0.22);
    z-index: 20;
  }
  .eden-status {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    padding: 7px 10px;
    border-radius: 999px;
    background: rgba(251, 247, 239, 0.92);
    border: 1px solid rgba(43, 36, 28, 0.12);
    color: rgba(43, 36, 28, 0.7);
    font-size: 12px;
    z-index: 20;
  }
  .eden-chapter {
    position: absolute;
    top: 14px;
    left: 14px;
    width: min(340px, calc(100% - 28px));
    padding: 14px 15px;
    border-radius: 18px;
    background: rgba(251, 247, 239, 0.94);
    border: 1px solid rgba(43, 36, 28, 0.12);
    box-shadow: 0 12px 30px rgba(43, 36, 28, 0.1);
    z-index: 20;
  }
  .eden-chapter[hidden] { display: none; }
  .eden-chapter-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(43, 36, 28, 0.52);
  }
  .eden-chapter-title {
    margin-top: 6px;
    font-size: 17px;
    font-weight: 600;
  }
  .eden-chapter-body {
    margin-top: 6px;
    font-size: 13px;
    line-height: 1.45;
    color: rgba(43, 36, 28, 0.76);
  }
  .eden-chapter-unlocks {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .eden-chapter-quests {
    display: grid;
    gap: 8px;
    margin-top: 12px;
  }
  .eden-chapter-tracks {
    display: grid;
    gap: 8px;
    margin-top: 12px;
  }
  .eden-chapter-quest {
    padding: 10px 11px;
    border-radius: 14px;
    border: 1px solid rgba(43, 36, 28, 0.12);
    background: rgba(255,255,255,0.72);
  }
  .eden-chapter-quest.is-completed {
    border-color: rgba(96, 123, 66, 0.24);
    background: rgba(138, 163, 108, 0.12);
  }
  .eden-chapter-quest.is-locked {
    border-style: dashed;
    background: rgba(237, 228, 208, 0.88);
  }
  .eden-chapter-quest-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .eden-chapter-quest-title {
    font-size: 13px;
    font-weight: 600;
    color: rgba(43, 36, 28, 0.86);
  }
  .eden-chapter-quest-state {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(43, 36, 28, 0.56);
  }
  .eden-chapter-quest-body {
    margin-top: 5px;
    font-size: 12px;
    line-height: 1.45;
    color: rgba(43, 36, 28, 0.74);
  }
  .eden-chapter-quest-note {
    margin-top: 5px;
    font-size: 11px;
    color: rgba(43, 36, 28, 0.58);
  }
  .eden-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid rgba(43, 36, 28, 0.12);
    background: rgba(255,255,255,0.7);
    color: rgba(43, 36, 28, 0.78);
    font-size: 12px;
    text-decoration: none;
  }
  .eden-chip.is-locked {
    border-style: dashed;
    opacity: 0.88;
    background: rgba(237, 228, 208, 0.9);
  }
  .eden-chip.is-open {
    background: rgba(138, 163, 108, 0.18);
    border-color: rgba(96, 123, 66, 0.2);
  }
  .eden-chip-note {
    color: rgba(43, 36, 28, 0.52);
    font-size: 11px;
  }
  .eden-surface {
    position: absolute;
    border-radius: 18px;
    border: 1px solid rgba(43, 36, 28, 0.14);
    background: var(--eden-panel);
    box-shadow: 0 10px 24px rgba(43, 36, 28, 0.12);
    overflow: hidden;
    transform-origin: 0 0;
    transition: box-shadow 140ms ease, transform 140ms ease, border-color 140ms ease;
  }
  .eden-surface[hidden] { display: none; }
  .eden-surface[data-relief="0"] { box-shadow: none; }
  .eden-surface[data-relief="1"] { box-shadow: 0 8px 20px rgba(43, 36, 28, 0.08); }
  .eden-surface[data-relief="2"] { box-shadow: 0 12px 28px rgba(43, 36, 28, 0.12); }
  .eden-surface[data-relief="3"] { box-shadow: 0 16px 34px rgba(43, 36, 28, 0.16); }
  .eden-surface[data-relief="4"] { box-shadow: 0 20px 40px rgba(43, 36, 28, 0.2); }
  .eden-surface.is-focused {
    border-color: rgba(96, 123, 66, 0.28);
  }
  .eden-surface-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(43, 36, 28, 0.08);
    background: linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0.25));
  }
  .eden-surface-title { font-size: 14px; font-weight: 600; }
  .eden-surface-subtitle { font-size: 12px; color: rgba(43, 36, 28, 0.62); }
  .eden-surface-body {
    padding: 14px;
    font-size: 13px;
    color: rgba(43, 36, 28, 0.76);
  }
  .eden-surface-body p {
    margin: 0;
    line-height: 1.45;
  }
  .eden-surface-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .eden-surface-tag {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(43, 36, 28, 0.06);
    font-size: 11px;
    color: rgba(43, 36, 28, 0.58);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .eden-surface-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 14px 14px;
  }
  .eden-surface-actions:empty { display: none; }
  .eden-surface-goto, .eden-surface-link {
    width: 100%;
    height: 100%;
    padding: 0;
    text-align: left;
    background: transparent;
    border: 0;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  .eden-surface-goto .eden-surface-header, .eden-surface-link .eden-surface-header { cursor: pointer; }
  .eden-surface-tree {
    border-radius: 999px;
    background:
      radial-gradient(circle at 50% 40%, rgba(255,255,255,0.35), transparent 35%),
      radial-gradient(circle at 50% 50%, #95ad73 0%, #7e9461 65%, #6d8152 100%);
    border: 1px solid rgba(43, 36, 28, 0.14);
    box-shadow: inset 0 2px 6px rgba(255,255,255,0.35), 0 10px 22px rgba(43, 36, 28, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 14px;
    color: #fffdf7;
    font-weight: 600;
  }
  .eden-surface-tree small {
    display: block;
    margin-top: 6px;
    font-weight: 400;
    opacity: 0.86;
  }
  .eden-tree-shell {
    width: 100%;
    max-width: 260px;
    display: grid;
    gap: 10px;
  }
  .eden-tree-card {
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 16px;
    background: rgba(61, 79, 47, 0.28);
    padding: 10px 12px;
    display: grid;
    gap: 6px;
    text-align: left;
    backdrop-filter: blur(3px);
  }
  .eden-tree-kicker {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255,253,247,0.78);
  }
  .eden-tree-line {
    font-size: 12px;
    color: rgba(255,253,247,0.94);
    line-height: 1.45;
  }
  .eden-tree-auth,
  .eden-tree-editor,
  .eden-tree-quests,
  .eden-tree-lessons {
    display: grid;
    gap: 8px;
  }
  .eden-tree-grid {
    display: grid;
    gap: 8px;
  }
  .eden-tree-grid input {
    width: 100%;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 12px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.12);
    color: #fffdf7;
  }
  .eden-tree-grid input::placeholder {
    color: rgba(255,253,247,0.7);
  }
  .eden-tree-textarea {
    width: 100%;
    min-height: 78px;
    resize: vertical;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 12px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.12);
    color: #fffdf7;
    font: inherit;
  }
  .eden-tree-textarea::placeholder {
    color: rgba(255,253,247,0.7);
  }
  .eden-tree-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .eden-tree-actions button {
    border: 1px solid rgba(255,255,255,0.22);
    border-radius: 999px;
    padding: 8px 12px;
    background: rgba(255,255,255,0.12);
    color: #fffdf7;
    cursor: pointer;
  }
  .eden-tree-actions button[disabled] {
    opacity: 0.56;
    cursor: default;
  }
  .eden-tree-status {
    min-height: 18px;
    font-size: 12px;
    color: rgba(255,253,247,0.92);
  }
  .eden-tree-status.is-error {
    color: #ffe0cf;
  }
  .eden-tree-status.is-ok {
    color: #f1ffd7;
  }
  .eden-tree-teachback-list {
    display: grid;
    gap: 8px;
  }
  .eden-tree-teachback-item {
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 12px;
    padding: 10px 12px;
    background: rgba(255,255,255,0.08);
  }
  .eden-tree-teachback-meta {
    margin-bottom: 6px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,253,247,0.72);
  }
  .eden-surface.is-chrome-tray .eden-surface-header {
    background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(248,242,229,0.4));
  }
  .eden-surface.is-chrome-shelf .eden-surface-header {
    background: linear-gradient(180deg, rgba(244, 233, 210, 0.92), rgba(255,255,255,0.38));
  }
  .eden-surface.is-chrome-machinePlate .eden-surface-header {
    background: linear-gradient(180deg, rgba(232, 223, 206, 0.92), rgba(255,255,255,0.3));
  }
  .eden-surface.is-chrome-mapWall .eden-surface-header {
    background: linear-gradient(180deg, rgba(239, 241, 228, 0.94), rgba(255,255,255,0.3));
  }
  .eden-embedded-frame {
    width: 100%;
    height: calc(100% - 126px);
    border: 0;
    background: #fff;
    pointer-events: none;
  }
  .eden-relief-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
  }
  .eden-relief-card {
    position: absolute;
    border: 1px solid rgba(43, 36, 28, 0.16);
    border-radius: 12px;
    background: rgba(251, 247, 239, 0.62);
    box-shadow: 0 8px 20px rgba(43, 36, 28, 0.08);
    backdrop-filter: blur(3px);
    pointer-events: auto;
    cursor: pointer;
    padding: 6px 8px;
    overflow: hidden;
    transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background 140ms ease;
  }
  .eden-relief-card[data-relief="0"] {
    background: rgba(251, 247, 239, 0.34);
    box-shadow: none;
  }
  .eden-relief-card[data-relief="1"] { box-shadow: 0 6px 16px rgba(43, 36, 28, 0.06); }
  .eden-relief-card[data-relief="2"] { box-shadow: 0 10px 22px rgba(43, 36, 28, 0.1); }
  .eden-relief-card[data-relief="3"] { box-shadow: 0 14px 28px rgba(43, 36, 28, 0.14); }
  .eden-relief-card[data-relief="4"] {
    box-shadow: 0 18px 34px rgba(43, 36, 28, 0.18);
    border-color: rgba(96, 123, 66, 0.28);
  }
  .eden-relief-card.is-signal {
    background: rgba(138, 163, 108, 0.14);
  }
  .eden-relief-card.is-focused {
    background: rgba(255,255,255,0.82);
  }
  .eden-relief-title {
    font-size: 11px;
    font-weight: 600;
    color: rgba(43, 36, 28, 0.86);
    line-height: 1.2;
  }
  .eden-relief-meta {
    margin-top: 3px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(43, 36, 28, 0.54);
  }
  .eden-embedded-actions {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    z-index: 3;
  }
  .eden-embedded-actions a, .eden-embedded-actions button {
    text-decoration: none;
    background: rgba(43, 36, 28, 0.92);
    color: #faf4ea;
    padding: 7px 11px;
    border-radius: 999px;
    font-size: 12px;
    border: 0;
    cursor: pointer;
    font: inherit;
  }
  .eden-embedded-actions button.is-active {
    background: rgba(73, 97, 50, 0.94);
  }
  .eden-embedded-actions button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .eden-embedded-mode {
    display: inline-flex;
    align-items: center;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(251, 247, 239, 0.94);
    border: 1px solid rgba(43, 36, 28, 0.14);
    color: rgba(43, 36, 28, 0.72);
    font-size: 11px;
  }
  .eden-connector-label {
    font: 12px "Segoe UI", Tahoma, sans-serif;
    fill: rgba(43, 36, 28, 0.72);
    paint-order: stroke;
    stroke: rgba(245, 239, 223, 0.95);
    stroke-width: 4px;
  }
  .eden-personal-auth, .eden-personal-editor, .eden-personal-items {
    margin-top: 12px;
  }
  .eden-personal-auth[hidden], .eden-personal-editor[hidden] { display: none; }
  .eden-personal-grid {
    display: grid;
    gap: 8px;
  }
  .eden-personal-grid input, .eden-personal-grid select {
    width: 100%;
    padding: 8px 9px;
    border-radius: 10px;
    border: 1px solid rgba(43, 36, 28, 0.16);
    background: rgba(255,255,255,0.84);
    color: inherit;
    font: inherit;
  }
  .eden-personal-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .eden-personal-actions button {
    border: 1px solid rgba(43, 36, 28, 0.14);
    background: rgba(255,255,255,0.78);
    color: inherit;
    border-radius: 999px;
    padding: 7px 11px;
    cursor: pointer;
    font: inherit;
  }
  .eden-personal-session {
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-personal-status {
    margin-top: 8px;
    min-height: 18px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-personal-status.is-error { color: #8a372f; }
  .eden-personal-status.is-ok { color: #496132; }
  .eden-personal-list {
    display: grid;
    gap: 8px;
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .eden-personal-item {
    padding: 10px;
    border-radius: 14px;
    border: 1px solid rgba(43, 36, 28, 0.12);
    background: rgba(255,255,255,0.72);
  }
  .eden-personal-item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .eden-personal-item-kind {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(43, 36, 28, 0.56);
  }
  .eden-personal-item-text {
    margin-top: 6px;
    line-height: 1.4;
    color: rgba(43, 36, 28, 0.8);
    word-break: break-word;
  }
  .eden-personal-item-link {
    color: #45612f;
    text-decoration: none;
  }
  .eden-personal-item-controls {
    display: flex;
    gap: 6px;
  }
  .eden-personal-item-controls button {
    border: 0;
    background: rgba(43, 36, 28, 0.08);
    color: inherit;
    border-radius: 999px;
    padding: 5px 8px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  .eden-personal-empty {
    padding: 12px;
    border-radius: 14px;
    border: 1px dashed rgba(43, 36, 28, 0.18);
    color: rgba(43, 36, 28, 0.58);
    background: rgba(255,255,255,0.45);
  }
  .eden-edit-auth, .eden-edit-editor, .eden-edit-preview {
    margin-top: 12px;
  }
  .eden-edit-auth[hidden], .eden-edit-editor[hidden] { display: none; }
  .eden-edit-grid {
    display: grid;
    gap: 8px;
  }
  .eden-edit-grid input, .eden-edit-grid select {
    width: 100%;
    padding: 8px 9px;
    border-radius: 10px;
    border: 1px solid rgba(43, 36, 28, 0.16);
    background: rgba(255,255,255,0.84);
    color: inherit;
    font: inherit;
  }
  .eden-edit-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .eden-edit-actions button {
    border: 1px solid rgba(43, 36, 28, 0.14);
    background: rgba(255,255,255,0.78);
    color: inherit;
    border-radius: 999px;
    padding: 7px 11px;
    cursor: pointer;
    font: inherit;
  }
  .eden-edit-session {
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-edit-status {
    margin-top: 8px;
    min-height: 18px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-edit-status.is-error { color: #8a372f; }
  .eden-edit-status.is-ok { color: #496132; }
  .eden-edit-preview-card {
    border: 1px solid rgba(43, 36, 28, 0.12);
    border-radius: 14px;
    padding: 12px;
    background: rgba(255,255,255,0.72);
    display: grid;
    gap: 6px;
  }
  .eden-edit-preview-kicker {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(43, 36, 28, 0.56);
  }
  .eden-edit-preview-line {
    font-size: 13px;
    color: rgba(43, 36, 28, 0.78);
  }
  .eden-version-auth, .eden-version-editor {
    margin-top: 12px;
  }
  .eden-version-auth[hidden], .eden-version-editor[hidden] { display: none; }
  .eden-version-grid {
    display: grid;
    gap: 10px;
  }
  .eden-version-grid input, .eden-version-grid select {
    width: 100%;
    padding: 8px 9px;
    border-radius: 10px;
    border: 1px solid rgba(43, 36, 28, 0.16);
    background: rgba(255,255,255,0.84);
    color: inherit;
    font: inherit;
  }
  .eden-version-session {
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-version-status {
    margin-top: 8px;
    min-height: 18px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-version-status.is-error { color: #8a372f; }
  .eden-version-status.is-ok { color: #496132; }
  .eden-version-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .eden-version-actions button {
    border: 1px solid rgba(43, 36, 28, 0.14);
    background: rgba(255,255,255,0.78);
    color: inherit;
    border-radius: 999px;
    padding: 7px 11px;
    cursor: pointer;
    font: inherit;
  }
  .eden-version-actions button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .eden-version-summary, .eden-version-list {
    display: grid;
    gap: 8px;
  }
  .eden-version-card, .eden-version-item {
    border: 1px solid rgba(43, 36, 28, 0.12);
    border-radius: 14px;
    background: rgba(255,255,255,0.72);
    padding: 10px 12px;
  }
  .eden-version-card.is-current, .eden-version-item.is-active {
    border-color: rgba(96, 123, 66, 0.24);
    background: rgba(138, 163, 108, 0.14);
  }
  .eden-version-card-kicker, .eden-version-item-meta {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(43, 36, 28, 0.56);
  }
  .eden-version-card-title, .eden-version-item-title {
    margin-top: 4px;
    font-size: 13px;
    font-weight: 600;
    color: rgba(43, 36, 28, 0.86);
  }
  .eden-version-card-body, .eden-version-item-preview {
    margin-top: 4px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.72);
    line-height: 1.45;
  }
  .eden-version-diff {
    margin-top: 6px;
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.7);
  }
  .eden-version-item-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .eden-version-badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .eden-version-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    background: rgba(43, 36, 28, 0.08);
    color: rgba(43, 36, 28, 0.66);
    padding: 3px 7px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .eden-version-badge.is-published {
    background: rgba(176, 139, 79, 0.16);
    color: rgba(97, 71, 23, 0.86);
  }
  .eden-version-badge.is-draft {
    background: rgba(138, 163, 108, 0.16);
    color: rgba(61, 87, 34, 0.86);
  }
  .eden-capability-auth, .eden-capability-editor {
    margin-top: 12px;
  }
  .eden-capability-auth[hidden], .eden-capability-editor[hidden] { display: none; }
  .eden-capability-grid {
    display: grid;
    gap: 10px;
  }
  .eden-capability-grid input, .eden-capability-grid select {
    width: 100%;
    padding: 8px 9px;
    border-radius: 10px;
    border: 1px solid rgba(43, 36, 28, 0.16);
    background: rgba(255,255,255,0.84);
    color: inherit;
    font: inherit;
  }
  .eden-capability-session {
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-capability-status {
    margin-top: 8px;
    min-height: 18px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-capability-status.is-error { color: #8a372f; }
  .eden-capability-status.is-ok { color: #496132; }
  .eden-capability-summary, .eden-capability-list {
    display: grid;
    gap: 8px;
  }
  .eden-capability-card {
    border: 1px solid rgba(43, 36, 28, 0.12);
    border-radius: 14px;
    background: rgba(255,255,255,0.72);
    padding: 10px 12px;
    display: grid;
    gap: 6px;
  }
  .eden-capability-kicker {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(43, 36, 28, 0.56);
  }
  .eden-capability-title {
    font-size: 13px;
    font-weight: 600;
    color: rgba(43, 36, 28, 0.86);
  }
  .eden-capability-body, .eden-capability-meta {
    font-size: 12px;
    color: rgba(43, 36, 28, 0.72);
    line-height: 1.45;
  }
  .eden-capability-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 2px;
  }
  .eden-capability-actions button {
    border: 1px solid rgba(43, 36, 28, 0.14);
    background: rgba(255,255,255,0.78);
    color: inherit;
    border-radius: 999px;
    padding: 7px 11px;
    cursor: pointer;
    font: inherit;
  }
  .eden-capability-actions button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .eden-capability-badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .eden-capability-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    background: rgba(43, 36, 28, 0.08);
    color: rgba(43, 36, 28, 0.66);
    padding: 3px 7px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .eden-capability-badge.is-installed {
    background: rgba(138, 163, 108, 0.16);
    color: rgba(61, 87, 34, 0.86);
  }
  .eden-process-auth, .eden-process-editor {
    margin-top: 12px;
  }
  .eden-process-auth[hidden], .eden-process-editor[hidden] { display: none; }
  .eden-process-grid {
    display: grid;
    gap: 10px;
  }
  .eden-process-grid input {
    width: 100%;
    padding: 8px 9px;
    border-radius: 10px;
    border: 1px solid rgba(43, 36, 28, 0.16);
    background: rgba(255,255,255,0.84);
    color: inherit;
    font: inherit;
  }
  .eden-process-session {
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-process-status {
    margin-top: 8px;
    min-height: 18px;
    font-size: 12px;
    color: rgba(43, 36, 28, 0.66);
  }
  .eden-process-status.is-error { color: #8a372f; }
  .eden-process-status.is-ok { color: #496132; }
  .eden-process-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .eden-process-actions button, .eden-process-actions a {
    border: 1px solid rgba(43, 36, 28, 0.14);
    background: rgba(255,255,255,0.78);
    color: inherit;
    border-radius: 999px;
    padding: 7px 11px;
    cursor: pointer;
    font: inherit;
    text-decoration: none;
  }
  .eden-process-actions button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .eden-process-summary, .eden-process-preview {
    display: grid;
    gap: 8px;
  }
  .eden-process-card {
    border: 1px solid rgba(43, 36, 28, 0.12);
    border-radius: 14px;
    background: rgba(255,255,255,0.72);
    padding: 10px 12px;
    display: grid;
    gap: 6px;
  }
  .eden-process-kicker {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(43, 36, 28, 0.56);
  }
  .eden-process-line {
    font-size: 12px;
    color: rgba(43, 36, 28, 0.74);
    line-height: 1.45;
  }
  .eden-process-quests {
    display: grid;
    gap: 8px;
  }
`;
