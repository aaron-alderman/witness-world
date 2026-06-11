import { relation } from "./kernel.js";
import { thingId } from "./ids.js";
import { defineWidget, attachWidget } from "./widgets.js";
import { typeModelProjection, validateProcessInput, validateProcessOutput } from "./type-model.js";

export function requestWidgetDefine(world, {
  actor,
  backendHost,
  body,
  defaultParent = null,
  owner = actor,
  widgetClass = "user-widget"
}) {
  if (!actor) {
    const witness = world.emit({
      process: "widget.define.failed",
      actor: backendHost,
      claims: [],
      body: { reason: "no actor" }
    });
    return { ok: false, status: 401, error: "choose a perspective first", witness };
  }

  const typeModel = typeModelProjection(world.allWitnesses());
  const validatedInput = validateProcessInput(typeModel, "widget.define", body);
  if (!validatedInput.ok) {
    const witness = world.emit({
      process: "widget.define.blocked",
      actor,
      claims: [],
      body: { gate: "type.compatibility", failures: validatedInput.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }

  const widget = buildWidgetDefineOutput(world, {
    actor,
    input: validatedInput.value,
    defaultParent
  });
  if (!widget.ok) return widget;

  const validatedOutput = validateProcessOutput(typeModel, "widget.define", widget.value);
  if (!validatedOutput.ok) {
    const witness = world.emit({
      process: "widget.define.failed",
      actor,
      claims: [],
      body: { gate: "type.compatibility", failures: validatedOutput.failures }
    });
    return { ok: false, status: 500, error: "typed output validation failed", witness };
  }

  defineWidget(world, {
    actor,
    id: validatedOutput.value.id,
    kind: validatedOutput.value.kind,
    props: { text: validatedOutput.value.text, class: widgetClass },
    owner
  });
  attachWidget(world, {
    actor,
    parent: validatedOutput.value.parent,
    child: validatedOutput.value.id,
    order: validatedOutput.value.order
  });
  const witness = world.emit({
    process: "widget.define",
    actor,
    claims: [relation(actor, "editedProjection", validatedOutput.value.parent)],
    body: { input: validatedInput.value, widget: validatedOutput.value }
  });
  return { ok: true, status: 201, widget: validatedOutput.value, witness };
}

function buildWidgetDefineOutput(world, { actor, input, defaultParent }) {
  const kind = input.kind;
  const text = input.text.trim();
  const parent = typeof input.parent === "string" && input.parent.trim()
    ? input.parent.trim()
    : defaultParent;
  if (!parent) {
    const witness = world.emit({
      process: "widget.define.failed",
      actor,
      claims: [],
      body: { reason: "root widget not configured" }
    });
    return { ok: false, status: 400, error: "root widget not configured", witness };
  }
  const order = Number.isFinite(Number(input.order)) ? Number(input.order) : 999;
  return {
    ok: true,
    value: {
      id: thingId("widget", { actor, parent, kind, text, ordinal: world.allWitnesses().length }),
      kind,
      parent,
      text,
      order
    }
  };
}
