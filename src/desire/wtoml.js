import fs from "node:fs/promises";
import path from "node:path";
import { createDesirePlusDocument, createDesirePlusNode, createTrace } from "./ir.js";
import { parseWitnessToml } from "../dsl.js";

const SEMANTIC_WTOML_KINDS = new Set([
  "context",
  "capability",
  "type",
  "trait",
  "valueType",
  "state",
  "message",
  "processSpec",
  "entity",
  "identity",
  "store",
  "process",
  "boundary",
  "policy",
  "projection",
  "surface",
  "dataflow"
]);

export function compileWtomlDocsToDesirePlus(docs, meta = {}) {
  const nodes = docs.map((doc, index) => {
    const trace = createTrace({
      sourceLanguage: "wtoml",
      file: doc.file ?? null,
      startLine: doc.line ?? null,
      sourceKind: doc.kind
    });
    const semantic = semanticWtomlShape(doc);
    const sourceCategory = SEMANTIC_WTOML_KINDS.has(doc.kind) ? "semantic" : "runtime";
    return createDesirePlusNode({
      kind: "wtoml.doc",
      name: doc.values?.id ?? doc.values?.soul ?? doc.values?.version ?? null,
      order: index,
      trace,
      payload: {
        docKind: doc.kind,
        values: structuredClone(doc.values ?? {}),
        file: doc.file ?? null,
        line: doc.line ?? null,
        sectionStyle: doc.sectionStyle ?? inferSectionStyle(doc)
      },
      semantic,
      meta: {
        sourceCategory,
        residualCategory: sourceCategory === "runtime" ? "authored-runtime" : null,
        desireBoundary: sourceCategory === "semantic" ? "desire-kernel" : "desire-plus-only"
      }
    });
  });
  return createDesirePlusDocument(nodes, meta);
}

export function compileWtomlToDesirePlus(source, { file = null } = {}) {
  const docs = parseWitnessToml(source).map(doc => ({ ...doc, file }));
  return compileWtomlDocsToDesirePlus(docs, { file });
}

export async function compileWtomlFileToDesirePlus(file) {
  const resolved = path.resolve(file);
  const source = await fs.readFile(resolved, "utf8");
  return compileWtomlToDesirePlus(source, { file: resolved });
}

