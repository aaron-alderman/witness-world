import { renderCanvasCorePrelude } from "./canvas-core.js";

const EDEN_CSS = `
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

const EDEN_CLIENT_JS = model => `(() => {
  ${renderCanvasCorePrelude()}
  const core = __canvasCore;
  const model = ${JSON.stringify(model).replace(/</g, "\\u003c")};
  const stage = document.getElementById('eden-stage');
  const surfacesRoot = document.getElementById('eden-surfaces');
  const promptEl = document.getElementById('eden-prompt');
  const statusEl = document.getElementById('eden-status');
  const chapterEl = document.getElementById('eden-chapter');
  const chapterTitleEl = document.getElementById('eden-chapter-title');
  const chapterBodyEl = document.getElementById('eden-chapter-body');
  const chapterUnlocksEl = document.getElementById('eden-chapter-unlocks');
  const chapterQuestsEl = document.getElementById('eden-chapter-quests');
  const chapterTracksEl = document.getElementById('eden-chapter-tracks');
  const svg = document.getElementById('eden-connections');
  const ns = 'http://www.w3.org/2000/svg';
  const state = {
    camera: core.createCameraState(),
    drag: null,
    elements: new Map(),
    focusSurfaceId: null,
    hoverSurfaceId: null,
    focusReliefKey: null,
    hoverReliefKey: null,
    detailStatus: '',
    session: model.session || { authenticated: false, actor: null, identity: null, label: null },
    personalStatus: { tone: '', text: '' },
    personalEditingId: null,
    editStatus: { tone: '', text: '' },
    versionStatus: { tone: '', text: '' },
    capabilityStatus: { tone: '', text: '' },
    organizationStatus: { tone: '', text: '' },
    theoryStatus: { tone: '', text: '' },
    processStatus: { tone: '', text: '' },
    theoryTeachBackDraft: '',
    embeddedModes: Object.create(null)
  };

  const byId = new Map(model.surfaces.map(surface => [surface.id, surface]));
  const targetById = new Map(model.cameraTargets.map(target => [target.id, target]));

  function academyState() {
    return model.academy && model.academy.mode === 'academy'
      ? model.academy
      : { mode: 'academy', actor: state.session.actor || null, quests: [], tracks: [], signals: [], practice: {} };
  }

  function viewport() {
    return { width: stage.clientWidth, height: stage.clientHeight };
  }

  function setStatus(text) {
    statusEl.textContent = text || '';
  }

  function requestJson(url, options = {}) {
    return fetch(url, { credentials: 'same-origin', ...options }).then(async response => ({
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => ({}))
    }));
  }

  function setPersonalStatus(text, tone = '') {
    state.personalStatus = { text: text || '', tone: tone || '' };
  }

  function setEditStatus(text, tone = '') {
    state.editStatus = { text: text || '', tone: tone || '' };
  }

  function setVersionStatus(text, tone = '') {
    state.versionStatus = { text: text || '', tone: tone || '' };
  }

  function setCapabilityStatus(text, tone = '') {
    state.capabilityStatus = { text: text || '', tone: tone || '' };
  }

  function setOrganizationStatus(text, tone = '') {
    state.organizationStatus = { text: text || '', tone: tone || '' };
  }

  function setTheoryStatus(text, tone = '') {
    state.theoryStatus = { text: text || '', tone: tone || '' };
  }

  function setProcessStatus(text, tone = '') {
    state.processStatus = { text: text || '', tone: tone || '' };
  }

  function actionVisible(action) {
    const minZoom = action.visibleRange?.minZoom ?? 0;
    const maxZoom = action.visibleRange?.maxZoom ?? 99;
    return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
  }

  function cameraForSurface(surface, overrideZoom = null) {
    return core.cameraToFocusRect(surface, viewport(), { zoom: overrideZoom ?? null, padding: 48, maxZoom: 1.25 });
  }

  function focusTarget(targetId) {
    const target = targetById.get(targetId) || model.cameraTargets.find(row => row.surfaceId === targetId) || null;
    if (!target) return;
    const surface = byId.get(target.surfaceId);
    if (!surface) return;
    state.focusSurfaceId = surface.id;
    state.camera = target.zoom == null
      ? cameraForSurface(surface, null)
      : core.cameraToFocusRect(surface, viewport(), { zoom: target.zoom, padding: 48, maxZoom: 1.25 });
    render();
  }

  function isVisible(surface) {
    const range = surface.visibleRange || {};
    const minZoom = typeof range.minZoom === 'number' ? range.minZoom : 0;
    const maxZoom = typeof range.maxZoom === 'number' ? range.maxZoom : 99;
    return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
  }

  function rectToScreen(surface) {
    const topLeft = core.worldToScreen(state.camera, surface.x, surface.y);
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: surface.w * state.camera.zoom,
      height: surface.h * state.camera.zoom
    };
  }

  function reliefLevelFor(surface) {
    const relief = surface.relief || {};
    if (state.focusSurfaceId === surface.id) return Math.round(relief.focus ?? relief.base ?? 1);
    if (state.hoverSurfaceId === surface.id) return Math.round(relief.hover ?? relief.base ?? 1);
    return Math.round(relief.base ?? 1);
  }

  function applySurfaceMeta(container, surface) {
    if (!container) return;
    container.innerHTML = '';
    const tags = [];
    if (surface.district) tags.push(surface.district);
    for (const tag of surface.tags || []) tags.push(tag);
    for (const tag of tags) {
      const chip = document.createElement('span');
      chip.className = 'eden-surface-tag';
      chip.textContent = tag;
      container.appendChild(chip);
    }
  }

  function renderActions(container, surface) {
    if (!container) return;
    container.innerHTML = '';
    const actions = (surface.actions || []).filter(actionVisible);
    for (const action of actions) {
      const interactive = action.state === 'open' && (action.href || action.cameraTargetId || action.commandQuery);
      const node = document.createElement(interactive && action.href ? 'a' : 'button');
      if (node.tagName === 'A') node.href = action.href;
      else node.type = 'button';
      node.className = 'eden-chip ' + (action.state === 'open' ? 'is-open' : 'is-locked');
      if (!interactive) node.disabled = node.tagName === 'BUTTON';
      const label = document.createElement('span');
      label.textContent = action.label;
      node.appendChild(label);
      if (action.requires && action.state !== 'open') {
        const note = document.createElement('span');
        note.className = 'eden-chip-note';
        note.textContent = action.requires;
        node.appendChild(note);
      }
      node.addEventListener('click', event => {
        if (action.state !== 'open') {
          event.preventDefault();
          setStatus(action.requires || (action.label + ' is not unlocked yet'));
          return;
        }
        if (action.cameraTargetId) {
          event.preventDefault();
          focusTarget(action.cameraTargetId);
          return;
        }
        if (action.commandQuery) {
          event.preventDefault();
          openExpertShortcut(action.commandSurfaceId || surface.id, action.commandQuery);
        }
      });
      container.appendChild(node);
    }
  }

  function personalBoxRuntime(surface) {
    return surface.runtime && surface.runtime.mode === 'personalBox'
      ? surface.runtime
      : { mode: 'personalBox', actor: state.session.actor || null, items: [] };
  }

  function pageThemeRuntime(surface) {
    return surface.runtime && surface.runtime.mode === 'pageTheme'
      ? surface.runtime
      : {
          mode: 'pageTheme',
          actor: state.session.actor || null,
          pageId: surface.pageId || 'todo_app_widget',
          pageTheme: { themeId: 'paper', material: 'linen', typography: 'sans' }
        };
  }

  function processRuntime(surface) {
    return surface.runtime && surface.runtime.mode === 'processView'
      ? surface.runtime
      : {
          mode: 'processView',
          actor: state.session.actor || null,
          processProgram: surface.processProgram || 'todo_frontend_program',
          processEvent: surface.processEvent || 'load',
          preview: null
        };
  }

  function versionsRuntime(surface) {
    return surface.runtime && surface.runtime.mode === 'versions'
      ? surface.runtime
      : {
          mode: 'versions',
          surfaceId: surface.id,
          soul: surface.versionSoul || '',
          activeVersion: null,
          publishedVersion: surface.publishedVersion || null,
          draftVersion: surface.draftVersion || null,
          lastGoodVersion: null,
          rollbackAvailable: false,
          versions: [],
          compare: { activePreview: '', publishedPreview: '', draftPreview: '', activeToPublished: [], activeToDraft: [] },
          history: [],
          authority: {
            authenticated: Boolean(state.session?.authenticated && state.session?.actor),
            canMutate: false,
            canPropose: false,
            reason: state.session?.authenticated ? 'direct version changes are guarded here' : 'sign in to change versions'
          }
        };
  }

  function edenVersionProposalId(processName, runtime, suffix = '') {
    const actorPart = String(state.session?.actor || 'guest').replace(/[^A-Za-z0-9_.:-]+/g, '-');
    const processPart = String(processName || 'edenVersions.action').replace(/[^A-Za-z0-9_.:-]+/g, '-');
    const soulPart = String(runtime?.soul || 'version-surface').replace(/[^A-Za-z0-9_.:-]+/g, '-');
    const extra = String(suffix || '').replace(/[^A-Za-z0-9_.:-]+/g, '-');
    return ['proposal', 'eden', actorPart, processPart, soulPart, extra || String(Date.now())].filter(Boolean).join('.');
  }

  async function createEdenVersionProposal(surface, { processName, version = null, reason, statusText }) {
    const runtime = versionsRuntime(surface);
    const body = {
      surfaceId: runtime.surfaceId || surface.id,
      soul: runtime.soul || surface.versionSoul || ''
    };
    if (version) body.version = version;
    if (runtime.publishedVersion) body.publishedVersion = runtime.publishedVersion;
    if (runtime.draftVersion) body.draftVersion = runtime.draftVersion;
    const response = await requestJson('/api/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: edenVersionProposalId(processName, runtime, version || processName),
        targetProcess: processName,
        targetKind: 'widgetVersion',
        targetId: runtime.soul || surface.versionSoul || '',
        bodyJson: JSON.stringify(body),
        reason
      })
    });
    if (!response.ok) {
      setVersionStatus(response.body?.error || 'version proposal creation failed', 'error');
      render();
      return false;
    }
    setVersionStatus(statusText + ' as ' + (response.body?.proposal?.id || 'proposal') + '.', 'ok');
    return true;
  }

  function edenCapabilityInstallProposalId(runtime, capability) {
    const actorPart = String(state.session?.actor || 'guest').replace(/[^A-Za-z0-9_.:-]+/g, '-');
    const targetPart = String(runtime?.target || 'capability-target').replace(/[^A-Za-z0-9_.:-]+/g, '-');
    const capabilityPart = String(capability || 'capability').replace(/[^A-Za-z0-9_.:-]+/g, '-');
    return ['proposal', 'eden', actorPart, 'capability.install', targetPart, capabilityPart].filter(Boolean).join('.');
  }

  async function createEdenCapabilityInstallProposal(surface, row) {
    const runtime = capabilityInstallRuntime(surface);
    const targetLabel = runtime.targetLabel || runtime.target || 'this target';
    const capabilityLabel = row.label || row.id;
    const response = await requestJson('/api/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: edenCapabilityInstallProposalId(runtime, row.id),
        targetProcess: 'capability.install',
        targetKind: runtime.targetKind || 'context',
        targetId: runtime.target || '',
        bodyJson: JSON.stringify({
          capability: row.id,
          target: runtime.target || '',
          targetKind: runtime.targetKind || 'context'
        }),
        reason: 'Install ' + capabilityLabel + ' on ' + targetLabel + ' through proposal review'
      })
    });
    if (!response.ok) {
      setCapabilityStatus(response.body?.error || ('proposal creation failed for ' + capabilityLabel), 'error');
      render();
      return false;
    }
    setCapabilityStatus('Proposed installing ' + capabilityLabel + ' on ' + targetLabel + ' as ' + (response.body?.proposal?.id || 'proposal') + '.', 'ok');
    return true;
  }

  function capabilityInstallRuntime(surface) {
    return surface.runtime && surface.runtime.mode === 'capabilityInstall'
      ? surface.runtime
      : {
          mode: 'capabilityInstall',
          actor: state.session.actor || null,
          target: surface.capabilityTarget || 'frontend',
          targetKind: surface.capabilityTargetKind || 'context',
          targetLabel: surface.capabilityTargetLabel || surface.capabilityTarget || 'frontend',
          suggestedCapabilities: [],
          installedCapabilities: [],
          authority: {
            authenticated: Boolean(state.session?.authenticated && state.session?.actor),
            canMutate: false,
            canPropose: false,
            reason: state.session?.authenticated ? 'direct capability installs are guarded here' : 'sign in to install capabilities'
          }
        };
  }

  function organizationRuntime(surface) {
    return surface.runtime && surface.runtime.mode === 'organization'
      ? surface.runtime
      : {
          mode: 'organization',
          actor: state.session.actor || null,
          surfaceId: surface.id,
          contextParent: surface.contextParent || 'frontend',
          contextId: null,
          contextLabel: null,
          contextExists: false,
          context: null,
          guestSteward: surface.guestSteward || 'callan',
          stewardships: [],
          guestGrant: null,
          hasGuestStewardship: false,
          proposalTemplate: {
            targetProcess: surface.proposalTargetProcess || 'widget.define',
            targetKind: surface.proposalTargetKind || 'widget',
            targetId: surface.proposalTargetId || null,
            body: surface.proposalBody || null
          },
          proposals: [],
          openProposal: null,
          approvedProposal: null,
          approvedProposalCount: 0,
          noticeWidgetId: null,
          noticeWidgetExists: false
        };
  }

  function theoryAnnexRuntime(surface) {
    return surface.runtime && surface.runtime.mode === 'theoryAnnex'
        ? surface.runtime
        : {
            mode: 'theoryAnnex',
            actor: state.session.actor || null,
            surfaceId: surface.id,
            lessons: Array.isArray(surface.theoryLessons) ? surface.theoryLessons : [],
            completedLessonCount: 0,
            allLessonsCompleted: false,
            trained: false,
            trainedWitness: null,
            trainedLabel: 'not yet trained',
            teachBackCount: 0,
            teachBacks: []
          };
  }

  function actionById(surface, actionId) {
    return (surface.actions || []).find(action => action.id === actionId) || null;
  }

  function embeddedMode(surfaceId) {
    const key = String(surfaceId || '');
    if (!state.embeddedModes[key]) state.embeddedModes[key] = { inspect: false };
    return state.embeddedModes[key];
  }

  function embeddedFrame(surfaceId) {
    return state.elements.get(surfaceId)?.querySelector?.('iframe') || null;
  }

  function embeddedDocument(surfaceId) {
    try {
      return embeddedFrame(surfaceId)?.contentDocument || null;
    } catch {
      return null;
    }
  }

  function embeddedWindow(surfaceId) {
    try {
      return embeddedFrame(surfaceId)?.contentWindow || null;
    } catch {
      return null;
    }
  }

  function surfaceInspectorPanelOpen(doc) {
    return Boolean(doc?.querySelector?.('[data-surface-inspector-panel]'));
  }

  function surfaceCommandPaletteOpen(doc) {
    return Boolean(doc?.querySelector?.('[data-surface-command-palette]'));
  }

  function setEmbeddedSurfaceInspector(surfaceId, open) {
    const doc = embeddedDocument(surfaceId);
    const toggle = doc?.querySelector?.('[data-surface-inspector-toggle]');
    if (!toggle || surfaceInspectorPanelOpen(doc) === Boolean(open)) return;
    toggle.click();
  }

  function setEmbeddedSurfaceCommand(surfaceId, open) {
    const doc = embeddedDocument(surfaceId);
    const toggle = doc?.querySelector?.('[data-surface-command-toggle]');
    if (!toggle || surfaceCommandPaletteOpen(doc) === Boolean(open)) return;
    toggle.click();
  }

  function seedEmbeddedCommandQuery(surfaceId, query) {
    const doc = embeddedDocument(surfaceId);
    const input = doc?.querySelector?.('[data-surface-command-input]');
    if (!input) return false;
    const value = String(query || '');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(value.length, value.length);
    return true;
  }

  function syncEmbeddedMode(surface) {
    const node = state.elements.get(surface.id);
    const frame = node?.querySelector?.('iframe');
    const layer = node?.querySelector?.('[data-eden-relief-layer]');
    const inspectButton = node?.querySelector?.('[data-eden-embedded-inspect]');
    const commandButton = node?.querySelector?.('[data-eden-embedded-command]');
    const modeLabel = node?.querySelector?.('[data-eden-embedded-mode]');
    const mode = embeddedMode(surface.id);
    if (frame) frame.style.pointerEvents = mode.inspect ? 'auto' : 'none';
    if (layer) layer.hidden = mode.inspect;
    if (inspectButton) {
      inspectButton.textContent = mode.inspect ? 'Return To Map' : 'Inspect Board';
      inspectButton.classList.toggle('is-active', mode.inspect);
      inspectButton.setAttribute('aria-pressed', mode.inspect ? 'true' : 'false');
    }
    if (commandButton) commandButton.disabled = !mode.inspect;
    if (modeLabel) modeLabel.textContent = mode.inspect ? 'Inspect mode' : 'Map mode';
    setEmbeddedSurfaceInspector(surface.id, mode.inspect);
    if (!mode.inspect) setEmbeddedSurfaceCommand(surface.id, false);
  }

  function toggleEmbeddedInspect(surface, next = null) {
    const mode = embeddedMode(surface.id);
    mode.inspect = typeof next === 'boolean' ? next : !mode.inspect;
    if (!mode.inspect) {
      state.focusReliefKey = null;
      state.hoverReliefKey = null;
    }
    syncEmbeddedMode(surface);
    setStatus(mode.inspect
      ? 'Inspect mode active. Right-click widgets on the live board.'
      : 'Map mode restored. Relief overlays are back.');
    render();
  }

  function openExpertShortcut(surfaceId = 'eden.surface.todo', query = 'whoami') {
    const surface = byId.get(surfaceId);
    if (!surface) return;
    if (!isVisible(surface)) {
      if (targetById.has('home')) focusTarget('home');
      else {
        state.focusSurfaceId = surface.id;
        state.camera = cameraForSurface(surface, 1.02);
      }
    }
    toggleEmbeddedInspect(surface, true);
    const applyQuery = (attempts = 10) => {
      if (String(query || '').trim().toLowerCase() === 'whoami') {
        const doc = embeddedDocument(surface.id);
        const win = embeddedWindow(surface.id);
        if (doc?.querySelector?.('[data-surface-command-toggle]') && win?.dispatchEvent) {
          const event = typeof win.KeyboardEvent === 'function'
            ? new win.KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true })
            : new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true });
          win.dispatchEvent(event);
          setStatus('Expert shortcut active. whoami is on the board command surface.');
          return;
        }
      }
      setEmbeddedSurfaceCommand(surface.id, true);
      if (seedEmbeddedCommandQuery(surface.id, query)) {
        setStatus('Expert shortcut active. whoami is on the board command surface.');
        return;
      }
      if (attempts <= 0) return;
      setTimeout(() => applyQuery(attempts - 1), 60);
    };
    setTimeout(applyQuery, 0);
  }

  function reliefSections(surface) {
    return Array.isArray(surface.reliefSections) ? surface.reliefSections : [];
  }

  function reliefKey(surfaceId, sectionId) {
    return String(surfaceId || '') + '::' + String(sectionId || '');
  }

  function reliefActiveSignals(section) {
    const activeSignals = [];
    const signals = Array.isArray(section?.signals) ? section.signals : [];
    const versionsSurface = byId.get('eden.surface.versions');
    const versions = versionsSurface ? versionsRuntime(versionsSurface) : null;
    for (const signal of signals) {
      if (signal === 'session.authenticated' && state.session?.authenticated && state.session?.actor) activeSignals.push(signal);
      if (signal === 'versions.liveDiff' && versions?.activeVersion && versions?.publishedVersion && versions.activeVersion !== versions.publishedVersion) activeSignals.push(signal);
      if (signal === 'versions.draftDiff' && versions?.draftVersion && versions?.publishedVersion && versions.draftVersion !== versions.publishedVersion) activeSignals.push(signal);
      if (signal === 'versions.rollbackAvailable' && versions?.rollbackAvailable) activeSignals.push(signal);
    }
    return activeSignals;
  }

  function reliefLevelForSection(surface, section) {
    const key = reliefKey(surface.id, section.id);
    const relief = section.relief || {};
    const activeSignals = reliefActiveSignals(section);
    if (state.focusReliefKey === key) return Math.round(relief.focus ?? relief.base ?? 1);
    if (state.hoverReliefKey === key) return Math.round(relief.hover ?? relief.base ?? 1);
    if (activeSignals.length) return Math.round(relief.active ?? relief.base ?? 1);
    return Math.round(relief.base ?? 1);
  }

  async function refreshPersonalBox(surface) {
    const response = await requestJson('/api/eden/personal-box');
    if (!response.ok) {
      setPersonalStatus(response.body?.error || 'personal box refresh failed', 'error');
      render();
      return;
    }
    const runtime = personalBoxRuntime(surface);
    runtime.actor = response.body?.actor || null;
    runtime.items = Array.isArray(response.body?.items) ? response.body.items : [];
    surface.runtime = runtime;
    state.session = {
      authenticated: Boolean(response.body?.authenticated),
      actor: response.body?.actor || null,
      identity: response.body?.identity || null,
      label: response.body?.label || null
    };
    if (!runtime.items.some(item => item.id === state.personalEditingId)) state.personalEditingId = null;
    render();
  }

  async function refreshPageTheme(surface) {
    const response = await requestJson('/api/eden/page-theme');
    if (!response.ok) {
      setEditStatus(response.body?.error || 'page theme refresh failed', 'error');
      render();
      return;
    }
    const runtime = pageThemeRuntime(surface);
    runtime.actor = response.body?.actor || null;
    runtime.pageId = response.body?.pageId || runtime.pageId;
    runtime.pageTheme = response.body?.pageTheme || runtime.pageTheme;
    surface.runtime = runtime;
    render();
  }

  async function refreshVersions(surface) {
    const response = await requestJson('/api/eden/versions');
    if (!response.ok) {
      setVersionStatus(response.body?.error || 'versions refresh failed', 'error');
      render();
      return;
    }
    surface.runtime = response.body?.versionState || versionsRuntime(surface);
    render();
  }

  async function refreshCapabilityInstall(surface) {
    const response = await requestJson('/api/eden/capability-installs');
    if (!response.ok) {
      setCapabilityStatus(response.body?.error || 'capability shelf refresh failed', 'error');
      render();
      return;
    }
    const runtime = capabilityInstallRuntime(surface);
    surface.runtime = response.body?.capabilityState || runtime;
    state.session = {
      authenticated: Boolean(response.body?.authenticated),
      actor: response.body?.actor || null,
      identity: response.body?.identity || null,
      label: response.body?.label || null
    };
    render();
  }

  async function refreshOrganization(surface) {
    const response = await requestJson('/api/eden/organization');
    if (!response.ok) {
      setOrganizationStatus(response.body?.error || 'commons refresh failed', 'error');
      render();
      return;
    }
    surface.runtime = response.body?.organizationState || organizationRuntime(surface);
    state.session = {
      authenticated: Boolean(response.body?.authenticated),
      actor: response.body?.actor || null,
      identity: response.body?.identity || null,
      label: response.body?.label || null
    };
    render();
  }

  async function refreshTheoryState(surface) {
    const response = await requestJson('/api/eden/theory');
    if (!response.ok) {
      setTheoryStatus(response.body?.error || 'theory annex refresh failed', 'error');
      render();
      return;
    }
    surface.runtime = response.body?.theoryState || theoryAnnexRuntime(surface);
    state.session = {
      authenticated: Boolean(response.body?.authenticated),
      actor: response.body?.actor || null,
      identity: response.body?.identity || null,
      label: response.body?.label || null
    };
    render();
  }

  async function refreshProcessPreview(surface) {
    const runtime = processRuntime(surface);
    const url = new URL('/api/process-view', window.location.origin);
    if (runtime.processProgram) url.searchParams.set('program', runtime.processProgram);
    if (runtime.processEvent) url.searchParams.set('event', runtime.processEvent);
    const response = await requestJson(url.pathname + url.search);
    if (!response.ok) {
      setProcessStatus(response.body?.error || 'process preview refresh failed', 'error');
      render();
      return;
    }
    runtime.preview = response.body || null;
    runtime.actor = state.session.actor || null;
    surface.runtime = runtime;
    await refreshAcademyState();
    render();
  }

  async function refreshAcademyState() {
    const response = await requestJson('/api/eden/academy');
    if (!response.ok) {
      setStatus(response.body?.error || 'academy refresh failed');
      render();
      return;
    }
    model.academy = response.body?.academy || academyState();
    const actionMap = new Map((response.body?.surfaces || []).map(surface => [surface.id, Array.isArray(surface.actions) ? surface.actions : []]));
    for (const surface of model.surfaces) {
      if (actionMap.has(surface.id)) surface.actions = actionMap.get(surface.id);
    }
    const checkpointMap = new Map((response.body?.checkpoints || []).map(checkpoint => [checkpoint.id, Array.isArray(checkpoint.quests) ? checkpoint.quests : []]));
    for (const checkpoint of model.checkpoints || []) {
      if (checkpointMap.has(checkpoint.id)) checkpoint.quests = checkpointMap.get(checkpoint.id);
    }
    state.session = {
      authenticated: Boolean(response.body?.authenticated),
      actor: response.body?.actor || null,
      identity: response.body?.identity || null,
      label: response.body?.label || null
    };
    render();
  }

  async function refreshSessionSurfaces() {
    const tasks = [];
    const treeSurface = byId.get('eden.surface.tree');
    if (treeSurface && theoryAnnexRuntime(treeSurface).lessons.length) tasks.push(refreshTheoryState(treeSurface));
    const personalSurface = byId.get('eden.surface.personal');
    if (personalSurface && personalSurface.panelKind === 'personalBox') tasks.push(refreshPersonalBox(personalSurface));
    const editSurface = byId.get('eden.surface.edit');
    if (editSurface && editSurface.panelKind === 'editPage') tasks.push(refreshPageTheme(editSurface));
    const versionsSurface = byId.get('eden.surface.versions');
    if (versionsSurface && versionsSurface.panelKind === 'versions') tasks.push(refreshVersions(versionsSurface));
    const worldSurface = byId.get('eden.surface.world');
    if (worldSurface && worldSurface.panelKind === 'capabilityInstall') tasks.push(refreshCapabilityInstall(worldSurface));
    const commonsSurface = byId.get('eden.surface.commons');
    if (commonsSurface && commonsSurface.panelKind === 'organization') tasks.push(refreshOrganization(commonsSurface));
    const processSurface = byId.get('eden.surface.process');
    if (processSurface && processSurface.panelKind === 'processView' && processRuntime(processSurface).preview) tasks.push(refreshProcessPreview(processSurface));
    tasks.push(refreshAcademyState());
    await Promise.all(tasks);
  }

  function reloadEmbeddedTodoPage() {
    const todoNode = state.elements.get('eden.surface.todo');
    const frame = todoNode?.querySelector?.('iframe');
    if (!frame) return;
    const base = frame.dataset.baseSrc || frame.getAttribute('src') || '/';
    frame.dataset.baseSrc = base.split('?')[0];
    const next = new URL(frame.dataset.baseSrc, window.location.origin);
    next.searchParams.set('edenThemeRev', String(Date.now()));
    frame.src = next.pathname + next.search;
  }

  function scrollReliefSectionIntoView(surface, sectionId) {
    const node = state.elements.get(surface.id);
    const frame = node?.querySelector?.('iframe');
    const doc = frame?.contentDocument;
    if (!doc) return;
    const target = doc.querySelector('[data-widget="' + String(sectionId).replace(/"/g, '\\"') + '"]');
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function computeReliefBoxes(surface, node) {
    const frame = node?.querySelector?.('iframe');
    const doc = frame?.contentDocument;
    if (!frame || !doc) return [];
    const pageId = surface.pageId || 'todo_app_widget';
    const root = doc.querySelector('[data-widget="' + String(pageId).replace(/"/g, '\\"') + '"]') || doc.body;
    if (!root) return [];
    const rootRect = root.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const widthBase = Math.max(rootRect.width || root.scrollWidth || 0, 1);
    const heightBase = Math.max(rootRect.height || root.scrollHeight || 0, 1);
    const frameLeft = frameRect.left - nodeRect.left;
    const frameTop = frameRect.top - nodeRect.top;
    const frameWidth = frameRect.width;
    const frameHeight = frameRect.height;
    return reliefSections(surface).map(section => {
      const element = doc.querySelector('[data-widget="' + String(section.widgetId).replace(/"/g, '\\"') + '"]');
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const left = frameLeft + ((rect.left - rootRect.left) / widthBase) * frameWidth;
      const top = frameTop + ((rect.top - rootRect.top) / heightBase) * frameHeight;
      const width = Math.max(78, (rect.width / widthBase) * frameWidth);
      const height = Math.max(28, (rect.height / heightBase) * frameHeight);
      return { section, left, top, width, height };
    }).filter(Boolean);
  }

  function renderEmbeddedRelief(node, surface) {
    const layer = node?.querySelector?.('[data-eden-relief-layer]');
    if (!layer) return;
    if (embeddedMode(surface.id).inspect) {
      layer.hidden = true;
      layer.innerHTML = '';
      return;
    }
    layer.hidden = false;
    layer.innerHTML = '';
    const boxes = computeReliefBoxes(surface, node);
    for (const box of boxes) {
      const section = box.section;
      const activeSignals = reliefActiveSignals(section);
      const key = reliefKey(surface.id, section.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'eden-relief-card';
      card.dataset.edenRelief = section.id;
      card.dataset.relief = String(Math.max(0, Math.min(4, reliefLevelForSection(surface, section))));
      card.dataset.signalCount = String(activeSignals.length);
      card.classList.toggle('is-signal', activeSignals.length > 0);
      card.classList.toggle('is-focused', state.focusReliefKey === key);
      card.style.left = box.left + 'px';
      card.style.top = box.top + 'px';
      card.style.width = box.width + 'px';
      card.style.height = box.height + 'px';
      const title = document.createElement('div');
      title.className = 'eden-relief-title';
      title.textContent = section.title || section.id;
      card.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'eden-relief-meta';
      meta.textContent = activeSignals.length
        ? activeSignals.join(' · ')
        : (section.role || section.chromeKind || section.id);
      card.appendChild(meta);
      card.addEventListener('pointerenter', () => {
        state.hoverReliefKey = key;
        render();
      });
      card.addEventListener('pointerleave', () => {
        if (state.hoverReliefKey === key) state.hoverReliefKey = null;
        render();
      });
      card.addEventListener('click', () => {
        state.focusReliefKey = key;
        scrollReliefSectionIntoView(surface, section.id);
        state.detailStatus = (section.title || section.id) + (section.meaning ? ' · ' + section.meaning : '');
        render();
      });
      layer.appendChild(card);
    }
  }

  function fillPersonalEditor(form, surface, itemId = null) {
    if (!form) return;
    const runtime = personalBoxRuntime(surface);
    const item = runtime.items.find(entry => entry.id === itemId) || null;
    form.dataset.mode = item ? 'edit' : 'create';
    form.dataset.itemId = item?.id || '';
    form.querySelector('[name="kind"]').value = item?.kind || 'note';
    form.querySelector('[name="text"]').value = item?.text || '';
    form.querySelector('[name="href"]').value = item?.href || '';
    const submit = form.querySelector('[data-eden-personal-submit]');
    if (submit) submit.textContent = item ? 'Save widget' : 'Add widget';
    const cancel = form.querySelector('[data-eden-personal-cancel]');
    if (cancel) cancel.hidden = !item;
  }

  function renderPersonalBox(node, surface) {
    const runtime = personalBoxRuntime(surface);
    const auth = node.querySelector('[data-eden-personal-auth]');
    const editor = node.querySelector('[data-eden-personal-editor]');
    const session = node.querySelector('[data-eden-personal-session]');
    const status = node.querySelector('[data-eden-personal-status]');
    const list = node.querySelector('[data-eden-personal-items]');
    if (!auth || !editor || !session || !status || !list) return;
    const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
    auth.hidden = authenticated;
    editor.hidden = !authenticated;
    session.textContent = authenticated
      ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. This patch is yours.')
      : 'Sign in to claim your room and edit the box from inside Eden.';
    status.textContent = state.personalStatus.text || '';
    status.classList.toggle('is-error', state.personalStatus.tone === 'error');
    status.classList.toggle('is-ok', state.personalStatus.tone === 'ok');
    list.innerHTML = '';
    const items = Array.isArray(runtime.items) ? runtime.items : [];
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'eden-personal-empty';
      empty.textContent = authenticated
        ? 'No widgets yet. Add one below.'
        : 'Your widgets appear here after you sign in and plant something.';
      list.appendChild(empty);
    } else {
      for (const item of items) {
        const li = document.createElement('li');
        li.className = 'eden-personal-item';
        li.innerHTML = '<div class="eden-personal-item-header"><span class="eden-personal-item-kind"></span><div class="eden-personal-item-controls"><button type="button" data-eden-personal-edit>Edit</button><button type="button" data-eden-personal-delete>Delete</button></div></div><div class="eden-personal-item-text"></div>';
        li.querySelector('.eden-personal-item-kind').textContent = item.kind;
        const text = li.querySelector('.eden-personal-item-text');
        if (item.kind === 'link' && item.href) {
          text.innerHTML = '<a class="eden-personal-item-link" target="_blank" rel="noreferrer noopener"></a>';
          const link = text.querySelector('a');
          link.href = item.href;
          link.textContent = item.text;
        } else {
          text.textContent = item.text;
        }
        li.querySelector('[data-eden-personal-edit]').addEventListener('click', () => {
          state.personalEditingId = item.id;
          fillPersonalEditor(editor.querySelector('form'), surface, item.id);
          setPersonalStatus('Editing ' + item.text, 'ok');
        });
        li.querySelector('[data-eden-personal-delete]').addEventListener('click', async () => {
          const response = await requestJson('/api/eden/personal-box/items/' + encodeURIComponent(item.id), { method: 'DELETE' });
          if (!response.ok) {
            setPersonalStatus(response.body?.error || 'delete failed', 'error');
            render();
            return;
        }
        setPersonalStatus('Deleted widget.', 'ok');
        if (state.personalEditingId === item.id) state.personalEditingId = null;
        await refreshPersonalBox(surface);
        await refreshAcademyState();
      });
        list.appendChild(li);
      }
    }
    fillPersonalEditor(editor.querySelector('form'), surface, state.personalEditingId);
  }

  function renderEditPage(node, surface) {
    const runtime = pageThemeRuntime(surface);
    const auth = node.querySelector('[data-eden-edit-auth]');
    const editor = node.querySelector('[data-eden-edit-editor]');
    const session = node.querySelector('[data-eden-edit-session]');
    const status = node.querySelector('[data-eden-edit-status]');
    const preview = node.querySelector('[data-eden-edit-preview]');
    if (!auth || !editor || !session || !status || !preview) return;
    const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
    auth.hidden = authenticated;
    editor.hidden = !authenticated;
    session.textContent = authenticated
      ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. These page treatments now write to the live Todo surface.')
      : 'Sign in to personalize the live Todo page from inside Eden.';
    status.textContent = state.editStatus.text || '';
    status.classList.toggle('is-error', state.editStatus.tone === 'error');
    status.classList.toggle('is-ok', state.editStatus.tone === 'ok');
    const form = editor.querySelector('form');
    if (form) {
      form.querySelector('[name="themeId"]').value = runtime.pageTheme?.themeId || 'paper';
      form.querySelector('[name="material"]').value = runtime.pageTheme?.material || 'linen';
      form.querySelector('[name="typography"]').value = runtime.pageTheme?.typography || 'sans';
    }
    preview.innerHTML = '<div class="eden-edit-preview-card"><div class="eden-edit-preview-kicker">Current treatment</div><div class="eden-edit-preview-line">Theme: ' + (runtime.pageTheme?.themeId || 'paper') + '</div><div class="eden-edit-preview-line">Material: ' + (runtime.pageTheme?.material || 'linen') + '</div><div class="eden-edit-preview-line">Typography: ' + (runtime.pageTheme?.typography || 'sans') + '</div></div>';
  }

  function renderVersions(node, surface) {
    const runtime = versionsRuntime(surface);
    const auth = node.querySelector('[data-eden-version-auth]');
    const editor = node.querySelector('[data-eden-version-editor]');
    const session = node.querySelector('[data-eden-version-session]');
    const status = node.querySelector('[data-eden-version-status]');
    const summary = node.querySelector('[data-eden-version-summary]');
    const list = node.querySelector('[data-eden-version-list]');
    if (!auth || !editor || !session || !status || !summary || !list) return;
    const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
    const authority = runtime.authority && typeof runtime.authority === 'object'
      ? runtime.authority
      : {
          authenticated,
          canMutate: false,
          canPropose: false,
          reason: authenticated ? 'direct version changes are guarded here' : 'sign in to change versions'
        };
    auth.hidden = authenticated;
    editor.hidden = !authenticated;
    session.textContent = !authenticated
      ? 'Sign in to move between draft, published, and last good from inside Eden.'
      : (authority.canMutate
          ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. These recovery controls mutate the live Todo board.')
          : ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. Direct version changes are guarded here, but you can create real proposals for the shared board.'));
    status.textContent = state.versionStatus.text || '';
    status.classList.toggle('is-error', state.versionStatus.tone === 'error');
    status.classList.toggle('is-ok', state.versionStatus.tone === 'ok');

    const summaries = [
      { kicker: 'Current live', version: runtime.activeVersion, preview: runtime.compare?.activePreview || 'No active version yet.', current: true },
      { kicker: 'Published', version: runtime.publishedVersion, preview: runtime.compare?.publishedPreview || 'No published version yet.' },
      { kicker: 'Draft candidate', version: runtime.draftVersion, preview: runtime.compare?.draftPreview || 'No draft candidate yet.' }
    ];
    summary.innerHTML = '';
    for (const entry of summaries) {
      const card = document.createElement('div');
      card.className = 'eden-version-card' + (entry.current ? ' is-current' : '');
      const kicker = document.createElement('div');
      kicker.className = 'eden-version-card-kicker';
      kicker.textContent = entry.kicker;
      const title = document.createElement('div');
      title.className = 'eden-version-card-title';
      title.textContent = entry.version || 'None';
      const body = document.createElement('div');
      body.className = 'eden-version-card-body';
      body.textContent = entry.preview || 'No preview.';
      card.appendChild(kicker);
      card.appendChild(title);
      card.appendChild(body);
      summary.appendChild(card);
    }

    const comparePublished = Array.isArray(runtime.compare?.activeToPublished) ? runtime.compare.activeToPublished : [];
    const compareDraft = Array.isArray(runtime.compare?.activeToDraft) ? runtime.compare.activeToDraft : [];
    const publishedDiff = node.querySelector('[data-eden-version-diff-published]');
    const draftDiff = node.querySelector('[data-eden-version-diff-draft]');
    if (publishedDiff) {
      publishedDiff.innerHTML = '';
      if (!comparePublished.length) {
        publishedDiff.textContent = 'Current live version already matches published.';
      } else {
        for (const row of comparePublished) {
          const line = document.createElement('div');
          line.textContent = row.key + ': ' + String(row.from ?? '') + ' -> ' + String(row.to ?? '');
          publishedDiff.appendChild(line);
        }
      }
    }
    if (draftDiff) {
      draftDiff.innerHTML = '';
      if (!compareDraft.length) {
        draftDiff.textContent = 'Current live version already matches the draft candidate.';
      } else {
        for (const row of compareDraft) {
          const line = document.createElement('div');
          line.textContent = row.key + ': ' + String(row.from ?? '') + ' -> ' + String(row.to ?? '');
          draftDiff.appendChild(line);
        }
      }
    }

    list.innerHTML = '';
    const rows = Array.isArray(runtime.versions) ? runtime.versions : [];
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'eden-version-item';
      empty.textContent = 'No authored versions are attached to this recovery seam yet.';
      list.appendChild(empty);
    } else {
      for (const row of rows) {
        const item = document.createElement('div');
        item.className = 'eden-version-item' + (row.isActive ? ' is-active' : '');
        const header = document.createElement('div');
        header.className = 'eden-version-item-header';
        const title = document.createElement('div');
        title.innerHTML = '<div class="eden-version-item-meta">Version ' + String(row.index ?? 0) + '</div><div class="eden-version-item-title"></div>';
        title.querySelector('.eden-version-item-title').textContent = row.version;
        const badges = document.createElement('div');
        badges.className = 'eden-version-badges';
        if (row.isActive) {
          const badge = document.createElement('span');
          badge.className = 'eden-version-badge';
          badge.textContent = 'live';
          badges.appendChild(badge);
        }
        if (row.isPublished) {
          const badge = document.createElement('span');
          badge.className = 'eden-version-badge is-published';
          badge.textContent = 'published';
          badges.appendChild(badge);
        }
        if (row.isDraft) {
          const badge = document.createElement('span');
          badge.className = 'eden-version-badge is-draft';
          badge.textContent = 'draft';
          badges.appendChild(badge);
        }
        header.appendChild(title);
        header.appendChild(badges);
        item.appendChild(header);
        const preview = document.createElement('div');
        preview.className = 'eden-version-item-preview';
        preview.textContent = row.preview || 'No preview.';
        item.appendChild(preview);
        list.appendChild(item);
      }
    }

    const activatePublished = node.querySelector('[data-eden-version-open-published]');
    const activateDraft = node.querySelector('[data-eden-version-open-draft]');
    const restore = node.querySelector('[data-eden-version-restore]');
    const publish = node.querySelector('[data-eden-version-publish]');
    if (activatePublished) activatePublished.textContent = authority.canPropose ? 'Propose Published In Board' : 'View published in board';
    if (activateDraft) activateDraft.textContent = authority.canPropose ? 'Propose Draft In Board' : 'Open draft in board';
    if (restore) restore.textContent = authority.canPropose ? 'Propose Restore Last Good' : 'Restore last good';
    if (publish) publish.textContent = authority.canPropose ? 'Propose Publish Current' : 'Publish current';
    if (activatePublished) activatePublished.disabled = !runtime.publishedVersion || runtime.activeVersion === runtime.publishedVersion;
    if (activateDraft) activateDraft.disabled = !runtime.draftVersion || runtime.activeVersion === runtime.draftVersion;
    if (restore) restore.disabled = !runtime.rollbackAvailable;
    if (publish) publish.disabled = !runtime.activeVersion || runtime.activeVersion === runtime.publishedVersion;
  }

  function renderCapabilityInstall(node, surface) {
    const runtime = capabilityInstallRuntime(surface);
    const authority = runtime.authority || {
      authenticated: Boolean(state.session?.authenticated && state.session?.actor),
      canMutate: false,
      canPropose: false,
      reason: state.session?.authenticated ? 'direct capability installs are guarded here' : 'sign in to install capabilities'
    };
    const auth = node.querySelector('[data-eden-capability-auth]');
    const editor = node.querySelector('[data-eden-capability-editor]');
    const session = node.querySelector('[data-eden-capability-session]');
    const status = node.querySelector('[data-eden-capability-status]');
    const summary = node.querySelector('[data-eden-capability-summary]');
    const list = node.querySelector('[data-eden-capability-list]');
    if (!auth || !editor || !session || !status || !summary || !list) return;
    const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
    auth.hidden = authenticated;
    editor.hidden = !authenticated;
    session.textContent = authenticated
      ? (authority.canMutate
        ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. Install curated capabilities directly onto ' + (runtime.targetLabel || runtime.target || 'this target') + '.')
        : (authority.canPropose
          ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. You can create real install proposals for ' + (runtime.targetLabel || runtime.target || 'this target') + '.')
          : ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. Capability installs here are read-only right now.')))
      : 'Sign in to install capabilities from the place where the missing power is discovered.';
    status.textContent = state.capabilityStatus.text || '';
    status.classList.toggle('is-error', state.capabilityStatus.tone === 'error');
    status.classList.toggle('is-ok', state.capabilityStatus.tone === 'ok');

    summary.innerHTML = '';
    const summaryCard = document.createElement('div');
    summaryCard.className = 'eden-capability-card';
    summaryCard.innerHTML = '<div class="eden-capability-kicker">Install target</div><div class="eden-capability-title"></div><div class="eden-capability-body"></div><div class="eden-capability-badges"></div>';
    summaryCard.querySelector('.eden-capability-title').textContent = runtime.targetLabel || runtime.target || 'frontend';
    summaryCard.querySelector('.eden-capability-body').textContent = 'Target kind: ' + (runtime.targetKind || 'context') + '. Installed here: ' + (runtime.installedCapabilities?.length || 0) + '.';
    const installedBadges = summaryCard.querySelector('.eden-capability-badges');
    for (const row of runtime.installedCapabilities || []) {
      const badge = document.createElement('span');
      badge.className = 'eden-capability-badge is-installed';
      badge.textContent = row.label || row.id;
      installedBadges.appendChild(badge);
    }
    if (!installedBadges.childElementCount) {
      const badge = document.createElement('span');
      badge.className = 'eden-capability-badge';
      badge.textContent = 'No installs yet';
      installedBadges.appendChild(badge);
    }
    summary.appendChild(summaryCard);

    list.innerHTML = '';
    const rows = Array.isArray(runtime.suggestedCapabilities) ? runtime.suggestedCapabilities : [];
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'eden-capability-card';
      empty.textContent = 'No curated capabilities are recommended for this target yet.';
      list.appendChild(empty);
      return;
    }
    for (const row of rows) {
      const card = document.createElement('div');
      card.className = 'eden-capability-card';
      card.dataset.edenCapability = row.id;
      card.innerHTML = '<div class="eden-capability-kicker"></div><div class="eden-capability-title"></div><div class="eden-capability-body"></div><div class="eden-capability-meta"></div><div class="eden-capability-badges"></div><div class="eden-capability-actions"><button type="button" data-eden-capability-install>Install here</button></div>';
      card.querySelector('.eden-capability-kicker').textContent = row.version ? ('Capability · ' + row.version) : 'Capability';
      card.querySelector('.eden-capability-title').textContent = row.label || row.id;
      card.querySelector('.eden-capability-body').textContent = row.summary || 'Inspectable capability object.';
      const metaParts = [];
      if (Array.isArray(row.dependsOn) && row.dependsOn.length) metaParts.push('Depends on: ' + row.dependsOn.join(', '));
      if (Array.isArray(row.providerAdapters) && row.providerAdapters.length) metaParts.push('Adapters: ' + row.providerAdapters.join(', '));
      if (row.context) metaParts.push('Context: ' + row.context);
      if (Array.isArray(row.missingDependencies) && row.missingDependencies.length) metaParts.push('Missing on target: ' + row.missingDependencies.join(', '));
      card.querySelector('.eden-capability-meta').textContent = metaParts.join(' · ');
      const badges = card.querySelector('.eden-capability-badges');
      for (const placement of row.placement || []) {
        const badge = document.createElement('span');
        badge.className = 'eden-capability-badge';
        badge.textContent = placement;
        badges.appendChild(badge);
      }
      if (row.installed) {
        const badge = document.createElement('span');
        badge.className = 'eden-capability-badge is-installed';
        badge.textContent = 'Installed';
        badges.appendChild(badge);
      }
      const install = card.querySelector('[data-eden-capability-install]');
      const unavailable = !authority.canMutate && !authority.canPropose;
      install.disabled = row.installed || !authenticated || Boolean(row.missingDependencies?.length) || unavailable;
      if (row.installed) install.textContent = 'Installed';
      if (!authenticated) install.textContent = 'Sign in to install';
      if (row.missingDependencies?.length) install.textContent = 'Dependencies first';
      if (authenticated && authority.canPropose && !row.installed && !row.missingDependencies?.length) install.textContent = 'Propose install';
      if (authenticated && unavailable && !row.installed && !row.missingDependencies?.length) install.textContent = 'Read only';
      install.addEventListener('click', async () => {
        if (authority.canPropose) {
          await createEdenCapabilityInstallProposal(surface, row);
          render();
          return;
        }
        const response = await requestJson('/api/eden/capability-installs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ capability: row.id })
        });
        surface.runtime = response.body?.capabilityState || capabilityInstallRuntime(surface);
        if (!response.ok) {
          setCapabilityStatus(response.body?.error || ('install failed for ' + row.id), 'error');
          render();
          return;
        }
        setCapabilityStatus('Installed ' + (row.label || row.id) + ' on ' + (runtime.targetLabel || runtime.target || 'this target') + '.', 'ok');
        await refreshAcademyState();
        render();
      });
      list.appendChild(card);
    }
  }

  function renderOrganization(node, surface) {
    const runtime = organizationRuntime(surface);
    const academy = academyState();
    const governanceTrack = (academy.tracks || []).find(track => track.id === 'governance') || null;
    const auth = node.querySelector('[data-eden-organization-auth]');
    const editor = node.querySelector('[data-eden-organization-editor]');
    const session = node.querySelector('[data-eden-organization-session]');
    const status = node.querySelector('[data-eden-organization-status]');
    const summary = node.querySelector('[data-eden-organization-summary]');
    const list = node.querySelector('[data-eden-organization-list]');
    if (!auth || !editor || !session || !status || !summary || !list) return;
    const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
    auth.hidden = authenticated;
    editor.hidden = !authenticated;
    session.textContent = authenticated
      ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. Start a group, delegate care, and run a proposal loop inside the commons.')
      : 'Sign in to practice real context, stewardship, and proposal work inside Eden.';
    status.textContent = state.organizationStatus.text || '';
    status.classList.toggle('is-error', state.organizationStatus.tone === 'error');
    status.classList.toggle('is-ok', state.organizationStatus.tone === 'ok');

    summary.innerHTML = '';
    const summaryCard = document.createElement('div');
    summaryCard.className = 'eden-capability-card';
    summaryCard.innerHTML = '<div class="eden-capability-kicker">Commons status</div><div class="eden-capability-title"></div><div class="eden-capability-body"></div><div class="eden-capability-badges"></div>';
    summaryCard.querySelector('.eden-capability-title').textContent = runtime.contextLabel || 'Guild context';
    summaryCard.querySelector('.eden-capability-body').textContent = runtime.contextExists
      ? ('Context ' + (runtime.contextId || 'guild') + ' exists under ' + (runtime.contextParent || 'the shared parent') + '.')
      : ('No commons context yet. Start the group under ' + (runtime.contextParent || 'the shared parent') + '.');
    const summaryBadges = summaryCard.querySelector('.eden-capability-badges');
    const contextBadge = document.createElement('span');
    contextBadge.className = 'eden-capability-badge' + (runtime.contextExists ? ' is-installed' : '');
    contextBadge.textContent = runtime.contextExists ? 'Group started' : 'Group not started';
    summaryBadges.appendChild(contextBadge);
    const stewardBadge = document.createElement('span');
    stewardBadge.className = 'eden-capability-badge' + (runtime.hasGuestStewardship ? ' is-installed' : '');
    stewardBadge.textContent = runtime.hasGuestStewardship
      ? ('Steward: ' + (runtime.guestSteward || 'callan'))
      : ('Delegate ' + (runtime.guestSteward || 'callan'));
    summaryBadges.appendChild(stewardBadge);
    const noticeBadge = document.createElement('span');
    noticeBadge.className = 'eden-capability-badge' + (runtime.noticeWidgetExists ? ' is-installed' : '');
    noticeBadge.textContent = runtime.noticeWidgetExists ? 'Notice authored' : 'No notice yet';
    summaryBadges.appendChild(noticeBadge);
    summary.appendChild(summaryCard);
    if (governanceTrack) summary.appendChild(renderTrackCard(governanceTrack));

    list.innerHTML = '';
    const quests = Array.isArray(surface.quests) ? surface.quests : [];
    if (quests.length) {
      const questCard = document.createElement('div');
      questCard.className = 'eden-capability-card';
      questCard.innerHTML = '<div class="eden-capability-kicker">Quest family</div><div class="eden-capability-body" data-eden-organization-quests></div>';
      const body = questCard.querySelector('[data-eden-organization-quests]');
      body.innerHTML = quests.map(quest =>
        '<div><strong>' + (quest.title || quest.id) + '</strong>: ' + (quest.statusLabel || quest.status || 'ready') + '</div>'
      ).join('');
      list.appendChild(questCard);
    }

    const proposalCard = document.createElement('div');
    proposalCard.className = 'eden-capability-card';
    proposalCard.innerHTML = '<div class="eden-capability-kicker">Proposal loop</div><div class="eden-capability-body"></div><div class="eden-capability-badges"></div>';
    proposalCard.querySelector('.eden-capability-body').textContent = runtime.openProposal
      ? ('Open proposal: ' + runtime.openProposal.id + '. Approve it to witness one governance loop.')
      : (runtime.approvedProposal
        ? ('Latest approved proposal: ' + runtime.approvedProposal.id + '.')
        : 'No governance proposal yet.');
    const proposalBadges = proposalCard.querySelector('.eden-capability-badges');
    const openBadge = document.createElement('span');
    openBadge.className = 'eden-capability-badge' + (runtime.openProposal ? ' is-installed' : '');
    openBadge.textContent = runtime.openProposal ? 'Open proposal' : 'No open proposal';
    proposalBadges.appendChild(openBadge);
    const approvedBadge = document.createElement('span');
    approvedBadge.className = 'eden-capability-badge' + (runtime.approvedProposalCount ? ' is-installed' : '');
    approvedBadge.textContent = runtime.approvedProposalCount
      ? ('Approved: ' + String(runtime.approvedProposalCount))
      : 'Approved: 0';
    proposalBadges.appendChild(approvedBadge);
    list.appendChild(proposalCard);

    const createContext = node.querySelector('[data-eden-organization-create-context]');
    const grantStewardship = node.querySelector('[data-eden-organization-grant-stewardship]');
    const createProposal = node.querySelector('[data-eden-organization-create-proposal]');
    const approveProposal = node.querySelector('[data-eden-organization-approve-proposal]');
    if (createContext) createContext.disabled = !authenticated || runtime.contextExists;
    if (grantStewardship) grantStewardship.disabled = !authenticated || !runtime.contextExists || runtime.hasGuestStewardship;
    if (createProposal) createProposal.disabled = !authenticated || !runtime.contextExists || !runtime.hasGuestStewardship;
    if (approveProposal) approveProposal.disabled = !authenticated || !runtime.openProposal;
  }

  function renderTreeSurface(node, surface) {
    const runtime = theoryAnnexRuntime(surface);
    const academy = academyState();
    const auth = node.querySelector('[data-eden-tree-auth]');
    const editor = node.querySelector('[data-eden-tree-editor]');
    const session = node.querySelector('[data-eden-tree-session]');
    const status = node.querySelector('[data-eden-tree-status]');
    const summary = node.querySelector('[data-eden-tree-summary]');
    const quests = node.querySelector('[data-eden-tree-quests]');
    const lessons = node.querySelector('[data-eden-tree-lessons]');
    if (!auth || !editor || !session || !status || !summary || !quests || !lessons) return;
    const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
    const theoryAction = actionById(surface, 'tree_theory');
    const pathOpen = theoryAction?.state === 'open';
    const stewardshipTrack = (academy.tracks || []).find(track => track.id === 'stewardship') || null;
    const teachingTrack = (academy.tracks || []).find(track => track.id === 'teaching') || null;
    const surfaceQuests = Array.isArray(surface.questIds)
      ? surface.questIds
          .map(id => (academy.quests || []).find(quest => quest.id === id) || null)
          .filter(Boolean)
      : [];
    auth.hidden = authenticated;
    editor.hidden = !authenticated;
    session.textContent = authenticated
      ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. The annex will witness optional theory work and, eventually, the trained mark.')
      : 'Sign in to make optional theory work and the trained mark count toward your academy path.';
    status.textContent = state.theoryStatus.text || '';
    status.classList.toggle('is-error', state.theoryStatus.tone === 'error');
    status.classList.toggle('is-ok', state.theoryStatus.tone === 'ok');

    summary.innerHTML = '';
    const summaryCard = document.createElement('div');
    summaryCard.className = 'eden-tree-card';
    summaryCard.innerHTML =
      '<div class="eden-tree-kicker">Theory Annex</div>'
      + '<div class="eden-tree-line">' + (pathOpen
        ? 'Open. The optional theory path can now be practiced here.'
        : (theoryAction?.requires || 'Locked.')) + '</div>'
      + '<div class="eden-tree-line">Lessons studied: ' + String(runtime.completedLessonCount || 0) + ' / ' + String((runtime.lessons || []).length) + '</div>'
      + '<div class="eden-tree-line">Trained mark: ' + (runtime.trained ? 'earned' : 'not yet earned') + '</div>'
      + '<div class="eden-tree-line">Teach-backs witnessed: ' + String(runtime.teachBackCount || 0) + '</div>';
    summary.appendChild(summaryCard);
    if (stewardshipTrack) summary.appendChild(renderTrackCard(stewardshipTrack));
    if (teachingTrack) summary.appendChild(renderTrackCard(teachingTrack));

    quests.innerHTML = '';
    for (const quest of surfaceQuests) {
      const card = document.createElement('div');
      card.className = 'eden-chapter-quest'
        + (quest.status === 'completed' ? ' is-completed' : '')
        + (quest.status === 'locked' ? ' is-locked' : '');
      const header = document.createElement('div');
      header.className = 'eden-chapter-quest-header';
      const title = document.createElement('div');
      title.className = 'eden-chapter-quest-title';
      title.textContent = quest.title || quest.id;
      const stateLabel = document.createElement('div');
      stateLabel.className = 'eden-chapter-quest-state';
      stateLabel.textContent = quest.statusLabel || quest.status || 'ready';
      header.appendChild(title);
      header.appendChild(stateLabel);
      card.appendChild(header);
      if (quest.description) {
        const body = document.createElement('div');
        body.className = 'eden-chapter-quest-body';
        body.textContent = quest.description;
        card.appendChild(body);
      }
      quests.appendChild(card);
    }

    lessons.innerHTML = '';
    for (const lesson of runtime.lessons || []) {
      const card = document.createElement('div');
      card.className = 'eden-tree-card';
      card.dataset.edenTheoryLesson = lesson.id;
      card.innerHTML =
        '<div class="eden-tree-kicker"></div>'
        + '<div class="eden-tree-line" data-eden-tree-lesson-title></div>'
        + '<div class="eden-tree-line" data-eden-tree-lesson-summary></div>'
        + '<div class="eden-tree-actions"><button type="button" data-eden-theory-study></button></div>';
      card.querySelector('.eden-tree-kicker').textContent = lesson.concept ? ('Theory · ' + lesson.concept) : 'Theory';
      card.querySelector('[data-eden-tree-lesson-title]').textContent = lesson.title;
      card.querySelector('[data-eden-tree-lesson-summary]').textContent = lesson.summary || 'Optional lesson.';
      const button = card.querySelector('[data-eden-theory-study]');
      button.textContent = lesson.completed ? 'Studied' : 'Study';
      button.disabled = !authenticated || !pathOpen || lesson.completed;
      button.addEventListener('click', async () => {
        const response = await requestJson('/api/eden/theory/lessons/' + encodeURIComponent(lesson.id) + '/study', {
          method: 'POST'
        });
        surface.runtime = response.body?.theoryState || theoryAnnexRuntime(surface);
        if (!response.ok) {
          setTheoryStatus(response.body?.error || ('study failed for ' + lesson.title), 'error');
          render();
          return;
        }
        setTheoryStatus('Studied ' + lesson.title + '.', 'ok');
        await refreshAcademyState();
        render();
      });
      lessons.appendChild(card);
    }

    const assessCard = document.createElement('div');
    assessCard.className = 'eden-tree-card';
    assessCard.innerHTML =
      '<div class="eden-tree-kicker">Assessment</div>'
      + '<div class="eden-tree-line">Complete every lesson, then take the witnessed assessment to earn the optional trained mark.</div>'
      + '<div class="eden-tree-actions"><button type="button" data-eden-theory-assess>Earn trained mark</button><button type="button" data-eden-theory-logout>Logout</button></div>';
    const assess = assessCard.querySelector('[data-eden-theory-assess]');
    assess.disabled = !authenticated || !pathOpen || !runtime.allLessonsCompleted || runtime.trained;
    if (runtime.trained) assess.textContent = 'trained mark earned';
    assess.addEventListener('click', async () => {
      const response = await requestJson('/api/eden/theory/assessment', { method: 'POST' });
      surface.runtime = response.body?.theoryState || theoryAnnexRuntime(surface);
      if (!response.ok) {
        setTheoryStatus(response.body?.error || 'assessment failed', 'error');
        render();
        return;
      }
      setTheoryStatus('The trained mark is now witnessed on your path.', 'ok');
      await refreshAcademyState();
      render();
    });
    assessCard.querySelector('[data-eden-theory-logout]').addEventListener('click', async () => {
      const response = await requestJson('/api/session', { method: 'DELETE' });
      if (!response.ok) {
        setTheoryStatus(response.body?.error || 'logout failed', 'error');
        render();
        return;
      }
      state.session = { authenticated: false, actor: null, identity: null, label: null };
      state.theoryTeachBackDraft = '';
      setTheoryStatus('Signed out. The annex keeps its notes.', 'ok');
      await refreshSessionSurfaces();
    });
    lessons.appendChild(assessCard);

    const teachBackCard = document.createElement('div');
    teachBackCard.className = 'eden-tree-card';
    teachBackCard.innerHTML =
      '<div class="eden-tree-kicker">Teach Back</div>'
      + '<div class="eden-tree-line">After the trained mark, say the world back in your own words so theory becomes something you can carry for someone else.</div>'
      + '<textarea class="eden-tree-textarea" data-eden-theory-teachback-note placeholder="What did you just learn, and how would you explain it to another builder?"></textarea>'
      + '<div class="eden-tree-actions"><button type="button" data-eden-theory-teachback>Witness teach-back</button></div>'
      + '<div class="eden-tree-teachback-list" data-eden-theory-teachback-list></div>';
    const teachBackInput = teachBackCard.querySelector('[data-eden-theory-teachback-note]');
    const teachBackButton = teachBackCard.querySelector('[data-eden-theory-teachback]');
    const teachBackList = teachBackCard.querySelector('[data-eden-theory-teachback-list]');
    teachBackInput.value = state.theoryTeachBackDraft || '';
    const syncTeachBackButton = () => {
      const hasNote = Boolean(String(teachBackInput.value || '').trim());
      teachBackButton.disabled = !authenticated || !runtime.trained || !hasNote;
      if (!authenticated) teachBackButton.textContent = 'Sign in to teach back';
      else if (!runtime.trained) teachBackButton.textContent = 'Earn trained mark first';
      else teachBackButton.textContent = runtime.teachBackCount ? 'Witness another teach-back' : 'Witness teach-back';
    };
    teachBackInput.addEventListener('input', () => {
      state.theoryTeachBackDraft = teachBackInput.value;
      syncTeachBackButton();
    });
    syncTeachBackButton();
    teachBackButton.addEventListener('click', async () => {
      const note = String(teachBackInput.value || '').trim();
      const response = await requestJson('/api/eden/theory/teach-back', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note })
      });
      surface.runtime = response.body?.theoryState || theoryAnnexRuntime(surface);
      if (!response.ok) {
        setTheoryStatus(response.body?.error || 'teach-back failed', 'error');
        render();
        return;
      }
      state.theoryTeachBackDraft = '';
      setTheoryStatus('Teach-back witnessed. Teaching now counts too.', 'ok');
      await refreshAcademyState();
      render();
    });
    teachBackList.innerHTML = '';
    const teachBacks = Array.isArray(runtime.teachBacks) ? runtime.teachBacks : [];
    if (!teachBacks.length) {
      const empty = document.createElement('div');
      empty.className = 'eden-tree-line';
      empty.textContent = runtime.trained
        ? 'No teach-backs yet. Explain one lesson in your own words.'
        : 'Teach-back unlocks after the trained mark.';
      teachBackList.appendChild(empty);
    } else {
      for (const row of teachBacks) {
        const item = document.createElement('div');
        item.className = 'eden-tree-teachback-item';
        const meta = document.createElement('div');
        meta.className = 'eden-tree-teachback-meta';
        meta.textContent = row.title || 'Witnessed teach-back';
        const note = document.createElement('div');
        note.className = 'eden-tree-line';
        note.textContent = row.note;
        item.appendChild(meta);
        item.appendChild(note);
        teachBackList.appendChild(item);
      }
    }
    lessons.appendChild(teachBackCard);
  }

  function renderProcessSurface(node, surface) {
    const runtime = processRuntime(surface);
    const academy = academyState();
    const operatorTrack = (academy.tracks || []).find(track => track.id === 'operator') || null;
    const auth = node.querySelector('[data-eden-process-auth]');
    const editor = node.querySelector('[data-eden-process-editor]');
    const session = node.querySelector('[data-eden-process-session]');
    const status = node.querySelector('[data-eden-process-status]');
    const summary = node.querySelector('[data-eden-process-summary]');
    const quests = node.querySelector('[data-eden-process-quests]');
    const preview = node.querySelector('[data-eden-process-preview]');
    if (!auth || !editor || !session || !status || !summary || !quests || !preview) return;
    const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
    const alterAction = actionById(surface, 'process_alter');
    const surfaceQuests = Array.isArray(surface.questIds)
      ? surface.questIds
          .map(id => (academy.quests || []).find(quest => quest.id === id) || null)
          .filter(Boolean)
      : [];
    auth.hidden = authenticated;
    editor.hidden = !authenticated;
    session.textContent = authenticated
      ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. The machine room will witness your practice.')
      : 'Sign in to make process practice and runtime drills count toward your academy path.';
    status.textContent = state.processStatus.text || '';
    status.classList.toggle('is-error', state.processStatus.tone === 'error');
    status.classList.toggle('is-ok', state.processStatus.tone === 'ok');

    summary.innerHTML = '';
    const practiceCard = document.createElement('div');
    practiceCard.className = 'eden-process-card';
    practiceCard.innerHTML =
      '<div class="eden-process-kicker">Operator Practice</div>'
      + '<div class="eden-process-line">Process views witnessed: ' + String(academy.practice?.processViews || 0) + '</div>'
      + '<div class="eden-process-line">Runtime drills witnessed: ' + String(academy.practice?.runtimeDrills || 0) + '</div>'
      + '<div class="eden-process-line">Version publishes witnessed: ' + String(academy.practice?.versionPublishes || 0) + '</div>';
    summary.appendChild(practiceCard);

    const gateCard = document.createElement('div');
    gateCard.className = 'eden-process-card';
    gateCard.innerHTML =
      '<div class="eden-process-kicker">Alter Runtime Gate</div>'
      + '<div class="eden-process-line">' + (alterAction?.state === 'open'
        ? 'Open. You can now run the failure drill from inside Eden.'
        : (alterAction?.requires || 'Locked.')) + '</div>';
    summary.appendChild(gateCard);
    if (operatorTrack) summary.appendChild(renderTrackCard(operatorTrack));

    quests.innerHTML = '';
    if (surfaceQuests.length) {
      for (const quest of surfaceQuests) {
        const card = document.createElement('div');
        card.className = 'eden-chapter-quest'
          + (quest.status === 'completed' ? ' is-completed' : '')
          + (quest.status === 'locked' ? ' is-locked' : '');
        const header = document.createElement('div');
        header.className = 'eden-chapter-quest-header';
        const title = document.createElement('div');
        title.className = 'eden-chapter-quest-title';
        title.textContent = quest.title || quest.id;
        const stateLabel = document.createElement('div');
        stateLabel.className = 'eden-chapter-quest-state';
        stateLabel.textContent = quest.statusLabel || quest.status || 'ready';
        header.appendChild(title);
        header.appendChild(stateLabel);
        card.appendChild(header);
        if (quest.description) {
          const body = document.createElement('div');
          body.className = 'eden-chapter-quest-body';
          body.textContent = quest.description;
          card.appendChild(body);
        }
        const notes = [];
        if (Array.isArray(quest.unlocks) && quest.unlocks.length) notes.push('Unlocks: ' + quest.unlocks.join(', '));
        if (Array.isArray(quest.missingDependencies) && quest.missingDependencies.length) notes.push('Needs: ' + quest.missingDependencies.join(', '));
        if (Array.isArray(quest.missingSignals) && quest.missingSignals.length && quest.status !== 'completed') notes.push('Practice signals: ' + quest.missingSignals.join(', '));
        if (notes.length) {
          const note = document.createElement('div');
          note.className = 'eden-chapter-quest-note';
          note.textContent = notes.join(' Â· ');
          card.appendChild(note);
        }
        quests.appendChild(card);
      }
    } else {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'eden-process-card';
      emptyCard.innerHTML =
        '<div class="eden-process-kicker">Operator Path</div>'
        + '<div class="eden-process-line">No local operator quests are authored for this surface yet.</div>';
      quests.appendChild(emptyCard);
    }

    const inspectButton = node.querySelector('[data-eden-process-inspect]');
    const drillButton = node.querySelector('[data-eden-process-drill]');
    if (inspectButton) inspectButton.disabled = !authenticated;
    if (drillButton) drillButton.disabled = !authenticated || alterAction?.state !== 'open';

    preview.innerHTML = '';
    if (runtime.preview?.selection?.program) {
      const graph = runtime.preview.graph || { nodes: [], layers: [] };
      const runs = Array.isArray(runtime.preview.runs) ? runtime.preview.runs : [];
      const previewCard = document.createElement('div');
      previewCard.className = 'eden-process-card';
      previewCard.innerHTML =
        '<div class="eden-process-kicker">Last Process Read</div>'
        + '<div class="eden-process-line">' + runtime.preview.selection.program + ' · ' + (runtime.preview.selection.event || 'load') + '</div>'
        + '<div class="eden-process-line">' + String(graph.nodes?.length || 0) + ' nodes · ' + String(graph.layers?.length || 0) + ' layers · ' + String(runs.length) + ' runs</div>';
      preview.appendChild(previewCard);
    } else {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'eden-process-card';
      emptyCard.innerHTML =
        '<div class="eden-process-kicker">Inspect Flow</div>'
        + '<div class="eden-process-line">Read the real process graph here first. That witnessed read opens the operator gate when paired with a real publish.</div>';
      preview.appendChild(emptyCard);
    }
  }

  function bindSurfaceNode(node, surface) {
    node.dataset.edenSurface = surface.id;
    node.classList.toggle('is-chrome-tray', surface.chromeKind === 'tray');
    node.classList.toggle('is-chrome-shelf', surface.chromeKind === 'shelf');
    node.classList.toggle('is-chrome-machinePlate', surface.chromeKind === 'machinePlate');
    node.classList.toggle('is-chrome-mapWall', surface.chromeKind === 'mapWall');
    node.addEventListener('pointerenter', () => {
      state.hoverSurfaceId = surface.id;
      render();
    });
    node.addEventListener('pointerleave', () => {
      if (state.hoverSurfaceId === surface.id) state.hoverSurfaceId = null;
      render();
    });
    node.addEventListener('dblclick', event => {
      if (surface.cameraTargetId) {
        event.preventDefault();
        focusTarget(surface.cameraTargetId);
      }
    });
  }

  function ensureSurface(surface) {
    if (state.elements.has(surface.id)) return state.elements.get(surface.id);
    let node;
    if (surface.surfaceKind === 'embeddedPage') {
      node = document.createElement('section');
      node.className = 'eden-surface';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div></div><div class="eden-surface-actions"></div><iframe class="eden-embedded-frame" loading="lazy"></iframe><div class="eden-relief-layer" data-eden-relief-layer></div><div class="eden-embedded-actions"><span class="eden-embedded-mode" data-eden-embedded-mode>Map mode</span><button type="button" data-eden-embedded-inspect aria-pressed="false">Inspect Board</button><button type="button" data-eden-embedded-command disabled>Search Board</button><a target="_self">Open app</a></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || 'Live embedded board';
      node.querySelector('.eden-surface-body p').textContent = surface.body || 'The canonical starter app remains real inside the neighbourhood.';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('iframe').src = surface.src || '/';
      node.querySelector('iframe').dataset.baseSrc = surface.src || '/';
      node.querySelector('iframe').addEventListener('load', () => {
        syncEmbeddedMode(surface);
        render();
      });
      node.querySelector('[data-eden-embedded-inspect]').addEventListener('click', event => {
        event.preventDefault();
        toggleEmbeddedInspect(surface);
      });
      node.querySelector('[data-eden-embedded-command]').addEventListener('click', event => {
        event.preventDefault();
        if (!embeddedMode(surface.id).inspect) toggleEmbeddedInspect(surface, true);
        setEmbeddedSurfaceCommand(surface.id, true);
      });
      const action = node.querySelector('a');
      action.href = surface.href || surface.src || '/';
    } else if (surface.surfaceKind === 'tree') {
      node = document.createElement('section');
      node.className = 'eden-surface eden-surface-tree';
      node.innerHTML = '<div class="eden-tree-shell"><div><div class="eden-surface-title"></div><small></small></div><div class="eden-surface-body"><p></p></div><div class="eden-tree-auth" data-eden-tree-auth><form class="eden-tree-grid" data-eden-tree-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-tree-actions"><button type="submit">Open Theory Annex</button></div></form></div><div class="eden-tree-editor" data-eden-tree-editor hidden><div class="eden-tree-session" data-eden-tree-session></div></div><div class="eden-tree-status" data-eden-tree-status></div><div class="eden-tree-summary" data-eden-tree-summary></div><div class="eden-tree-quests" data-eden-tree-quests></div><div class="eden-tree-lessons" data-eden-tree-lessons></div><div class="eden-surface-actions"></div></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('small').textContent = surface.subtitle || 'Landmark';
      node.querySelector('.eden-surface-body p').textContent = surface.body || 'Growth, authorship, and return.';
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('[data-eden-tree-login-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const username = form.querySelector('[name="username"]').value;
        const password = form.querySelector('[name="password"]').value;
        const response = await requestJson('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        if (!response.ok) {
          setTheoryStatus(response.body?.error || 'invalid credentials', 'error');
          render();
          return;
        }
        state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
        setTheoryStatus('Theory annex open. Optional study now counts.', 'ok');
        await refreshSessionSurfaces();
      });
      renderTreeSurface(node, surface);
    } else if (surface.surfaceKind === 'goto') {
      node = document.createElement(surface.href ? 'a' : 'button');
      node.className = 'eden-surface eden-surface-goto';
      if (surface.href) node.href = surface.href;
      else node.type = 'button';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || 'Transport';
      node.querySelector('.eden-surface-body').textContent = surface.body || 'Move across the world.';
      node.addEventListener('click', event => {
        event.preventDefault();
        if (surface.cameraTargetId) focusTarget(surface.cameraTargetId);
        if (surface.href) {
          setStatus('transporting to ' + surface.title);
          setTimeout(() => { window.location.href = surface.href; }, 160);
        }
      });
    } else if (surface.panelKind === 'personalBox') {
      node = document.createElement('section');
      node.className = 'eden-surface';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-personal-auth" data-eden-personal-auth><form class="eden-personal-grid" data-eden-login-form><input name="username" placeholder="Username" autocomplete="username" data-eden-personal-username /><input name="password" type="password" placeholder="Password" autocomplete="current-password" data-eden-personal-password /><div class="eden-personal-actions"><button type="submit">Claim Your Room</button></div></form></div><div class="eden-personal-editor" data-eden-personal-editor hidden><div class="eden-personal-session" data-eden-personal-session></div><form class="eden-personal-grid" data-eden-personal-form><select name="kind"><option value="note">Note</option><option value="check">Check</option><option value="link">Link</option></select><input name="text" placeholder="Widget text" /><input name="href" placeholder="Optional link for link widgets" /><div class="eden-personal-actions"><button type="submit" data-eden-personal-submit>Add widget</button><button type="button" data-eden-personal-cancel hidden>Cancel edit</button><button type="button" data-eden-personal-logout>Logout</button></div></form></div><div class="eden-personal-status" data-eden-personal-status></div><div class="eden-personal-items" data-eden-personal-items></div></div><div class="eden-surface-actions"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
      node.querySelector('.eden-surface-body p').textContent = surface.body || '';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('[data-eden-login-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const username = form.querySelector('[name="username"]').value;
        const password = form.querySelector('[name="password"]').value;
        const response = await requestJson('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        if (!response.ok) {
          setPersonalStatus(response.body?.error || 'invalid credentials', 'error');
          render();
          return;
        }
        state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
        setPersonalStatus('Room claimed. Your box is live.', 'ok');
        await refreshSessionSurfaces();
      });
      node.querySelector('[data-eden-personal-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = {
          kind: form.querySelector('[name="kind"]').value,
          text: form.querySelector('[name="text"]').value,
          href: form.querySelector('[name="href"]').value
        };
        const editingId = form.dataset.itemId || '';
        const response = await requestJson(editingId ? ('/api/eden/personal-box/items/' + encodeURIComponent(editingId)) : '/api/eden/personal-box/items', {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          setPersonalStatus(response.body?.error || 'save failed', 'error');
          render();
          return;
        }
        state.personalEditingId = null;
        setPersonalStatus(editingId ? 'Widget updated.' : 'Widget added.', 'ok');
        await refreshPersonalBox(surface);
        await refreshAcademyState();
      });
      node.querySelector('[data-eden-personal-cancel]').addEventListener('click', event => {
        state.personalEditingId = null;
        fillPersonalEditor(event.currentTarget.closest('form'), surface, null);
        setPersonalStatus('Edit cancelled.', 'ok');
      });
      node.querySelector('[data-eden-personal-logout]').addEventListener('click', async () => {
        const response = await requestJson('/api/session', { method: 'DELETE' });
        if (!response.ok) {
          setPersonalStatus(response.body?.error || 'logout failed', 'error');
          render();
          return;
        }
        state.session = { authenticated: false, actor: null, identity: null, label: null };
        state.personalEditingId = null;
        setPersonalStatus('Signed out. The room is waiting.', 'ok');
        await refreshSessionSurfaces();
      });
      renderPersonalBox(node, surface);
    } else if (surface.panelKind === 'editPage') {
      node = document.createElement('section');
      node.className = 'eden-surface';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-edit-auth" data-eden-edit-auth><form class="eden-edit-grid" data-eden-edit-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-edit-actions"><button type="submit">Open Edit Page</button></div></form></div><div class="eden-edit-editor" data-eden-edit-editor hidden><div class="eden-edit-session" data-eden-edit-session></div><form class="eden-edit-grid" data-eden-edit-form><select name="themeId"><option value="paper">Paper Cream</option><option value="straw">Straw</option><option value="moss">Moss</option></select><select name="material"><option value="linen">Linen</option><option value="wood">Wood</option><option value="stone">Stone</option></select><select name="typography"><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select><div class="eden-edit-actions"><button type="submit">Apply to Todo</button><button type="button" data-eden-edit-reset>Reset View</button><button type="button" data-eden-edit-logout>Logout</button></div></form></div><div class="eden-edit-status" data-eden-edit-status></div><div class="eden-edit-preview" data-eden-edit-preview></div></div><div class="eden-surface-actions"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
      node.querySelector('.eden-surface-body p').textContent = surface.body || '';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('[data-eden-edit-login-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const response = await requestJson('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            username: form.querySelector('[name="username"]').value,
            password: form.querySelector('[name="password"]').value
          })
        });
        if (!response.ok) {
          setEditStatus(response.body?.error || 'invalid credentials', 'error');
          render();
          return;
        }
        state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
        setEditStatus('Edit page unlocked for this session.', 'ok');
        await refreshSessionSurfaces();
      });
      node.querySelector('[data-eden-edit-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const response = await requestJson('/api/eden/page-theme', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            themeId: form.querySelector('[name="themeId"]').value,
            material: form.querySelector('[name="material"]').value,
            typography: form.querySelector('[name="typography"]').value
          })
        });
        if (!response.ok) {
          setEditStatus(response.body?.error || 'page theme save failed', 'error');
          render();
          return;
        }
        surface.runtime = { ...(surface.runtime || {}), mode: 'pageTheme', pageId: surface.pageId || 'todo_app_widget', pageTheme: response.body?.pageTheme || null };
        setEditStatus('Todo page treatment updated.', 'ok');
        reloadEmbeddedTodoPage();
        await refreshPageTheme(surface);
        await refreshAcademyState();
      });
      node.querySelector('[data-eden-edit-reset]').addEventListener('click', async () => {
        await refreshPageTheme(surface);
        setEditStatus('Reloaded current page treatment.', 'ok');
      });
      node.querySelector('[data-eden-edit-logout]').addEventListener('click', async () => {
        const response = await requestJson('/api/session', { method: 'DELETE' });
        if (!response.ok) {
          setEditStatus(response.body?.error || 'logout failed', 'error');
          render();
          return;
        }
        state.session = { authenticated: false, actor: null, identity: null, label: null };
        setEditStatus('Signed out. Edit Page is dormant again.', 'ok');
        await refreshSessionSurfaces();
      });
      renderEditPage(node, surface);
    } else if (surface.panelKind === 'organization') {
      node = document.createElement('section');
      node.className = 'eden-surface';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-capability-auth" data-eden-organization-auth><form class="eden-capability-grid" data-eden-organization-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-capability-actions"><button type="submit">Open Commons</button></div></form></div><div class="eden-capability-editor" data-eden-organization-editor hidden><div class="eden-capability-session" data-eden-organization-session></div><div class="eden-capability-actions"><button type="button" data-eden-organization-create-context>Start A Group</button><button type="button" data-eden-organization-grant-stewardship>Set The Rules</button><button type="button" data-eden-organization-create-proposal>Open Proposal</button><button type="button" data-eden-organization-approve-proposal>Approve Proposal</button><button type="button" data-eden-organization-refresh>Refresh</button><button type="button" data-eden-organization-logout>Logout</button></div></div><div class="eden-capability-status" data-eden-organization-status></div><div class="eden-capability-summary" data-eden-organization-summary></div><div class="eden-capability-list" data-eden-organization-list></div></div><div class="eden-surface-actions"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
      node.querySelector('.eden-surface-body p').textContent = surface.body || '';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('[data-eden-organization-login-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const response = await requestJson('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            username: form.querySelector('[name="username"]').value,
            password: form.querySelector('[name="password"]').value
          })
        });
        if (!response.ok) {
          setOrganizationStatus(response.body?.error || 'invalid credentials', 'error');
          render();
          return;
        }
        state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
        setOrganizationStatus('Commons unlocked for this session.', 'ok');
        await refreshSessionSurfaces();
      });
      node.querySelector('[data-eden-organization-create-context]').addEventListener('click', async () => {
        const response = await requestJson('/api/eden/organization/context', { method: 'POST' });
        surface.runtime = response.body?.organizationState || organizationRuntime(surface);
        if (!response.ok) {
          setOrganizationStatus(response.body?.error || 'group start failed', 'error');
          render();
          return;
        }
        setOrganizationStatus('Group started under the commons.', 'ok');
        await refreshAcademyState();
        render();
      });
      node.querySelector('[data-eden-organization-grant-stewardship]').addEventListener('click', async () => {
        const response = await requestJson('/api/eden/organization/stewardship', { method: 'POST' });
        surface.runtime = response.body?.organizationState || organizationRuntime(surface);
        if (!response.ok) {
          setOrganizationStatus(response.body?.error || 'stewardship grant failed', 'error');
          render();
          return;
        }
        const steward = surface.runtime?.guestSteward || 'callan';
        setOrganizationStatus('Delegated commons stewardship to ' + steward + '.', 'ok');
        await refreshAcademyState();
        render();
      });
      node.querySelector('[data-eden-organization-create-proposal]').addEventListener('click', async () => {
        const response = await requestJson('/api/eden/organization/proposals', { method: 'POST' });
        surface.runtime = response.body?.organizationState || organizationRuntime(surface);
        if (!response.ok) {
          setOrganizationStatus(response.body?.error || 'proposal create failed', 'error');
          render();
          return;
        }
        setOrganizationStatus('Governance proposal opened in the commons.', 'ok');
        await refreshAcademyState();
        render();
      });
      node.querySelector('[data-eden-organization-approve-proposal]').addEventListener('click', async () => {
        const response = await requestJson('/api/eden/organization/proposals/approve', { method: 'POST' });
        surface.runtime = response.body?.organizationState || organizationRuntime(surface);
        if (!response.ok) {
          setOrganizationStatus(response.body?.error || 'proposal approval failed', 'error');
          render();
          return;
        }
        setOrganizationStatus('Open organization witnessed through approval.', 'ok');
        await refreshAcademyState();
        render();
      });
      node.querySelector('[data-eden-organization-refresh]').addEventListener('click', async () => {
        await refreshOrganization(surface);
        setOrganizationStatus('Reloaded commons state.', 'ok');
      });
      node.querySelector('[data-eden-organization-logout]').addEventListener('click', async () => {
        const response = await requestJson('/api/session', { method: 'DELETE' });
        if (!response.ok) {
          setOrganizationStatus(response.body?.error || 'logout failed', 'error');
          render();
          return;
        }
        state.session = { authenticated: false, actor: null, identity: null, label: null };
        setOrganizationStatus('Signed out. The commons stays visible but inactive.', 'ok');
        await refreshSessionSurfaces();
      });
      renderOrganization(node, surface);
    } else if (surface.panelKind === 'capabilityInstall') {
      node = document.createElement('section');
      node.className = 'eden-surface';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-capability-auth" data-eden-capability-auth><form class="eden-capability-grid" data-eden-capability-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-capability-actions"><button type="submit">Open Capability Shelf</button></div></form></div><div class="eden-capability-editor" data-eden-capability-editor hidden><div class="eden-capability-session" data-eden-capability-session></div><div class="eden-capability-actions"><button type="button" data-eden-capability-refresh>Refresh</button><button type="button" data-eden-capability-logout>Logout</button></div></div><div class="eden-capability-status" data-eden-capability-status></div><div class="eden-capability-summary" data-eden-capability-summary></div><div class="eden-capability-list" data-eden-capability-list></div></div><div class="eden-surface-actions"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
      node.querySelector('.eden-surface-body p').textContent = surface.body || '';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('[data-eden-capability-login-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const response = await requestJson('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            username: form.querySelector('[name="username"]').value,
            password: form.querySelector('[name="password"]').value
          })
        });
        if (!response.ok) {
          setCapabilityStatus(response.body?.error || 'invalid credentials', 'error');
          render();
          return;
        }
        state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
        setCapabilityStatus('Capability shelf unlocked for this session.', 'ok');
        await refreshSessionSurfaces();
      });
      node.querySelector('[data-eden-capability-refresh]').addEventListener('click', async () => {
        await refreshCapabilityInstall(surface);
        setCapabilityStatus('Reloaded capability state.', 'ok');
      });
      node.querySelector('[data-eden-capability-logout]').addEventListener('click', async () => {
        const response = await requestJson('/api/session', { method: 'DELETE' });
        if (!response.ok) {
          setCapabilityStatus(response.body?.error || 'logout failed', 'error');
          render();
          return;
        }
        state.session = { authenticated: false, actor: null, identity: null, label: null };
        setCapabilityStatus('Signed out. Capability installs are read-only again.', 'ok');
        await refreshSessionSurfaces();
      });
      renderCapabilityInstall(node, surface);
    } else if (surface.panelKind === 'processView') {
      node = document.createElement('section');
      node.className = 'eden-surface';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-process-auth" data-eden-process-auth><form class="eden-process-grid" data-eden-process-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-process-actions"><button type="submit">Open Machine Room</button></div></form></div><div class="eden-process-editor" data-eden-process-editor hidden><div class="eden-process-session" data-eden-process-session></div><div class="eden-process-actions"><button type="button" data-eden-process-inspect>Inspect Flow Here</button><button type="button" data-eden-process-drill>Run Failure Drill</button><a data-eden-process-open-full href="/process">Open full Process View</a><button type="button" data-eden-process-refresh>Refresh</button><button type="button" data-eden-process-logout>Logout</button></div></div><div class="eden-process-status" data-eden-process-status></div><div class="eden-process-summary" data-eden-process-summary></div><div class="eden-process-quests" data-eden-process-quests></div><div class="eden-process-preview" data-eden-process-preview></div></div><div class="eden-surface-actions"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
      node.querySelector('.eden-surface-body p').textContent = surface.body || '';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('[data-eden-process-open-full]').href = surface.href || '/process';
      node.querySelector('[data-eden-process-login-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const response = await requestJson('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            username: form.querySelector('[name="username"]').value,
            password: form.querySelector('[name="password"]').value
          })
        });
        if (!response.ok) {
          setProcessStatus(response.body?.error || 'invalid credentials', 'error');
          render();
          return;
        }
        state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
        setProcessStatus('Machine room unlocked for this session.', 'ok');
        await refreshSessionSurfaces();
      });
      node.querySelector('[data-eden-process-inspect]').addEventListener('click', async () => {
        await refreshProcessPreview(surface);
        setProcessStatus('Process graph read from the live runtime.', 'ok');
      });
      node.querySelector('[data-eden-process-drill]').addEventListener('click', async () => {
        const response = await requestJson('/api/simulate-network-error');
        if (response.status !== 503 || response.body?.error !== 'simulated network error') {
          setProcessStatus(response.body?.error || 'runtime drill failed', 'error');
          render();
          return;
        }
        setProcessStatus('Failure drill witnessed. The runtime answered honestly.', 'ok');
        await refreshAcademyState();
        render();
      });
      node.querySelector('[data-eden-process-refresh]').addEventListener('click', async () => {
        await refreshProcessPreview(surface);
        setProcessStatus('Reloaded process practice state.', 'ok');
      });
      node.querySelector('[data-eden-process-logout]').addEventListener('click', async () => {
        const response = await requestJson('/api/session', { method: 'DELETE' });
        if (!response.ok) {
          setProcessStatus(response.body?.error || 'logout failed', 'error');
          render();
          return;
        }
        state.session = { authenticated: false, actor: null, identity: null, label: null };
        setProcessStatus('Signed out. Operator practice is read-only again.', 'ok');
        await refreshSessionSurfaces();
      });
      renderProcessSurface(node, surface);
    } else if (surface.panelKind === 'versions') {
      node = document.createElement('section');
      node.className = 'eden-surface';
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-version-auth" data-eden-version-auth><form class="eden-version-grid" data-eden-version-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-version-actions"><button type="submit">Open Versions</button></div></form></div><div class="eden-version-editor" data-eden-version-editor hidden><div class="eden-version-session" data-eden-version-session></div><div class="eden-version-actions"><button type="button" data-eden-version-open-published>View published in board</button><button type="button" data-eden-version-open-draft>Open draft in board</button><button type="button" data-eden-version-restore>Restore last good</button><button type="button" data-eden-version-publish>Publish current</button><button type="button" data-eden-version-refresh>Refresh</button><button type="button" data-eden-version-logout>Logout</button></div></div><div class="eden-version-status" data-eden-version-status></div><div class="eden-version-summary" data-eden-version-summary></div><div class="eden-version-card"><div class="eden-version-card-kicker">Compare to published</div><div class="eden-version-diff" data-eden-version-diff-published></div></div><div class="eden-version-card"><div class="eden-version-card-kicker">Compare to draft</div><div class="eden-version-diff" data-eden-version-diff-draft></div></div><div class="eden-version-list" data-eden-version-list></div></div><div class="eden-surface-actions"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
      node.querySelector('.eden-surface-body p').textContent = surface.body || '';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
      node.querySelector('[data-eden-version-login-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const response = await requestJson('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            username: form.querySelector('[name="username"]').value,
            password: form.querySelector('[name="password"]').value
          })
        });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'invalid credentials', 'error');
          render();
          return;
        }
        state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
        setVersionStatus('Versions unlocked for this session.', 'ok');
        await refreshSessionSurfaces();
      });
      node.querySelector('[data-eden-version-open-published]').addEventListener('click', async () => {
        const runtime = versionsRuntime(surface);
        if (runtime.authority?.canPropose) {
          await createEdenVersionProposal(surface, {
            processName: 'widgetVersion.activate',
            version: runtime.publishedVersion,
            reason: 'Load the published shared version into the live board through proposal review',
            statusText: 'Proposed loading the published version into the board'
          });
          render();
          return;
        }
        const response = await requestJson('/api/eden/versions/activate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version: runtime.publishedVersion })
        });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'published activation failed', 'error');
          render();
          return;
        }
        surface.runtime = response.body?.versionState || runtime;
        setVersionStatus('Published version loaded into the board.', 'ok');
        reloadEmbeddedTodoPage();
        await refreshAcademyState();
        render();
      });
      node.querySelector('[data-eden-version-open-draft]').addEventListener('click', async () => {
        const runtime = versionsRuntime(surface);
        if (runtime.authority?.canPropose) {
          await createEdenVersionProposal(surface, {
            processName: 'widgetVersion.activate',
            version: runtime.draftVersion,
            reason: 'Open the draft shared version in the live board through proposal review',
            statusText: 'Proposed opening the draft version in the board'
          });
          render();
          return;
        }
        const response = await requestJson('/api/eden/versions/activate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version: runtime.draftVersion })
        });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'draft activation failed', 'error');
          render();
          return;
        }
        surface.runtime = response.body?.versionState || runtime;
        setVersionStatus('Draft version opened in the live board.', 'ok');
        reloadEmbeddedTodoPage();
        await refreshAcademyState();
        render();
      });
      node.querySelector('[data-eden-version-restore]').addEventListener('click', async () => {
        const runtime = versionsRuntime(surface);
        if (runtime.authority?.canPropose) {
          await createEdenVersionProposal(surface, {
            processName: 'widgetVersion.rollback',
            reason: 'Restore the last good shared version through proposal review',
            statusText: 'Proposed restoring the last good version'
          });
          render();
          return;
        }
        const response = await requestJson('/api/eden/versions/rollback', {
          method: 'POST'
        });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'restore failed', 'error');
          render();
          return;
        }
        surface.runtime = response.body?.versionState || versionsRuntime(surface);
        setVersionStatus('Restored the last good version.', 'ok');
        reloadEmbeddedTodoPage();
        await refreshAcademyState();
        render();
      });
      node.querySelector('[data-eden-version-publish]').addEventListener('click', async () => {
        const runtime = versionsRuntime(surface);
        if (runtime.authority?.canPropose) {
          await createEdenVersionProposal(surface, {
            processName: 'edenVersions.publish',
            version: runtime.activeVersion,
            reason: 'Publish the current shared version through proposal review',
            statusText: 'Proposed publishing the current live version'
          });
          render();
          return;
        }
        const response = await requestJson('/api/eden/versions/publish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version: runtime.activeVersion })
        });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'publish failed', 'error');
          render();
          return;
        }
        surface.runtime = response.body?.versionState || runtime;
        setVersionStatus('Current live version is now published.', 'ok');
        await refreshAcademyState();
        render();
      });
      node.querySelector('[data-eden-version-refresh]').addEventListener('click', async () => {
        await refreshVersions(surface);
        setVersionStatus('Reloaded version state.', 'ok');
      });
      node.querySelector('[data-eden-version-logout]').addEventListener('click', async () => {
        const response = await requestJson('/api/session', { method: 'DELETE' });
        if (!response.ok) {
          setVersionStatus(response.body?.error || 'logout failed', 'error');
          render();
          return;
        }
        state.session = { authenticated: false, actor: null, identity: null, label: null };
        setVersionStatus('Signed out. Versions are read-only again.', 'ok');
        await refreshSessionSurfaces();
      });
      renderVersions(node, surface);
    } else {
      node = document.createElement('section');
      node.className = 'eden-surface' + (surface.href ? ' eden-surface-link' : '');
      node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div></div><div class="eden-surface-actions"></div>';
      node.querySelector('.eden-surface-title').textContent = surface.title;
      node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
      node.querySelector('.eden-surface-body p').textContent = surface.body || '';
      applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
      renderActions(node.querySelector('.eden-surface-actions'), surface);
    }
    bindSurfaceNode(node, surface);
    surfacesRoot.appendChild(node);
    state.elements.set(surface.id, node);
    return node;
  }

  function renderConnections() {
    svg.innerHTML = '';
    const visible = new Map(model.surfaces.filter(isVisible).map(surface => [surface.id, surface]));
    for (const connection of model.connections) {
      const from = visible.get(connection.from);
      const to = visible.get(connection.to);
      if (!from || !to) continue;
      const { start, end } = core.layoutConnector(from, to);
      const a = core.worldToScreen(state.camera, start.x, start.y);
      const b = core.worldToScreen(state.camera, end.x, end.y);
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
      line.setAttribute('stroke-width', connection.visualType === 'pipe' ? '4' : connection.visualType === 'path' ? '3' : '2');
      line.setAttribute('stroke', connection.visualType === 'pipe' ? 'var(--eden-pipe)' : connection.visualType === 'path' ? 'var(--eden-path)' : 'var(--eden-wire)');
      line.setAttribute('stroke-dasharray', connection.visualType === 'path' ? '10 10' : 'none');
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line);
      if (connection.label) {
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('x', String((a.x + b.x) / 2));
        text.setAttribute('y', String((a.y + b.y) / 2 - 6));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'eden-connector-label');
        text.textContent = connection.label;
        svg.appendChild(text);
      }
    }
  }

  function renderPrompt() {
    const prompt = model.prompts.find(row => {
      const minZoom = row.visibleRange?.minZoom ?? 0;
      const maxZoom = row.visibleRange?.maxZoom ?? 99;
      return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
    }) || null;
    promptEl.hidden = !prompt;
    promptEl.textContent = prompt ? prompt.text : '';
  }

  function renderTrackCard(track) {
    const card = document.createElement('div');
    card.className = 'eden-chapter-quest'
      + (track.status === 'locked' ? ' is-locked' : '')
      + (track.status === 'practiced' ? ' is-completed' : '');
    const header = document.createElement('div');
    header.className = 'eden-chapter-quest-header';
    const title = document.createElement('div');
    title.className = 'eden-chapter-quest-title';
    title.textContent = track.title || track.id;
    const stateLabel = document.createElement('div');
    stateLabel.className = 'eden-chapter-quest-state';
    stateLabel.textContent = track.statusLabel || track.status || 'ready';
    header.appendChild(title);
    header.appendChild(stateLabel);
    card.appendChild(header);
    if (track.description) {
      const body = document.createElement('div');
      body.className = 'eden-chapter-quest-body';
      body.textContent = track.description;
      card.appendChild(body);
    }
    const notes = ['Witnessed count: ' + String(track.count || 0)];
    if (track.nextThreshold && track.nextLabel) notes.push('Next: ' + track.nextLabel + ' at ' + String(track.nextThreshold));
    const breakdown = Array.isArray(track.breakdown) ? track.breakdown.filter(entry => (entry?.count || 0) > 0) : [];
    if (breakdown.length) notes.push(breakdown.map(entry => entry.label + ': ' + String(entry.count || 0)).join(' · '));
    const note = document.createElement('div');
    note.className = 'eden-chapter-quest-note';
    note.textContent = notes.join(' · ');
    card.appendChild(note);
    return card;
  }

  function renderCheckpoint() {
    const academy = academyState();
    const checkpoint = model.checkpoints.find(row => {
      const minZoom = row.visibleRange?.minZoom ?? 0;
      const maxZoom = row.visibleRange?.maxZoom ?? 99;
      return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
    }) || null;
    chapterEl.hidden = !checkpoint;
    if (!checkpoint) return;
    chapterTitleEl.textContent = checkpoint.title;
    chapterBodyEl.textContent = checkpoint.description || checkpoint.statusText || '';
    chapterUnlocksEl.innerHTML = '';
    for (const item of checkpoint.unlocks || []) {
      const chip = document.createElement('span');
      chip.className = 'eden-chip is-open';
      chip.textContent = item;
      chapterUnlocksEl.appendChild(chip);
    }
    if (!chapterQuestsEl) return;
    chapterQuestsEl.innerHTML = '';
    for (const quest of checkpoint.quests || []) {
      const card = document.createElement('div');
      card.className = 'eden-chapter-quest'
        + (quest.status === 'completed' ? ' is-completed' : '')
        + (quest.status === 'locked' ? ' is-locked' : '');
      const header = document.createElement('div');
      header.className = 'eden-chapter-quest-header';
      const title = document.createElement('div');
      title.className = 'eden-chapter-quest-title';
      title.textContent = quest.title || quest.id;
      const stateLabel = document.createElement('div');
      stateLabel.className = 'eden-chapter-quest-state';
      stateLabel.textContent = quest.statusLabel || quest.status || 'ready';
      header.appendChild(title);
      header.appendChild(stateLabel);
      card.appendChild(header);
      if (quest.description) {
        const body = document.createElement('div');
        body.className = 'eden-chapter-quest-body';
        body.textContent = quest.description;
        card.appendChild(body);
      }
      const notes = [];
      if (Array.isArray(quest.unlocks) && quest.unlocks.length) notes.push('Unlocks: ' + quest.unlocks.join(', '));
      if (Array.isArray(quest.missingDependencies) && quest.missingDependencies.length) notes.push('Needs: ' + quest.missingDependencies.join(', '));
      if (Array.isArray(quest.missingSignals) && quest.missingSignals.length && quest.status !== 'completed') notes.push('Practice signals: ' + quest.missingSignals.join(', '));
      if (notes.length) {
        const note = document.createElement('div');
        note.className = 'eden-chapter-quest-note';
        note.textContent = notes.join(' · ');
        card.appendChild(note);
      }
      chapterQuestsEl.appendChild(card);
    }
    if (!chapterTracksEl) return;
    chapterTracksEl.innerHTML = '';
    for (const track of academy.tracks || []) chapterTracksEl.appendChild(renderTrackCard(track));
  }

  function render() {
    for (const surface of model.surfaces) {
      const node = ensureSurface(surface);
      const visible = isVisible(surface);
      node.hidden = !visible;
      if (!visible) continue;
      const rect = rectToScreen(surface);
      node.style.left = rect.left + 'px';
      node.style.top = rect.top + 'px';
      node.style.width = rect.width + 'px';
      node.style.height = rect.height + 'px';
      node.dataset.relief = String(Math.max(0, Math.min(4, reliefLevelFor(surface))));
      node.classList.toggle('is-focused', state.focusSurfaceId === surface.id);
      const actionContainer = node.querySelector('.eden-surface-actions');
      if (actionContainer) renderActions(actionContainer, surface);
      if (surface.surfaceKind === 'tree') renderTreeSurface(node, surface);
      if (surface.surfaceKind === 'embeddedPage') renderEmbeddedRelief(node, surface);
      if (surface.surfaceKind === 'embeddedPage') syncEmbeddedMode(surface);
      if (surface.panelKind === 'personalBox') renderPersonalBox(node, surface);
      if (surface.panelKind === 'editPage') renderEditPage(node, surface);
      if (surface.panelKind === 'organization') renderOrganization(node, surface);
      if (surface.panelKind === 'capabilityInstall') renderCapabilityInstall(node, surface);
      if (surface.panelKind === 'processView') renderProcessSurface(node, surface);
      if (surface.panelKind === 'versions') renderVersions(node, surface);
    }
    renderConnections();
    renderPrompt();
    renderCheckpoint();
    const checkpoint = model.checkpoints.find(row => {
      const minZoom = row.visibleRange?.minZoom ?? 0;
      const maxZoom = row.visibleRange?.maxZoom ?? 99;
      return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
    }) || null;
    setStatus((state.detailStatus || checkpoint?.title || model.neighborhood.title || 'Eden Canvas') + ' · ' + state.camera.zoom.toFixed(2) + 'x');
  }

  function initCamera() {
    const target = model.cameraTargets.find(row => row.id === 'home')
      || model.cameraTargets.find(row => row.surfaceId === model.neighborhood.defaultSurfaceId)
      || model.cameraTargets[0]
      || null;
    if (target) focusTarget(target.id);
    else render();
  }

  function pointerPosition(event) {
    const rect = stage.getBoundingClientRect();
    return { px: event.clientX - rect.left, py: event.clientY - rect.top };
  }

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.target?.closest?.('button, input, select, textarea, a, form')) return;
    state.drag = { px: event.clientX, py: event.clientY, camera: { ...state.camera } };
    stage.classList.add('is-dragging');
  });

  window.addEventListener('pointermove', event => {
    if (!state.drag) return;
    state.camera.x = state.drag.camera.x + (event.clientX - state.drag.px);
    state.camera.y = state.drag.camera.y + (event.clientY - state.drag.py);
    render();
  });

  window.addEventListener('pointerup', () => {
    state.drag = null;
    stage.classList.remove('is-dragging');
  });

  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const { px, py } = pointerPosition(event);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    state.camera = core.zoomCameraAt(state.camera, px, py, factor);
    render();
  }, { passive: false });

  window.addEventListener('keydown', event => {
    if (event.key !== 'F1') return;
    event.preventDefault();
    openExpertShortcut('eden.surface.todo', 'whoami');
  });

  document.getElementById('eden-reset-view').addEventListener('click', () => focusTarget('home'));
  window.addEventListener('resize', render);
  setStatus(model.neighborhood.title || 'Eden Canvas');
  initCamera();
})();`;

export function renderEdenPage({ model }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model?.neighborhood?.title || "Eden Canvas")}</title>
<style>${EDEN_CSS}</style>
</head>
<body>
  <header class="eden-toolbar">
    <strong>Eden Canvas</strong>
    <span>${escapeHtml(model?.neighborhood?.title || "First Neighbourhood")}</span>
    <button id="eden-reset-view" type="button">Home</button>
    <a href="/">Open Todo</a>
    <a href="/canvas">Open Canvas</a>
  </header>
  <div class="eden-stage" id="eden-stage">
    <svg class="eden-connections" id="eden-connections"></svg>
    <div class="eden-surfaces" id="eden-surfaces"></div>
    <div class="eden-status" id="eden-status"></div>
    <aside class="eden-chapter" id="eden-chapter" hidden>
      <div class="eden-chapter-label">Current Chapter</div>
      <div class="eden-chapter-title" id="eden-chapter-title"></div>
      <div class="eden-chapter-body" id="eden-chapter-body"></div>
      <div class="eden-chapter-unlocks" id="eden-chapter-unlocks"></div>
      <div class="eden-chapter-quests" id="eden-chapter-quests"></div>
      <div class="eden-chapter-tracks" id="eden-chapter-tracks"></div>
    </aside>
    <div class="eden-prompt" id="eden-prompt" hidden></div>
  </div>
  <script>${EDEN_CLIENT_JS(model)}</script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}
