export function renderWorldShellViewFactory() {
  return String.raw`
    const renderWorldGraphShell = ${renderWorldGraphShell.toString()};
  `;
}

export function renderWorldGraphShell({
  tutorialPanel = "",
  inspector = "",
  modeMenu = "",
  commandPalette = "",
  canvas = ""
} = {}) {
  return '<div class="surface-shell-2 world-graph-shell"><aside class="surface-pane surface-stack world-graph-inspector" data-world-inspector>'
    + tutorialPanel
    + inspector
    + '</aside><section class="world-main-pane">'
    + modeMenu
    + commandPalette
    + canvas
    + '</section></div>';
}
