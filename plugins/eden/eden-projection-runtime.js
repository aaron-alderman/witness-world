function readEdenPersonalBoxRuntime(surface, state) {
  return surface.runtime && surface.runtime.mode === "personalBox"
    ? surface.runtime
    : { mode: "personalBox", actor: state.session.actor || null, items: [] };
}

function readEdenPageThemeRuntime(surface, state) {
  return surface.runtime && surface.runtime.mode === "pageTheme"
    ? surface.runtime
    : {
        mode: "pageTheme",
        actor: state.session.actor || null,
        pageId: surface.pageId || "todo_app_widget",
        pageTheme: { themeId: "paper", material: "linen", typography: "sans" }
      };
}

function readEdenProcessRuntime(surface, state) {
  return surface.runtime && surface.runtime.mode === "processView"
    ? surface.runtime
    : {
        mode: "processView",
        actor: state.session.actor || null,
        processProgram: surface.processProgram || "todo_frontend_program",
        processEvent: surface.processEvent || "load",
        preview: null
      };
}

function readEdenVersionsRuntime(surface, state) {
  return surface.runtime && surface.runtime.mode === "versions"
    ? surface.runtime
    : {
        mode: "versions",
        surfaceId: surface.id,
        soul: surface.versionSoul || "",
        activeVersion: null,
        publishedVersion: surface.publishedVersion || null,
        draftVersion: surface.draftVersion || null,
        lastGoodVersion: null,
        rollbackAvailable: false,
        versions: [],
        compare: { activePreview: "", publishedPreview: "", draftPreview: "", activeToPublished: [], activeToDraft: [] },
        history: [],
        authority: {
          authenticated: Boolean(state.session?.authenticated && state.session?.actor),
          canMutate: false,
          canPropose: false,
          reason: state.session?.authenticated ? "direct version changes are guarded here" : "sign in to change versions"
        }
      };
}

function readEdenCapabilityInstallRuntime(surface, state) {
  return surface.runtime && surface.runtime.mode === "capabilityInstall"
    ? surface.runtime
    : {
        mode: "capabilityInstall",
        actor: state.session.actor || null,
        target: surface.capabilityTarget || "frontend",
        targetKind: surface.capabilityTargetKind || "context",
        targetLabel: surface.capabilityTargetLabel || surface.capabilityTarget || "frontend",
        suggestedCapabilities: [],
        installedCapabilities: [],
        authority: {
          authenticated: Boolean(state.session?.authenticated && state.session?.actor),
          canMutate: false,
          canPropose: false,
          reason: state.session?.authenticated ? "direct capability installs are guarded here" : "sign in to install capabilities"
        }
      };
}

function readEdenOrganizationRuntime(surface, state) {
  return surface.runtime && surface.runtime.mode === "organization"
    ? surface.runtime
    : {
        mode: "organization",
        actor: state.session.actor || null,
        surfaceId: surface.id,
        contextParent: surface.contextParent || "frontend",
        contextId: null,
        contextLabel: null,
        contextExists: false,
        context: null,
        guestSteward: surface.guestSteward || "callan",
        stewardships: [],
        guestGrant: null,
        hasGuestStewardship: false,
        proposalTemplate: {
          targetProcess: surface.proposalTargetProcess || "widget.define",
          targetKind: surface.proposalTargetKind || "widget",
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

function readEdenTheoryAnnexRuntime(surface, state) {
  return surface.runtime && surface.runtime.mode === "theoryAnnex"
    ? surface.runtime
    : {
        mode: "theoryAnnex",
        actor: state.session.actor || null,
        surfaceId: surface.id,
        lessons: Array.isArray(surface.theoryLessons) ? surface.theoryLessons : [],
        completedLessonCount: 0,
        allLessonsCompleted: false,
        trained: false,
        trainedWitness: null,
        trainedLabel: "not yet trained",
        teachBackCount: 0,
        teachBacks: []
      };
}

function findEdenActionById(surface, actionId) {
  return (surface.actions || []).find(action => action.id === actionId) || null;
}

export function renderEdenProjectionRuntimePrelude() {
  return `
${readEdenPersonalBoxRuntime.toString()}
${readEdenPageThemeRuntime.toString()}
${readEdenProcessRuntime.toString()}
${readEdenVersionsRuntime.toString()}
${readEdenCapabilityInstallRuntime.toString()}
${readEdenOrganizationRuntime.toString()}
${readEdenTheoryAnnexRuntime.toString()}
${findEdenActionById.toString()}
`;
}
