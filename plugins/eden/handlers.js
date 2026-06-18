import { relation } from "../../src/kernel.js";
import { edenNeighborhoodProjection } from "./eden-projection.js";
import { renderEdenPage } from "./eden-page.js";
import {
  requestBootstrapContextDefine,
  requestBootstrapStewardshipGrant
} from "../authoring-core/authoring-core-processes.js";
import {
  requestBootstrapProposalCreate,
  requestBootstrapProposalApprove
} from "../proposals/proposal-processes.js";
import {
  projectEdenPersonalBoxItems,
  requestEdenPersonalBoxItemCreate,
  requestEdenPersonalBoxItemDelete,
  requestEdenPersonalBoxItemUpdate
} from "./eden-personal-box.js";
import { projectEdenPageTheme, requestEdenPageThemeSet } from "./eden-page-theme.js";
import { projectEdenAcademyState } from "./eden-academy.js";
import {
  edenOrganizationContextId,
  edenOrganizationContextLabel,
  edenOrganizationProposalBody,
  nextEdenOrganizationProposalId,
  projectEdenOrganizationState
} from "./eden-organization.js";
import {
  requestEdenTheoryAssessmentPass,
  requestEdenTheoryLessonStudy,
  requestEdenTheoryTeachBack
} from "./eden-theory.js";
import { projectEdenCapabilityInstallState } from "./eden-capability-install.js";
import { requestEdenCapabilityInstall } from "./eden-capability-install-request.js";
import {
  projectEdenVersionState,
  requestEdenVersionActivate,
  requestEdenVersionPublish,
  requestEdenVersionRollback
} from "./eden-versions.js";
import { normalizeAuthorityTuple } from "../../src/runtime-authz.js";
export function createEdenBundleHandlers({
  world,
  backendHost,
  frontendHost,
  send,
  sendJson,
  readJson,
  requestVisibleWitnesses,
  authoringServices,
  sendGateFailure
}) {
  const {
    requireBootstrapActor,
    ensureTargetAuthority,
    executeBootstrapProposal
  } = authoringServices;
  const edenOrganizationSurface = (requestActor, appContext, route) => {
    const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
    const surfaceId = route?.params?.surfaceId ?? "eden.surface.commons";
    const visible = requestVisibleWitnesses(requestActor, appContext);
    const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
    const surface = model?.surfaces?.find(entry => entry.id === surfaceId) ?? null;
    return { neighborhoodId, surfaceId, visible, model, surface };
  };
  const projectEdenOrganizationRuntime = (requestActor, appContext, surface) => projectEdenOrganizationState(
    requestVisibleWitnesses(requestActor, appContext),
    {
      actor: requestActor,
      surfaceId: surface?.id ?? "eden.surface.commons",
      contextParent: surface?.contextParent,
      guestSteward: surface?.guestSteward,
      proposalTargetProcess: surface?.proposalTargetProcess,
      proposalTargetKind: surface?.proposalTargetKind,
      proposalTargetId: surface?.proposalTargetId,
      proposalBody: surface?.proposalBody
    }
  );
  const edenVersionAuthorityState = (requestActor, soul) => {
    if (!requestActor) {
      return {
        authenticated: false,
        canMutate: false,
        canPropose: false,
        reason: "sign in to change versions"
      };
    }
    const gate = ensureTargetAuthority(requestActor, soul || "");
    return {
      authenticated: true,
      canMutate: Boolean(gate?.ok),
      canPropose: !gate?.ok,
      reason: gate?.ok ? null : (gate?.reason || "forbidden")
    };
  };
  const edenCapabilityInstallAuthorityState = (requestActor, target) => {
    if (!requestActor) {
      return {
        authenticated: false,
        canMutate: false,
        canPropose: false,
        reason: "sign in to install capabilities"
      };
    }
    const gate = ensureTargetAuthority(requestActor, target || "");
    return {
      authenticated: true,
      canMutate: Boolean(gate?.ok),
      canPropose: gate?.status === 403,
      reason: gate?.ok ? null : (gate?.reason || "forbidden")
    };
  };
  const edenVersionStateForRequest = ({ requestActor, surfaceId, soul, publishedVersion = null, draftVersion = null }) => ({
    ...projectEdenVersionState(world.allWitnesses(), {
      surfaceId,
      soul,
      publishedVersion,
      draftVersion
    }),
    authority: edenVersionAuthorityState(requestActor, soul)
  });
  const nextEdenVersionProposalId = ({ actor, processName, soul, version = null }) => {
    const actorPart = String(actor || "guest").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const processPart = String(processName || "edenVersions.action").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const soulPart = String(soul || "version-surface").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const versionPart = String(version || processName || Date.now()).replace(/[^A-Za-z0-9_.:-]+/g, "-");
    return ["proposal", "eden", actorPart, processPart, soulPart, versionPart].filter(Boolean).join(".");
  };
  const requestEdenVersionProposalCreate = ({ actor, processName, soul, surfaceId, publishedVersion = null, draftVersion = null, version = null, reason }) => {
    const proposalBody = { surfaceId, soul };
    if (version) proposalBody.version = version;
    if (publishedVersion) proposalBody.publishedVersion = publishedVersion;
    if (draftVersion) proposalBody.draftVersion = draftVersion;
    return requestBootstrapProposalCreate(world, {
      actor,
      backendHost,
      body: {
        id: nextEdenVersionProposalId({ actor, processName, soul, version }),
        targetProcess: processName,
        targetKind: "widgetVersion",
        targetId: soul,
        bodyJson: JSON.stringify(proposalBody),
        reason
      }
    });
  };
  const nextEdenCapabilityInstallProposalId = ({ actor, target, capability }) => {
    const actorPart = String(actor || "guest").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const targetPart = String(target || "capability-target").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const capabilityPart = String(capability || "capability").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    return ["proposal", "eden", actorPart, "capability.install", targetPart, capabilityPart].filter(Boolean).join(".");
  };
  const requestEdenCapabilityInstallProposalCreate = ({ actor, target, targetKind, capability, targetLabel }) => requestBootstrapProposalCreate(world, {
    actor,
    backendHost,
    body: {
      id: nextEdenCapabilityInstallProposalId({ actor, target, capability }),
      targetProcess: "capability.install",
      targetKind,
      targetId: target,
      bodyJson: JSON.stringify({ capability, target, targetKind }),
      reason: "Install " + capability + " on " + (targetLabel || target || "this target") + " through proposal review"
    }
  });
  const edenCapabilityInstallStateForRequest = ({
    requestActor,
    appContext,
    surfaceId,
    target,
    targetKind,
    targetLabel,
    recommendedCapabilities = []
  }) => ({
    ...projectEdenCapabilityInstallState(requestVisibleWitnesses(requestActor, appContext), {
      actor: requestActor,
      surfaceId,
      target,
      targetKind,
      targetLabel,
      recommendedCapabilities
    }),
    authority: edenCapabilityInstallAuthorityState(requestActor, target)
  });
  const theorySurfaceForRequest = (requestActor, appContext, route) => {
    const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
    const surfaceId = route?.params?.surfaceId ?? "eden.surface.tree";
    const visible = requestVisibleWitnesses(requestActor, appContext);
    const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
    const surface = model?.surfaces?.find(entry => entry.id === surfaceId) ?? null;
    return { neighborhoodId, surfaceId, visible, surface };
  };

  return {
    "edenPersonalBox.read": async ({ res, requestActor, requestSession, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const items = projectEdenPersonalBoxItems(world.allWitnesses(), { actor: requestActor, surfaceId });
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        surfaceId,
        items
      });
    },

    "edenPersonalBox.create": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const body = await readJson(req);
      const result = requestEdenPersonalBoxItemCreate(world, { actor: requestActor, backendHost, surfaceId, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { item: result.item, witness: result.witness });
    },

    "edenPersonalBox.update": async ({ req, res, requestActor, params, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const body = await readJson(req);
      const result = requestEdenPersonalBoxItemUpdate(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        itemId: params.id || "",
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { item: result.item, witness: result.witness });
    },

    "edenPersonalBox.delete": async ({ res, requestActor, params, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.personal";
      const result = requestEdenPersonalBoxItemDelete(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        itemId: params.id || ""
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { ok: true, id: result.id, witness: result.witness });
    },

    "edenPageTheme.read": async ({ res, requestActor, route, appContext }) => {
      const pageId = route?.params?.pageId ?? "todo_app_widget";
      const pageTheme = projectEdenPageTheme(requestVisibleWitnesses(requestActor, appContext), { actor: requestActor, pageId });
      sendJson(res, 200, {
        actor: requestActor || null,
        pageId,
        pageTheme
      });
    },

    "edenPageTheme.write": async ({ req, res, requestActor, route }) => {
      const pageId = route?.params?.pageId ?? "todo_app_widget";
      const body = await readJson(req);
      const result = requestEdenPageThemeSet(world, { actor: requestActor, backendHost, pageId, body });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 200, { pageTheme: result.pageTheme, witness: result.witness });
    },

    "edenAcademy.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const neighborhoodId = route?.params?.neighborhood ?? "eden.neighborhood.home";
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
      if (!model) {
        sendJson(res, 404, { error: "eden neighborhood not configured", neighborhood: neighborhoodId });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        academy: projectEdenAcademyState(visible, {
          actor: requestActor,
          neighborhoodId,
          quests: model.academy?.quests || []
        }),
        surfaces: model.surfaces.map(surface => ({
          id: surface.id,
          actions: Array.isArray(surface.actions) ? surface.actions : []
        })),
        checkpoints: model.checkpoints.map(checkpoint => ({
          id: checkpoint.id,
          quests: Array.isArray(checkpoint.quests) ? checkpoint.quests : []
        }))
      });
    },

    "edenOrganization.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(requestActor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        organizationState: surface.runtime,
        surface: {
          id: surface.id,
          actions: Array.isArray(surface.actions) ? surface.actions : [],
          quests: Array.isArray(surface.quests) ? surface.quests : []
        }
      });
    },

    "edenOrganization.createContext": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const auth = surface.contextParent ? ensureTargetAuthority(gate.actor, surface.contextParent) : { ok: true };
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      if (surface.runtime.contextExists) {
        sendJson(res, 200, {
          context: surface.runtime.context,
          organizationState: surface.runtime
        });
        return;
      }
      const result = requestBootstrapContextDefine(world, {
        actor: gate.actor,
        backendHost,
        body: {
          id: edenOrganizationContextId(gate.actor),
          label: edenOrganizationContextLabel(gate.actor),
          parent: surface.contextParent ?? null
        }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 201, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        context: result.context,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenOrganization.grantStewardship": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      if (!surface.runtime.contextExists) {
        sendJson(res, 409, { error: "start a group first", organizationState: surface.runtime });
        return;
      }
      const auth = ensureTargetAuthority(gate.actor, surface.runtime.contextId);
      if (!auth.ok) {
        sendGateFailure(res, auth);
        return;
      }
      if (surface.runtime.hasGuestStewardship) {
        sendJson(res, 200, {
          stewardship: surface.runtime.guestGrant,
          organizationState: surface.runtime
        });
        return;
      }
      const result = requestBootstrapStewardshipGrant(world, {
        actor: gate.actor,
        backendHost,
        body: {
          steward: surface.runtime.guestSteward,
          target: surface.runtime.contextId,
          targetKind: "context"
        }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 201, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        stewardship: result.stewardship,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenOrganization.createProposal": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      if (!surface.runtime.contextExists) {
        sendJson(res, 409, { error: "start a group first", organizationState: surface.runtime });
        return;
      }
      if (!surface.runtime.hasGuestStewardship) {
        sendJson(res, 409, { error: "grant stewardship first", organizationState: surface.runtime });
        return;
      }
      if (surface.runtime.openProposal) {
        sendJson(res, 200, {
          proposal: surface.runtime.openProposal,
          organizationState: surface.runtime
        });
        return;
      }
      const template = surface.runtime.proposalTemplate || {};
      const result = requestBootstrapProposalCreate(world, {
        actor: gate.actor,
        backendHost,
        body: {
          id: nextEdenOrganizationProposalId(world.allWitnesses(), gate.actor),
          targetProcess: template.targetProcess || "widget.define",
          targetKind: template.targetKind || "widget",
          targetId: template.targetId || null,
          bodyJson: JSON.stringify(
            template.body && typeof template.body === "object"
              ? template.body
              : edenOrganizationProposalBody(gate.actor, { contextId: surface.runtime.contextId, widgetId: surface.runtime.noticeWidgetId })
          ),
          reason: `Open ${edenOrganizationContextLabel(gate.actor)} through a witnessed proposal`
        }
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 201, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        proposal: result.proposal,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenOrganization.approveProposal": async ({ res, requestActor, requestSession, route, appContext }) => {
      const gate = requireBootstrapActor(requestActor);
      if (!gate.ok) {
        sendGateFailure(res, gate);
        return;
      }
      const { neighborhoodId, surfaceId, surface } = edenOrganizationSurface(gate.actor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "organization") {
        sendJson(res, 404, { error: "eden organization practice not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const proposalId = surface.runtime.openProposal?.id || null;
      if (!proposalId) {
        sendJson(res, 404, { error: "no open organization proposal", organizationState: surface.runtime });
        return;
      }
      const result = await requestBootstrapProposalApprove(world, {
        actor: gate.actor,
        backendHost,
        proposalId,
        executeTarget: executeBootstrapProposal(gate.actor)
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: gate.actor,
        proposal: result.proposal,
        witness: result.witness,
        organizationState: projectEdenOrganizationRuntime(gate.actor, appContext, surface)
      });
    },

    "edenTheory.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const { neighborhoodId, surfaceId, surface } = theorySurfaceForRequest(requestActor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        theoryState: surface.runtime,
        surface: {
          id: surface.id,
          actions: Array.isArray(surface.actions) ? surface.actions : [],
          quests: Array.isArray(surface.quests) ? surface.quests : []
        }
      });
    },

    "edenTheory.study": async ({ res, requestActor, requestSession, route, appContext, params }) => {
      const { neighborhoodId, surfaceId, surface } = theorySurfaceForRequest(requestActor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const annexAction = (surface.actions || []).find(action => action.id === "tree_theory") ?? null;
      if (annexAction && annexAction.state !== "open") {
        sendJson(res, 409, { error: annexAction.requires || "theory annex is still locked" });
        return;
      }
      const result = requestEdenTheoryLessonStudy(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        lessonId: params.id || "",
        lessons: surface.theoryLessons || []
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          theoryState: result.theoryState ?? null
        });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        theoryState: result.theoryState
      });
    },

    "edenTheory.assess": async ({ res, requestActor, requestSession, route, appContext }) => {
      const { neighborhoodId, surfaceId, surface } = theorySurfaceForRequest(requestActor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const annexAction = (surface.actions || []).find(action => action.id === "tree_theory") ?? null;
      if (annexAction && annexAction.state !== "open") {
        sendJson(res, 409, { error: annexAction.requires || "theory annex is still locked" });
        return;
      }
      const result = requestEdenTheoryAssessmentPass(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        lessons: surface.theoryLessons || []
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          theoryState: result.theoryState ?? null
        });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        theoryState: result.theoryState
      });
    },

    "edenTheory.teachBack": async ({ req, res, requestActor, requestSession, route, appContext }) => {
      const { neighborhoodId, surfaceId, surface } = theorySurfaceForRequest(requestActor, appContext, route);
      if (!surface?.runtime || surface.runtime.mode !== "theoryAnnex") {
        sendJson(res, 404, { error: "eden theory annex not configured", neighborhood: neighborhoodId, surfaceId });
        return;
      }
      const annexAction = (surface.actions || []).find(action => action.id === "tree_theory") ?? null;
      if (annexAction && annexAction.state !== "open") {
        sendJson(res, 409, { error: annexAction.requires || "theory annex is still locked" });
        return;
      }
      const body = await readJson(req);
      const result = requestEdenTheoryTeachBack(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        lessons: surface.theoryLessons || [],
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          theoryState: result.theoryState ?? null
        });
        return;
      }
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        theoryState: result.theoryState
      });
    },

    "edenCapabilityInstall.read": async ({ res, requestActor, requestSession, route, appContext }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.world";
      const target = route?.params?.target ?? "frontend";
      const targetKind = route?.params?.targetKind ?? "context";
      const targetLabel = route?.params?.targetLabel ?? target;
      const recommendedCapabilities = Array.isArray(route?.params?.recommendedCapabilities)
        ? route.params.recommendedCapabilities
        : [];
      const capabilityState = edenCapabilityInstallStateForRequest({
        requestActor,
        appContext,
        surfaceId,
        target,
        targetKind,
        targetLabel,
        recommendedCapabilities
      });
      sendJson(res, 200, {
        authenticated: Boolean(requestSession),
        actor: requestActor || null,
        identity: requestSession?.identity ?? null,
        label: requestSession?.label ?? null,
        capabilityState
      });
    },

    "edenCapabilityInstall.install": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.world";
      const target = route?.params?.target ?? "frontend";
      const targetKind = route?.params?.targetKind ?? "context";
      const targetLabel = route?.params?.targetLabel ?? target;
      const recommendedCapabilities = Array.isArray(route?.params?.recommendedCapabilities)
        ? route.params.recommendedCapabilities
        : [];
      const body = await readJson(req);
      const auth = requestActor ? ensureTargetAuthority(requestActor, target) : null;
      if (requestActor && auth && !auth.ok) {
        if (auth.status === 403) {
          const capability = typeof body?.capability === "string" ? body.capability : null;
          const proposal = requestEdenCapabilityInstallProposalCreate({
            actor: requestActor,
            target,
            targetKind,
            capability,
            targetLabel
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            capabilityState: {
              ...edenCapabilityInstallStateForRequest({
                requestActor,
                appContext: null,
                surfaceId,
                target,
                targetKind,
                targetLabel,
                recommendedCapabilities
              }),
              authority: edenCapabilityInstallAuthorityState(requestActor, target)
            }
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestEdenCapabilityInstall(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        target,
        targetKind,
        targetLabel,
        recommendedCapabilities,
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          capabilityState: {
            ...(result.capabilityState ?? edenCapabilityInstallStateForRequest({
              requestActor,
              appContext: null,
              surfaceId,
              target,
              targetKind,
              targetLabel,
              recommendedCapabilities
            })),
            authority: edenCapabilityInstallAuthorityState(requestActor, target)
          }
        });
        return;
      }
      if (result.status === 202) {
        sendJson(res, 202, {
          ok: true,
          status: "proposed",
          proposal: result.proposal,
          witness: result.witness,
          capabilityState: {
            ...result.capabilityState,
            authority: edenCapabilityInstallAuthorityState(requestActor, target)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        capabilityInstall: result.capabilityInstall,
        witness: result.witness,
        capabilityState: {
          ...result.capabilityState,
          authority: edenCapabilityInstallAuthorityState(requestActor, target)
        }
      });
    },

    "edenVersions.read": async ({ res, route, requestActor }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const versionState = edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion });
      sendJson(res, 200, { surfaceId, soul, versionState });
    },

    "edenVersions.activate": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const body = await readJson(req);
      const version = typeof body?.version === "string" ? body.version : null;
      const auth = requestActor ? ensureTargetAuthority(requestActor, soul) : null;
      if (requestActor && auth && !auth.ok) {
        if (auth.status === 403) {
          const proposal = requestEdenVersionProposalCreate({
            actor: requestActor,
            processName: "edenVersions.activate",
            soul,
            surfaceId,
            publishedVersion,
            draftVersion,
            version,
            reason: "Open a shared Eden version through proposal review"
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            versionState: edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestEdenVersionActivate(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        soul,
        publishedVersion,
        draftVersion,
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          versionState: {
            ...(result.versionState ?? edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })),
            authority: edenVersionAuthorityState(requestActor, soul)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        status: result.activationStatus,
        witness: result.witness,
        versionState: {
          ...result.versionState,
          authority: edenVersionAuthorityState(requestActor, soul)
        }
      });
    },

    "edenVersions.rollback": async ({ res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const auth = requestActor ? ensureTargetAuthority(requestActor, soul) : null;
      if (requestActor && auth && !auth.ok) {
        if (auth.status === 403) {
          const proposal = requestEdenVersionProposalCreate({
            actor: requestActor,
            processName: "edenVersions.rollback",
            soul,
            surfaceId,
            publishedVersion,
            draftVersion,
            reason: "Restore the last good shared Eden version through proposal review"
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            versionState: edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const result = requestEdenVersionRollback(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        soul,
        publishedVersion,
        draftVersion
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          versionState: {
            ...(result.versionState ?? edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })),
            authority: edenVersionAuthorityState(requestActor, soul)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        status: result.rollbackStatus,
        witness: result.witness,
        versionState: {
          ...result.versionState,
          authority: edenVersionAuthorityState(requestActor, soul)
        }
      });
    },

    "edenVersions.publish": async ({ req, res, requestActor, route }) => {
      const surfaceId = route?.params?.surfaceId ?? "eden.surface.versions";
      const soul = route?.params?.soul ?? "";
      const publishedVersion = route?.params?.publishedVersion ?? null;
      const draftVersion = route?.params?.draftVersion ?? null;
      const auth = requestActor ? ensureTargetAuthority(requestActor, soul) : null;
      if (requestActor && auth && !auth.ok) {
        if (auth.status === 403) {
          const body = await readJson(req);
          const version = typeof body?.version === "string" ? body.version : null;
          const proposal = requestEdenVersionProposalCreate({
            actor: requestActor,
            processName: "edenVersions.publish",
            soul,
            surfaceId,
            publishedVersion,
            draftVersion,
            version,
            reason: "Publish the current shared version through proposal review"
          });
          if (!proposal.ok) {
            sendJson(res, proposal.status || 400, { error: proposal.error, witness: proposal.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            versionState: edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })
          });
          return;
        }
        sendGateFailure(res, auth);
        return;
      }
      const body = await readJson(req);
      const result = requestEdenVersionPublish(world, {
        actor: requestActor,
        backendHost,
        surfaceId,
        soul,
        publishedVersion,
        draftVersion,
        body
      });
      if (!result.ok) {
        sendJson(res, result.status, {
          error: result.error,
          witness: result.witness,
          versionState: {
            ...(result.versionState ?? edenVersionStateForRequest({ requestActor, surfaceId, soul, publishedVersion, draftVersion })),
            authority: edenVersionAuthorityState(requestActor, soul)
          }
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        witness: result.witness,
        versionState: {
          ...result.versionState,
          authority: edenVersionAuthorityState(requestActor, soul)
        }
      });
    },

    "page.edenCanvas": async ({ res, route, requestActor, requestSession, appContext }) => {
      const neighborhoodId = route.params?.neighborhood ?? "eden.neighborhood.home";
      const visible = requestVisibleWitnesses(requestActor, appContext);
      const model = edenNeighborhoodProjection(visible, neighborhoodId, { actor: requestActor });
      if (!model) {
        sendJson(res, 404, { error: "eden neighborhood not configured", neighborhood: neighborhoodId });
        return;
      }
      if (requestSession) {
        const authority = normalizeAuthorityTuple(requestSession);
        model.session = {
          authenticated: true,
          actor: authority.effectiveActor ?? null,
          identity: authority.effectiveIdentity ?? null,
          label: requestSession.label,
          authenticatedIdentity: authority.authenticatedIdentity ?? null,
          authenticatedActor: authority.authenticatedActor ?? null,
          effectiveIdentity: authority.effectiveIdentity ?? null,
          effectiveActor: authority.effectiveActor ?? null,
          authorityMode: authority.authorityMode ?? "direct",
          assumptionGrantId: authority.assumptionGrantId ?? null
        };
      } else {
        model.session = {
          authenticated: false,
          actor: null,
          identity: null,
          label: null,
          authenticatedIdentity: null,
          authenticatedActor: null,
          effectiveIdentity: null,
          effectiveActor: null,
          authorityMode: "direct",
          assumptionGrantId: null
        };
      }
      world.observe({
        process: "frontend.renderEdenPage",
        actor: frontendHost,
        claims: [relation(frontendHost, "rendered", route.serves || neighborhoodId)],
        body: { route: route.path, neighborhood: neighborhoodId }
      });
      send(res, 200, "text/html", renderEdenPage({ model }));
    }
  };
}


