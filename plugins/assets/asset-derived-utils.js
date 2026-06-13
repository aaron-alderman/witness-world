import { inflateSync } from "node:zlib";
import { positiveInteger, runtimeConfigLookup } from "../../src/runtime-config-utils.js";

function decodeSearchTextBytes(bytes, maxTextBytes) {
  return Buffer.isBuffer(bytes)
    ? bytes.subarray(0, maxTextBytes).toString("utf8")
    : Buffer.from(bytes || []).subarray(0, maxTextBytes).toString("utf8");
}

function flattenJsonForSearch(value, prefix = "", rows = []) {
  if (value == null) {
    if (prefix) rows.push(`${prefix} null`);
    return rows;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenJsonForSearch(item, prefix ? `${prefix}.${index}` : String(index), rows));
    return rows;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      if (entry && typeof entry === "object") {
        flattenJsonForSearch(entry, next, rows);
      } else {
        rows.push(`${next} ${String(entry)}`);
      }
    }
    return rows;
  }
  if (prefix) rows.push(`${prefix} ${String(value)}`);
  else rows.push(String(value));
  return rows;
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function extractMarkupText(text) {
  return decodeHtmlEntities(String(text || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractDelimitedText(text, delimiterPattern) {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => line.split(delimiterPattern).map(cell => cell.trim()).filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n");
}

function countNonEmptyLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .length;
}

function countWords(text) {
  return String(text || "").trim().match(/\S+/g)?.length ?? 0;
}

function limitMetadataList(values, limit = 8) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || "").trim())
    .filter(Boolean))]
    .slice(0, limit);
}

function textDerivedMetadata(kind, text, extra = {}) {
  const metadata = {
    kind,
    lineCount: countNonEmptyLines(text),
    wordCount: countWords(text),
    charCount: String(text || "").length,
    ...extra
  };
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      if (value == null) return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  );
}

function extractDelimitedMetadata(text, delimiterPattern, kind) {
  const rows = String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(delimiterPattern).map(cell => cell.trim()));
  if (!rows.length) return { kind, rowCount: 0, dataRowCount: 0, columnCount: 0 };
  const headers = limitMetadataList(rows[0]);
  const columnCount = rows.reduce((max, row) => Math.max(max, row.filter(Boolean).length), 0);
  return {
    kind,
    rowCount: rows.length,
    dataRowCount: Math.max(0, rows.length - 1),
    columnCount,
    headers
  };
}

function extractJsonDerivedMetadata(value) {
  if (Array.isArray(value)) {
    return {
      kind: "json",
      rootKind: "array",
      entryCount: value.length
    };
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    return {
      kind: "json",
      rootKind: "object",
      topLevelKeyCount: keys.length,
      topLevelKeys: limitMetadataList(keys)
    };
  }
  return {
    kind: "json",
    rootKind: value == null ? "null" : typeof value
  };
}

