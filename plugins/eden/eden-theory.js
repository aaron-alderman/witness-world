function stringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeLesson(entry, index) {
  if (!entry || typeof entry !== "object") return null;
  const id = stringOrNull(entry.id) ?? `lesson:${index}`;
  return {
    id,
    title: stringOrNull(entry.title) ?? id,
    summary: stringOrNull(entry.summary) ?? stringOrNull(entry.description) ?? "Optional theory lesson.",
    concept: stringOrNull(entry.concept),
    order: Number(entry.order ?? index)
  };
}

function sortByOrder(rows) {
  return rows.sort((a, b) => {
    const orderDiff = Number(a.order ?? 0) - Number(b.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a.id).localeCompare(String(b.id));
  });
}

function normalizedLessons(lessons) {
  return sortByOrder((Array.isArray(lessons) ? lessons : []).map(normalizeLesson).filter(Boolean));
}

export function projectEdenTheoryState(witnesses, {
  actor = null,
  surfaceId = "eden.surface.tree",
  lessons = []
} = {}) {
  const normalized = normalizedLessons(lessons);
  const studiedByLesson = new Map();
  let trainedWitness = null;
  const teachBacks = [];
  if (actor) {
    for (const witness of witnesses) {
      const body = witness.body ?? {};
      if (witness.process === "edenTheory.lesson.study" && witness.actor === actor && body.surfaceId === surfaceId) {
        const lessonId = stringOrNull(body.lessonId);
        if (lessonId) studiedByLesson.set(lessonId, witness);
        continue;
      }
      if (witness.process === "edenTheory.assessment.pass" && witness.actor === actor && body.surfaceId === surfaceId) {
        trainedWitness = witness;
        continue;
      }
      if (witness.process === "edenTheory.teachBack" && witness.actor === actor && body.surfaceId === surfaceId) {
        const note = stringOrNull(body.note);
        if (!note) continue;
        teachBacks.push({
          witnessId: witness.id,
          note,
          createdAt: witness.at ?? null,
          title: stringOrNull(body.title),
          audience: stringOrNull(body.audience)
        });
      }
    }
  }
  const projectedLessons = normalized.map(lesson => ({
    ...lesson,
    completed: studiedByLesson.has(lesson.id),
    witness: studiedByLesson.get(lesson.id) ?? null
  }));
  const completedLessonCount = projectedLessons.filter(lesson => lesson.completed).length;
  const allLessonsCompleted = projectedLessons.length > 0 && completedLessonCount === projectedLessons.length;
  const trained = Boolean(trainedWitness && allLessonsCompleted);
  return {
    mode: "theoryAnnex",
    actor,
    surfaceId,
    lessons: projectedLessons,
    completedLessonCount,
    allLessonsCompleted,
    trained,
    trainedWitness,
    trainedLabel: trained ? "trained" : "not yet trained",
    teachBackCount: teachBacks.length,
    teachBacks: teachBacks.slice(-6).reverse()
  };
}

export function requestEdenTheoryLessonStudy(world, {
  actor,
  backendHost,
  surfaceId = "eden.surface.tree",
  lessonId,
  lessons = []
} = {}) {
  if (!actor) return { ok: false, status: 401, error: "sign in first" };
  const normalized = normalizedLessons(lessons);
  const lesson = normalized.find(entry => entry.id === lessonId) ?? null;
  if (!lesson) return { ok: false, status: 404, error: "theory lesson not found" };
  world.emit({
    process: "edenTheory.lesson.study",
    actor,
    claims: [],
    body: {
      owner: actor,
      surfaceId,
      lessonId: lesson.id,
      title: lesson.title,
      witnessedBy: backendHost
    }
  });
  return {
    ok: true,
    status: 200,
    lesson,
    theoryState: projectEdenTheoryState(world.allWitnesses(), { actor, surfaceId, lessons: normalized })
  };
}

export function requestEdenTheoryAssessmentPass(world, {
  actor,
  backendHost,
  surfaceId = "eden.surface.tree",
  lessons = []
} = {}) {
  if (!actor) return { ok: false, status: 401, error: "sign in first" };
  const normalized = normalizedLessons(lessons);
  const current = projectEdenTheoryState(world.allWitnesses(), { actor, surfaceId, lessons: normalized });
  if (!current.allLessonsCompleted) {
    return {
      ok: false,
      status: 409,
      error: "study every theory lesson first",
      theoryState: current
    };
  }
  world.emit({
    process: "edenTheory.assessment.pass",
    actor,
    claims: [],
    body: {
      owner: actor,
      surfaceId,
      lessonCount: current.completedLessonCount,
      witnessedBy: backendHost,
      mark: "trained"
    }
  });
  return {
    ok: true,
    status: 200,
    theoryState: projectEdenTheoryState(world.allWitnesses(), { actor, surfaceId, lessons: normalized })
  };
}

export function requestEdenTheoryTeachBack(world, {
  actor,
  backendHost,
  surfaceId = "eden.surface.tree",
  lessons = [],
  body = {}
} = {}) {
  if (!actor) return { ok: false, status: 401, error: "sign in first" };
  const normalized = normalizedLessons(lessons);
  const current = projectEdenTheoryState(world.allWitnesses(), { actor, surfaceId, lessons: normalized });
  if (!current.trained) {
    return {
      ok: false,
      status: 409,
      error: "earn the trained mark first",
      theoryState: current
    };
  }
  const note = stringOrNull(body.note);
  if (!note) {
    return {
      ok: false,
      status: 400,
      error: "teach-back note is required",
      theoryState: current
    };
  }
  world.emit({
    process: "edenTheory.teachBack",
    actor,
    claims: [],
    body: {
      owner: actor,
      surfaceId,
      note,
      title: stringOrNull(body.title),
      audience: stringOrNull(body.audience),
      witnessedBy: backendHost,
      mark: "trained"
    }
  });
  return {
    ok: true,
    status: 200,
    theoryState: projectEdenTheoryState(world.allWitnesses(), { actor, surfaceId, lessons: normalized })
  };
}
