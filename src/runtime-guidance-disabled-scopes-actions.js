export function renderTutorialDisabledScopesActionsFactory() {
  return String.raw`
    const runTutorialDisabledScopesPanelAction = ${runTutorialDisabledScopesPanelAction.toString()};
    const bindTutorialDisabledScopesActions = ${bindTutorialDisabledScopesActions.toString()};
  `;
}

export async function runTutorialDisabledScopesPanelAction({
  event = null,
  progress = null,
  tutorialDisabledGuidanceRowsFn = () => [],
  focusTutorialScopeTargetFn = () => {},
  focusTutorialTargetFn = () => {},
  clearTutorialContextDisabledFn = (current, contextId) => ({ ...current, contextId }),
  clearTutorialScopeDisabledFn = (current, scopeKey) => ({ ...current, scopeKey }),
  saveProgress = async current => current,
  render = () => {},
  continueTutorialOnPage = async () => {}
} = {}) {
  const focusButton = event?.target?.closest?.('[data-disabled-scope-focus]');
  const contextEnableButton = event?.target?.closest?.('[data-disabled-context-enable]');
  const enableButton = event?.target?.closest?.('[data-disabled-scope-enable]');
  const openButton = event?.target?.closest?.('[data-disabled-scope-open]');

  if (focusButton) {
    event?.preventDefault?.();
    const scopeKey = focusButton.getAttribute('data-disabled-scope-focus') || '';
    const row = tutorialDisabledGuidanceRowsFn(progress).find(candidate => candidate.scopeKey === scopeKey);
    if (scopeKey) focusTutorialScopeTargetFn(scopeKey);
    else if (row?.target) focusTutorialTargetFn(row.target);
    return true;
  }
  if (contextEnableButton && progress) {
    event?.preventDefault?.();
    await saveProgress(clearTutorialContextDisabledFn(progress, contextEnableButton.getAttribute('data-disabled-context-enable') || ''));
    render();
    return true;
  }
  if (enableButton && progress) {
    event?.preventDefault?.();
    await saveProgress(clearTutorialScopeDisabledFn(progress, enableButton.getAttribute('data-disabled-scope-enable') || ''));
    render();
    return true;
  }
  if (openButton) {
    event?.preventDefault?.();
    await continueTutorialOnPage(openButton.getAttribute('data-disabled-scope-open') || '');
    return true;
  }
  return false;
}

export function bindTutorialDisabledScopesActions({
  disabledScopesToggle = null,
  disabledScopesClose = null,
  disabledScopesPanel = null,
  getDisabledScopesOpen = () => false,
  setDisabledScopesOpen = () => {},
  renderDisabledScopes = () => {},
  getProgress = () => null,
  tutorialDisabledGuidanceRowsFn = () => [],
  focusTutorialScopeTargetFn = () => {},
  focusTutorialTargetFn = () => {},
  clearTutorialContextDisabledFn = (current, contextId) => ({ ...current, contextId }),
  clearTutorialScopeDisabledFn = (current, scopeKey) => ({ ...current, scopeKey }),
  saveProgress = async current => current,
  render = () => {},
  continueTutorialOnPage = async () => {}
} = {}) {
  disabledScopesToggle?.addEventListener?.('click', () => {
    setDisabledScopesOpen(!getDisabledScopesOpen());
    renderDisabledScopes();
  });
  disabledScopesClose?.addEventListener?.('click', () => {
    setDisabledScopesOpen(false);
    renderDisabledScopes();
  });
  disabledScopesPanel?.addEventListener?.('click', event => {
    void runTutorialDisabledScopesPanelAction({
      event,
      progress: getProgress(),
      tutorialDisabledGuidanceRowsFn,
      focusTutorialScopeTargetFn,
      focusTutorialTargetFn,
      clearTutorialContextDisabledFn,
      clearTutorialScopeDisabledFn,
      saveProgress,
      render,
      continueTutorialOnPage
    });
  });
}
