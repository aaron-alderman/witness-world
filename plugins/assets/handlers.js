import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { relation, thing } from "../../src/kernel.js";
import { requestBootstrapProposalCreate } from "../proposals/proposal-processes.js";

export function createAssetSurfaceHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  currentAssetById,
  ensureReadableAssetAccess,
  assetPathFor,
  assetTextPathFor,
  assetTextUrl,
  assetThumbnailPathFor,
  authorityServices,
  sendGateFailure,
  requireBackendCapabilities,
  attachmentTargetsForAsset,
  currentThingExists,
  currentThingKind,
  assetAttachedToTarget,
  runAssetAttach,
  runAssetDetach
}) {
  const { ensureTargetAuthority } = authorityServices;
  const assetAttachmentProposalId = (process, assetId, targetId) => {
    const processPart = String(process || "asset.attachment").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const assetPart = String(assetId || "asset").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    const targetPart = String(targetId || "target").replace(/[^A-Za-z0-9_.:-]+/g, "-");
    return `proposal.${processPart}.${assetPart}.${targetPart}`;
  };
  const assetAttachmentProposalConfig = ({ process, assetId, targetId }) => {
    if (!assetId || !targetId) return null;
    if (process === "asset.attach") {
      return {
        targetProcess: process,
        targetKind: "thing",
        targetId: assetId,
        reason: "Attach a shared asset through witnessed proposal",
        statusMessage: "Proposed asset attachment for review."
      };
    }
    if (process === "asset.detach") {
      return {
        targetProcess: process,
        targetKind: "thing",
        targetId: assetId,
        reason: "Remove a shared asset attachment through witnessed proposal",
        statusMessage: "Proposed asset detachment for review."
      };
    }
    return null;
  };
  const createAssetAttachmentProposal = ({ actor, process, assetId, targetId, perspective = null }) => {
    const config = assetAttachmentProposalConfig({ process, assetId, targetId });
    if (!config) return null;
    return requestBootstrapProposalCreate(world, {
      actor,
      backendHost,
      body: {
        id: assetAttachmentProposalId(config.targetProcess, assetId, targetId),
        targetProcess: config.targetProcess,
        targetKind: config.targetKind,
        targetId: config.targetId,
        bodyJson: JSON.stringify({ asset: assetId, target: targetId, perspective }),
        reason: config.reason
      }
    });
  };
  return {
    "asset.content.read": async ({ res, params, requestActor, requestUrl, appContext }) => {
      const asset = currentAssetById(params.id || "", appContext);
      if (!asset) {
        world.observe({ process: "asset.content.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const wantsDownload = requestUrl?.searchParams?.get("download") === "1";
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.content.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      const assetPath = assetPathFor(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(assetPath);
      } catch {
        world.observe({ process: "asset.content.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "asset content missing", storageKey: asset.storageKey } });
        sendJson(res, 404, { error: "asset content missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.content.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          mimeType: asset.mimeType,
          sizeBytes: stat.size,
          storageKey: asset.storageKey,
          visibility: asset.visibility,
          context: asset.context,
          contentUrl: asset.contentUrl,
          disposition: wantsDownload ? "attachment" : "inline"
        }
      });
      const fileName = String(asset.title || asset.originalName || asset.id).replace(/["\r\n]/g, "_");
      res.writeHead(200, {
        "content-type": asset.mimeType || "application/octet-stream",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `${wantsDownload ? "attachment" : "inline"}; filename="${fileName}"`
      });
      const stream = createReadStream(assetPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "asset stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.text.read": async ({ res, params, requestActor, appContext }) => {
      const asset = currentAssetById(params.id || "", appContext);
      if (!asset) {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.text.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      if (typeof asset.textRef !== "string" || !asset.textRef) {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "derived text not available" } });
        sendJson(res, 404, { error: "derived text not available", id: asset.id });
        return;
      }
      const textPath = assetTextPathFor(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(textPath);
      } catch {
        world.observe({ process: "asset.text.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "derived text missing", textRef: asset.textRef } });
        sendJson(res, 404, { error: "derived text missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.text.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          textRef: asset.textRef,
          textUrl: assetTextUrl(asset.id),
          textStatus: asset.textStatus ?? null,
          textExtractor: asset.textExtractor ?? null,
          textBytes: asset.textBytes ?? stat.size,
          visibility: asset.visibility
        }
      });
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `inline; filename="${String(asset.id).replace(/["\r\n]/g, "_")}.derived.txt"`
      });
      const stream = createReadStream(textPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "derived text stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.thumbnail.read": async ({ res, params, requestActor, appContext }) => {
      const asset = currentAssetById(params.id || "", appContext);
      if (!asset) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const access = ensureReadableAssetAccess(asset, requestActor);
      if (!access.ok) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: access.observeActor || backendHost, claims: [], body: { id: asset.id, reason: access.reason === "sign in first" ? "no actor" : access.reason } });
        sendJson(res, access.status || 403, { error: access.reason || "forbidden" });
        return;
      }
      if (typeof asset.thumbnailRef !== "string" || !asset.thumbnailRef || typeof asset.thumbnailUrl !== "string" || !asset.thumbnailUrl) {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "thumbnail not available" } });
        sendJson(res, 404, { error: "thumbnail not available", id: asset.id });
        return;
      }
      const thumbnailPath = assetThumbnailPathFor(appContext, asset.id);
      let stat = null;
      try {
        stat = await fs.stat(thumbnailPath);
      } catch {
        world.observe({ process: "asset.thumbnail.read.failed", actor: requestActor || backendHost, claims: [], body: { id: asset.id, reason: "thumbnail content missing", thumbnailRef: asset.thumbnailRef } });
        sendJson(res, 404, { error: "thumbnail content missing", id: asset.id });
        return;
      }
      world.observe({
        process: "asset.thumbnail.read",
        actor: requestActor || backendHost,
        claims: [],
        body: {
          id: asset.id,
          thumbnailRef: asset.thumbnailRef,
          thumbnailUrl: asset.thumbnailUrl,
          visibility: asset.visibility,
          sizeBytes: stat.size,
          imageWidth: asset.imageWidth ?? null,
          imageHeight: asset.imageHeight ?? null
        }
      });
      res.writeHead(200, {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-length": String(stat.size),
        "cache-control": access.isPublic ? "public, max-age=60" : "no-store",
        "content-disposition": `inline; filename="${String(asset.id).replace(/["\r\n]/g, "_")}.thumbnail.svg"`
      });
      const stream = createReadStream(thumbnailPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "thumbnail stream failed", id: asset.id });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "asset.attachments.list": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const asset = currentAssetById(params.id || "", appContext);
      if (!asset) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "asset.attachments.read.failed", actor: backendHost, claims: [], body: { id: asset.id, reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const gate = ensureTargetAuthority(requestActor, asset.id);
      if (!gate.ok) {
        world.observe({ process: "asset.attachments.read.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason } });
        sendGateFailure(res, gate);
        return;
      }
      const attachments = attachmentTargetsForAsset(asset.id);
      world.observe({
        process: "asset.attachments.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", asset.id)],
        body: { id: asset.id, count: attachments.length }
      });
      sendJson(res, 200, { asset, attachments });
    },

    "asset.attach": async ({ req, res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.attach.failed", actor: requestActor || backendHost, claims: [], body: { asset: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.attach.failed", actor: backendHost, claims: [], body: { asset: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "", appContext);
      if (!asset) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const body = await readJson(req);
      const target = typeof body?.target === "string" && body.target.trim() ? body.target.trim() : "";
      const perspective = typeof body?.perspective === "string" && body.perspective.trim() ? body.perspective.trim() : null;
      if (!target) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, reason: "target is required" } });
        sendJson(res, 400, { error: "target is required" });
        return;
      }
      if (!currentThingExists(target)) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "target not found" } });
        sendJson(res, 404, { error: "target not found", target });
        return;
      }
      const targetKind = currentThingKind(target);
      if (targetKind === "asset" || targetKind === "projectionInstance" || targetKind === "perspective") {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "target cannot hold asset attachments" } });
        sendJson(res, 409, { error: "target cannot hold asset attachments", target });
        return;
      }
      const assetGate = ensureTargetAuthority(requestActor, asset.id);
      if (!assetGate.ok) {
        if (assetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.attach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.attach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: assetGate.reason, blockedTarget: asset.id } });
        sendGateFailure(res, assetGate);
        return;
      }
      const targetGate = ensureTargetAuthority(requestActor, target);
      if (!targetGate.ok) {
        if (targetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.attach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.attach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: targetGate.reason, blockedTarget: target } });
        sendGateFailure(res, targetGate);
        return;
      }
      if (assetAttachedToTarget(asset.id, target)) {
        world.emit({ process: "asset.attach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "asset already attached to target" } });
        sendJson(res, 409, { error: "asset already attached to target", asset: asset.id, target });
        return;
      }
      const witness = runAssetAttach({ actor: requestActor, asset: asset.id, target, perspective });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, 400, { error: witness.body?.reason || "rejected", witness });
        return;
      }
      sendJson(res, 201, { ok: true, witness, attachment: { asset: asset.id, target, perspective } });
    },

    "asset.detach": async ({ req, res, params, requestActor, requestUrl, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.detach.failed", actor: requestActor || backendHost, claims: [], body: { asset: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.detach.failed", actor: backendHost, claims: [], body: { asset: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "", appContext);
      if (!asset) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: params.id || "", reason: "unknown asset" } });
        sendJson(res, 404, { error: "unknown asset", id: params.id || "" });
        return;
      }
      const body = req.method === "DELETE" ? null : await readJson(req).catch(() => null);
      const target = typeof body?.target === "string" && body.target.trim()
        ? body.target.trim()
        : String(requestUrl.searchParams.get("target") || "").trim();
      const perspective = typeof body?.perspective === "string" && body.perspective.trim() ? body.perspective.trim() : null;
      if (!target) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, reason: "target is required" } });
        sendJson(res, 400, { error: "target is required" });
        return;
      }
      const assetGate = ensureTargetAuthority(requestActor, asset.id);
      if (!assetGate.ok) {
        if (assetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.detach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.detach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: assetGate.reason, blockedTarget: asset.id } });
        sendGateFailure(res, assetGate);
        return;
      }
      const targetGate = ensureTargetAuthority(requestActor, target);
      if (!targetGate.ok) {
        if (targetGate.status === 403) {
          const proposal = createAssetAttachmentProposal({
            actor: requestActor,
            process: "asset.detach",
            assetId: asset.id,
            targetId: target,
            perspective
          });
          if (!proposal?.ok) {
            sendJson(res, proposal?.status || 400, { error: proposal?.error || "proposal creation failed", witness: proposal?.witness });
            return;
          }
          sendJson(res, 202, {
            ok: true,
            status: "proposed",
            proposal: proposal.proposal,
            witness: proposal.witness,
            attachment: { asset: asset.id, target, perspective },
            statusMessage: assetAttachmentProposalConfig({ process: "asset.detach", assetId: asset.id, targetId: target })?.statusMessage || "Proposed change for review."
          });
          return;
        }
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: targetGate.reason, blockedTarget: target } });
        sendGateFailure(res, targetGate);
        return;
      }
      if (!assetAttachedToTarget(asset.id, target)) {
        world.emit({ process: "asset.detach.failed", actor: requestActor, claims: [], body: { asset: asset.id, target, perspective, reason: "asset attachment not current" } });
        sendJson(res, 404, { error: "asset attachment not current", asset: asset.id, target });
        return;
      }
      const witness = runAssetDetach({ actor: requestActor, asset: asset.id, target, perspective });
      if (witness.process.endsWith(".failed") || witness.process.endsWith(".blocked")) {
        sendJson(res, 400, { error: witness.body?.reason || "rejected", witness });
        return;
      }
      sendJson(res, 200, { ok: true, witness, attachment: { asset: asset.id, target, perspective } });
    }
  };
}