function extractTomlSearchText(raw) {
  const source = String(raw || "");
  const sections = [];
  const topLevelKeys = [];
  const rows = [];
  let currentSection = "";
  let arrayTableCount = 0;
  for (const line of source.split(/\r?\n/)) {
    const withoutComment = line.replace(/\s+#.*$/, "").trim();
    if (!withoutComment) continue;
    const arrayTableMatch = withoutComment.match(/^\[\[\s*([^\]]+?)\s*\]\]$/);
    if (arrayTableMatch) {
      currentSection = arrayTableMatch[1].trim();
      arrayTableCount += 1;
      sections.push(currentSection);
      rows.push(currentSection);
      continue;
    }
    const sectionMatch = withoutComment.match(/^\[\s*([^\]]+?)\s*\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      sections.push(currentSection);
      rows.push(currentSection);
      continue;
    }
    const keyValueMatch = withoutComment.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!keyValueMatch) continue;
    const key = keyValueMatch[1].trim();
    const value = keyValueMatch[2].trim().replace(/^["']|["']$/g, "");
    if (!currentSection && key) topLevelKeys.push(key);
    rows.push(`${currentSection ? `${currentSection}.` : ""}${key} ${value}`.trim());
  }
  const text = rows.join("\n").trim();
  return {
    text,
    status: text ? "extracted" : "empty",
    extractor: "toml",
    metadata: textDerivedMetadata("toml", text, {
      topLevelKeyCount: limitMetadataList(topLevelKeys).length || null,
      topLevelKeys,
      sectionCount: limitMetadataList(sections).length || null,
      sections,
      arrayTableCount: arrayTableCount || null
    })
  };
}

function extractYamlSearchText(raw) {
  const source = String(raw || "");
  const rows = [];
  const stack = [];
  const topLevelKeys = [];
  let listCount = 0;
  for (const line of source.split(/\r?\n/)) {
    const withoutComment = line.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.match(/^\s*/)?.[0]?.length ?? 0;
    const trimmed = withoutComment.trim();
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (trimmed.startsWith("- ")) {
      listCount += 1;
      const value = trimmed.slice(2).trim();
      if (!value) continue;
      const inlinePair = value.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.+)$/);
      if (inlinePair) {
        const prefix = stack.map(entry => entry.key).join(".");
        rows.push(`${prefix ? `${prefix}.` : ""}${inlinePair[1]} ${inlinePair[2]}`.trim());
      } else {
        const prefix = stack.map(entry => entry.key).join(".");
        rows.push(`${prefix} ${value}`.trim());
      }
      continue;
    }
    const keyValueMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!keyValueMatch) continue;
    const key = keyValueMatch[1].trim();
    const value = keyValueMatch[2].trim().replace(/^["']|["']$/g, "");
    if (indent === 0) topLevelKeys.push(key);
    stack.push({ indent, key });
    if (!value) continue;
    const pathParts = stack.map(entry => entry.key);
    rows.push(`${pathParts.join(".")} ${value}`.trim());
  }
  const text = rows.join("\n").trim();
  return {
    text,
    status: text ? "extracted" : "empty",
    extractor: "yaml",
    metadata: textDerivedMetadata("yaml", text, {
      topLevelKeyCount: limitMetadataList(topLevelKeys).length || null,
      topLevelKeys,
      listCount: listCount || null
    })
  };
}

function extractMarkdownDerivedMetadata(raw) {
  const source = String(raw || "");
  const headings = limitMetadataList(
    source
      .split(/\r?\n/)
      .map(line => line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1] ?? "")
  );
  const frontmatterMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const frontmatterKeys = limitMetadataList(
    frontmatterMatch
      ? [...frontmatterMatch[1].matchAll(/^\s*([A-Za-z0-9_-]+)\s*:/gm)].map(match => match[1])
      : []
  );
  return textDerivedMetadata("markdown", source, {
    title: headings[0] || null,
    headingCount: headings.length,
    headings,
    frontmatterKeyCount: frontmatterKeys.length || null,
    frontmatterKeys
  });
}

