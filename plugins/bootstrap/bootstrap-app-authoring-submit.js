export function renderBootstrapAppAuthoringSubmitFactory() {
  return String.raw`
    const coerceInteger = ${coerceInteger.toString()};
    const omitBlankStringFields = ${omitBlankStringFields.toString()};
    const readBootstrapAuthoringFormDataFromDocument = ${readBootstrapAuthoringFormDataFromDocument.toString()};
    const buildBootstrapAppAuthoringSubmitRequest = ${buildBootstrapAppAuthoringSubmitRequest.toString()};
    const runBootstrapAppAuthoringSubmit = ${runBootstrapAppAuthoringSubmit.toString()};
    const bindBootstrapAppAuthoringSubmit = ${bindBootstrapAppAuthoringSubmit.toString()};
  `;
}

function coerceInteger(value) {
  return value === "" || value == null ? undefined : Number(value);
}

function omitBlankStringFields(record = {}) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== "")
  );
}

function readBootstrapAuthoringFormDataFromDocument({
  formId = "",
  family = "",
  document = globalThis?.document || null
} = {}) {
  const form = document?.getElementById?.(formId);
  if (!form) throw new Error("missing bootstrap form: " + formId);
  const data = Object.fromEntries(new FormData(form).entries());
  if (family === "widget" || family === "route") {
    for (const field of Array.from(form.elements || [])) {
      if (!field?.name || field?.type !== "checkbox") continue;
      data[field.name] = Boolean(field.checked);
    }
  }
  return data;
}

export function buildBootstrapAppAuthoringSubmitRequest({
  detail = {},
  data = {}
} = {}) {
  if (detail.family === "context") {
    return {
      url: "/api/contexts",
      body: data
    };
  }
  if (detail.family === "perspective") {
    return {
      url: "/api/perspectives",
      body: data
    };
  }
  if (detail.family === "widget") {
    return {
      url: "/api/widgets",
      body: {
        ...omitBlankStringFields(data),
        tutorialTarget: data.tutorialTarget || data.id || undefined,
        attach: data.attach === true,
        template: data.template === true,
        order: coerceInteger(data.order),
        level: coerceInteger(data.level)
      }
    };
  }
  if (detail.family === "program") {
    return {
      url: "/api/frontend-programs",
      body: data
    };
  }
  if (detail.family === "step") {
    return {
      url: "/api/frontend-steps",
      body: {
        ...data,
        order: coerceInteger(data.order)
      }
    };
  }
  if (detail.family === "route") {
    return {
      url: "/api/routes",
      body: {
        ...omitBlankStringFields(data),
        liveProjection: data.liveProjection === true
      }
    };
  }
  if (detail.family === "serve") {
    return {
      url: "/api/serve-mounts",
      body: data
    };
  }
  if (detail.family === "runner") {
    return {
      url: "/api/server-runners",
      body: data
    };
  }
  return null;
}

export async function runBootstrapAppAuthoringSubmit({
  detail = {},
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  readFormData = payload => readBootstrapAuthoringFormDataFromDocument(payload)
} = {}) {
  const data = readFormData({
    formId: detail.formId || "",
    family: detail.family || ""
  });
  const request = buildBootstrapAppAuthoringSubmitRequest({ detail, data });
  if (!request) return false;
  try {
    await postJson(request.url, request.body);
    setStatus(detail.statusId, "Saved.");
    resetForm(detail.formId);
    await refresh();
    return true;
  } catch (error) {
    setStatus(detail.statusId, error.message);
    return false;
  }
}

export function bindBootstrapAppAuthoringSubmit({
  target = null,
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  readFormData = payload => readBootstrapAuthoringFormDataFromDocument(payload)
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  if (!resolvedTarget?.addEventListener) return null;
  const handler = event => runBootstrapAppAuthoringSubmit({
    detail: event?.detail || {},
    postJson,
    refresh,
    setStatus,
    resetForm,
    readFormData
  });
  resolvedTarget.addEventListener("witness:bootstrap-app-authoring-submit", handler);
  return handler;
}