export function createAssetWorkflowHandlers({
  world,
  backendHost,
  sendJson,
  requireBackendCapabilities,
  headerValue,
  parseMultipartAssetUpload,
  parseRawAssetUpload,
  normalizeAssetVisibility,
  resolveAssetDropContext,
  assetStorageKey,
  assetContentUrl,
  assetDownloadUrl,
  assetPathFor,
  streamReadableToFile,
  randomUUID,
  currentAssetById,
  authorityServices,
  sendGateFailure,
  canMutateTarget,
  emitSearchIndexEvent,
  currentSearchIndexForRunner,
  searchIndexReadShape
}) {
  const { ensureTargetAuthority } = authorityServices;
  return {
    "asset.upload": async ({ req, res, requestUrl, requestActor, requestSession, appContext }) => {
      if (!requestActor) {
        world.emit({ process: "asset.upload.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const capabilityGate = requireBackendCapabilities(["upload.asset", "fs.blob", "fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: { reason: capabilityGate.reason, missing: capabilityGate.missing }
        });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const contentType = headerValue(req.headers["content-type"]).toLowerCase();
      const parsedUpload = contentType.startsWith("multipart/form-data")
        ? await parseMultipartAssetUpload(req)
        : parseRawAssetUpload(req, requestUrl);
      if (!parsedUpload.ok) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: parsedUpload.reason } });
        sendJson(res, parsedUpload.status || 400, { error: parsedUpload.reason });
        return;
      }
      const perspectiveId = parsedUpload.perspectiveId || requestUrl.searchParams.get("perspective") || "";
      if (!perspectiveId) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing perspective id" } });
        sendJson(res, 400, { error: "missing perspective id" });
        return;
      }
      const originalName = parsedUpload.originalName;
      const mimeType = parsedUpload.mimeType;
      const explicitContextId = parsedUpload.explicitContextId || null;
      const visibilityInput = normalizeAssetVisibility(parsedUpload.visibilityRaw, appContext?.runtimeConfig ?? {});
      if (!originalName) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing filename header", perspective: perspectiveId } });
        sendJson(res, 400, { error: parsedUpload.uploadKind === "multipart" ? "multipart upload requires a filename" : "missing x-witness-file-name header" });
        return;
      }
      if (!mimeType) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: "missing content type", perspective: perspectiveId, originalName } });
        sendJson(res, 400, { error: "missing content-type header" });
        return;
      }
      if (!visibilityInput.ok) {
        world.emit({ process: "asset.upload.failed", actor: requestActor, claims: [], body: { reason: visibilityInput.reason, perspective: perspectiveId, originalName } });
        sendJson(res, 400, { error: visibilityInput.reason });
        return;
      }
      const resolvedContext = resolveAssetDropContext({
        actor: requestActor,
        perspectiveId,
        requestSession,
        explicitContextId
      });
      if (!resolvedContext.ok) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: resolvedContext.reason,
            perspective: perspectiveId,
            originalName,
            homeContext: requestSession?.homeContext ?? null
          }
        });
        sendJson(res, resolvedContext.status || 400, { error: resolvedContext.reason });
        return;
      }
      const assetId = `asset_${randomUUID()}`;
      const storageKey = assetStorageKey(assetId);
      const contentUrl = assetContentUrl(assetId);
      const visibility = visibilityInput.value;
      const assetPath = assetPathFor(appContext, assetId);
      let streamed = null;

      try {
        streamed = await streamReadableToFile(parsedUpload.source, assetPath);
      } catch (error) {
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "asset storage write failed",
            perspective: perspectiveId,
            originalName,
            storageKey,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "asset storage write failed" });
        return;
      }
      if (!streamed.sizeBytes) {
        await fs.rm(assetPath, { force: true }).catch(() => {});
        world.emit({
          process: "asset.upload.failed",
          actor: requestActor,
          claims: [],
          body: { reason: "empty upload body", perspective: perspectiveId, originalName, context: resolvedContext.contextId }
        });
        sendJson(res, 400, { error: "empty upload body" });
        return;
      }
      const sizeBytes = streamed.sizeBytes;

      const witness = world.emit({
        process: "asset.upload",
        actor: requestActor,
        claims: [
          thing(assetId),
          relation(requestActor, "owns", assetId),
          relation(assetId, "hasModuleKind", "asset"),
          relation(assetId, "hasTitle", originalName),
          relation(assetId, "inContext", resolvedContext.contextId)
        ],
        body: {
          id: assetId,
          originalName,
          mimeType,
          sizeBytes,
          declaredSizeBytes: parsedUpload.declaredSizeBytes,
          uploadKind: parsedUpload.uploadKind,
          chunkCount: streamed.chunkCount,
          maxChunkBytes: streamed.maxChunkBytes,
          drainCount: streamed.drainCount,
          writeHighWaterMarkBytes: streamed.writeHighWaterMarkBytes,
          storageKey,
          contentUrl,
          visibility,
          context: resolvedContext.contextId
        }
      });
      let processing = null;
      const queued = appContext?.jobs?.enqueue?.({
        actor: requestActor,
        handler: "asset.ingest.process",
        payload: { assetId },
        idempotencyKey: `asset.ingest:${assetId}`
      });
      if (queued?.ok && queued.job) {
        world.emit({
          process: "asset.ingest.enqueue",
          actor: requestActor,
          claims: [],
          body: {
            id: assetId,
            serverRunner: appContext?.serverRunnerId || null,
            jobId: queued.job.id,
            handler: queued.job.handler,
            availableAt: queued.job.availableAt,
            idempotencyKey: queued.job.idempotencyKey
          }
        });
        processing = {
          status: queued.job.status || "queued",
          jobId: queued.job.id,
          attempt: queued.job.attempt ?? 0
        };
      } else {
        world.emit({
          process: "asset.ingest.enqueue.failed",
          actor: requestActor,
          claims: [],
          body: {
            id: assetId,
            serverRunner: appContext?.serverRunnerId || null,
            reason: queued?.reason || "asset ingestion queue unavailable"
          }
        });
        processing = {
          status: "enqueue-failed",
          jobId: null,
          attempt: 0,
          error: queued?.reason || "asset ingestion queue unavailable"
        };
      }
      sendJson(res, 201, {
        asset: {
          id: assetId,
          title: originalName,
          mimeType,
          sizeBytes,
          storageKey,
          visibility,
          context: resolvedContext.contextId,
          contentUrl,
          downloadUrl: assetDownloadUrl(contentUrl)
        },
        processing,
        witness: witness.id
      });
    },

    "asset.ingest.retry": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["upload.asset", "jobs.queue"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.ingest.retry.failed", actor: backendHost, claims: [], body: { id: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "", appContext);
      if (!asset) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: params.id || "", reason: "asset not found" } });
        sendJson(res, 404, { error: "asset not found", id: params.id || "" });
        return;
      }
      const gate = ensureTargetAuthority(requestActor, asset.id);
      if (!gate.ok) {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason || "forbidden" } });
        sendGateFailure(res, gate);
        return;
      }
      if (asset.processingStatus === "queued" || asset.processingStatus === "running") {
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: "asset ingestion already active", jobId: asset.processingJobId ?? null } });
        sendJson(res, 409, { error: "asset ingestion already active", id: asset.id, jobId: asset.processingJobId ?? null });
        return;
      }
      const queued = appContext?.jobs?.enqueue?.({
        actor: requestActor,
        handler: "asset.ingest.process",
        payload: { assetId: asset.id }
      });
      if (!queued?.ok || !queued.job) {
        const reason = queued?.reason || "asset ingestion queue unavailable";
        world.emit({ process: "asset.ingest.retry.failed", actor: requestActor, claims: [], body: { id: asset.id, reason } });
        sendJson(res, queued?.status || 503, { error: reason, id: asset.id });
        return;
      }
      const witness = world.emit({
        process: "asset.ingest.retry",
        actor: requestActor,
        claims: [],
        body: {
          id: asset.id,
          serverRunner: appContext?.serverRunnerId || null,
          previousJobId: asset.processingJobId ?? null,
          previousStatus: asset.processingStatus ?? null,
          jobId: queued.job.id,
          handler: queued.job.handler,
          availableAt: queued.job.availableAt,
          attempt: queued.job.attempt ?? 0
        }
      });
      sendJson(res, queued.created === false ? 200 : 201, {
        asset: currentAssetById(asset.id, appContext) ?? asset,
        job: queued.job,
        witness: witness.id
      });
    },

    "asset.search.reindex": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor || backendHost, claims: [], body: { id: params.id || "", reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "asset.search.reindex.failed", actor: backendHost, claims: [], body: { id: params.id || "", reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const asset = currentAssetById(params.id || "", appContext);
      if (!asset) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor, claims: [], body: { id: params.id || "", reason: "asset not found" } });
        sendJson(res, 404, { error: "asset not found", id: params.id || "" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "asset.search.reindex.failed", actor: requestActor, claims: [], body: { id: asset.id, reason: gate.reason || "forbidden", serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const rebuilt = await appContext?.searchIndex?.reindexAsset?.(asset.id);
      if (!rebuilt?.ok || !rebuilt.index) {
        const reason = rebuilt?.reason || "asset search reindex failed";
        world.emit({
          process: "asset.search.reindex.failed",
          actor: requestActor,
          claims: [],
          body: {
            id: asset.id,
            serverRunner: serverRunnerId,
            reason,
            searchPolicy: rebuilt?.repair?.policy || asset.searchPolicy || null,
            disposition: rebuilt?.repair?.disposition || null
          }
        });
        sendJson(res, rebuilt?.status || 500, { error: reason, id: asset.id, repair: rebuilt?.repair ?? null });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.reindex",
        index: rebuilt.index,
        body: {
          sourceCount: rebuilt.index.sourceCount,
          documentCount: rebuilt.index.documentCount,
          assetCount: rebuilt.index.assetCount,
          queryCount: rebuilt.index.queryCount,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          path: rebuilt.index.path
        }
      });
      const witness = world.emit({
        process: "asset.search.reindex",
        actor: requestActor,
        claims: [],
        body: {
          id: asset.id,
          serverRunner: serverRunnerId,
          searchStatus: "reindexed",
          searchPolicy: rebuilt.repair?.policy || asset.searchPolicy || null,
          reindexedIndexId: rebuilt.index.id,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          completedAt: new Date(Date.now()).toISOString()
        }
      });
      sendJson(res, 200, {
        asset: {
          ...(currentAssetById(asset.id, appContext) ?? asset),
          searchStatus: "reindexed",
          searchPolicy: rebuilt.repair?.policy || asset.searchPolicy || null,
          reindexedIndexId: rebuilt.index.id,
          searchError: null
        },
        index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, rebuilt.index.id, appContext) ?? rebuilt.index),
        repair: rebuilt.repair ?? null,
        witness: witness.id
      });
    }
  };
}

