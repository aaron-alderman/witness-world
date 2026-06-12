import {
  assetDerivedTextPathForAppContext,
  assetDerivedTextStorageKey,
  assetDerivedThumbnailPathForAppContext,
  assetDerivedThumbnailStorageKey,
  assetThumbnailUrlForId
} from "./runtime-practical-backend-asset-services.js";
import {
  createBuiltinAssetJobHandlers as createBuiltinAssetJobHandlersModule,
  createBuiltinNotificationJobHandlers as createBuiltinNotificationJobHandlersModule,
  createBuiltinWebhookJobHandlers as createBuiltinWebhookJobHandlersModule
} from "./runtime-builtin-job-handlers.js";
import { looksJsonContentType, webhookPayloadPathFor } from "./runtime-practical-backend-io-services.js";
import { isoAt, positiveInteger, runtimeConfigLookup } from "./runtime-config-utils.js";
import { extractAssetSearchText, extractAssetThumbnail, supportsDerivedAssetSearchText } from "./runtime-asset-derived-utils.js";
import { renderTemplatedText } from "./runtime-template-utils.js";

export function createBuiltinNotificationJobHandlers({ world, backendHost, runtimeConfig }) {
  return createBuiltinNotificationJobHandlersModule({
    world,
    backendHost,
    runtimeConfig,
    renderTemplatedText
  });
}

export function createBuiltinWebhookJobHandlers({ world, backendHost }) {
  return createBuiltinWebhookJobHandlersModule({
    world,
    backendHost,
    webhookPayloadPathFor,
    looksJsonContentType
  });
}

export function createBuiltinAssetJobHandlers({ world, backendHost, runtimeConfig }) {
  return createBuiltinAssetJobHandlersModule({
    world,
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
  });
}
