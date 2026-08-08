const GOAL_CONFIG = {
  chat: {
    label: "Chat",
    taskPhrase: "chat or instruction model",
    format: "GGUF",
    quantisation: "Q4_K_M first; Q5_K_M if the model is already small",
    searchFilter: "Text Generation + GGUF",
    filters: {
      library: "gguf",
      pipelineTag: "text-generation"
    },
    apiFilters: ["gguf", "text-generation"],
    secondaryLabel: "Q4_K_M variants",
    secondarySearch: "Q4_K_M",
    candidateSearch: "Q4_K_M",
    avoid: "Avoid base-only models, FP16/BF16 weights, and 13B+ models unless you expect slow RAM offloading."
  },
  code: {
    label: "Coding",
    taskPhrase: "coding assistant model",
    format: "GGUF",
    quantisation: "Q4_K_M first; Q5_K_M only for smaller coding models",
    searchFilter: "Text Generation + GGUF, narrowed by code",
    filters: {
      library: "gguf",
      pipelineTag: "text-generation",
      search: "code"
    },
    apiFilters: ["gguf", "text-generation"],
    secondaryLabel: "Coder variants",
    secondarySearch: "coder",
    candidateSearch: "coder",
    avoid: "Avoid large FP16 coding models and repositories without a chat or instruct variant."
  },
  embedding: {
    label: "Embeddings",
    taskPhrase: "embedding model",
    format: "safetensors or sentence-transformers",
    quantisation: "Quantisation is less important than choosing a small embedding model",
    searchFilter: "Feature Extraction + Sentence Transformers",
    filters: {
      library: "sentence-transformers",
      pipelineTag: "feature-extraction"
    },
    apiFilters: ["sentence-transformers", "feature-extraction"],
    secondaryLabel: "Embedding name search",
    secondarySearch: "embedding",
    candidateSearch: "embedding",
    avoid: "Avoid chat models; embeddings are for search, matching, retrieval, or clustering."
  },
  image: {
    label: "Images",
    taskPhrase: "image generation model",
    format: "Diffusers-compatible repository",
    quantisation: "FP16 can still be heavy; prefer small or turbo/lightning variants on modest GPUs",
    searchFilter: "Text-to-Image + Diffusers",
    filters: {
      library: "diffusers",
      pipelineTag: "text-to-image"
    },
    apiFilters: ["diffusers", "text-to-image"],
    secondaryLabel: "Fast image variants",
    secondarySearch: "turbo",
    candidateSearch: "turbo",
    avoid: "Avoid large diffusion checkpoints until the extension can estimate image-model memory more precisely."
  }
};

const ROUTE_CONFIG = {
  beginner: {
    label: "Beginner app",
    routeText: "Prefer a beginner desktop route when possible."
  },
  ollama: {
    label: "Ollama",
    routeText: "Prefer models with an Ollama-ready path or enough information to create one."
  },
  python: {
    label: "Python",
    routeText: "Python gives more control, but the setup is more technical."
  },
  unsure: {
    label: "Not sure",
    routeText: "Start with the simplest route that matches the detected model files."
  }
};

const PRIORITY_CONFIG = {
  balanced: {
    label: "Balanced",
    rangeBias: 1,
    text: "Balance output quality with a realistic local setup."
  },
  speed: {
    label: "Speed",
    rangeBias: 0.65,
    text: "Prefer smaller models that start quickly and leave memory spare."
  },
  quality: {
    label: "Quality",
    rangeBias: 1.25,
    text: "Prefer the largest model that still looks realistic for this machine."
  }
};

const RANK_CONFIG = {
  popular: {
    label: "Downloads + likes",
    text: "Rank candidates by a mix of download count, likes, and fit for your selected target."
  },
  downloads: {
    label: "Most downloads",
    text: "Prefer candidates that many people have downloaded."
  },
  likes: {
    label: "Most liked",
    text: "Prefer candidates that many people have liked."
  }
};