function semanticWtomlShape(doc) {
  const values = doc.values ?? {};
  switch (doc.kind) {
    case "context":
      return {
        kind: "context",
        name: values.id ?? null,
        actor: values.actor ?? null,
        label: values.label ?? null,
        parent: values.parent ?? null,
        owner: values.owner ?? null,
        stewards: values.stewards ?? values.initialStewards ?? [],
        capabilities: values.capabilities ?? []
      };
    case "capability":
      return {
        kind: "capability",
        name: values.id ?? null,
        verbs: values.verbs ?? [],
        scope: values.scope ?? (values.context ? [values.context] : []),
        provides: values.provides ?? [],
        source: values.source ?? null,
        state: values.state ?? null,
        driver: values.driver ?? null,
        actor: values.actor ?? null,
        label: values.label ?? null,
        version: values.version ?? null,
        provenance: values.provenance ?? null,
        dependsOn: values.dependsOn ?? [],
        publicApi: values.publicApi ?? [],
        config: values.config ?? [],
        internals: values.internals ?? [],
        authority: values.authority ?? [],
        providerAdapters: values.providerAdapters ?? [],
        witnessContract: values.witnessContract ?? null,
        placement: values.placement ?? [],
        context: values.context ?? null,
        owner: values.owner ?? null
      };
    case "type":
      return {
        kind: "type",
        name: values.id ?? null,
        role: values.role ?? null,
        field: values.field ?? null,
        versionKind: values.versionKind ?? null,
        valueType: values.valueType ?? null,
        initial: values.initial ?? null,
        actor: values.actor ?? null,
        label: values.label ?? null,
        editor: values.editor ?? null,
        compatibleWith: values.compatibleWith ?? [],
        cases: values.cases ?? [],
        owner: values.owner ?? null
      };
    case "state":
      return {
        kind: "state",
        name: values.id ?? null,
        valueType: values.valueType ?? null,
        initial: values.initial ?? null
      };
    case "trait":
      return {
        kind: "type",
        name: values.id ?? null,
        role: "trait",
        actor: values.actor ?? null,
        label: values.label ?? null,
        owner: values.owner ?? null
      };
    case "valueType":
      return {
        kind: "type",
        name: values.id ?? null,
        role: "valueType",
        actor: values.actor ?? null,
        label: values.label ?? null,
        editor: values.editor ?? null,
        compatibleWith: values.compatibleWith ?? [],
        owner: values.owner ?? null
      };
    case "processSpec":
      return {
        kind: "message",
        name: values.id ?? null,
        role: "processSpec",
        actor: values.actor ?? null,
        process: values.process ?? null,
        inputs: values.inputs ?? [],
        outputs: values.outputs ?? [],
        owner: values.owner ?? null
      };
    case "message":
      return {
        kind: "message",
        name: values.id ?? null,
        fields: values.fields ?? [],
        role: values.role ?? null,
        schema: values.schema ?? null,
        writes: values.writes ?? {},
        messageKind: values.messageKind ?? values.kind ?? null,
        route: values.route ?? null,
        requestSchema: values.requestSchema ?? null,
        responseSchema: values.responseSchema ?? null,
        requestState: values.requestState ?? null,
        loadingState: values.loadingState ?? null,
        successEvent: values.successEvent ?? null,
        failureEvent: values.failureEvent ?? null,
        refreshRuntime: values.refreshRuntime ?? null,
        sequence: values.sequence ?? null,
        boundary: values.boundary ?? null,
        steps: values.steps ?? [],
        actor: values.actor ?? null,
        process: values.process ?? null,
        inputs: values.inputs ?? [],
        outputs: values.outputs ?? [],
        owner: values.owner ?? null
      };
    case "entity":
      return {
        kind: "entity",
        name: values.id ?? null,
        context: values.context ?? null,
        store: values.store ?? null,
        identity: values.identity ?? null,
        version: values.version ?? null,
        versionRef: values.versionRef ?? null,
        fields: values.fields ?? [],
        role: values.role ?? null,
        actor: values.actor ?? null,
        author: values.author ?? null,
        label: values.label ?? null,
        username: values.username ?? null,
        password: values.password ?? null,
        homeContext: values.homeContext ?? null,
        homePerspective: values.homePerspective ?? null,
        owner: values.owner ?? null
      };
    case "identity":
      return {
        kind: "entity",
        name: values.id ?? null,
        role: "identity",
        actor: values.actor ?? null,
        author: values.author ?? null,
        context: values.context ?? null,
        label: values.label ?? null,
        username: values.username ?? null,
        password: values.password ?? null,
        homeContext: values.homeContext ?? null,
        homePerspective: values.homePerspective ?? null,
        owner: values.owner ?? null
      };
    case "store":
      return {
        kind: "store",
        name: values.id ?? null,
        storeKind: values.storeKind ?? values.kind ?? null,
        context: values.context ?? null,
        owner: values.owner ?? null,
        entity: values.entity ?? null,
        props: values.props ?? {}
      };
    case "process":
      return {
        kind: "process",
        name: values.id ?? null,
        state: values.state ?? [],
        handles: values.handles ?? [],
        emits: values.emits ?? [],
        rules: values.rules ?? []
      };
    case "boundary":
      return {
        kind: "boundary",
        name: values.id ?? null,
        capabilities: values.capabilities ?? [],
        operations: values.operations ?? []
      };
    case "policy":
      return {
        kind: "policy",
        name: values.id ?? null,
        subject: values.subject ?? null,
        initialState: values.initialState ?? null,
        stateField: values.stateField ?? null,
        readyState: values.readyState ?? null,
        disagreementState: values.disagreementState ?? null,
        disagreementOutcomes: values.disagreementOutcomes ?? {},
        policyOutcomes: values.policyOutcomes ?? {}
      };
    case "projection":
      return {
        kind: "projection",
        name: values.id ?? null,
        projectionKind: values.projectionKind ?? values.kind ?? null,
        source: values.source ?? null,
        props: values.props ?? {}
      };
    case "surface":
      return {
        kind: "surface",
        name: values.id ?? null,
        identity: values.identity ?? null,
        surfaceKind: values.surfaceKind ?? values.kind ?? null,
        className: values.className ?? values.class ?? null,
        children: values.children ?? [],
        props: values.props ?? {},
        processRef: values.processRef ?? null,
        projectionRefs: values.projectionRefs ?? [],
        capabilityRefs: values.capabilityRefs ?? [],
        bindings: values.bindings ?? [],
        interactions: values.interactions ?? [],
        modelRef: values.modelRef ?? values.model ?? null,
        frame: values.frame ?? null,
        encoding: normalizeChartEncoding(values.encoding ?? {}),
        editable: values.editable ?? [],
        layers: values.layers ?? []
      };
    case "dataflow":
      return {
        kind: "dataflow",
        name: values.id ?? null,
        axes: values.axes ?? [],
        params: values.params ?? [],
        derives: values.derives ?? [],
        reduces: values.reduces ?? []
      };
    default:
      return null;
  }
}

function inferSectionStyle(doc) {
  if (doc.kind === "context") return "table";
  return "array";
}

function normalizeChartEncoding(encoding) {
  return Object.fromEntries(
    Object.entries(encoding ?? {}).map(([channel, spec]) => [
      channel,
      {
        ...spec,
        label: spec?.label ?? null
      }
    ])
  );
}
