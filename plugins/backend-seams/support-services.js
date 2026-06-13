import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { relation, thing } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { nonNegativeInteger, positiveInteger } from "../../src/runtime-config-utils.js";

function defaultAssetsRootFor(appContext) {
  return appContext?.storage?.assetsRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "assets");
}

function defaultBlobsRootFor(appContext) {
  return appContext?.storage?.blobsRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "blobs");
}

function assetIngestRetryUrl(assetId) {
  return `/api/assets/${encodeURIComponent(assetId)}/ingest/retry`;
}

function assetSearchReindexUrl(assetId) {
  return `/api/assets/${encodeURIComponent(assetId)}/search/reindex`;
}

export function createPracticalBackendSupportServices({
  world,
  backendHost,
  currentBackendCapabilities,
  assetsRootFor = defaultAssetsRootFor,
  blobsRootFor = defaultBlobsRootFor,
  assetIngestRetryUrl: assetIngestRetryUrlImpl = assetIngestRetryUrl,
  assetSearchReindexUrl: assetSearchReindexUrlImpl = assetSearchReindexUrl,
  requireBackendCapabilities,
  canCreateInContext,
  canMutateTarget,
  sendGateFailure,
  sendJson,
  readJson,
  notificationTitle,
  notificationReadShape
}) {
  const normalizeNotificationRequest = ({ channel, body, actor, serverRunnerId }) => {
    const recipient = typeof body?.to === "string" ? body.to.trim() : "";
    if (!recipient) return { ok: false, status: 400, reason: "recipient required" };
    const subject = channel === "email"
      ? (typeof body?.subject === "string" ? body.subject.trim() : "")
      : null;
    if (channel === "email" && !subject) return { ok: false, status: 400, reason: "subject required" };
    const hasText = typeof body?.text === "string";
    const hasTemplate = typeof body?.template === "string" && body.template.trim();
    if (!hasText && !hasTemplate) return { ok: false, status: 400, reason: "text or template required" };
    if (hasText && hasTemplate) return { ok: false, status: 400, reason: "choose text or template" };
    const vars = body?.vars && typeof body.vars === "object" && !Array.isArray(body.vars) ? { ...body.vars } : {};
    const contextId = typeof body?.context === "string" && body.context.trim() ? body.context.trim() : null;
    if (contextId) {
      const gate = canCreateInContext(actor, contextId);
      if (!gate.ok) return gate;
    }
    return {
      ok: true,
      notification: {
        id: `notification_${randomUUID()}`,
        channel,
        actor,
        serverRunner: serverRunnerId,
        context: contextId,
        to: recipient,
        subject,
        text: hasText ? String(body.text) : null,
        template: hasTemplate ? String(body.template) : null,
        vars,
        delayMs: nonNegativeInteger(body?.delayMs, 0),
        maxAttempts: positiveInteger(body?.maxAttempts, 3),
        retryDelayMs: positiveInteger(body?.retryDelayMs, 50),
        idempotencyKey: typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim() ? body.idempotencyKey.trim() : null
      }
    };
  };

  const recentWitnessBodies = process => world.allWitnesses()
    .filter(witness => witness.process === process)
    .slice(-20)
    .reverse()
    .map(witness => ({ id: witness.id, actor: witness.actor, body: witness.body ?? {} }));

  const projectFor = appContext => appContext?.project ?? (projector => world.project(projector));
  const notificationsForRunner = (serverRunnerId, appContext = null) => {
    const project = projectFor(appContext);
    const jobIndex = project(moduleProjectors.jobIndex).byId;
    return project(moduleProjectors.notifications)
      .filter(row => row.jobId == null || ((jobIndex[row.jobId] ?? null)?.serverRunner === serverRunnerId));
  };
  const currentNotificationForRunner = (serverRunnerId, notificationId, appContext = null) => notificationsForRunner(serverRunnerId, appContext)
    .find(row => row.id === notificationId) ?? null;
  const outboundRequestsForRunner = (serverRunnerId, appContext = null) => projectFor(appContext)(moduleProjectors.outboundRequests)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentOutboundForRunner = (serverRunnerId, outboundId, appContext = null) => outboundRequestsForRunner(serverRunnerId, appContext)
    .find(row => row.id === outboundId) ?? null;
  const webhookDeliveriesForRunner = (serverRunnerId, appContext = null) => projectFor(appContext)(moduleProjectors.webhookDeliveries)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentWebhookForRunner = (serverRunnerId, webhookIdValue, appContext = null) => webhookDeliveriesForRunner(serverRunnerId, appContext)
    .find(row => row.id === webhookIdValue) ?? null;
  const sqlDatasourcesForRunner = (serverRunnerId, appContext = null) => projectFor(appContext)(moduleProjectors.sqlDatasources)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentSqlDatasourceForRunner = (serverRunnerId, datasourceId, appContext = null) => sqlDatasourcesForRunner(serverRunnerId, appContext)
    .find(row => row.id === datasourceId) ?? null;
  const sqlOperationsForRunner = (serverRunnerId, appContext = null) => projectFor(appContext)(moduleProjectors.sqlOperations)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentSqlOperationForRunner = (serverRunnerId, operationId, appContext = null) => sqlOperationsForRunner(serverRunnerId, appContext)
    .find(row => row.id === operationId) ?? null;
  const searchIndexesForRunner = (serverRunnerId, appContext = null) => projectFor(appContext)(moduleProjectors.searchIndexes)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentSearchIndexForRunner = (serverRunnerId, indexId, appContext = null) => searchIndexesForRunner(serverRunnerId, appContext)
    .find(row => row.id === indexId) ?? null;
  const oauthLinksForRunner = (serverRunnerId, appContext = null) => projectFor(appContext)(moduleProjectors.oauthLinks)
    .filter(row => row.serverRunner === serverRunnerId);
  const currentOauthLinkForRunner = (serverRunnerId, linkId, appContext = null) => oauthLinksForRunner(serverRunnerId, appContext)
    .find(row => row.id === linkId) ?? null;
  const currentOauthLinkByProviderAccount = (serverRunnerId, provider, providerAccountId, appContext = null) => oauthLinksForRunner(serverRunnerId, appContext)
    .find(row => row.provider === provider && row.providerAccountId === providerAccountId) ?? null;

  const retryableAssetIngest = asset => {
    const status = String(asset?.processingStatus || "");
    return status === "dead-letter" || status === "enqueue-failed";
  };

  const assetDiagnostics = async appContext => {
    const project = projectFor(appContext);
    const assets = project(moduleProjectors.assets);
    const capabilityIndex = project(moduleProjectors.capabilityIndex).byId;
    const streamWrites = world.allWitnesses().filter(row => row.process === "fs.stream.write");
    const streamCopies = world.allWitnesses().filter(row => row.process === "fs.stream.copy");
    const assetUploads = world.allWitnesses().filter(row => row.process === "asset.upload");
    const jobs = project(moduleProjectors.jobs)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const notifications = project(moduleProjectors.notifications);
    const outboundRequests = project(moduleProjectors.outboundRequests)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const webhookDeliveries = project(moduleProjectors.webhookDeliveries)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const sqlDatasources = project(moduleProjectors.sqlDatasources)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const sqlOperations = project(moduleProjectors.sqlOperations)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const searchIndexes = project(moduleProjectors.searchIndexes)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const oauthFlows = project(moduleProjectors.oauthFlows)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const oauthLinks = project(moduleProjectors.oauthLinks)
      .filter(row => row.serverRunner === (appContext?.serverRunnerId || ""));
    const backendCapabilities = [...currentBackendCapabilities()]
      .sort()
      .map(id => capabilityIndex[id] ? { ...capabilityIndex[id] } : { id, label: id });
    const filesContexts = project(moduleProjectors.contexts)
      .filter(row => String(row.id || "").endsWith(":files"));
    const assetsRoot = assetsRootFor(appContext);
    const blobsRoot = blobsRootFor(appContext);
    let assetsRootExists = false;
    let blobsRootExists = false;
    try {
      const stat = await fs.stat(assetsRoot);
      assetsRootExists = stat.isDirectory();
    } catch {
      assetsRootExists = false;
    }
    try {
      const stat = await fs.stat(blobsRoot);
      blobsRootExists = stat.isDirectory();
    } catch {
      blobsRootExists = false;
    }
    const searchRepairStates = appContext?.searchIndex?.inspectAsset
      ? await Promise.all(assets.map(async asset => ({ asset, repair: await appContext.searchIndex.inspectAsset(asset.id) })))
      : [];
    const ingestRetryable = assets
      .filter(retryableAssetIngest)
      .map(asset => ({
        id: asset.id,
        title: asset.title,
        context: asset.context ?? null,
        processingStatus: asset.processingStatus ?? null,
        processingError: asset.processingError ?? null,
        processingJobId: asset.processingJobId ?? null,
        retryUrl: assetIngestRetryUrlImpl(asset.id)
      }));
    const searchRefreshable = searchRepairStates
      .filter(row => row.repair?.ok && row.repair.indexed && row.repair.stale)
      .map(({ asset, repair }) => ({
        id: asset.id,
        title: asset.title,
        context: asset.context ?? null,
        searchStatus: asset.searchStatus ?? null,
        searchPolicy: repair.policy ?? asset.searchPolicy ?? null,
        lastBuiltAt: repair.lastBuiltAt ?? null,
        assetUpdatedAt: repair.assetUpdatedAt ?? null,
        reindexUrl: assetSearchReindexUrlImpl(asset.id)
      }));
    return {
      backendHost,
      capabilities: [...currentBackendCapabilities()].sort(),
      backendCapabilities,
      runtimeConfig: {
        fieldCount: appContext?.runtimeConfigFields?.length ?? 0,
        missingCount: (appContext?.runtimeConfigFields ?? []).filter(field => field.required && field.resolved !== true).length,
        secretCount: (appContext?.runtimeConfigFields ?? []).filter(field => field.secret === true).length,
        fields: appContext?.runtimeConfigFields ?? []
      },
      jobs: {
        total: jobs.length,
        queuedCount: jobs.filter(row => row.status === "queued").length,
        runningCount: jobs.filter(row => row.status === "running").length,
        succeededCount: jobs.filter(row => row.status === "succeeded").length,
        deadLetterCount: jobs.filter(row => row.status === "dead-letter").length,
        handlers: [...new Set(jobs.map(row => row.handler).filter(Boolean))].sort()
      },
      notifications: {
        total: notifications.length,
        emailCount: notifications.filter(row => row.channel === "email").length,
        smsCount: notifications.filter(row => row.channel === "sms").length,
        sentCount: notifications.filter(row => row.status === "sent").length,
        failedCount: notifications.filter(row => row.status === "failed").length,
        providerMessageCount: notifications.filter(row => typeof row.providerMessageId === "string" && row.providerMessageId).length
      },
      outbound: {
        total: outboundRequests.length,
        succeededCount: outboundRequests.filter(row => row.status === "succeeded").length,
        failedCount: outboundRequests.filter(row => row.status === "failed").length,
        retryingCount: outboundRequests.filter(row => row.status === "retrying").length,
        externalRefCount: outboundRequests.filter(row => (typeof row.externalRefId === "string" && row.externalRefId) || (typeof row.correlationId === "string" && row.correlationId)).length,
        transports: [...new Set(outboundRequests.map(row => row.transport).filter(Boolean))].sort()
      },
      webhooks: {
        total: webhookDeliveries.length,
        acceptedCount: webhookDeliveries.filter(row => row.replayStatus === "accepted").length,
        rejectedCount: webhookDeliveries.filter(row => row.status === "rejected").length,
        processedCount: webhookDeliveries.filter(row => row.status === "processed").length,
        failedCount: webhookDeliveries.filter(row => row.status === "failed").length,
        deliveryRefCount: webhookDeliveries.filter(row => typeof row.deliveryId === "string" && row.deliveryId).length,
        targets: [...new Set(webhookDeliveries.map(row => row.target).filter(Boolean))].sort()
      },
      dbSql: {
        datasourceCount: sqlDatasources.length,
        operationCount: sqlOperations.length,
        providers: [...new Set(sqlDatasources.map(row => row.provider).filter(Boolean))].sort(),
        failedCount: sqlOperations.filter(row => row.status === "failed").length
      },
      search: {
        indexCount: searchIndexes.length,
        readyCount: searchIndexes.filter(row => row.status === "ready").length,
        failedCount: searchIndexes.filter(row => row.status === "failed").length,
        queryCount: searchIndexes.reduce((sum, row) => sum + Number(row.queryCount ?? 0), 0),
        providers: [...new Set(searchIndexes.map(row => row.provider).filter(Boolean))].sort()
      },
      oauth: {
        flowCount: oauthFlows.length,
        activeCount: oauthFlows.filter(row => ["started", "callback"].includes(row.status)).length,
        linkCount: oauthLinks.length,
        failedCount: oauthFlows.filter(row => row.status === "failed").length + oauthLinks.filter(row => row.status === "failed").length,
        providerAccountCount: oauthLinks.filter(row => typeof row.providerAccountId === "string" && row.providerAccountId).length,
        providers: [...new Set([...oauthFlows, ...oauthLinks].map(row => row.provider).filter(Boolean))].sort()
      },
      storage: {
        runtimeRoot: appContext?.runtimeRoot ?? null,
        assetsRoot,
        assetsRootExists,
        blobsRoot,
        blobsRootExists
      },
      assets: {
        total: assets.length,
        privateCount: assets.filter(asset => asset.visibility === "private").length,
        publicCount: assets.filter(asset => asset.visibility === "public").length,
        attachmentCount: assets.reduce((sum, asset) => sum + Number(asset.attachmentCount ?? 0), 0),
        processingQueuedCount: assets.filter(asset => asset.processingStatus === "queued").length,
        processingRunningCount: assets.filter(asset => asset.processingStatus === "running").length,
        processingSucceededCount: assets.filter(asset => asset.processingStatus === "succeeded").length,
        processingDeadLetterCount: assets.filter(asset => asset.processingStatus === "dead-letter").length,
        textReadyCount: assets.filter(asset => asset.textStatus === "extracted" || asset.textStatus === "empty").length,
        thumbnailReadyCount: assets.filter(asset => asset.thumbnailStatus === "ready").length,
        searchReindexedCount: assets.filter(asset => asset.searchStatus === "reindexed").length,
        totalBytes: assets.reduce((sum, asset) => sum + (Number.isFinite(asset.sizeBytes) ? asset.sizeBytes : 0), 0),
        rawUploadCount: assetUploads.filter(row => row.body?.uploadKind === "raw").length,
        multipartUploadCount: assetUploads.filter(row => row.body?.uploadKind === "multipart").length,
        contexts: [...new Set(assets.map(asset => asset.context).filter(Boolean))].sort(),
        ingestRetryableCount: ingestRetryable.length,
        searchRefreshableCount: searchRefreshable.length
      },
      repairs: {
        ingestRetryable,
        searchRefreshable
      },
      streams: {
        writeCount: streamWrites.length,
        copyCount: streamCopies.length,
        writeBytes: streamWrites.reduce((sum, row) => sum + (Number.isFinite(row.body?.sizeBytes) ? row.body.sizeBytes : 0), 0),
        copyBytes: streamCopies.reduce((sum, row) => sum + (Number.isFinite(row.body?.sizeBytes) ? row.body.sizeBytes : 0), 0),
        drainCount: [...streamWrites, ...streamCopies].reduce((sum, row) => sum + (Number.isFinite(row.body?.drainCount) ? row.body.drainCount : 0), 0),
        maxChunkBytes: [...streamWrites, ...streamCopies, ...assetUploads].reduce((max, row) => {
          const value = Number.isFinite(row.body?.maxChunkBytes) ? row.body.maxChunkBytes : 0;
          return value > max ? value : max;
        }, 0)
      },
      filesContexts,
      failures: {
        assetUploadFailed: recentWitnessBodies("asset.upload.failed"),
        assetIngestFailed: recentWitnessBodies("asset.ingest.failed"),
        assetAttachFailed: recentWitnessBodies("asset.attach.failed"),
        assetContentReadFailed: world.allObservations()
          .filter(observation => observation.process === "asset.content.read.failed")
          .slice(-20)
          .reverse()
          .map(observation => ({ id: observation.id, actor: observation.actor, body: observation.body ?? {} })),
        assetThumbnailReadFailed: world.allObservations()
          .filter(observation => observation.process === "asset.thumbnail.read.failed")
          .slice(-20)
          .reverse()
          .map(observation => ({ id: observation.id, actor: observation.actor, body: observation.body ?? {} })),
        jobDeadLetter: recentWitnessBodies("jobs.queue.deadLetter"),
        httpOutboundRequestFailed: recentWitnessBodies("http.outbound.request.failed"),
        httpOutboundFailed: recentWitnessBodies("http.outbound.failed"),
        dbSqlFailed: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^db\.sql\..*\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} })),
        searchIndexFailed: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^search\.index\..*\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} })),
        authOauthFailed: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^auth\.oauth\..*\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} })),
        webhookReceiveFailed: recentWitnessBodies("webhook.inbound.receive.failed"),
        webhookRejected: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^webhook\.inbound\.(verify|replay|accept|process)\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} })),
        notifyEmailRenderFailed: recentWitnessBodies("notify.email.render.failed"),
        notifySmsRenderFailed: recentWitnessBodies("notify.sms.render.failed"),
        fsBlobFailed: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^fs\.blob\..*\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} })),
        fsStreamFailed: [...world.allWitnesses(), ...world.allObservations()]
          .filter(entry => /^fs\.stream\..*\.failed$/.test(entry.process))
          .slice(-20)
          .reverse()
          .map(entry => ({ id: entry.id, actor: entry.actor, body: entry.body ?? {} }))
      }
    };
  };

  const enqueueNotification = async ({ channel, req, res, requestActor, appContext }) => {
    const capability = channel === "email" ? "notify.email" : "notify.sms";
    const capabilityGate = requireBackendCapabilities([capability, "jobs.queue"]);
    if (!capabilityGate.ok) {
      world.emit({ process: `notify.${channel}.enqueue.failed`, actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
      sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
      return;
    }
    if (!requestActor) {
      world.emit({ process: `notify.${channel}.enqueue.failed`, actor: backendHost, claims: [], body: { reason: "no actor" } });
      sendJson(res, 401, { error: "sign in first" });
      return;
    }
    const serverRunnerId = appContext?.serverRunnerId || "";
    const gate = canMutateTarget(world, requestActor, serverRunnerId);
    if (!gate.ok) {
      world.emit({ process: `notify.${channel}.enqueue.failed`, actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
      sendGateFailure(res, gate);
      return;
    }
    const body = await readJson(req);
    const normalized = normalizeNotificationRequest({ channel, body, actor: requestActor, serverRunnerId });
    if (!normalized.ok) {
      world.emit({ process: `notify.${channel}.enqueue.failed`, actor: requestActor, claims: [], body: { reason: normalized.reason, serverRunner: serverRunnerId } });
      sendJson(res, normalized.status || 400, { error: normalized.reason });
      return;
    }
    const row = normalized.notification;
    const queued = appContext?.jobs?.enqueue({
      actor: requestActor,
      handler: `notify.${channel}.deliver`,
      payload: { notificationId: row.id },
      delayMs: row.delayMs,
      maxAttempts: row.maxAttempts,
      retryDelayMs: row.retryDelayMs,
      idempotencyKey: row.idempotencyKey
    });
    if (!queued?.ok) {
      world.emit({ process: `notify.${channel}.enqueue.failed`, actor: requestActor, claims: [], body: { reason: queued?.reason || "queue unavailable", serverRunner: serverRunnerId } });
      sendJson(res, queued?.status || 503, { error: queued?.reason || "queue unavailable" });
      return;
    }
    const title = notificationTitle(channel, { subject: row.subject, to: row.to });
    const witness = world.emit({
      process: `notify.${channel}.enqueue`,
      actor: requestActor,
      claims: [
        thing(row.id),
        relation(row.id, "hasModuleKind", "notification"),
        relation(requestActor, "owns", row.id),
        relation(row.id, "hasTitle", title),
        ...(row.context ? [relation(row.id, "inContext", row.context)] : [])
      ],
      body: {
        id: row.id,
        serverRunner: serverRunnerId,
        channel,
        to: row.to,
        subject: row.subject,
        text: row.text,
        template: row.template,
        vars: row.vars,
        context: row.context,
        transport: "stub",
        jobId: queued.job?.id ?? null
      }
    });
    sendJson(res, 201, {
      notification: notificationReadShape(currentNotificationForRunner(serverRunnerId, row.id, appContext) ?? {
        id: row.id,
        title,
        channel,
        recipient: row.to,
        subject: row.subject,
        sender: null,
        preview: null,
        transport: "stub",
        status: "queued",
        context: row.context,
        jobId: queued.job?.id ?? null,
        providerMessageId: null,
        attempt: 0,
        maxAttempts: row.maxAttempts,
        retryDelayMs: row.retryDelayMs,
        lastError: null
      }),
      job: queued.job,
      witness
    });
  };

  return {
    notificationsForRunner,
    currentNotificationForRunner,
    outboundRequestsForRunner,
    currentOutboundForRunner,
    webhookDeliveriesForRunner,
    currentWebhookForRunner,
    currentSqlDatasourceForRunner,
    sqlOperationsForRunner,
    currentSqlOperationForRunner,
    currentSearchIndexForRunner,
    oauthLinksForRunner,
    currentOauthLinkForRunner,
    currentOauthLinkByProviderAccount,
    assetDiagnostics,
    enqueueNotification
  };
}
