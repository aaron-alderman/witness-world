// The shared renderer half — pure, platform-neutral.
//
// planSurface(view, data) resolves bindings, list expansion and conditionals
// into a flat render tree of CONCRETE primitives: pure data, no DOM, no closures,
// no platform types. A `draw()` for ANY platform walks this identical tree — the
// browser shell (server.js) today, a React Native shell next. This is the
// chart-runtime discipline (planChart -> drawChart): one pure plan, many native
// draws. The plan is the contract between "what to show" and "how to paint it".
//
// Primitives a draw() must handle (the whole language):
//   { prim:"screen", children }
//   { prim:"group",  role, children }
//   { prim:"text",   role, value }
//   { prim:"list",   empty, rows:[plan...] }     // already expanded per item
//   { prim:"field",  bind, fieldKind, placeholder, value }
//   { prim:"button", label, intent:{ intent, arg, fromField } }

const get = (dotted, ctx) =>
  String(dotted).split(".").reduce((o, k) => (o == null ? o : o[k]), ctx);

export function planSurface(view, data = {}) {
  return planNode(view, data);
}

function planNode(node, ctx) {
  switch (node.kind) {
    case "screen":
      return { prim: "screen", children: (node.children || []).map(c => planNode(c, ctx)) };
    case "group":
      return { prim: "group", role: node.role ?? null, children: (node.children || []).map(c => planNode(c, ctx)) };
    case "text":
      return {
        prim: "text",
        role: node.role ?? null,
        value: node.bind ? (get(node.bind, ctx) ?? "") : (node.text ?? "")
      };
    case "list": {
      const items = get(node.bind, ctx) || [];
      return {
        prim: "list",
        empty: node.empty ?? "",
        rows: items.map(item => planNode(node.item, { ...ctx, item }))
      };
    }
    case "field":
      return {
        prim: "field",
        bind: node.bind,
        fieldKind: node.fieldKind ?? "text",
        placeholder: node.placeholder ?? "",
        value: get(node.bind, ctx) ?? ""
      };
    case "action":
      // `arg` resolves now (item context is known); `fromField` stays a reference
      // because a field's live value lives in the shell, not in the projection.
      return {
        prim: "button",
        label: node.label ?? "",
        intent: {
          intent: node.intent,
          arg: node.arg ? (get(node.arg, ctx) ?? null) : null,
          fromField: node.from ?? null
        }
      };
    default:
      return { prim: "unknown", kind: node.kind ?? null };
  }
}
