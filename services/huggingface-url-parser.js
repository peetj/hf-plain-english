const HUGGING_FACE_HOST = "huggingface.co";
const RESERVED_TOP_LEVEL_PATHS = new Set([
  "api",
  "blog",
  "collections",
  "datasets",
  "docs",
  "enterprise",
  "join",
  "login",
  "models",
  "new",
  "organizations",
  "pricing",
  "settings",
  "spaces",
  "tasks"
]);

/**
 * Parse a browser URL and determine whether it is a supported public Hugging Face model page.
 *
 * V1 supports owner/model URLs and model subpages. It intentionally does not
 * support one-segment model aliases, datasets, Spaces, docs, settings, or Hub
 * index pages.
 *
 * @param {string} inputUrl
 * @returns {{
 *   ok: boolean,
 *   isHuggingFace: boolean,
 *   isModelPage: boolean,
 *   modelId: string | null,
 *   owner: string | null,
 *   modelName: string | null,
 *   url: string,
 *   reason: string | null
 * }}
 */
export function parseHuggingFaceModelUrl(inputUrl) {
  const baseResult = {
    ok: false,
    isHuggingFace: false,
    isModelPage: false,
    modelId: null,
    owner: null,
    modelName: null,
    url: typeof inputUrl === "string" ? inputUrl : "",
    reason: null
  };

  if (typeof inputUrl !== "string" || inputUrl.trim() === "") {
    return {
      ...baseResult,
      reason: "missing-url"
    };
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(inputUrl);
  } catch {
    return {
      ...baseResult,
      reason: "malformed-url"
    };
  }

  const normalisedUrl = parsedUrl.href;

  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== HUGGING_FACE_HOST) {
    return {
      ...baseResult,
      url: normalisedUrl,
      reason: "not-hugging-face"
    };
  }

  const pathParts = parsedUrl.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodePathPart(part));

  if (pathParts.length < 2) {
    return {
      ...baseResult,
      isHuggingFace: true,
      url: normalisedUrl,
      reason: "not-a-model-page"
    };
  }

  const [owner, modelName] = pathParts;

  if (RESERVED_TOP_LEVEL_PATHS.has(owner.toLowerCase())) {
    return {
      ...baseResult,
      isHuggingFace: true,
      url: normalisedUrl,
      reason: "unsupported-hugging-face-section"
    };
  }

  if (!isValidRepoSegment(owner) || !isValidRepoSegment(modelName)) {
    return {
      ...baseResult,
      isHuggingFace: true,
      url: normalisedUrl,
      reason: "invalid-model-id"
    };
  }

  const modelId = `${owner}/${modelName}`;

  return {
    ...baseResult,
    ok: true,
    isHuggingFace: true,
    isModelPage: true,
    modelId,
    owner,
    modelName,
    url: normalisedUrl,
    reason: null
  };
}

/**
 * @param {string} inputUrl
 * @returns {boolean}
 */
export function isSupportedHuggingFaceModelUrl(inputUrl) {
  return parseHuggingFaceModelUrl(inputUrl).ok;
}

function decodePathPart(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function isValidRepoSegment(segment) {
  if (typeof segment !== "string" || segment.length === 0 || segment.length > 96) {
    return false;
  }

  if (segment.startsWith(".") || segment.endsWith(".")) {
    return false;
  }

  if (segment.includes("..")) {
    return false;
  }

  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment);
}
