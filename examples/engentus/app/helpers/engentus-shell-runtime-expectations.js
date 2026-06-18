const SHELL_PROVIDER_KEY = "__engentusShellExpectationProviderRegistered";

const ROUTE_VIEW_BY_KEY = Object.freeze({
  login: { pathnames: ["/", "/engentus", "/engentus/login"], rootId: "view-login" },
  home: { pathnames: ["/engentus/home"], rootId: "view-home" },
  goodman: { pathnames: ["/engentus/goodman"], rootId: "view-goodman" },
  "mill-charge": { pathnames: ["/engentus/mill-charge"], rootId: "view-mill" },
  "mill-force": { pathnames: ["/engentus/mill-force"], rootId: "view-mill-force" },
  "platform-config-operator": { pathnames: ["/engentus/platform-config"], rootId: "view-platform-config" },
  "platform-config-secrets": { pathnames: ["/engentus/platform-config/secrets"], rootId: "view-platform-config-secrets" },
  "platform-config-datasources": { pathnames: ["/engentus/platform-config/datasources"], rootId: "view-platform-config-datasources" },
  "platform-config-scripts": { pathnames: ["/engentus/platform-config/scripts"], rootId: "view-platform-config-scripts" },
  "platform-config-access": { pathnames: ["/engentus/platform-config/access"], rootId: "view-platform-config-access" },
  signout: { pathnames: ["/engentus/signout"], rootId: "view-signout" }
});

