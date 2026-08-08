const HUGGING_FACE_BASE_URL = "https://huggingface.co";
const DEFAULT_TIMEOUT_MS = 12000;

export async function fetchModelCandidates(request, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const url = buildModelSearchApiUrl(request);

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json"
      },
      timeoutMs
    });

    if (!response.ok) {
      return {
        ok: false,
        candidates: [],
        error: `Hugging Face returned HTTP ${response.status} for the candidate search.`,
        source: url
      };
    }

    const body = await response.json();

    return {
      ok: Array.isArray(body),
      candidates: Array.isArray(body) ? body : [],
      error: Array.isArray(body) ? "" : "Hugging Face returned an unexpected candidate search response.",
      source: url
    };
  } catch {
    return {
      ok: false,
      candidates: [],
      error: "The extension could not reach Hugging Face model search.",
      source: url
    };
  }
}

function buildModelSearchApiUrl(request = {}) {
  const params = new URLSearchParams({
    sort: "downloads",
    direction: "-1",
    limit: "20"
  });

  const filters = Array.isArray(request.filters)
    ? request.filters.filter((filter) => typeof filter === "string" && filter.trim() !== "")
    : [];

  if (filters.length > 0) {
    params.set("filter", filters.join(","));
  }

  if (typeof request.search === "string" && request.search.trim() !== "") {
    params.set("search", request.search.trim());
  }

  return `${HUGGING_FACE_BASE_URL}/api/models?${params.toString()}`;
}

async function fetchWithTimeout(url, { headers, timeoutMs }) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers,
      signal: controller.signal
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
