import { buildBootstrapDesktopControlsView, applyBootstrapDesktopControlsView } from "./bootstrap-desktop-controls-view.js";
import { buildBootstrapFormAccessView, applyBootstrapFormAccessView } from "./bootstrap-form-access-view.js";
import { buildBootstrapStarterControlsView, applyBootstrapStarterControlsView } from "./bootstrap-starter-controls-view.js";

export function renderBootstrapShellViewStateFactory() {
  return String.raw`
    const syncBootstrapShellViewState = ${syncBootstrapShellViewState.toString()};
    const applyBootstrapShellViewState = ${applyBootstrapShellViewState.toString()};
  `;
}

export function syncBootstrapShellViewState({
  state = {},
  buildStarterControlsViewFn = buildBootstrapStarterControlsView,
  buildDesktopControlsViewFn = buildBootstrapDesktopControlsView,
  buildFormAccessViewFn = buildBootstrapFormAccessView
} = {}) {
  state.starterControlsView = buildStarterControlsViewFn({
    model: state.model,
    bootstrapState: state.bootstrapState,
    session: state.session
  });
  state.desktopControlsView = buildDesktopControlsViewFn({
    desktopShell: state.desktopShell
  });
  state.formAccessView = buildFormAccessViewFn({
    bootstrapState: state.bootstrapState,
    session: state.session,
    operator: state.bootstrapState?.operator || null
  });
  return state;
}

export function applyBootstrapShellViewState({
  state = {},
  byId = () => null,
  applyStarterControlsViewFn = applyBootstrapStarterControlsView,
  applyDesktopControlsViewFn = applyBootstrapDesktopControlsView,
  applyFormAccessViewFn = applyBootstrapFormAccessView
} = {}) {
  applyFormAccessViewFn({
    view: state.formAccessView,
    byId
  });
  applyDesktopControlsViewFn({
    view: state.desktopControlsView,
    byId
  });
  applyStarterControlsViewFn({
    view: state.starterControlsView,
    byId
  });
}
