import fs from "node:fs/promises";
import path from "node:path";
import { relation, thing } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

export function createBuiltinAssetJobHandlers({
  world,
  project = projector => world.project(projector),
  backendHost,
  runtimeConfig,
  runtimeConfigLookup,
  positiveInteger,
  supportsDerivedAssetSearchText,
  extractAssetSearchText,
  extractAssetThumbnail,
  assetDerivedTextPathForAppContext,
  assetDerivedTextStorageKey,
  assetDerivedThumbnailPathForAppContext,
  assetDerivedThumbnailStorageKey,
  assetThumbnailUrlForId,
  isoAt
}) {
  const maxTextBytes = positiveInteger(runtimeConfigLookup(runtimeConfig, "search.index.maxTextBytes"), 262144);

  const emitSearchIndexReindex = ({ actor, index }) => world.emit({
    process: "search.index.reindex",
    actor,
    claims: [
      thing(index.id),
      relation(index.id, "hasModuleKind", "searchIndex"),
      relation(actor, "owns", index.id),
      relation(index.id, "hasTitle", index.title)
    ],
    body: {
      id: index.id,
      serverRunner: index.serverRunner,
      provider: index.provider,
      name: index.name,
      sourceCount: index.sourceCount,
      documentCount: index.documentCount,
      assetCount: index.assetCount,
      queryCount: index.queryCount,
      lastBuiltAt: index.lastBuiltAt,
      path: index.path
    }
  });

  return {
    "asset.ingest.process": async ({ actor, job, payload, attempt, appContext }) => {
      const assetId = typeof payload?.assetId === "string" ? payload.assetId.trim() : "";
      if (!assetId) throw new Error("assetId required");
      const currentActor = actor || backendHost;
      const asset = project(moduleProjectors.assetIndex).byId[assetId] ?? null;
      if (!asset) {
        world.emit({
          process: "asset.ingest.failed",
          actor: currentActor,
          claims: [],
          body: {
            id: assetId,
            jobId: job.id,
            attempt,
            reason: "asset not found"
          }
        });
        throw new Error("asset not found");
      }

      world.emit({
        process: "asset.ingest.start",
        actor: currentActor,
        claims: [],
        body: {
          id: asset.id,
          jobId: job.id,
          attempt,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes ?? null
        }
      });

      try {
        const mimeType = typeof asset.mimeType === "string" ? asset.mimeType : "";
        const originalName = typeof asset.originalName === "string" && asset.originalName
          ? asset.originalName
          : (typeof asset.title === "string" ? asset.title : "");
        const assetPath = appContext
          ? path.join(appContext.storage?.assetsRoot || path.resolve(appContext.runtimeRoot || process.cwd(), "assets"), encodeURIComponent(asset.id), "blob")
          : null;
        const bytes = await fs.readFile(assetPath);
        let textStatus = "skipped";
        let textBytes = 0;
        let textRef = null;
        let textExtractor = null;
        let derivedMetadata = null;
        if (supportsDerivedAssetSearchText(mimeType, originalName)) {
          const extracted = extractAssetSearchText({ mimeType, originalName, bytes, maxTextBytes });
          const extractedText = extracted.text;
          const derivedPath = assetDerivedTextPathForAppContext(appContext, asset.id);
          await fs.mkdir(path.dirname(derivedPath), { recursive: true });
          await fs.writeFile(derivedPath, extractedText, "utf8");
          textStatus = extracted.status;
          textBytes = Buffer.byteLength(extractedText, "utf8");
          textRef = assetDerivedTextStorageKey(asset.id);
          textExtractor = extracted.extractor;
          derivedMetadata = extracted.metadata ?? derivedMetadata;
        }

        const thumbnailResult = extractAssetThumbnail({
          mimeType,
          bytes,
          runtimeConfig: appContext?.runtimeConfig ?? {}
        });
        let thumbnailStatus = thumbnailResult.status;
        let thumbnailRef = null;
        let thumbnailUrl = null;
        let imageWidth = Number.isFinite(thumbnailResult.metadata?.width) ? thumbnailResult.metadata.width : null;
        let imageHeight = Number.isFinite(thumbnailResult.metadata?.height) ? thumbnailResult.metadata.height : null;
        if (thumbnailResult.thumbnail) {
          const derivedThumbnailPath = assetDerivedThumbnailPathForAppContext(appContext, asset.id);
          await fs.mkdir(path.dirname(derivedThumbnailPath), { recursive: true });
          await fs.writeFile(derivedThumbnailPath, thumbnailResult.thumbnail.bytes);
          thumbnailRef = assetDerivedThumbnailStorageKey(asset.id);
          thumbnailUrl = assetThumbnailUrlForId(asset.id);
        }

        let searchStatus = "not-built";
        let reindexedIndexId = null;
        let searchPolicy = "on-ingest";
        const refreshed = await appContext?.searchIndex?.refreshAsset?.(asset.id);
        if (refreshed?.ok) {
          searchPolicy = refreshed.policy || searchPolicy;
          if (refreshed.changed && refreshed.index) {
            searchStatus = "reindexed";
            reindexedIndexId = refreshed.index.id;
            emitSearchIndexReindex({ actor: currentActor, index: refreshed.index });
          } else if (refreshed.disposition === "not-indexed") {
            searchStatus = "not-indexed";
          } else {
            searchStatus = refreshed.disposition || "not-built";
          }
        } else if (refreshed) {
          throw new Error(refreshed.reason || "search index refresh failed");
        }

        world.emit({
          process: "asset.ingest.succeeded",
          actor: currentActor,
          claims: [],
          body: {
            id: asset.id,
            jobId: job.id,
            attempt,
            mimeType,
            sizeBytes: asset.sizeBytes ?? null,
            textStatus,
            textBytes,
            textRef,
            textExtractor,
            derivedMetadata,
            thumbnailStatus,
            thumbnailRef,
            thumbnailUrl,
            imageWidth,
            imageHeight,
            searchStatus,
            searchPolicy,
            reindexedIndexId,
            completedAt: isoAt(Date.now())
          }
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        world.emit({
          process: "asset.ingest.failed",
          actor: currentActor,
          claims: [],
          body: {
            id: asset.id,
            jobId: job.id,
            attempt,
            reason
          }
        });
        throw error;
      }
    }
  };
}