const TARGET_CONFIG = {
  auto: {
    label: "Auto for my machine",
    mode: "auto"
  },
  small: {
    label: "Smallest practical",
    mode: "priority",
    priority: "speed"
  },
  comfort: {
    label: "Comfort target",
    mode: "auto"
  },
  stretch: {
    label: "Stretch target",
    mode: "priority",
    priority: "quality"
  },
  tiny: {
    label: "1B-2B",
    mode: "fixed",
    primaryRange: "1B-2B Q4 models",
    stretchRange: "3B Q4 can be a stretch on modest hardware",
    scanAdvice: "filenames around 1B-2B with Q4_K_M files.",
    sizeHints: ["1b", "2b"]
  },
  compact: {
    label: "3B-4B",
    mode: "fixed",
    primaryRange: "3B-4B Q4 models",
    stretchRange: "7B Q4 can be possible, but expect partial offloading or slower runs",
    scanAdvice: "filenames around 3B-4B with Q4_K_M files; treat 7B as a stretch.",
    sizeHints: ["3b", "4b"]
  },
  sevenB: {
    label: "7B",
    mode: "fixed",
    primaryRange: "7B Q4 models",
    stretchRange: "8B-13B models need more caution unless the quantisation is strong",
    scanAdvice: "filenames around 7B with Q4_K_M files.",
    sizeHints: ["7b", "8b"]
  },
  thirteenB: {
    label: "13B",
    mode: "fixed",
    primaryRange: "13B Q4 models",
    stretchRange: "Larger models usually need more VRAM or patient RAM offloading",
    scanAdvice: "filenames around 13B with Q4_K_M files.",
    sizeHints: ["13b", "14b"]
  }
};

const FORMAT_CONFIG = {
  auto: {
    label: "Auto",
    format: null
  },
  gguf: {
    label: "GGUF",
    format: "GGUF"
  },
  safetensors: {
    label: "safetensors",
    format: "safetensors"
  },
  diffusers: {
    label: "Diffusers",
    format: "Diffusers-compatible repository"
  }
};

const QUANTISATION_CONFIG = {
  auto: {
    label: "Auto",
    value: null
  },
  q4: {
    label: "Q4_K_M",
    value: "Q4_K_M"
  },
  q5: {
    label: "Q5_K_M",
    value: "Q5_K_M"
  },
  fp16: {
    label: "FP16",
    value: "FP16"
  }
};

export function buildModelFitFinder(hardwareProfile = {}, choices = {}) {
  const goal = getConfig(GOAL_CONFIG, choices.goal, "chat");
  const route = getConfig(ROUTE_CONFIG, choices.route, "beginner");
  const priority = getConfig(PRIORITY_CONFIG, choices.priority, "balanced");
  const rank = getConfig(RANK_CONFIG, choices.rankBy, "popular");
  const target = getConfig(TARGET_CONFIG, choices.targetSize, "auto");
  const format = getConfig(FORMAT_CONFIG, choices.fileFormat, "auto");
  const quantisation = getConfig(QUANTISATION_CONFIG, choices.quantisation, "auto");
  const sizing = estimateLocalSizeGuidance(hardwareProfile, goal.key, priority, target);
  const effectiveFormat = format.format || goal.format;
  const effectiveQuantisation = quantisation.value || goal.quantisation;
  const candidateRequest = buildCandidateRequest(goal, sizing, choices, quantisation, format);
  const summaryProfile = formatHardwareProfile(hardwareProfile);
  const summaryGuidance = buildSummaryGuidance(goal, sizing);

  return {
    summary: `${summaryProfile}: ${summaryGuidance}`,
    summaryProfile,
    summaryGuidance,
    rows: [
      ["Best target", `${goal.taskPhrase}; ${sizing.primaryRange}.`],
      ["Stretch target", sizing.stretchRange],
      ["File format", effectiveFormat],
      ["Quantisation", effectiveQuantisation],
      ["Route", `${route.routeText} ${priority.text}`],
      ["Rank by", `${rank.label}. ${rank.text}`],
      ["Search filter", goal.searchFilter],
      ["Scan results for", sizing.scanAdvice],
      ["Avoid", buildAvoidText(goal, choices)]
    ],
    candidateRequest,
    searchLinks: buildSearchLinks(goal, choices)
  };
}

function getConfig(config, value, fallbackKey) {
  const key = typeof value === "string" && config[value] ? value : fallbackKey;
  return {
    key,
    ...config[key]
  };
}