function extractMarkupDerivedMetadata(raw, text) {
  const rootTag = String(raw || "").match(/<\s*([A-Za-z][\w:-]*)\b/)?.[1]?.toLowerCase() ?? null;
  const title = decodeHtmlEntities(String(raw || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return textDerivedMetadata("markup", text, {
    rootTag,
    title: title || null
  });
}

function looksMarkdownMime(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return value === "text/markdown"
    || value === "text/x-markdown"
    || value === "application/markdown"
    || value.endsWith("+markdown");
}

function looksYamlMime(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return value === "application/yaml"
    || value === "application/x-yaml"
    || value === "text/yaml"
    || value === "text/x-yaml"
    || value.endsWith("+yaml");
}

function looksTomlMime(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return value === "application/toml"
    || value === "application/x-toml"
    || value === "text/toml"
    || value.endsWith("+toml");
}

function assetExtension(originalName) {
  const match = String(originalName || "").trim().toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function inferStructuredAssetKind({ mimeType, originalName }) {
  const lowered = String(mimeType || "").toLowerCase();
  const ext = assetExtension(originalName);
  if (lowered === "application/pdf" || ext === ".pdf") return "pdf";
  if (lowered === "application/json" || lowered === "application/ld+json" || lowered.endsWith("+json") || ext === ".json" || ext === ".jsonld") return "json";
  if (lowered.includes("csv") || ext === ".csv") return "csv";
  if (lowered.includes("tsv") || lowered.includes("tab-separated") || ext === ".tsv") return "tsv";
  if (looksMarkdownMime(lowered) || ext === ".md" || ext === ".markdown") return "markdown";
  if (looksYamlMime(lowered) || ext === ".yaml" || ext === ".yml") return "yaml";
  if (looksTomlMime(lowered) || ext === ".toml") return "toml";
  if (lowered.includes("html") || lowered.includes("xml") || lowered === "image/svg+xml" || ext === ".html" || ext === ".htm" || ext === ".xml" || ext === ".svg") return "markup";
  return looksTextSearchMime(lowered) ? "text" : "";
}

function decodePdfLiteralString(source) {
  let out = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = source[index + 1] ?? "";
    if (!next) break;
    if (/[0-7]/.test(next)) {
      let octal = next;
      if (/[0-7]/.test(source[index + 2] ?? "")) octal += source[index + 2];
      if (/[0-7]/.test(source[index + 3] ?? "")) octal += source[index + 3];
      out += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
      continue;
    }
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "\r" || next === "\n") {
      if (next === "\r" && source[index + 2] === "\n") index += 1;
    } else {
      out += next;
    }
    index += 1;
  }
  return out;
}

function extractPdfArrayStrings(source) {
  const values = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "(") {
      let depth = 1;
      let token = "";
      index += 1;
      while (index < source.length && depth > 0) {
        const current = source[index];
        if (current === "\\" && index + 1 < source.length) {
          token += current + source[index + 1];
          index += 2;
          continue;
        }
        if (current === "(") depth += 1;
        else if (current === ")") {
          depth -= 1;
          if (depth === 0) {
            index += 1;
            break;
          }
        }
        token += current;
        index += 1;
      }
      values.push(decodePdfLiteralString(token));
      continue;
    }
    if (char === "<" && source[index + 1] !== "<") {
      const end = source.indexOf(">", index + 1);
      if (end < 0) break;
      const hex = source.slice(index + 1, end).replace(/\s+/g, "");
      if (hex) {
        const padded = hex.length % 2 === 0 ? hex : `${hex}0`;
        try {
          values.push(Buffer.from(padded, "hex").toString("utf8"));
        } catch {
          values.push("");
        }
      }
      index = end + 1;
      continue;
    }
    index += 1;
  }
  return values;
}

