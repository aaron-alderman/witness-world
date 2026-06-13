import assert from "node:assert/strict";
import test from "node:test";
import {
  extractAssetSearchText,
  extractAssetThumbnail,
  supportsDerivedAssetSearchText
} from "../plugins/assets/asset-derived-utils.js";

test("asset derivation extracts structured search text and metadata", () => {
  assert.equal(supportsDerivedAssetSearchText("application/json", "example.json"), true);
  assert.equal(supportsDerivedAssetSearchText("application/octet-stream", "blob.bin"), false);

  const jsonResult = extractAssetSearchText({
    mimeType: "application/json",
    originalName: "example.json",
    bytes: Buffer.from(JSON.stringify({ title: "Hello", nested: { count: 2 } })),
    maxTextBytes: 4096
  });

  assert.equal(jsonResult.extractor, "json");
  assert.match(jsonResult.text, /title Hello/);
  assert.match(jsonResult.text, /nested.count 2/);
  assert.equal(jsonResult.metadata.rootKind, "object");

  const markdownResult = extractAssetSearchText({
    mimeType: "text/markdown",
    originalName: "readme.md",
    bytes: Buffer.from("# Heading\n\nSome text"),
    maxTextBytes: 4096
  });
  assert.equal(markdownResult.extractor, "markdown");
  assert.equal(markdownResult.metadata.title, "Heading");
});

test("asset derivation produces SVG thumbnails for supported images", () => {
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03
  ]);
  const result = extractAssetThumbnail({
    mimeType: "image/png",
    bytes: pngBytes,
    runtimeConfig: {}
  });

  assert.equal(result.status, "ready");
  assert.equal(result.metadata.width, 2);
  assert.equal(result.metadata.height, 3);
  assert.equal(result.thumbnail.mimeType, "image/svg+xml");
  assert.match(result.thumbnail.bytes.toString("utf8"), /<svg/);
});

test("asset derivation enforces thumbnail source-size limits", () => {
  const svg = Buffer.from("<svg width=\"1\" height=\"1\"></svg>", "utf8");
  const result = extractAssetThumbnail({
    mimeType: "image/svg+xml",
    bytes: svg,
    runtimeConfig: {
      upload: {
        asset: {
          thumbnailMaxSourceBytes: 8
        }
      }
    }
  });

  assert.equal(result.status, "too-large");
  assert.equal(result.thumbnail, null);
});
