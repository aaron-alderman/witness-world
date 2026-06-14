function ensureEdenPageSurface(surface, deps) {
  const {
    academyState,
    actionById,
    applySurfaceMeta,
    capabilityInstallRuntime,
    createEdenCapabilityInstallProposal,
    embeddedMode,
    focusTarget,
    organizationRuntime,
    pageThemeRuntime,
    personalBoxRuntime,
    processRuntime,
    refreshAcademyState,
    refreshCapabilityInstall,
    refreshOrganization,
    refreshPageTheme,
    refreshPersonalBox,
    refreshProcessPreview,
    refreshSessionSurfaces,
    refreshVersions,
    reloadEmbeddedTodoPage,
    render,
    renderActions,
    renderTrackCard,
    requestJson,
    setCapabilityStatus,
    setEditStatus,
    setEmbeddedSurfaceCommand,
    setOrganizationStatus,
    setPersonalStatus,
    setProcessStatus,
    setStatus,
    setTheoryStatus,
    setVersionStatus,
    state,
    surfacesRoot,
    syncEmbeddedMode,
    theoryAnnexRuntime,
    toggleEmbeddedInspect,
    versionsRuntime
  } = deps;
  return ensureEdenSurfaceNode(surface, {
    state,
    surfacesRoot,
    bindSurfaceNode: (node, activeSurface) => bindEdenSurfaceNode(node, activeSurface, {
      focusTarget,
      render,
      state
    }),
    createEmbeddedSurfaceNode: activeSurface => createEdenEmbeddedSurfaceNode(activeSurface, {
      applySurfaceMeta,
      renderActions,
      embeddedMode,
      syncEmbeddedMode,
      toggleEmbeddedInspect,
      setEmbeddedSurfaceCommand,
      render
    }),
    createTheorySurfaceNode: activeSurface => createEdenTheorySurfaceNode(activeSurface, {
      renderActions,
      requestJson,
      state,
      setTheoryStatus,
      refreshSessionSurfaces,
      refreshAcademyState,
      theoryAnnexRuntime,
      academyState,
      actionById,
      renderTrackCard,
      render
    }),
    createGotoSurfaceNode: activeSurface => createEdenGotoSurfaceNode(activeSurface, {
      focusTarget,
      setStatus
    }),
    createPersonalSurfaceNode: activeSurface => createEdenPersonalBoxSurfaceNode(activeSurface, {
      applySurfaceMeta,
      renderActions,
      requestJson,
      state,
      setPersonalStatus,
      refreshSessionSurfaces,
      refreshPersonalBox,
      refreshAcademyState,
      personalBoxRuntime,
      render
    }),
    createEditSurfaceNode: activeSurface => createEdenEditPageSurfaceNode(activeSurface, {
      applySurfaceMeta,
      renderActions,
      requestJson,
      state,
      setEditStatus,
      refreshSessionSurfaces,
      refreshPageTheme,
      reloadEmbeddedTodoPage,
      refreshAcademyState,
      pageThemeRuntime,
      render
    }),
    createOrganizationSurfaceNode: activeSurface => createEdenOrganizationSurfaceNode(activeSurface, {
      applySurfaceMeta,
      renderActions,
      requestJson,
      state,
      setOrganizationStatus,
      refreshSessionSurfaces,
      refreshAcademyState,
      refreshOrganization,
      organizationRuntime,
      academyState,
      renderTrackCard,
      render
    }),
    createCapabilitySurfaceNode: activeSurface => createEdenCapabilityInstallSurfaceNode(activeSurface, {
      applySurfaceMeta,
      renderActions,
      requestJson,
      state,
      setCapabilityStatus,
      refreshSessionSurfaces,
      refreshCapabilityInstall,
      capabilityInstallRuntime,
      refreshAcademyState,
      render,
      createEdenCapabilityInstallProposal
    }),
    createProcessSurfaceNode: activeSurface => createEdenProcessSurfaceNode(activeSurface, {
      applySurfaceMeta,
      renderActions,
      requestJson,
      state,
      setProcessStatus,
      refreshSessionSurfaces,
      refreshProcessPreview,
      refreshAcademyState,
      processRuntime,
      academyState,
      actionById,
      renderTrackCard,
      render
    }),
    createVersionsSurfaceNode: activeSurface => createEdenVersionsSurfaceNode(activeSurface, {
      applySurfaceMeta,
      renderActions,
      requestJson,
      state,
      setVersionStatus,
      refreshSessionSurfaces,
      createEdenVersionProposal,
      versionsRuntime,
      reloadEmbeddedTodoPage,
      refreshAcademyState,
      refreshVersions,
      render
    }),
    createDefaultSurfaceNode: activeSurface => createEdenDefaultSurfaceNode(activeSurface, {
      applySurfaceMeta,
      renderActions
    })
  });
}

function renderEdenPageSurfaceDetails(node, surface, deps) {
  const {
    academyState,
    actionById,
    capabilityInstallRuntime,
    createEdenCapabilityInstallProposal,
    pageThemeRuntime,
    personalBoxRuntime,
    processRuntime,
    refreshAcademyState,
    refreshPersonalBox,
    refreshSessionSurfaces,
    render,
    renderEmbeddedReliefOverlay,
    renderTrackCard,
    requestJson,
    setCapabilityStatus,
    setPersonalStatus,
    setTheoryStatus,
    state,
    syncEmbeddedMode,
    theoryAnnexRuntime,
    versionsRuntime
  } = deps;
  if (surface.surfaceKind === "tree") {
    renderEdenTheoryPanel(node, surface, {
      state,
      theoryAnnexRuntime,
      academyState,
      actionById,
      renderTrackCard,
      requestJson,
      setTheoryStatus,
      refreshSessionSurfaces,
      refreshAcademyState,
      render
    });
  }
  if (surface.surfaceKind === "embeddedPage") renderEmbeddedReliefOverlay(node, surface);
  if (surface.surfaceKind === "embeddedPage") syncEmbeddedMode(surface);
  if (surface.panelKind === "personalBox") {
    renderEdenPersonalBoxPanel(node, surface, {
      state,
      personalBoxRuntime,
      setPersonalStatus,
      requestJson,
      refreshPersonalBox,
      refreshAcademyState,
      render
    });
  }
  if (surface.panelKind === "editPage") {
    renderEdenEditPagePanel(node, surface, {
      state,
      pageThemeRuntime
    });
  }
  if (surface.panelKind === "organization") {
    renderEdenOrganizationPanel(node, surface, {
      state,
      academyState,
      organizationRuntime: deps.organizationRuntime,
      renderTrackCard
    });
  }
  if (surface.panelKind === "capabilityInstall") {
    renderEdenCapabilityInstallPanel(node, surface, {
      state,
      capabilityInstallRuntime,
      setCapabilityStatus,
      requestJson,
      refreshAcademyState,
      render,
      createEdenCapabilityInstallProposal
    });
  }
  if (surface.panelKind === "processView") {
    renderEdenProcessPanel(node, surface, {
      state,
      processRuntime,
      academyState,
      actionById,
      renderTrackCard,
      render
    });
  }
  if (surface.panelKind === "versions") {
    renderEdenVersionsPanel(node, surface, {
      state,
      versionsRuntime
    });
  }
}

export function renderEdenSurfaceAdaptersPrelude() {
  return `
${ensureEdenPageSurface.toString()}
${renderEdenPageSurfaceDetails.toString()}
`;
}