function extractPdfStreamText(source) {
  const chunks = [];
  const directLiteral = /\(((?:\\.|[^\\()])*)\)\s*Tj\b/g;
  for (const match of source.matchAll(directLiteral)) {
    chunks.push(decodePdfLiteralString(match[1]));
  }
  const directHex = /<([0-9A-Fa-f\s]+)>\s*Tj\b/g;
  for (const match of source.matchAll(directHex)) {
    const hex = match[1].replace(/\s+/g, "");
    if (!hex) continue;
    const padded = hex.length % 2 === 0 ? hex : `${hex}0`;
    try {
      chunks.push(Buffer.from(padded, "hex").toString("utf8"));
    } catch {
      // ignore malformed hex text segments
    }
  }
  const arrays = /\[([\s\S]*?)\]\s*TJ\b/g;
  for (const match of source.matchAll(arrays)) {
    chunks.push(...extractPdfArrayStrings(match[1]));
  }
  const quoteOps = /\(((?:\\.|[^\\()])*)\)\s*['"]/g;
  for (const match of source.matchAll(quoteOps)) {
    chunks.push(decodePdfLiteralString(match[1]));
  }
  return chunks
    .map(value => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function extractPdfSearchText(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const pdfText = buffer.toString("latin1");
  const parts = [];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/gs;
  for (const match of pdfText.matchAll(streamPattern)) {
    const dictionary = match[1] || "";
    const rawStream = Buffer.from(match[2] || "", "latin1");
    let decoded = rawStream;
    if (/\/Filter\s*(\[.*?\/FlateDecode.*?\]|\/FlateDecode)\b/s.test(dictionary)) {
      try {
        decoded = inflateSync(rawStream);
      } catch {
        continue;
      }
    }
    const text = extractPdfStreamText(decoded.toString("latin1"));
    if (text) parts.push(text);
  }
  const fallbackInfoStrings = [];
  const infoStringPattern = /\/(?:Title|Author|Subject|Keywords)\s*\(((?:\\.|[^\\()])*)\)/g;
  for (const match of pdfText.matchAll(infoStringPattern)) {
    fallbackInfoStrings.push(decodePdfLiteralString(match[1]));
  }
  const text = [...parts, ...fallbackInfoStrings]
    .map(value => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return {
    text,
    status: text ? "extracted" : "empty",
    extractor: "pdf",
    metadata: textDerivedMetadata("pdf", text, {
      pageCount: Number.parseInt(pdfText.match(/\/Type\s*\/Pages\b[\s\S]{0,256}?\/Count\s+(\d+)/)?.[1] || "", 10)
        || ([...pdfText.matchAll(/\/Type\s*\/Page\b/g)].length || null),
      title: decodePdfLiteralString(pdfText.match(/\/Title\s*\(((?:\\.|[^\\()])*)\)/)?.[1] ?? "").trim() || null,
      author: decodePdfLiteralString(pdfText.match(/\/Author\s*\(((?:\\.|[^\\()])*)\)/)?.[1] ?? "").trim() || null,
      subject: decodePdfLiteralString(pdfText.match(/\/Subject\s*\(((?:\\.|[^\\()])*)\)/)?.[1] ?? "").trim() || null
    })
  };
}

export function extractAssetSearchText({ mimeType, originalName, bytes, maxTextBytes }) {
  const lowered = String(mimeType || "").toLowerCase();
  const kind = inferStructuredAssetKind({ mimeType: lowered, originalName });
  if (kind === "pdf") {
    return extractPdfSearchText(bytes);
  }
  const raw = decodeSearchTextBytes(bytes, maxTextBytes);
  if (!raw.trim()) {
    return { text: "", status: "empty", extractor: "empty", metadata: { kind: "empty", lineCount: 0, wordCount: 0, charCount: 0 } };
  }
  if (kind === "json") {
    try {
      const parsed = JSON.parse(raw);
      return {
        text: flattenJsonForSearch(parsed).join("\n").trim(),
        status: "extracted",
        extractor: "json",
        metadata: extractJsonDerivedMetadata(parsed)
      };
    } catch {
      return {
        text: raw,
        status: "extracted",
        extractor: "text-fallback",
        metadata: textDerivedMetadata("text", raw)
      };
    }
  }
  if (kind === "csv") {
    return {
      text: extractDelimitedText(raw, /,/),
      status: "extracted",
      extractor: "csv",
      metadata: extractDelimitedMetadata(raw, /,/, "csv")
    };
  }
  if (kind === "tsv") {
    return {
      text: extractDelimitedText(raw, /\t/),
      status: "extracted",
      extractor: "tsv",
      metadata: extractDelimitedMetadata(raw, /\t/, "tsv")
    };
  }
  if (kind === "markdown") {
    return {
      text: raw,
      status: "extracted",
      extractor: "markdown",
      metadata: extractMarkdownDerivedMetadata(raw)
    };
  }
  if (kind === "yaml") return extractYamlSearchText(raw);
  if (kind === "toml") return extractTomlSearchText(raw);
  if (kind === "markup") {
    const text = extractMarkupText(raw);
    return {
      text,
      status: "extracted",
      extractor: "markup",
      metadata: extractMarkupDerivedMetadata(raw, text)
    };
  }
  return {
    text: raw,
    status: "extracted",
    extractor: "text",
    metadata: textDerivedMetadata("text", raw)
  };
}

export function supportsDerivedAssetSearchText(mimeType, originalName = "") {
  return Boolean(inferStructuredAssetKind({ mimeType, originalName }));
}

function looksTextSearchMime(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return value.startsWith("text/")
    || value === "application/json"
    || value === "application/ld+json"
    || value === "application/xml"
    || value === "image/svg+xml"
    || value.includes("javascript")
    || value.includes("xml");
}

function parseSvgLength(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(px)?$/i);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function detectPngDimensions(bytes) {
  if (bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height, format: "png" } : null;
}

function detectGifDimensions(bytes) {
  if (bytes.length < 10) return null;
  const header = bytes.subarray(0, 6).toString("ascii");
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  return width > 0 && height > 0 ? { width, height, format: "gif" } : null;
}

function detectJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    offset += 2;
    if (segmentLength < 2 || offset + segmentLength - 2 > bytes.length) break;
    if (sofMarkers.has(marker)) {
      if (segmentLength < 7) break;
      const height = bytes.readUInt16BE(offset + 1);
      const width = bytes.readUInt16BE(offset + 3);
      return width > 0 && height > 0 ? { width, height, format: "jpeg" } : null;
    }
    offset += segmentLength - 2;
  }
  return null;
}

function detectSvgDimensions(bytes) {
  const text = decodeSearchTextBytes(bytes, Math.min(bytes.length, 65536));
  const openTag = text.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  if (!openTag) return null;
  const width = parseSvgLength(openTag.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1] ?? null);
  const height = parseSvgLength(openTag.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1] ?? null);
  if (width && height) return { width, height, format: "svg" };
  const viewBox = openTag.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(value => Number.parseFloat(value));
    if (parts.length === 4 && parts.every(value => Number.isFinite(value)) && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3], format: "svg" };
    }
  }
  return null;
}