const APP_SHELL_ROUTES = new Set([
  "home",
  "goodman",
  "mill-charge",
  "mill-force",
  "platform-config-operator",
  "platform-config-secrets",
  "platform-config-datasources",
  "platform-config-scripts",
  "platform-config-access"
]);
const PLATFORM_CONFIG_ROUTES = new Map([
  ["platform-config-operator", "Operator"],
  ["platform-config-secrets", "Secrets"],
  ["platform-config-datasources", "Data Sources"],
  ["platform-config-scripts", "Scripts"],
  ["platform-config-access", "Access"]
]);
const VISIBLE_ROUTE_IDS = Object.freeze(Object.values(ROUTE_VIEW_BY_KEY).map(entry => entry.rootId));
const SIGN_OUT_VISIBLE_STATES = new Set(["signingOut", "signedOut"]);
const LOGIN_VISIBLE_INVALID_STATES = new Set(["signedIn", "signingOut", "signedOut"]);
const APP_SHELL_INVALID_STATES = new Set(["signingOut", "signedOut"]);
const PLATFORM_NOTICE_TONES = new Set(["success", "warn", "error"]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedPathname(value) {
  const text = normalizeText(value) || "/";
  if (text === "/") return "/";
  return text.replace(/\/+$/, "");
}

function issue(id, message, details = null, severity = "error") {
  return { id, severity, kind: "engentus-shell", message, details };
}

function processStateValue(snapshot, key) {
  const state = snapshot?.processState;
  return state && Object.prototype.hasOwnProperty.call(state, key) ? state[key] : undefined;
}

function visible(element, win) {
  if (!element) return false;
  if (element.hidden || element.hasAttribute?.("hidden")) return false;
  if (typeof win?.getComputedStyle === "function") {
    const style = win.getComputedStyle(element);
    if (!style) return true;
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

function visibleIds(document, win) {
  return VISIBLE_ROUTE_IDS.filter(id => visible(document.getElementById(id), win));
}

function classOpen(element) {
  return Boolean(element?.classList?.contains("open"));
}

function authBookVisible(root, win) {
  return visible(root?.querySelector?.(".auth-book"), win);
}

function activePlatformSidebarLinks(document, win) {
  return [...(document?.querySelectorAll?.(".platform-config-side-link.active") ?? [])]
    .filter(node => visible(node, win));
}

export function engentusShellExpectationProvider(snapshot, context = {}) {
  const target = globalThis;
  const document = target?.document;
  if (!document) return [];
  const activeRoute = normalizeText(processStateValue(snapshot, "EngentusShellActiveRoute"));
  const authStatus = normalizeText(processStateValue(snapshot, "EngentusShellAuthStatus"));
  if (!activeRoute || !ROUTE_VIEW_BY_KEY[activeRoute]) return [];
  const routeConfig = ROUTE_VIEW_BY_KEY[activeRoute];
  const pathname = normalizedPathname(snapshot?.routePathname ?? context?.routePathname);
  const currentVisibleIds = visibleIds(document, target);
  const currentRoot = document.getElementById(routeConfig.rootId);
  const issues = [];
  const push = next => issues.push(next);

  if (!routeConfig.pathnames.includes(pathname)) {
    push(issue(
      `engentus-shell:route-path-mismatch:${activeRoute}`,
      "Shell route state does not match the current URL",
      { activeRoute, pathname, allowedPathnames: routeConfig.pathnames }
    ));
  }
  if (snapshot?.rootNodeId !== routeConfig.rootId) {
    push(issue(
      `engentus-shell:root-id-mismatch:${activeRoute}`,
      "Settled root node does not match the authored shell route",
      { activeRoute, rootNodeId: snapshot?.rootNodeId ?? null, expectedRootId: routeConfig.rootId }
    ));
  }
  if (currentVisibleIds.length !== 1) {
    push(issue(
      "engentus-shell:visible-route-count",
      "Exactly one shell route view should be visible after settle",
      { visibleRouteIds: currentVisibleIds }
    ));
  } else if (currentVisibleIds[0] !== routeConfig.rootId) {
    push(issue(
      `engentus-shell:visible-route-mismatch:${activeRoute}`,
      "Visible shell route does not match authored route state",
      { activeRoute, visibleRouteIds: currentVisibleIds }
    ));
  }
  if (document.querySelectorAll("#surface-runtime-manifest").length !== 1) {
    push(issue(
      "engentus-shell:manifest-count",
      "Exactly one surface runtime manifest should be present",
      { count: document.querySelectorAll("#surface-runtime-manifest").length }
    ));
  }
  if (!target.__surfaceInteractionRuntime) {
    push(issue("engentus-shell:missing-runtime", "Surface interaction runtime is missing"));
  }

  const underlayCount = document.querySelectorAll("#surface-route-underlay").length;
  if (authStatus === "folding" || authStatus === "signingOut") {
    if (underlayCount < 1) {
      push(issue(
        `engentus-shell:missing-underlay:${authStatus}`,
        "Auth transition should expose the route underlay while folding",
        { authStatus, underlayCount }
      ));
    }
  } else if (underlayCount !== 0) {
    push(issue(
      `engentus-shell:stale-underlay:${activeRoute}`,
      "Route underlay should be cleared after the shell settles",
      { authStatus, underlayCount }
    ));
  }

  if (activeRoute === "login") {
    if (!visible(currentRoot, target)) {
      push(issue("engentus-shell:login-hidden", "Login shell route should be visible"));
    }
    if (!authBookVisible(currentRoot, target)) {
      push(issue("engentus-shell:login-auth-book", "Login route should render the auth book"));
    }
    if (visible(document.getElementById("module-area"), target)) {
      push(issue("engentus-shell:login-module-area", "Login route should not show the app module area"));
    }
    if (visible(document.getElementById("user-prof"), target)) {
      push(issue("engentus-shell:login-profile-visible", "Login route should not show the profile trigger"));
    }
    const microsoftButton = document.querySelector(".ms-btn");
    if (!microsoftButton || !visible(microsoftButton, target) || microsoftButton.disabled && authStatus === "idle") {
      push(issue("engentus-shell:login-microsoft-action", "Login route should expose an interactable Microsoft sign-in action"));
    }
    const passwordInput = document.getElementById("login-pw");
    const passwordRevealed = Boolean(processStateValue(snapshot, "EngentusPasswordRevealed"));
    if (!passwordInput) {
      push(issue("engentus-shell:login-password-input", "Login route should render the password input"));
    } else {
      const expectedType = passwordRevealed ? "text" : "password";
      if (normalizeText(passwordInput.getAttribute("type") || passwordInput.type) !== expectedType) {
        push(issue(
          "engentus-shell:login-password-toggle",
          "Password reveal state should agree with the rendered input type",
          { expectedType, actualType: passwordInput.getAttribute("type") || passwordInput.type, passwordRevealed }
        ));
      }
    }
    if (LOGIN_VISIBLE_INVALID_STATES.has(authStatus)) {
      push(issue(
        `engentus-shell:login-auth-status:${authStatus}`,
        "Login route settled into an impossible auth state",
        { authStatus }
      ));
    }
  }

  if (APP_SHELL_ROUTES.has(activeRoute)) {
    if (!visible(document.getElementById("user-prof"), target)) {
      push(issue(
        `engentus-shell:profile-trigger:${activeRoute}`,
        "App shell route should render the profile trigger",
        { activeRoute }
      ));
    }
    if (visible(document.getElementById("view-login"), target) || visible(document.getElementById("view-signout"), target)) {
      push(issue(
        `engentus-shell:auth-view-leak:${activeRoute}`,
        "App shell route should not show auth screens after settle",
        { activeRoute }
      ));
    }
    if (activeRoute === "home" && !visible(document.getElementById("module-area"), target)) {
      push(issue("engentus-shell:home-module-area", "Home route should render the module area"));
    }
    const menuVisibleState = Boolean(processStateValue(snapshot, "EngentusProfileMenuVisible"));
    const menuNode = document.getElementById("up-menu");
    if (!menuNode) {
      push(issue(
        `engentus-shell:profile-menu-node:${activeRoute}`,
        "App shell route should render the profile dropdown menu container",
        { activeRoute }
      ));
    } else if (classOpen(menuNode) !== menuVisibleState) {
      push(issue(
        `engentus-shell:profile-menu-visibility:${activeRoute}`,
        "Profile dropdown state should match rendered menu visibility",
        { activeRoute, menuVisibleState, menuOpenClass: classOpen(menuNode) }
      ));
    }
    if (APP_SHELL_INVALID_STATES.has(authStatus)) {
      push(issue(
        `engentus-shell:app-auth-status:${activeRoute}:${authStatus}`,
        "App shell route settled into an impossible sign-out auth state",
        { activeRoute, authStatus }
      ));
    }
  }

  if (PLATFORM_CONFIG_ROUTES.has(activeRoute)) {
    const sidebar = document.getElementById("platform-config-sidebar");
    if (!visible(sidebar, target)) {
      push(issue(
        `engentus-shell:platform-sidebar:${activeRoute}`,
        "Platform-config route should render the sidebar",
        { activeRoute }
      ));
    }
    const activeLinks = activePlatformSidebarLinks(document, target);
    if (activeLinks.length !== 1) {
      push(issue(
        `engentus-shell:platform-sidebar-active-count:${activeRoute}`,
        "Platform-config route should have exactly one active sidebar action",
        { activeRoute, activeCount: activeLinks.length }
      ));
    } else if (!normalizeText(activeLinks[0].textContent).includes(PLATFORM_CONFIG_ROUTES.get(activeRoute))) {
      push(issue(
        `engentus-shell:platform-sidebar-active-route:${activeRoute}`,
        "Platform-config sidebar active action should match the authored route",
        { activeRoute, activeText: normalizeText(activeLinks[0].textContent) }
      ));
    }
    const notice = document.getElementById("platform-config-notice");
    if (!visible(notice, target)) {
      push(issue(
        `engentus-shell:platform-notice:${activeRoute}`,
        "Platform-config route should render the notice panel",
        { activeRoute }
      ));
    } else {
      const tone = normalizeText(processStateValue(snapshot, "PlatformConfigNoticeTone"));
      if (PLATFORM_NOTICE_TONES.has(tone) && !notice.classList.contains(tone)) {
        push(issue(
          `engentus-shell:platform-notice-tone:${activeRoute}`,
          "Platform-config notice tone should match the rendered class state",
          { activeRoute, tone, className: notice.className }
        ));
      }
    }
  }

  if (activeRoute === "signout") {
    if (!visible(currentRoot, target)) {
      push(issue("engentus-shell:signout-hidden", "Signout shell route should be visible"));
    }
    if (!authBookVisible(currentRoot, target)) {
      push(issue("engentus-shell:signout-auth-book", "Signout route should render the auth book"));
    }
    if (!currentRoot?.textContent?.includes("Sign back in")) {
      push(issue("engentus-shell:signout-action", "Signout route should render the sign-back-in action"));
    }
    if (visible(document.getElementById("module-area"), target)) {
      push(issue("engentus-shell:signout-module-area", "Signout route should not show the app module area"));
    }
    if (visible(document.getElementById("user-prof"), target)) {
      push(issue("engentus-shell:signout-profile-visible", "Signout route should not show the profile trigger"));
    }
    if (authStatus && !SIGN_OUT_VISIBLE_STATES.has(authStatus)) {
      push(issue(
        `engentus-shell:signout-auth-status:${authStatus}`,
        "Signout route settled into an impossible auth state",
        { authStatus }
      ));
    }
  }

  return issues;
}

export function registerEngentusShellExpectationProvider(target = globalThis) {
  if (!target || target[SHELL_PROVIDER_KEY]) return;
  const registry = Array.isArray(target.__surfaceRuntimeExpectationProviders)
    ? target.__surfaceRuntimeExpectationProviders
    : (target.__surfaceRuntimeExpectationProviders = []);
  registry.push(engentusShellExpectationProvider);
  target[SHELL_PROVIDER_KEY] = true;
}
