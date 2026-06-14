import {
  renderPagePresentationChromeCss,
  renderPagePresentationHead,
  resolvePagePresentationTheme
} from "../../src/runtime-presentation.js";

export function renderBootstrapShellHead({ extensionStyles = "", guidanceStyles = "", tutorialStyles = "" } = {}) {
  const injectedStyles = extensionStyles || guidanceStyles || tutorialStyles;
  const pageTheme = resolvePagePresentationTheme({
    themeId: "bootstrap",
    material: "linen",
    typography: "serif"
  });
  return renderPagePresentationHead({
    title: "Witness Bootstrap",
    pageTheme,
    extraCss: `
    ${renderPagePresentationChromeCss()}
${injectedStyles}
    @keyframes tutorial-focus-pulse {
      0%, 100% { outline-color: color-mix(in srgb, var(--accent) 100%, transparent); box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 8%, transparent); }
      50% { outline-color: color-mix(in srgb, var(--accent) 65%, transparent); box-shadow: 0 0 0 10px color-mix(in srgb, var(--accent) 12%, transparent); }
    }
    @keyframes tutorial-changed-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 18%, transparent); }
      45% { transform: scale(1.01); box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 12%, transparent); }
    }
    @keyframes tutorial-text-pulse {
      0%, 100% { font-weight: 600; opacity: 1; }
      50% { font-weight: 400; opacity: .82; }
    }
    @keyframes tutorial-click-pulse {
      0% { transform: scale(.35); opacity: 1; }
      100% { transform: scale(2.6); opacity: 0; }
    }
    @keyframes tutorial-button-click {
      0% { transform: scale(1); }
      35% { transform: scale(.95); }
      100% { transform: scale(1); }
    }
  `
  });
}
