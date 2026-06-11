import { defineTrait, defineValueType, defineProcessSpec } from "./type-model.js";
import { defineCapability } from "./modules.js";

const TRAITS = [
  { id: "textual", label: "Textual" },
  { id: "numeric", label: "Numeric" },
  { id: "boolean", label: "Boolean" },
  { id: "color", label: "Color" },
  { id: "enumerated", label: "Enumerated" }
];

const VALUE_TYPES = [
  { id: "widget.kind", label: "Widget Kind", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["Page", "Box", "Section", "Heading", "Text", "Form", "Input", "Select", "Option", "Button", "Link", "List", "ValueEditor"] } },
  { id: "widget.id", label: "Widget Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.parent", label: "Parent Widget", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.order", label: "Widget Order", compatibleWith: ["numeric"], editor: { control: "number" } },
  { id: "widget.text", label: "Widget Text", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.title", label: "Widget Title", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.class", label: "Widget Class", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.role", label: "Widget Role", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.href", label: "Widget Href", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.name", label: "Widget Name", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.placeholder", label: "Widget Placeholder", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.autocomplete", label: "Widget Autocomplete", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.type", label: "Widget Type", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.action", label: "Widget Action", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.label", label: "Widget Label", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.valueType", label: "Widget Value Type", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.dataId", label: "Widget Data Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.dataDone", label: "Widget Data Done", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.tutorialTarget", label: "Widget Tutorial Target", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.eventSoul", label: "Widget Event Soul", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.eventVersion", label: "Widget Event Version", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.template", label: "Widget Template", compatibleWith: ["boolean"], editor: { control: "checkbox" } },
  { id: "widget.attach", label: "Widget Attach", compatibleWith: ["boolean"], editor: { control: "checkbox" } },
  { id: "widget.level", label: "Widget Level", compatibleWith: ["numeric"], editor: { control: "number" } },
  { id: "identity.id", label: "Identity Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.actor", label: "Identity Actor", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.label", label: "Identity Label", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.username", label: "Identity Username", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.password", label: "Identity Password", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.perspective", label: "Identity Perspective", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "program.id", label: "Program Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "program.event", label: "Program Event", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "program.op", label: "Program Operation", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["initSession", "setSession", "logout", "setText", "setValue", "fetchJson", "renderCollection", "renderWorldGraph", "readForm", "refreshProjection", "reloadPage", "postJson", "patchJson", "deleteJson", "clearForm", "run"] } },
  { id: "route.id", label: "Route Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "route.path", label: "Route Path", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "route.serves", label: "Route Serves", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "route.method", label: "Route Method", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["GET", "POST", "PATCH", "DELETE"] } },
  { id: "route.handler", label: "Route Handler", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.id", label: "Server Runner Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.handlerSet", label: "Handler Set", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.host", label: "Host Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.storage", label: "Storage Path", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "context.id", label: "Context Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "capability.id", label: "Capability Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "capability.label", label: "Capability Label", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "capability.version", label: "Capability Version", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "capability.target", label: "Capability Install Target", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "capability.targetKind", label: "Capability Install Target Kind", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["context", "serverRunner", "routePage"] } },
  { id: "authority.id", label: "Authority Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "json.text", label: "JSON Text", compatibleWith: ["textual"], editor: { control: "text" } }
];

const PROCESS_SPECS = [
  {
    id: "widget_define_spec",
    process: "widget.define",
    inputs: [
      { name: "id", accepts: "widget.id", required: false },
      { name: "kind", accepts: "widget.kind", required: true },
      { name: "parent", accepts: "widget.parent", required: false },
      { name: "order", accepts: "widget.order", required: false },
      { name: "text", accepts: "widget.text", required: false },
      { name: "title", accepts: "widget.title", required: false },
      { name: "class", accepts: "widget.class", required: false },
      { name: "role", accepts: "widget.role", required: false },
      { name: "href", accepts: "widget.href", required: false },
      { name: "name", accepts: "widget.name", required: false },
      { name: "placeholder", accepts: "widget.placeholder", required: false },
      { name: "autocomplete", accepts: "widget.autocomplete", required: false },
      { name: "type", accepts: "widget.type", required: false },
      { name: "action", accepts: "widget.action", required: false },
      { name: "label", accepts: "widget.label", required: false },
      { name: "valueType", accepts: "widget.valueType", required: false },
      { name: "dataId", accepts: "widget.dataId", required: false },
      { name: "dataDone", accepts: "widget.dataDone", required: false },
      { name: "tutorialTarget", accepts: "widget.tutorialTarget", required: false },
      { name: "eventSoul", accepts: "widget.eventSoul", required: false },
      { name: "eventVersion", accepts: "widget.eventVersion", required: false },
      { name: "template", accepts: "widget.template", required: false },
      { name: "attach", accepts: "widget.attach", required: false },
      { name: "level", accepts: "widget.level", required: false }
    ],
    outputs: [
      { name: "id", accepts: "widget.id", required: true },
      { name: "kind", accepts: "widget.kind", required: true },
      { name: "parent", accepts: "widget.parent", required: false },
      { name: "order", accepts: "widget.order", required: false },
      { name: "text", accepts: "widget.text", required: false }
    ]
  },
  {
    id: "identity_define_spec",
    process: "identity.define",
    inputs: [
      { name: "id", accepts: "identity.id", required: true },
      { name: "actor", accepts: "identity.actor", required: true },
      { name: "label", accepts: "identity.label", required: true },
      { name: "username", accepts: "identity.username", required: true },
      { name: "password", accepts: "identity.password", required: true },
      { name: "homePerspective", accepts: "identity.perspective", required: false }
    ],
    outputs: [{ name: "id", accepts: "identity.id", required: true }]
  },
  {
    id: "frontend_program_define_spec",
    process: "frontendProgram.define",
    inputs: [
      { name: "id", accepts: "program.id", required: true },
      { name: "rootWidget", accepts: "widget.id", required: true }
    ],
    outputs: [{ name: "id", accepts: "program.id", required: true }]
  },
  {
    id: "frontend_step_define_spec",
    process: "frontendStep.define",
    inputs: [
      { name: "program", accepts: "program.id", required: true },
      { name: "event", accepts: "program.event", required: true },
      { name: "op", accepts: "program.op", required: true },
      { name: "order", accepts: "widget.order", required: false },
      { name: "paramsJson", accepts: "json.text", required: false },
      { name: "whenJson", accepts: "json.text", required: false },
      { name: "repeatJson", accepts: "json.text", required: false },
      { name: "afterJson", accepts: "json.text", required: false }
    ],
    outputs: [{ name: "program", accepts: "program.id", required: true }]
  },
  {
    id: "route_define_spec",
    process: "route.define",
    inputs: [
      { name: "id", accepts: "route.id", required: true },
      { name: "path", accepts: "route.path", required: true },
      { name: "serves", accepts: "route.serves", required: true },
      { name: "method", accepts: "route.method", required: true },
      { name: "handler", accepts: "route.handler", required: true }
    ],
    outputs: [{ name: "id", accepts: "route.id", required: true }]
  },
  {
    id: "serve_define_spec",
    process: "serve.define",
    inputs: [
      { name: "serverRunner", accepts: "serverRunner.id", required: true },
      { name: "route", accepts: "route.id", required: true }
    ],
    outputs: [{ name: "route", accepts: "route.id", required: true }]
  },
  {
    id: "server_runner_define_spec",
    process: "serverRunner.define",
    inputs: [
      { name: "id", accepts: "serverRunner.id", required: true },
      { name: "backendHost", accepts: "serverRunner.host", required: true },
      { name: "frontendHost", accepts: "serverRunner.host", required: true },
      { name: "handlerSet", accepts: "serverRunner.handlerSet", required: false },
      { name: "todoProjection", accepts: "serverRunner.storage", required: false },
      { name: "privateNotesProjection", accepts: "serverRunner.storage", required: false },
      { name: "allowActorHeader", accepts: "widget.attach", required: false }
    ],
    outputs: [{ name: "id", accepts: "serverRunner.id", required: true }]
  },
  {
    id: "capability_define_spec",
    process: "capability.define",
    inputs: [
      { name: "id", accepts: "capability.id", required: true },
      { name: "label", accepts: "capability.label", required: true },
      { name: "version", accepts: "capability.version", required: false },
      { name: "provenanceJson", accepts: "json.text", required: false },
      { name: "dependsOnJson", accepts: "json.text", required: false },
      { name: "publicApiJson", accepts: "json.text", required: false },
      { name: "configJson", accepts: "json.text", required: false },
      { name: "internalsJson", accepts: "json.text", required: false },
      { name: "authorityJson", accepts: "json.text", required: false },
      { name: "placementJson", accepts: "json.text", required: false }
    ],
    outputs: [{ name: "id", accepts: "capability.id", required: true }]
  },
  {
    id: "capability_install_spec",
    process: "capability.install",
    inputs: [
      { name: "capability", accepts: "capability.id", required: true },
      { name: "target", accepts: "capability.target", required: true },
      { name: "targetKind", accepts: "capability.targetKind", required: true }
    ],
    outputs: [{ name: "capability", accepts: "capability.id", required: true }]
  },
  {
    id: "capability_remove_spec",
    process: "capability.remove",
    inputs: [
      { name: "capability", accepts: "capability.id", required: true },
      { name: "target", accepts: "capability.target", required: true },
      { name: "targetKind", accepts: "capability.targetKind", required: true }
    ],
    outputs: [{ name: "capability", accepts: "capability.id", required: true }]
  }
];

const BUILTIN_CAPABILITIES = [
  {
    id: "http.serve",
    label: "HTTP Serve",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    authority: [{ name: "network.listen", accepts: "authority.id", required: true }],
    placement: ["context", "serverRunner"]
  },
  {
    id: "fs.json.read",
    label: "JSON File Read",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    authority: [{ name: "filesystem.read", accepts: "authority.id", required: true }],
    placement: ["context", "serverRunner"]
  },
  {
    id: "fs.json.write",
    label: "JSON File Write",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    authority: [{ name: "filesystem.write", accepts: "authority.id", required: true }],
    placement: ["context", "serverRunner"]
  },
  {
    id: "dom.render",
    label: "DOM Render",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    authority: [{ name: "browser.dom", accepts: "authority.id", required: true }],
    placement: ["context", "serverRunner", "routePage"]
  },
  {
    id: "http.fetch",
    label: "HTTP Fetch",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    authority: [{ name: "network.fetch", accepts: "authority.id", required: true }],
    placement: ["context", "serverRunner", "routePage"]
  }
];

export function ensureRuntimeBuiltins(world, { actor = "system" } = {}) {
  const witnesses = world.allWitnesses();
  const definedTraits = new Set(
    witnesses.filter(w => w.process === "defineTrait" && w.body?.id).map(w => w.body.id)
  );
  const definedValueTypes = new Set(
    witnesses.filter(w => w.process === "defineValueType" && w.body?.id).map(w => w.body.id)
  );
  const definedProcessSpecs = new Set(
    witnesses.filter(w => w.process === "defineProcessSpec" && w.body?.id).map(w => w.body.id)
  );
  const definedCapabilities = new Set(
    witnesses.filter(w => w.process === "defineCapability" && w.body?.id).map(w => w.body.id)
  );

  for (const trait of TRAITS) {
    if (definedTraits.has(trait.id)) continue;
    defineTrait(world, { actor, id: trait.id, label: trait.label, owner: actor });
  }
  for (const valueType of VALUE_TYPES) {
    if (definedValueTypes.has(valueType.id)) continue;
    defineValueType(world, { actor, id: valueType.id, label: valueType.label, compatibleWith: valueType.compatibleWith, editor: valueType.editor, owner: actor });
  }
  for (const spec of PROCESS_SPECS) {
    if (definedProcessSpecs.has(spec.id)) continue;
    defineProcessSpec(world, { actor, id: spec.id, process: spec.process, inputs: spec.inputs, outputs: spec.outputs, owner: actor });
  }
  for (const capability of BUILTIN_CAPABILITIES) {
    if (definedCapabilities.has(capability.id)) continue;
    defineCapability(world, { actor, ...capability, owner: actor });
  }
}