function detectImageMetadata({ mimeType, bytes }) {
  const lowered = String(mimeType || "").toLowerCase();
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!buffer.length) return null;
  if (lowered === "image/png") return detectPngDimensions(buffer);
  if (lowered === "image/gif") return detectGifDimensions(buffer);
  if (lowered === "image/jpeg" || lowered === "image/jpg") return detectJpegDimensions(buffer);
  if (lowered === "image/svg+xml") return detectSvgDimensions(buffer);
  return detectPngDimensions(buffer) || detectGifDimensions(buffer) || detectJpegDimensions(buffer) || detectSvgDimensions(buffer);
}

function renderAssetThumbnailSvg({ mimeType, bytes, width, height, maxEdgePx }) {
  const sourceBytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const safeWidth = Number.isFinite(width) && width > 0 ? width : maxEdgePx;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : maxEdgePx;
  const largestEdge = Math.max(safeWidth, safeHeight, 1);
  const scale = Math.min(1, maxEdgePx / largestEdge);
  const displayWidth = Math.max(1, Math.round(safeWidth * scale));
  const displayHeight = Math.max(1, Math.round(safeHeight * scale));
  const dataUrl = `data:${mimeType};base64,${sourceBytes.toString("base64")}`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${displayWidth}" height="${displayHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">
  <rect width="${safeWidth}" height="${safeHeight}" fill="#f5f5f4"/>
  <image href="${dataUrl}" width="${safeWidth}" height="${safeHeight}" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
  return {
    bytes: Buffer.from(svg, "utf8"),
    mimeType: "image/svg+xml",
    width: safeWidth,
    height: safeHeight
  };
}

function normalizeAssetThumbnailConfig(runtimeConfig = {}) {
  return {
    maxSourceBytes: positiveInteger(runtimeConfigLookup(runtimeConfig, "upload.asset.thumbnailMaxSourceBytes"), 2 * 1024 * 1024),
    maxEdgePx: positiveInteger(runtimeConfigLookup(runtimeConfig, "upload.asset.thumbnailMaxEdgePx"), 256)
  };
}

export function extractAssetThumbnail({ mimeType, bytes, runtimeConfig }) {
  const lowered = String(mimeType || "").toLowerCase();
  if (!lowered.startsWith("image/")) return { status: "not-applicable", metadata: null, thumbnail: null };
  const metadata = detectImageMetadata({ mimeType: lowered, bytes });
  if (!metadata) return { status: "unsupported-image", metadata: null, thumbnail: null };
  const config = normalizeAssetThumbnailConfig(runtimeConfig);
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (buffer.length > config.maxSourceBytes) {
    return { status: "too-large", metadata, thumbnail: null };
  }
  return {
    status: "ready",
    metadata,
    thumbnail: renderAssetThumbnailSvg({
      mimeType: lowered,
      bytes: buffer,
      width: metadata.width,
      height: metadata.height,
      maxEdgePx: config.maxEdgePx
    })
  };
}