export function rankModelCandidates(candidates, finder, choices = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      status: "empty",
      model: null,
      justification: "No candidate model was returned by the Hugging Face search. Use the filtered search links and scan manually."
    };
  }

  const eligible = candidates
    .filter((candidate) => candidate && !candidate.private)
    .map((candidate) => normalizeCandidate(candidate))
    .filter((candidate) => isCandidateEligibleForRank(candidate, finder, choices));

  if (eligible.length === 0) {
    return {
      status: "empty",
      model: null,
      justification: "No eligible candidate model was returned by the Hugging Face search. Use the filtered search links and scan manually."
    };
  }

  const ranked = rankEligibleCandidates(eligible, finder, choices);

  const best = ranked[0]?.candidate || eligible[0];

  return {
    status: "found",
    model: best,
    justification: buildCandidateJustification(best, finder, choices)
  };
}

function rankEligibleCandidates(candidates, finder, choices) {
  if (choices.rankBy === "downloads") {
    return candidates
      .map((candidate) => ({
        candidate,
        score: candidate.downloads,
        tieBreak: candidate.likes
      }))
      .sort(compareRankedCandidateScores);
  }

  if (choices.rankBy === "likes") {
    return candidates
      .map((candidate) => ({
        candidate,
        score: candidate.likes,
        tieBreak: candidate.downloads
      }))
      .sort(compareRankedCandidateScores);
  }

  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, finder, choices),
      tieBreak: candidate.downloads + candidate.likes
    }))
    .sort(compareRankedCandidateScores);
}

function compareRankedCandidateScores(a, b) {
  return (b.score - a.score)
    || (b.tieBreak - a.tieBreak)
    || String(a.candidate.modelId).localeCompare(String(b.candidate.modelId));
}

function isCandidateEligibleForRank(candidate, finder, choices) {
  const searchable = `${candidate.modelId} ${candidate.tags.join(" ")}`.toLowerCase();

  if (finder?.candidateRequest?.permissiveOnly && !hasPermissiveLicense(candidate.tags)) {
    return false;
  }

  if (finder?.candidateRequest?.localOnly && !searchable.includes("gguf") && (choices.goal === "chat" || choices.goal === "code")) {
    return false;
  }

  if (/\b(layer-package|distributed-inference|skippy)\b/i.test(searchable)) {
    return false;
  }

  return true;
}

function estimateLocalSizeGuidance(hardwareProfile, goal, priority, target) {
  const gpuVramGb = Number(hardwareProfile?.gpuVramGb);
  const systemRamGb = Number(hardwareProfile?.systemRamGb);

  if (target.mode === "fixed") {
    return {
      primaryRange: target.primaryRange,
      stretchRange: target.stretchRange,
      scanAdvice: target.scanAdvice,
      sizeHints: target.sizeHints
    };
  }

  const rangeBias = target.mode === "priority"
    ? PRIORITY_CONFIG[target.priority]?.rangeBias || priority.rangeBias
    : priority.rangeBias;

  if (goal === "embedding") {
    return {
      primaryRange: "small embedding models",
      stretchRange: "Larger embedding models are fine if Python setup and disk space are acceptable",
      scanAdvice: "small, well-documented embedding models with clear sentence-transformers or Transformers usage.",
      sizeHints: ["small"]
    };
  }

  if (goal === "image") {
    const hasModestGpu = Number.isFinite(gpuVramGb) && gpuVramGb >= 6;
    return {
      primaryRange: hasModestGpu ? "small or optimised image models" : "hosted image inference before local downloads",
      stretchRange: hasModestGpu ? "SDXL-class models may still be tight; start with smaller variants" : "Use hosted inference before downloading large image models",
      scanAdvice: hasModestGpu
        ? "small, turbo, lightning, or low-VRAM notes before downloading."
        : "hosted demos or inference-provider support before local files.",
      sizeHints: hasModestGpu ? ["small", "turbo"] : ["small"]
    };
  }

  const baseBand = chooseLanguageModelBand(gpuVramGb, systemRamGb);
  const adjustedBand = applyPriorityBias(baseBand, rangeBias);

  return {
    primaryRange: adjustedBand.primary,
    stretchRange: adjustedBand.stretch,
    scanAdvice: adjustedBand.scanAdvice,
    sizeHints: adjustedBand.sizeHints || []
  };
}

