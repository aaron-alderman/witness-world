export function renderBootstrapDesktopControlsViewFactory() {
  return String.raw`
    const buildBootstrapDesktopControlsView = ${buildBootstrapDesktopControlsView.toString()};
    const applyBootstrapDesktopControlsView = ${applyBootstrapDesktopControlsView.toString()};
  `;
}

export function buildBootstrapDesktopControlsView({
  desktopShell = null
} = {}) {
  return {
    desktopButtonsDisabled: !desktopShell
  };
}

export function applyBootstrapDesktopControlsView({
  view = {},
  byId = () => null
} = {}) {
  for (const buttonId of ["desktop-open-world", "desktop-create-world", "desktop-reveal-world"]) {
    const button = byId(buttonId);
    if (!button) continue;
    button.disabled = view.desktopButtonsDisabled === true;
  }
}
