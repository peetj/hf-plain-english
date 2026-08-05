const HUGGING_FACE_BASE_URL = "https://huggingface.co";
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Fetch and normalize public Hugging Face model metadata, repository files, and README markdown.
 *
 * @param {string} modelId Hugging Face model identifier in owner/model form.
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   status: "success" | "partial" | "not-found" | "rate-limited" | "gated-or-private" | "network-error" | "invalid-response" | "invalid-model-id",
 *   data: object | null,
 *   warnings: Array<{ type: string, message: string }>,
 *   error: { type: string, message: string, status?: number, retryAfter?: string | null } | null,
 *   sources: { metadataApi: string, modelCard: string }
 * }>}
 */
export async function fetchHuggingFaceModel(modelId, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const warnings = [];
  const validation = validateModelId(modelId);

  if (!validation.ok) {
    return createFailure("invalid-model-id", {
      type: "invalid-model-id",
      message: validation.message
    });
  }

  const metadataApi = `${HUGGING_FACE_BASE_URL}/api/models/${encodeModelId(modelId)}`;
  const modelCard = `${HUGGING_FACE_BASE_URL}/${encodeModelId(modelId)}/raw/main/README.md`;
  const sources = { metadataApi, modelCard };

  let metadataResponse;

  try {
    metadataResponse = await fetchJson(metadataApi, { timeoutMs });
  } catch (error) {
    return createFailure("network-error", {
      type: "network-error",
      message: "Could not reach the Hugging Face Hub API.",
      status: error.status,
      retryAfter: error.retryAfter || null
    }, sources);
  }

  if (!metadataResponse.ok) {
    if (metadataResponse.invalidJson) {
      return createFailure("invalid-response", {
        type: "invalid-response",
        message: "Hugging Face returned metadata that was not valid JSON.",
        status: metadataResponse.status
      }, sources);
    }

    return createFailure(mapHttpStatus(metadataResponse.status), {
      type: mapHttpStatus(metadataResponse.status),
      message: getHttpErrorMessage(metadataResponse.status),
      status: metadataResponse.status,
      retryAfter: metadataResponse.retryAfter
    }, sources);
  }

  if (metadataResponse.invalidJson) {
    return createFailure("invalid-response", {
      type: "invalid-response",
      message: "Hugging Face returned metadata that was not valid JSON.",
      status: metadataResponse.status
    }, sources);
  }

  if (!isPlainObject(metadataResponse.body)) {
    return createFailure("invalid-response", {
      type: "invalid-response",
      message: "Hugging Face returned metadata in an unexpected format.",
      status: metadataResponse.status
    }, sources);
  }

  let normalizedData = normalizeModelMetadata(modelId, metadataResponse.body);

  try {
    const cardResponse = await fetchText(modelCard, { timeoutMs });

    if (cardResponse.ok) {
      normalizedData = {
        ...normalizedData,
        modelCardMarkdown: cardResponse.body
      };
    } else if (cardResponse.status === 404) {
      warnings.push({
        type: "missing-model-card",
        message: "No README model card was found at the default branch path."
      });
    } else if (cardResponse.status === 401 || cardResponse.status === 403) {
      warnings.push({
        type: "restricted-model-card",
        message: "The README model card could not be fetched without access."
      });
    } else if (cardResponse.status === 429) {
      warnings.push({
        type: "model-card-rate-limited",
        message: "Hugging Face rate-limited the model card request."
      });
    } else {
      warnings.push({
        type: "model-card-http-error",
        message: `The README model card request returned HTTP ${cardResponse.status}.`
      });
    }
  } catch {
    warnings.push({
      type: "model-card-network-error",
      message: "The metadata was fetched, but the README model card request failed."
    });
  }

  const status = warnings.length > 0 ? "partial" : "success";

  return {
    ok: true,
    status,
    data: normalizedData,
    warnings,
    error: null,
    sources
  };
}