function chooseLanguageModelBand(gpuVramGb, systemRamGb) {
  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 24) {
    return createBand("13B-30B Q4 models", "30B+ Q4 models may work, but check VRAM and context length carefully", "model cards or filenames around 13B-30B with Q4_K_M files.", ["13b", "30b"]);
  }

  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 12) {
    return createBand("7B-13B Q4 models", "14B models may work if quantised and context length is not extreme", "model cards or filenames around 7B-13B with Q4_K_M files.", ["7b", "13b"]);
  }

  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 8) {
    return createBand("3B-7B Q4 models", "8B models are worth trying when they are well quantised", "model cards or filenames around 3B-7B with Q4_K_M files.", ["3b", "7b"]);
  }

  if (Number.isFinite(gpuVramGb) && gpuVramGb >= 6) {
    return createBand("3B-4B Q4 models for comfort", "7B Q4 can be possible, but expect partial offloading or slower runs", "model cards or filenames around 3B-4B with Q4_K_M files; treat 7B as a stretch.", ["3b", "4b", "7b"]);
  }

  if (Number.isFinite(systemRamGb) && systemRamGb >= 16) {
    return createBand("1B-3B Q4 models", "7B Q4 may run from system RAM, but it is a patience test", "model cards or filenames around 1B-3B with Q4_K_M files.", ["1b", "3b"]);
  }

  return createBand("1B-2B Q4 models", "Use hosted inference for anything larger until the hardware profile improves", "model cards or filenames around 1B-2B with Q4_K_M files.", ["1b", "2b"]);
}

function createBand(primary, stretch, scanAdvice, sizeHints) {
  return {
    primary,
    stretch,
    scanAdvice,
    sizeHints
  };
}

function applyPriorityBias(band, rangeBias) {
  if (rangeBias < 0.8) {
    return {
      primary: band.primary.replace(/(?: for comfort)?$/, " with the smallest practical size"),
      stretch: "Only stretch upward after a smaller model runs comfortably.",
      scanAdvice: `${band.scanAdvice} Prefer the lower end of that range.`,
      sizeHints: band.sizeHints?.slice(0, 2) || []
    };
  }

  if (rangeBias > 1.15) {
    return {
      primary: band.primary,
      stretch: `${band.stretch}. Prefer Q5_K_M only when the target range is already comfortable.`,
      scanAdvice: `${band.scanAdvice} You can compare Q5_K_M only after a Q4_K_M file looks practical.`,
      sizeHints: band.sizeHints || []
    };
  }

  return band;
}

function buildCandidateRequest(goal, sizing, choices, quantisation, format) {
  const filters = buildCandidateFilters(goal, choices, format);
  const searchParts = [];
  const usesGguf = filters.includes("gguf");

  if (quantisation.value) {
    searchParts.push(quantisation.value);
  } else if (usesGguf && choices.localOnly !== false && goal.key === "chat") {
    searchParts.push(quantisation.value || goal.candidateSearch);
  } else if (goal.candidateSearch && goal.key !== "chat") {
    searchParts.push(goal.candidateSearch);
  }

  if (choices.keyword) {
    searchParts.push(String(choices.keyword).trim());
  }

  return {
    filters,
    search: searchParts.filter(Boolean).join(" "),
    sizeHints: sizing.sizeHints || [],
    permissiveOnly: choices.permissiveOnly === true,
    localOnly: choices.localOnly !== false,
    sortBy: choices.rankBy || "popular"
  };
}

function buildCandidateFilters(goal, choices, format) {
  const libraryFilters = new Set(["gguf", "sentence-transformers", "diffusers", "safetensors"]);
  const selectedLibrary = getSelectedLibraryFilter(format);
  const filters = goal.apiFilters.filter((filter) => !libraryFilters.has(filter));

  if (selectedLibrary) {
    filters.unshift(selectedLibrary);
  } else if (choices.localOnly === false && (goal.key === "chat" || goal.key === "code")) {
    filters.unshift("text-generation");
  } else {
    filters.unshift(...goal.apiFilters.filter((filter) => libraryFilters.has(filter)));
  }

  return Array.from(new Set(filters));
}

