export function renderTutorialRuntimeActionsFactory() {
  return String.raw`
    const continueTutorialOnPage = ${continueTutorialOnPage.toString()};
    const submitTutorialTargetForm = ${submitTutorialTargetForm.toString()};
    const restartTutorialChapter = ${restartTutorialChapter.toString()};
    const restartTutorialFromHere = ${restartTutorialFromHere.toString()};
    const readTutorialTodos = ${readTutorialTodos.toString()};
    const readTutorialNotes = ${readTutorialNotes.toString()};
    const isTutorialStepComplete = ${isTutorialStepComplete.toString()};
    const createTutorialRuntimeActions = ${createTutorialRuntimeActions.toString()};
  `;
}

export async function continueTutorialOnPage({
  page = "",
  windowTarget = globalThis?.window || null
} = {}) {
  if (page === "bootstrap") {
    const target = new URL("/_bootstrap", windowTarget.location.href);
    if (windowTarget.location.pathname === target.pathname) {
      windowTarget.location.reload();
      return true;
    }
    windowTarget.location.assign(target.toString());
    return true;
  }
  if (page === "app") {
    windowTarget.location.assign(new URL("/", windowTarget.location.href).toString());
    return true;
  }
  if (page === "world") {
    const target = new URL("/world", windowTarget.location.href);
    if (windowTarget.location.pathname === target.pathname) {
      windowTarget.location.reload();
      return true;
    }
    windowTarget.location.assign(target.toString());
    return true;
  }
  return false;
}

export async function submitTutorialTargetForm({
  target = null,
  flashAutoClickFn = () => {},
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  const form = target?.matches?.("form") ? target : target?.closest?.("form") || target?.querySelector?.("form");
  if (!form) return false;
  const submitter = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
  if (!submitter) return false;
  flashAutoClickFn(submitter);
  await wait(120);
  submitter.click();
  return true;
}

export async function restartTutorialChapter({
  getProgress = () => null,
  currentStep = () => null,
  firstStepInChapter = () => null,
  saveProgress = async current => current,
  render = () => {}
} = {}) {
  const progress = getProgress();
  const chapterId = progress?.chapterId || currentStep()?.chapterId || null;
  const first = firstStepInChapter(chapterId);
  if (!progress || !first) return false;
  await saveProgress({
    ...progress,
    chapterId: first.chapterId,
    stepId: first.id,
    chapterStatus: "in_progress",
    draftInputs: {},
    completedAt: null,
    hidden: false,
    replayScopeKey: null
  });
  render();
  return true;
}

export async function restartTutorialFromHere({
  getProgress = () => null,
  currentStep = () => null,
  tutorialStepScopeFn = () => null,
  saveProgress = async current => current,
  render = () => {}
} = {}) {
  const progress = getProgress();
  const step = currentStep();
  if (!progress || !step) return false;
  await saveProgress({
    ...progress,
    chapterId: step.chapterId,
    stepId: step.id,
    chapterStatus: "in_progress",
    draftInputs: {},
    completedAt: null,
    hidden: false,
    replayScopeKey: tutorialStepScopeFn(step)?.key || null
  });
  render();
  return true;
}

export async function readTutorialTodos({
  fetchFn = globalThis?.fetch || (async () => ({ json: async () => ({ todos: [] }) }))
} = {}) {
  return fetchFn("/api/todos").then(res => res.json().catch(() => ({ todos: [] })));
}

export async function readTutorialNotes({
  fetchFn = globalThis?.fetch || (async () => ({ json: async () => ({ notes: [] }) }))
} = {}) {
  return fetchFn("/api/private-notes").then(res => res.json().catch(() => ({ notes: [] })));
}

export async function isTutorialStepComplete({
  step = null,
  readTodosFn = async () => ({ todos: [] }),
  readNotesFn = async () => ({ notes: [] })
} = {}) {
  const check = step?.completeWhen || {};
  switch (check.kind) {
    case "manualAdvance":
    case "complete":
      return false;
    case "todoExists": {
      const todos = await readTodosFn();
      return Array.isArray(todos.todos) && todos.todos.some(todo => todo.title === check.title);
    }
    case "todoDone": {
      const todos = await readTodosFn();
      return Array.isArray(todos.todos) && todos.todos.some(todo => todo.title === check.title && todo.done === true);
    }
    case "todoMissing": {
      const todos = await readTodosFn();
      return !(Array.isArray(todos.todos) && todos.todos.some(todo => todo.title === check.title));
    }
    case "noteExists": {
      const notes = await readNotesFn();
      return Array.isArray(notes.notes) && notes.notes.some(note => note.text === check.text);
    }
    default:
      return false;
  }
}

export function createTutorialRuntimeActions({
  windowTarget = globalThis?.window || null,
  fetchFn = globalThis?.fetch || null,
  getProgress = () => null,
  currentStep = () => null,
  firstStepInChapter = () => null,
  tutorialStepScopeFn = () => null,
  saveProgress = async current => current,
  render = () => {},
  flashAutoClickFn = () => {},
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  const continueOnPage = page => continueTutorialOnPage({
    page,
    windowTarget
  });

  const submitForm = target => submitTutorialTargetForm({
    target,
    flashAutoClickFn,
    wait
  });

  const restartChapter = () => restartTutorialChapter({
    getProgress,
    currentStep,
    firstStepInChapter,
    saveProgress,
    render
  });

  const restartFromCurrent = () => restartTutorialFromHere({
    getProgress,
    currentStep,
    tutorialStepScopeFn,
    saveProgress,
    render
  });

  const readTodos = () => readTutorialTodos({
    fetchFn
  });

  const readNotes = () => readTutorialNotes({
    fetchFn
  });

  const isComplete = step => isTutorialStepComplete({
    step,
    readTodosFn: readTodos,
    readNotesFn: readNotes
  });

  return {
    continueTutorialOnPage: continueOnPage,
    submitTutorialForm: submitForm,
    restartCurrentChapter: restartChapter,
    restartFromHere: restartFromCurrent,
    readTodos,
    readNotes,
    isComplete
  };
}