function normalizeModelMetadata(requestedModelId, rawMetadata) {
  const resolvedModelId = stringOrNull(rawMetadata.modelId) || stringOrNull(rawMetadata.id) || requestedModelId;
  const [fallbackAuthor, fallbackModelName] = requestedModelId.split("/");
  const [resolvedAuthor, resolvedName] = resolvedModelId.split("/");
  const cardData = isPlainObject(rawMetadata.cardData) ? rawMetadata.cardData : {};
  const config = isPlainObject(rawMetadata.config) ? rawMetadata.config : {};
  const safetensors = isPlainObject(rawMetadata.safetensors) ? rawMetadata.safetensors : {};

  return {
    modelId: resolvedModelId,
    author: stringOrNull(rawMetadata.author) || resolvedAuthor || fallbackAuthor,
    modelName: resolvedName || fallbackModelName,
    pipelineTag: stringOrNull(rawMetadata.pipeline_tag) || stringOrNull(cardData.pipeline_tag),
    libraryName: stringOrNull(rawMetadata.library_name) || stringOrNull(cardData.library_name),
    tags: normalizeStringArray(rawMetadata.tags),
    license: extractLicense(rawMetadata, cardData),
    downloads: numberOrNull(rawMetadata.downloads),
    likes: numberOrNull(rawMetadata.likes),
    lastModified: stringOrNull(rawMetadata.lastModified),
    gated: normalizeGated(rawMetadata.gated),
    private: rawMetadata.private === true,
    parameters: numberOrNull(rawMetadata.parameters),
    safetensorsParameters: isPlainObject(safetensors.parameters) ? safetensors.parameters : null,
    architecture: extractArchitecture(config),
    languages: extractLanguages(rawMetadata, cardData),
    files: normalizeFiles(rawMetadata.siblings),
    modelCardMarkdown: "",
    rawMetadata
  };
}

async function fetchJson(url, { timeoutMs }) {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json"
    },
    timeoutMs
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      retryAfter: response.headers.get("Retry-After"),
      body: null
    };
  }

  const parsedBody = await parseJsonResponse(response);

  return {
    ok: true,
    status: response.status,
    retryAfter: response.headers.get("Retry-After"),
    body: parsedBody.body,
    invalidJson: parsedBody.invalidJson
  };
}

async function fetchText(url, { timeoutMs }) {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "text/plain"
    },
    timeoutMs
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      retryAfter: response.headers.get("Retry-After"),
      body: ""
    };
  }

  return {
    ok: true,
    status: response.status,
    retryAfter: response.headers.get("Retry-After"),
    body: await response.text()
  };
}

async function fetchWithTimeout(url, { headers, timeoutMs }) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store"
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function parseJsonResponse(response) {
  try {
    return {
      body: await response.json(),
      invalidJson: false
    };
  } catch {
    return {
      body: null,
      invalidJson: true
    };
  }
}

function validateModelId(modelId) {
  if (typeof modelId !== "string" || modelId.trim() === "") {
    return {
      ok: false,
      message: "Missing Hugging Face model ID."
    };
  }

  const parts = modelId.split("/");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      ok: false,
      message: "Model ID must use owner/model format."
    };
  }

  return {
    ok: true,
    message: ""
  };
}

function encodeModelId(modelId) {
  return modelId.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function normalizeFiles(siblings) {
  if (!Array.isArray(siblings)) {
    return [];
  }

  return siblings
    .filter((file) => isPlainObject(file) && typeof file.rfilename === "string")
    .map((file) => ({
      path: file.rfilename,
      name: file.rfilename.split("/").pop() || file.rfilename,
      size: numberOrNull(file.size),
      lfs: isPlainObject(file.lfs) ? file.lfs : null
    }));
}

function extractLicense(rawMetadata, cardData) {
  const cardLicense = stringOrNull(cardData.license);

  if (cardLicense) {
    return cardLicense;
  }

  const licenseTag = normalizeStringArray(rawMetadata.tags).find((tag) => tag.startsWith("license:"));
  return licenseTag ? licenseTag.replace("license:", "") : null;
}

function extractArchitecture(config) {
  if (Array.isArray(config.architectures) && typeof config.architectures[0] === "string") {
    return config.architectures[0];
  }

  return stringOrNull(config.model_type);
}

function extractLanguages(rawMetadata, cardData) {
  const cardLanguages = normalizeStringArray(cardData.language || cardData.languages);
  const languageTags = normalizeStringArray(rawMetadata.tags)
    .filter((tag) => tag.startsWith("language:"))
    .map((tag) => tag.replace("language:", ""));

  return Array.from(new Set([...cardLanguages, ...languageTags]));
}

function normalizeGated(value) {
  if (value === true || value === "auto" || value === "manual") {
    return true;
  }

  return false;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string");
  }

  if (typeof value === "string" && value.trim() !== "") {
    return [value];
  }

  return [];
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapHttpStatus(status) {
  if (status === 404) {
    return "not-found";
  }

  if (status === 401 || status === 403) {
    return "gated-or-private";
  }

  if (status === 429) {
    return "rate-limited";
  }

  return "network-error";
}

function getHttpErrorMessage(status) {
  if (status === 404) {
    return "Hugging Face could not find this model.";
  }

  if (status === 401 || status === 403) {
    return "This model may be gated or private.";
  }

  if (status === 429) {
    return "Hugging Face rate-limited the request. Try again later.";
  }

  return `Hugging Face returned HTTP ${status}.`;
}

function createFailure(status, error, sources = { metadataApi: "", modelCard: "" }) {
  return {
    ok: false,
    status,
    data: null,
    warnings: [],
    error,
    sources
  };
}