function getSelectedLibraryFilter(format) {
  switch (format.key) {
    case "gguf":
      return "gguf";
    case "safetensors":
      return "safetensors";
    case "diffusers":
      return "diffusers";
    default:
      return "";
  }
}

function buildSearchLinks(goal, choices) {
  return [
    {
      label: `${goal.label} filtered search`,
      url: buildHuggingFaceModelsUrl(goal.filters, choices)
    },
    {
      label: goal.secondaryLabel,
      url: buildHuggingFaceModelsUrl({
        ...goal.filters,
        search: goal.secondarySearch
      }, choices)
    }
  ];
}

function buildHuggingFaceModelsUrl(filters, choices = {}) {
  const params = new URLSearchParams({
    sort: getBrowserSort(choices.rankBy)
  });

  if (filters?.library) {
    params.set("library", filters.library);
  }

  if (filters?.pipelineTag) {
    params.set("pipeline_tag", filters.pipelineTag);
  }

  if (filters?.search) {
    params.set("search", filters.search);
  }

  return `https://huggingface.co/models?${params.toString()}`;
}

function getBrowserSort(rankBy) {
  if (rankBy === "downloads") {
    return "downloads";
  }

  if (rankBy === "likes") {
    return "likes";
  }

  return "trending";
}

function buildAvoidText(goal, choices) {
  const parts = [goal.avoid];

  if (choices.permissiveOnly) {
    parts.push("Skip models without a clearly permissive licence.");
  }

  if (choices.localOnly === false) {
    parts.push("Hosted inference is acceptable, but still check licence and access requirements.");
  }

  return parts.join(" ");
}

function scoreCandidate(candidate, finder, choices) {
  const normalized = normalizeCandidate(candidate);
  const searchable = `${normalized.modelId} ${normalized.tags.join(" ")}`.toLowerCase();
  let score = 0;

  const downloadsScore = Math.min(Math.log10((normalized.downloads || 0) + 1), 8);
  const likesScore = Math.min((normalized.likes || 0) / 250, 6);

  if (choices.rankBy === "downloads") {
    score += downloadsScore * 1.7;
    score += likesScore * 0.3;
  } else if (choices.rankBy === "likes") {
    score += likesScore * 1.6;
    score += downloadsScore * 0.4;
  } else {
    score += downloadsScore;
    score += likesScore;
  }

  if (finder?.candidateRequest?.permissiveOnly && !hasPermissiveLicense(normalized.tags)) {
    score -= 10;
  }

  if (finder?.candidateRequest?.localOnly && !searchable.includes("gguf") && (choices.goal === "chat" || choices.goal === "code")) {
    score -= 8;
  }

  for (const hint of finder?.candidateRequest?.sizeHints || []) {
    if (searchable.includes(hint.toLowerCase())) {
      score += 3;
    }
  }

  score += scoreSizeFit(normalized.modelId, finder?.candidateRequest?.sizeHints || []);

  if (searchable.includes("q4_k_m")) {
    score += 4;
  } else if (searchable.includes("q4")) {
    score += 2;
  }

  if (choices.goal === "code" && /\b(code|coder|coding)\b/i.test(searchable)) {
    score += 4;
  }

  if ((choices.goal === "chat" || choices.goal === "code") && /\b(base)\b/i.test(searchable) && !/\bchat|instruct|it\b/i.test(searchable)) {
    score -= 4;
  }

  if (/\b(layer-package|distributed-inference|skippy)\b/i.test(searchable)) {
    score -= 8;
  }

  return score;
}

function scoreSizeFit(modelId, sizeHints) {
  const targetSizes = sizeHints
    .map((hint) => Number.parseFloat(String(hint).toLowerCase().replace("b", "")))
    .filter(Number.isFinite);
  const modelSizes = extractBillionParameterSizes(modelId);

  if (targetSizes.length === 0 || modelSizes.length === 0) {
    return 0;
  }

  const closestDistance = Math.min(...modelSizes.flatMap((size) => targetSizes.map((target) => Math.abs(size - target))));
  const largestTarget = Math.max(...targetSizes);
  const largestModelSize = Math.max(...modelSizes);
  let score = Math.max(0, 6 - closestDistance);

  if (largestModelSize > largestTarget * 1.5 && modelSizes.length > 1) {
    score -= 6;
  } else if (largestModelSize > largestTarget * 1.5) {
    score -= 10;
  }

  return score;
}

