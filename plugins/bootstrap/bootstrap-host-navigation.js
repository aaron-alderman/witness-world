export function renderBootstrapHostNavigationFactory() {
  return String.raw`
    const openBootstrapAppHome = ${openBootstrapAppHome.toString()};
    const continueBootstrapGuidanceOnPage = ${continueBootstrapGuidanceOnPage.toString()};
    const continueBootstrapTutorialOnPage = continueBootstrapGuidanceOnPage;
  `;
}

export async function openBootstrapAppHome({
  href = "/",
  advance = false,
  currentSurfacePage = "bootstrap",
  getAppReady = () => false,
  refresh = async () => {},
  setBootstrapStatus = () => {},
  advanceTutorial = async () => {},
  currentHref = "http://bootstrap.local/_bootstrap",
  assign = () => {},
  reload = () => {}
} = {}) {
  if (getAppReady() !== true) {
    await refresh();
    if (getAppReady() !== true) {
      setBootstrapStatus("Home route is not ready yet.");
      return { opened: false, reason: "not-ready" };
    }
  }
  if (advance) await advanceTutorial();
  const target = new URL(href, currentHref);
  const current = new URL(currentHref);
  const sameUrl = target.origin === current.origin
    && target.pathname === current.pathname
    && target.search === current.search
    && target.hash === current.hash;
  if (sameUrl) {
    if (currentSurfacePage === "bootstrap") {
      assign(target.toString());
      return { opened: true, mode: "assign-same-url", target: target.toString() };
    }
    reload();
    return { opened: true, mode: "reload-same-url", target: target.toString() };
  }
  assign(target.toString());
  return { opened: true, mode: "assign", target: target.toString() };
}

export async function continueBootstrapGuidanceOnPage({
  page = "",
  openAppHome = async () => ({ opened: false, reason: "missing-opener" }),
  currentHref = "http://bootstrap.local/_bootstrap",
  currentPathname = new URL(currentHref).pathname,
  assign = () => {},
  reload = () => {}
} = {}) {
  if (page === "app") {
    return openAppHome({ advance: false });
  }
  if (page === "bootstrap" || page === "world") {
    const target = new URL(page === "bootstrap" ? "/_bootstrap" : "/world", currentHref);
    if (currentPathname === target.pathname) {
      reload();
      return { continued: true, mode: "reload", target: target.toString() };
    }
    assign(target.toString());
    return { continued: true, mode: "assign", target: target.toString() };
  }
  return { continued: false, mode: "ignored" };
}

export const continueBootstrapTutorialOnPage = continueBootstrapGuidanceOnPage;
