async function attachAsset(assetId, targetId) {
  const response = await fetch("/api/assets/" + encodeURIComponent(assetId) + "/attachments", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ target: targetId, perspective: state.perspective || null })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: body.error || ("attach failed (" + response.status + ")") };
  return { ok: true, witness: body.witness, statusMessage: body.statusMessage || null };
}

async function detachAsset(assetId, targetId) {
  const response = await fetch("/api/assets/" + encodeURIComponent(assetId) + "/attachments?target=" + encodeURIComponent(targetId), {
    method: "DELETE"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: body.error || ("detach failed (" + response.status + ")") };
  return { ok: true, witness: body.witness, statusMessage: body.statusMessage || null };
}

async function retryAssetIngest(assetId) {
  const response = await fetch("/api/assets/" + encodeURIComponent(assetId) + "/ingest/retry", {
    method: "POST",
    headers: headers()
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: body.error || ("ingest retry failed (" + response.status + ")") };
  return { ok: true, asset: body.asset || null, job: body.job || null, witness: body.witness || null };
}

async function refreshAssetSearch(assetId) {
  const response = await fetch("/api/assets/" + encodeURIComponent(assetId) + "/search/reindex", {
    method: "POST",
    headers: headers()
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: body.error || ("search refresh failed (" + response.status + ")") };
  return { ok: true, asset: body.asset || null, index: body.index || null, witness: body.witness || null };
}

function formatBytes(size) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function assetDownloadUrl(asset) {
  if (!asset) return "";
  if (asset.downloadUrl) return asset.downloadUrl;
  const contentUrl = asset.contentUrl || "";
  if (!contentUrl) return "";
  return contentUrl.includes("?") ? contentUrl + "&download=1" : contentUrl + "?download=1";
}

function assetCanRetryIngest(asset) {
  if (asset?.canRetryIngest === true) return true;
  const status = String(asset?.processingStatus || "");
  return status === "dead-letter" || status === "enqueue-failed";
}

function assetCanRefreshSearch(asset) {
  if (asset?.canRefreshSearch === true) return true;
  if (String(asset?.searchStatus || "") === "manual") return true;
  return typeof asset?.searchError === "string" && asset.searchError.trim().length > 0;
}

function assetProcessingSummary(asset) {
  const status = String(asset?.processingStatus || "");
  const attempt = Number(asset?.processingAttempt || 0);
  if (!status) return "No background ingest has run yet.";
  if (status === "queued") return attempt > 0 ? "Queued for background ingest retry." : "Queued for background ingest.";
  if (status === "running") return attempt > 1 ? "Background ingest is retrying now." : "Background ingest is running.";
  if (status === "succeeded") return "Background ingest completed.";
  if (status === "dead-letter") return "Background ingest failed and needs operator retry.";
  if (status === "enqueue-failed") return "Background ingest could not be queued.";
  return status;
}

function assetSearchSummary(asset) {
  const status = String(asset?.searchStatus || "");
  if (!status) return "Search state unknown.";
  if (status === "manual") return "Search refresh is manual for this asset.";
  if (status === "reindexed") return "Search index is refreshed.";
  if (status === "not-built") return "No search index has been built yet.";
  if (status === "not-indexed") return "This asset is not indexed in the current search build.";
  return status;
}

function assetPreviewMode(asset) {
  const mimeType = String(asset?.mimeType || "").toLowerCase();
  const sizeBytes = Number(asset?.sizeBytes);
  if ((!asset?.contentUrl && !asset?.thumbnailUrl && !asset?.textUrl) || !mimeType) {
    return { kind: "none", reason: "Preview unavailable." };
  }
  if (mimeType.startsWith("image/")) return { kind: "image" };
  if (asset?.textUrl) return { kind: "text", source: "derived" };
  const isTextLike = mimeType.startsWith("text/")
    || mimeType.includes("json")
    || mimeType.includes("xml")
    || mimeType.includes("javascript")
    || mimeType.includes("svg")
    || mimeType.endsWith("+json");
  if (!isTextLike) {
    if (asset?.processingStatus === "queued" || asset?.processingStatus === "running") {
      return { kind: "none", reason: "Preview will appear after processing completes." };
    }
    if (asset?.textStatus === "empty") return { kind: "none", reason: "No extracted text is available for this file." };
    return { kind: "none", reason: "Preview unavailable for this file type." };
  }
  if (Number.isFinite(sizeBytes) && sizeBytes > 128 * 1024) {
    return { kind: "none", reason: "Inline preview is limited to text files up to 128 KB." };
  }
  return { kind: "text", source: "content" };
}

function assetPreviewSource(asset, mode) {
  if (mode?.kind === "image") return asset?.thumbnailUrl || asset?.contentUrl || "";
  if (mode?.kind === "text" && mode?.source === "derived") return asset?.textUrl || "";
  return asset?.contentUrl || asset?.textUrl || "";
}

function ensureAssetPreview(asset) {
  const mode = assetPreviewMode(asset);
  if (mode.kind === "none") return { status: "none", reason: mode.reason };
  if (mode.kind === "image") return { status: "image", src: assetPreviewSource(asset, mode) };
  const previewUrl = assetPreviewSource(asset, mode);
  if (!previewUrl) return { status: "none", reason: "Preview unavailable." };
  const cacheKey = asset.id + "|" + previewUrl;
  const cached = state.assetPreviewCache.get(cacheKey);
  if (cached) return cached;
  const loading = { status: "loading" };
  state.assetPreviewCache.set(cacheKey, loading);
  fetch(previewUrl)
    .then(async response => {
      if (!response.ok) throw new Error("preview request failed (" + response.status + ")");
      const text = await response.text();
      const truncated = text.length > 12000;
      state.assetPreviewCache.set(cacheKey, {
        status: "ready",
        text: truncated ? text.slice(0, 12000) + "\\n..." : text,
        truncated
      });
    })
    .catch(error => {
      state.assetPreviewCache.set(cacheKey, {
        status: "error",
        reason: error?.message || "preview failed"
      });
    })
    .finally(() => {
      const selected = soleSelected();
      if (selected?.asset?.id === asset.id) renderInspector();
    });
  return loading;
}

export function renderCanvasAssetRuntimePrelude() {
  return `
${attachAsset.toString()}
${detachAsset.toString()}
${retryAssetIngest.toString()}
${refreshAssetSearch.toString()}
${formatBytes.toString()}
${assetDownloadUrl.toString()}
${assetCanRetryIngest.toString()}
${assetCanRefreshSearch.toString()}
${assetProcessingSummary.toString()}
${assetSearchSummary.toString()}
${assetPreviewMode.toString()}
${assetPreviewSource.toString()}
${ensureAssetPreview.toString()}
`;
}