function extractBillionParameterSizes(text) {
  return [...String(text).matchAll(/(\d+(?:\.\d+)?)\s*b\b/gi)]
    .map((match) => Number.parseFloat(match[1]))
    .filter(Number.isFinite);
}

function normalizeCandidate(candidate) {
  return {
    modelId: candidate?.modelId || candidate?.id || "Unknown model",
    downloads: Number(candidate?.downloads) || 0,
    likes: Number(candidate?.likes) || 0,
    pipelineTag: candidate?.pipeline_tag || candidate?.pipelineTag || "",
    libraryName: candidate?.library_name || candidate?.libraryName || "",
    tags: Array.isArray(candidate?.tags) ? candidate.tags.filter((tag) => typeof tag === "string") : []
  };
}

function buildCandidateJustification(candidate, finder, choices) {
  const normalized = normalizeCandidate(candidate);
  const reasons = [];

  reasons.push(`It appeared in a current Hugging Face search for ${finder.rows.find(([label]) => label === "Search filter")?.[1] || "the selected filters"}.`);

  if (choices.rankBy === "downloads") {
    reasons.push("You asked for downloads, so this is the highest-download eligible candidate returned by the current search filters.");
  } else if (choices.rankBy === "likes") {
    reasons.push("You asked for likes, so this is the highest-liked eligible candidate returned by the current search filters.");
  } else {
    reasons.push("The ranking balances downloads, likes, and fit for your target size.");
  }

  if (normalized.tags.some((tag) => tag.toLowerCase() === "gguf")) {
    reasons.push("It is tagged as GGUF, which fits beginner local tools better than raw full-precision weights.");
  }

  if (normalized.tags.some((tag) => /q4/i.test(tag)) || /q4/i.test(normalized.modelId)) {
    reasons.push("The name or tags suggest a Q4 quantised variant, which is a practical starting point for modest hardware.");
  }

  if (hasPermissiveLicense(normalized.tags)) {
    reasons.push("Its tags include a permissive-looking licence, but the model page still needs checking.");
  } else if (choices.permissiveOnly) {
    reasons.push("The search did not confirm a permissive licence, so check the licence before use.");
  }

  reasons.push(`This is a starting candidate, not a guarantee: compare the model card, files, and fit estimate before downloading.`);

  return reasons.join(" ");
}

function hasPermissiveLicense(tags) {
  return tags.some((tag) => /^license:(apache-2\.0|mit|bsd|cc-by|cc-by-sa)/i.test(tag));
}

function buildSummaryGuidance(goal, sizing) {
  return `${capitalizeFirst(sizing.primaryRange)} ${getRangeVerb(sizing.primaryRange)} the safest starting point for ${withIndefiniteArticle(goal.taskPhrase)}.`;
}

function formatHardwareProfile(profile) {
  const parts = [];
  const gpuVramGb = profile?.gpuVramGb !== null && profile?.gpuVramGb !== undefined ? Number(profile.gpuVramGb) : null;
  const systemRamGb = profile?.systemRamGb !== null && profile?.systemRamGb !== undefined ? Number(profile.systemRamGb) : null;

  if (profile?.operatingSystem) {
    parts.push(profile.operatingSystem);
  }

  if (Number.isFinite(gpuVramGb)) {
    parts.push(`${gpuVramGb} GB VRAM`);
  }

  if (Number.isFinite(systemRamGb)) {
    parts.push(`${systemRamGb} GB RAM`);
  }

  return parts.length ? parts.join(", ") : "Saved hardware profile";
}

function withIndefiniteArticle(phrase) {
  return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

function capitalizeFirst(text) {
  return `${String(text).charAt(0).toUpperCase()}${String(text).slice(1)}`;
}

function getRangeVerb(text) {
  return /\bmodels\b/i.test(text) ? "are" : "is";
}
